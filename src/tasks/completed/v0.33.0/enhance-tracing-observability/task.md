---
title: "Tracingログ・オブザーバビリティの改善"
type: "improvement"
emoji: "📊"
topics:
  - Observability
  - Tracing
  - Rust
  - Logging
  - OpenTelemetry
published: true
targetFiles:
  - packages/telemetry/src/lib.rs
  - packages/telemetry/src/http.rs
  - apps/tachyon-api/src/router.rs
  - apps/library-api/src/router.rs
  - apps/bakuure-api/src/router.rs
  - packages/errors/src/axum.rs
  - packages/errors/src/async_graphql.rs
  - docs/src/architecture/structured-logging-guidelines.md
github: ""
---

# Tracingログ・オブザーバビリティの改善

## 概要

エラーの追跡を容易にするため、tracingログ周りを改善する。Request/Trace IDの伝搬、構造化ログの強化、エラーレベルの適切な段階化を実装し、プロダクション環境でのデバッグ・トラブルシューティング効率を向上させる。

## 背景・目的

### 現状の課題

1. **エラー追跡が困難**
   - Request IDがログに含まれないため、特定リクエストのログを追跡できない
   - マイクロサービス間での相関IDがなく、分散システムでのトレースが不可能
   - エラー発生時にどのリクエストで起きたか特定に時間がかかる

2. **構造化ログの不足**
   - 大多数のログが文字列補間で、検索・分析が非効率
   - ログ集約ツール（Datadog、CloudWatch Logs Insights等）での活用が制限される

3. **本番環境でのオブザーバビリティ不足**
   - OpenTelemetry OTLPエクスポートが本番でコメントアウトされている
   - 分散トレーシングが開発環境のみで有効
   - HTTP層のメトリクス（レイテンシ、ステータスコード別集計）がない

4. **ログノイズ**
   - ビジネスロジックエラー（400系）もERRORレベルで出力される
   - 本当の問題（500系）が埋もれやすい

### 期待される成果

- エラー発生時、Request IDで関連ログを即座にフィルタ可能
- ログ検索・分析の効率が向上（構造化フィールドによるクエリ）
- 本番環境での分散トレーシング復活（Jaeger/Tempo等での可視化）
- 重要なエラーのみがアラート対象になり、ノイズ削減

## 詳細仕様

### 機能要件

1. **Request/Trace ID伝搬**
   - 全HTTPリクエストにユニークなRequest IDを付与
   - ログ出力に自動的にRequest IDを含める
   - レスポンスヘッダー `x-request-id` で返却
   - 既存の `axum-trace-id` クレートを活用

2. **構造化ログの強化**
   - 主要なログ出力を構造化フィールド形式に移行
   - 最低限、以下のフィールドを標準化:
     ```rust
     tracing::info!(
         request_id = %request_id,
         user_id = %user_id,
         operator_id = %operator_id,
         action = "execute_usecase",
         duration_ms = elapsed.as_millis(),
         "Usecase completed"
     );
     ```

3. **エラーレベルの段階化**
   - 400系（クライアントエラー）: WARN
   - 500系（サーバーエラー）: ERROR
   - 認証エラー: WARN
   - リクエスト検証エラー: DEBUG or WARN

4. **HTTP層トレーシング**
   - `tower-http::trace::TraceLayer` の導入
   - エンドポイント別のレイテンシ・ステータスコード記録
   - リクエスト/レスポンスボディのサイズ記録

### 非機能要件

- **パフォーマンス**: ログ出力によるオーバーヘッドは最小限に（< 1ms/request）
- **互換性**: 既存のログ出力形式との後方互換性を維持
- **運用性**: 環境変数でログレベル・出力形式を制御可能

### コンテキスト別の責務

```yaml
contexts:
  telemetry:
    description: "ログ・トレーシングの中央管理"
    responsibilities:
      - tracing-subscriberの初期化
      - OpenTelemetry設定
      - ログフォーマット制御
      - 環境別設定

  tachyon-api:
    description: "HTTPレイヤーのトレーシング"
    responsibilities:
      - Request ID生成・伝搬
      - TraceLayerの設定
      - レスポンスヘッダー付与

  errors:
    description: "エラーレベルの制御"
    responsibilities:
      - HTTPステータスに応じたログレベル決定
      - 構造化エラー情報の出力
```

## 実装方針

### アーキテクチャ設計

```
Request Flow:
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Client    │────▶│  TraceLayer  │────▶│   Handler   │
└─────────────┘     │ (Request ID) │     │  (Usecase)  │
                    └──────────────┘     └─────────────┘
                           │                    │
                           ▼                    ▼
                    ┌──────────────────────────────────┐
                    │   tracing-subscriber (JSON/OTLP)  │
                    └──────────────────────────────────┘
                           │                    │
                    ┌──────┴──────┐      ┌─────┴─────┐
                    │   stdout    │      │   OTLP    │
                    │   (JSON)    │      │ (Jaeger)  │
                    └─────────────┘      └───────────┘
```

### 技術選定

| 用途 | 選定技術 | 理由 |
|------|----------|------|
| Request ID生成 | `tower-http::request_id` | axum 0.7との互換性、標準的 |
| HTTP Tracing | `tower-http::trace` | axumとの親和性、標準的 |
| 構造化ログ | tracing structured fields | 既存基盤を活用 |
| 分散トレーシング | OpenTelemetry OTLP | 既存設定の再有効化 |

> **Note**: `axum-trace-id`はaxum 0.7との互換性問題があったため、`tower-http::request_id`を採用。

### 移行戦略

1. **フェーズ1**: 基盤整備（Request ID、TraceLayer）
2. **フェーズ2**: エラーレベル段階化
3. **フェーズ3**: 構造化ログへの段階的移行
4. **フェーズ4**: 本番OTel再有効化（検証後）

## タスク分解

### フェーズ1: Request ID・HTTP Tracing基盤 ✅ (2026-01-16 完了)

- [x] `tower-http::request_id` を有効化し、全リクエストにUUID形式のIDを付与
- [x] `tower-http::trace::TraceLayer` を導入
- [x] Request IDをtracing spanのフィールドとして伝搬
- [x] レスポンスヘッダー `x-request-id` を追加（PropagateRequestIdLayer）
- [x] コンパイル確認

実装メモ: `axum-trace-id`はaxum 0.7との互換性問題があったため、`tower-http::request_id`モジュールの`SetRequestIdLayer`/`PropagateRequestIdLayer`を採用。`packages/telemetry/src/http.rs`に共通化し、tachyon-api / library-api / bakuure-api で再利用可能に。

### フェーズ2: エラーレベルの段階化 ✅ (2026-01-16 完了)

- [x] `packages/errors/src/axum.rs` のログ出力レベルを見直し
- [x] 400系エラー → WARN に変更 (`log_client_error`)
- [x] 500系エラー → ERROR を維持 (`log_server_error`)
- [x] `packages/errors/src/async_graphql.rs` のエラーログレベルを調整
- [x] コンパイル確認

実装メモ: `log_error_response`を`log_server_error`/`log_client_error`に分割し、適切なログレベルを使用。

### フェーズ3: 構造化ログ強化 ✅ (2026-01-16 完了)

- [x] ログ出力のベストプラクティスをドキュメント化
  - `docs/src/architecture/structured-logging-guidelines.md` を作成
- [x] `packages/telemetry/src/lib.rs` のドキュメントを拡充
- [ ] 主要Usecaseの `#[instrument]` に構造化フィールド追加（今後段階的に）
- [x] サンプルログクエリ（CloudWatch Insights、Datadog）をガイドラインに記載

### フェーズ4: 本番OTel再有効化 ✅ (2026-01-16 完了)

**調査・準備:**
- [x] サンプリングレートの設定を検討（デフォルト10%）

**Rust側の変更:** ✅ (2026-01-16 完了)
- [x] `packages/telemetry/src/lib.rs` の `init_production_tracing` でOTelを再有効化
- [x] 環境変数でOTel有効/無効を切り替え可能に
- [x] `apps/library-api/bin/lambda.rs` を更新

実装メモ:
- `TracingConfig`に`otel_enabled`と`otel_sampling_rate`フィールドを追加
- `OTEL_ENABLED=true`でOTelが有効化される
- サンプリングレートは`OTEL_TRACES_SAMPLER_ARG`で設定可能（デフォルト10%）
- OTelエンドポイントは`OTEL_EXPORTER_OTLP_ENDPOINT`で設定（デフォルト`http://localhost:4317`、ADOT Lambda Layer用）
- サービス名は`OTEL_SERVICE_NAME`で設定可能
- 型推論の問題を回避するため、`init_production_tracing_with_otel`と`init_production_tracing_without_otel`に分割

**Lambda/インフラ側の設定:** ✅ (2026-01-16 完了)
- [x] AWS Distro for OpenTelemetry (ADOT) Lambda Layerの追加
- [x] Lambda環境変数の設定
  - `OTEL_ENABLED=true`
  - `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317`（ADOT Layer標準）
  - `OTEL_SERVICE_NAME=library-api` / `library-api-dev`
  - `OTEL_TRACES_SAMPLER_ARG=0.1`（10%サンプリング）
- [x] OTelコレクターの選定・デプロイ
  - **採用: AWS X-Ray** - Lambda/AWSネイティブ統合、コレクター運用不要、サービスマップ可視化
- [x] Lambda実行ロールにトレース送信権限を追加（`xray:PutTraceSegments`, `xray:PutTelemetryRecords`等）
- [x] Terraformでのインフラ定義

Terraform実装メモ:
- `cluster/n1-aws/modules/lambda/variables.tf` に `layers` と `tracing_mode` 変数を追加
- `cluster/n1-aws/modules/lambda/main.tf` に layers と tracing_config を追加
- `cluster/n1-aws/main.tf` に `LambdaXRayTracingPolicy` IAMポリシーを追加
- `cluster/n1-aws/lambda.tf` に ADOT Layer ARN (arm64) を定義し、全Lambda関数に適用:
  - bakuure-api
  - library-api
  - library-api-dev
  - tachyon-api

**検証・ロールアウト:**
- [ ] ステージング環境で検証
- [ ] コスト見積もり（トレースデータ量）
- [ ] 段階的にロールアウト

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| パフォーマンス劣化 | 中 | ベンチマーク実施、サンプリング導入 |
| ログ容量増加 | 低 | ログレベルで制御、構造化により圧縮効率向上 |
| 既存ログ形式との互換性 | 中 | 段階的移行、後方互換性を維持 |
| OTel再有効化の副作用 | 中 | 本番前にステージングで十分検証 |

## 参考資料

- [Rust tracing crate](https://docs.rs/tracing/latest/tracing/)
- [tower-http TraceLayer](https://docs.rs/tower-http/latest/tower_http/trace/index.html)
- [OpenTelemetry Rust](https://opentelemetry.io/docs/instrumentation/rust/)
- [axum-trace-id](https://docs.rs/axum-trace-id/latest/axum_trace_id/)

## 完了条件

- [x] 全HTTPリクエストにRequest IDが付与される
- [x] ログ出力にrequest_idフィールドが含まれる
- [x] レスポンスヘッダーに `x-request-id` が含まれる
- [x] 400系エラーがWARNレベルで出力される
- [x] 500系エラーがERRORレベルで出力される
- [x] `mise run docker-check` が通る
- [x] ドキュメントが更新される

### バージョン番号の決定基準

このタスクが完了した際のバージョン番号の上げ方：

- [x] 既存機能の大幅な改善 → **マイナーバージョン（x.X.x）を上げる**

## 備考

- ~~`axum-trace-id` は既に依存として定義されているが未使用状態~~ → `tower-http::request_id` を使用
- ~~本番でOTel OTLPがコメントアウトされている理由は要調査~~ → フェーズ4で解決（環境変数で有効/無効切り替え可能に）
- 構造化ログへの移行は段階的に行い、一度に全てを変更しない
- **全フェーズ完了**: フェーズ1〜4すべて実装完了。残りは本番デプロイ後の検証のみ
