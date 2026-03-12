# デプロイ単位の分割 — ECSビルド高速化のためのLambda移行

## 概要

tachyon-api の ECS デプロイが遅い（8-12分）原因を分析し、一部の機能を Lambda に分離することで ECS ビルド・デプロイサイクルを高速化する。

## 背景・目的

### 現状の問題

1. **ECSデプロイが遅い**: Docker ビルド（cargo build + multi-stage）→ ECR push → ECS update → stability wait で 8-12分
2. **トリガー範囲が広すぎる**: `tachyon-api-release.yml` が `packages/**` の全変更でトリガーされる。bakuure や library 関連の変更でも tachyon-api が再ビルドされる
3. **単一バイナリの肥大化**: tachyon-api は 60+ クレートのワークスペースから依存を引き込み、コンパイル対象が大きい
4. **Lambda デプロイは速い**: 同じ Rust バイナリでも cargo-lambda + deploy は 6-10分（ECSより短い）。Docker ビルドとECR push が不要

### 期待される効果

- **ECSデプロイ頻度の削減**: tachyon-api に関係ない変更では ECS リビルドをスキップ
- **デプロイフィードバックの高速化**: Lambda 側に移行した機能は独立してデプロイ可能（6-10分）
- **リスク分離**: 機能ごとにデプロイ単位が分かれることで、障害影響範囲が縮小

### 現行デプロイマトリクス

| サービス | ECS | Lambda | 備考 |
|----------|-----|--------|------|
| tachyon-api | Primary | Alternative | 両方にデプロイ中 |
| bakuure-api | - | Primary | Lambda のみ |
| library-api | - | Primary | Lambda のみ |
| tool-job-worker | Primary | - | SQSコンシューマー、ECS必須 |
| quic-gateway | Primary | - | UDP永続接続、ECS必須 |
| user-insights | - | Primary | EventBridge cron、Lambda のみ |

## 機能要件

### 1. ECSワークフローのパスフィルタ精緻化

現在の `packages/**` を、tachyon-api が実際に依存するパッケージに限定する。

**現状:**
```yaml
paths:
  - apps/tachyon-api/**
  - packages/**           # ← 全パッケージで発火
```

**改善後:**
```yaml
paths:
  - apps/tachyon-api/**
  - packages/auth/**
  - packages/database/**
  - packages/persistence/**
  # ... tachyon-api の実依存のみ列挙
```

### 2. tachyon-api からの機能切り出し候補の特定

以下の観点で切り出し候補を評価する:

- **独立性**: 他のドメインとの依存が少ないコンテキスト
- **変更頻度**: 頻繁に変更されるパッケージ（変更のたびにECSが再ビルドされる）
- **Lambda適性**: リクエスト/レスポンス型で長時間実行しないもの
- **既存Lambda実績**: bakuure-api, library-api が Lambda で稼働中 → 同じパターンで切り出せる

#### 切り出し候補例

| パッケージ群 | Lambda化の適性 | 理由 |
|-------------|--------------|------|
| compute (ビルド管理) | 高 | CodeBuild連携、CF Pagesデプロイ — 独立性が高い |
| crm | 中 | 顧客管理機能、API中心 |
| notification | 中 | メール・SMS送信、非同期処理向き |
| integration | 中 | 外部連携（Square等）、独立ドメイン |
| llms / agents | 低 | SQS + 長時間実行あり → tool-job-worker (ECS) が適切 |
| streaming | 不可 | QUIC/UDP接続 → ECS必須 |

### 3. Lambda関数の追加デプロイパイプライン整備

新しい Lambda 関数を追加する場合:
- Terraform で Lambda + API Gateway を定義
- GitHub Actions ワークフローをパッケージ固有のパスフィルタで作成
- tachyon-api からの API ルーティング分離（API Gateway or ALB のパスベースルーティング）

## 非機能要件

- ECS デプロイ時間を現状の 8-12分 → パスフィルタ精緻化だけでも不要なビルドを 50% 以上削減
- Lambda コールドスタートが許容範囲内であること（現行 Lambda は ARM64 + Rust で高速）
- 既存の API エンドポイントの後方互換性を維持

## 完了条件

- [ ] tachyon-api の実依存パッケージを特定し、ワークフローのパスフィルタを更新
- [ ] 切り出し候補パッケージの優先順位リストを作成
- [ ] 最低1つの機能を Lambda に切り出し、独立デプロイパイプラインを稼働させる
- [ ] 切り出し前後のデプロイ頻度・時間を計測し、改善効果を確認

## 参考情報

- 既存 Lambda デプロイ: `.github/workflows/terraform-lambda-deploy.yml`
- ECS デプロイ: `.github/workflows/tachyon-api-release.yml`
- Terraform Lambda定義: `cluster/n1-aws/lambda.tf`
- ビルド速度改善タスク（並行）: `docs/src/tasks/in-progress/improve-rust-build-speed/`
