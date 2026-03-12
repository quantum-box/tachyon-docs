---
title: "X API従量課金対応クライアントとBookmark Webhook調査フロー"
type: "feature"
emoji: "🐦"
topics:
  - "x-api"
  - "billing"
  - "agent"
  - "webhook"
published: true
targetFiles:
  - "packages/providers/"
  - "packages/llms/"
  - "apps/tachyon-api/"
  - "docs/src/tachyon-apps/"
github: "https://github.com/quantum-box/tachyon-apps"
---

# X API従量課金対応クライアントとBookmark Webhook調査フロー

## 概要

X APIの従量課金モデルに対応したクライアント層を整備し、料金見積もり・実コスト記録・上限ガードを実装する。
あわせて、BookmarkイベントをWebhookで受信し、対象ポストをエージェントで調査できるフローを追加する。

## 背景・目的

- X APIが従量課金化され、API呼び出し数・データ取得量に応じた課金管理が必要になった
- 現状はX連携のコスト可視化が弱く、運用時に想定外コストが発生するリスクがある
- Bookmarkを起点に「保存した情報の自動調査」を実現したい
- webhook → 取り込み → agent調査 → レポート化の一連フローを標準化したい

## 詳細仕様

### 機能要件

1. X API clientを新規作成し、以下を提供する
   - 認証情報の管理（token / secret）
   - リクエスト共通化（retry, timeout, rate-limit handling）
   - エンドポイントごとの課金メタデータ付与
2. 従量課金テーブルを定義し、見積もり関数を実装する
   - 事前見積もり（実行前）
   - 実績計測（実行後）
   - 差分記録（見積もり vs 実績）
3. コスト上限ガードを実装する
   - 1リクエスト上限
   - 1日上限
   - 1オペレーター月次上限
4. Bookmark webhook受信エンドポイントを追加する
   - 署名検証
   - リプレイ攻撃対策（timestamp + nonce）
   - 冪等処理（event_idベース）
5. webhook受信後に調査ジョブを作成する
   - Bookmark対象のポスト内容・関連ポストを収集
   - Agent Tool Jobとして調査を実行
   - 結果サマリーを保存・再参照可能にする
6. 監査ログを追加する
   - API呼び出し単位の課金内訳
   - webhookイベントの処理結果
   - agent調査ジョブへのトレースID紐付け

### 非機能要件

- コスト見積もりの誤差は実績に対して ±5% 以内を目標（従量単価の更新遅延時を除く）
- webhook処理のp95レイテンシは 500ms 以内（Agent実行は非同期化）
- 同一event_idの重複処理は100%抑止する
- 単価更新はデプロイ不要（設定またはDB更新で反映）

### コンテキスト別の責務

```yaml
contexts:
  providers:
    description: "X APIクライアント実装"
    responsibilities:
      - API通信
      - レート制御
      - 呼び出しメタデータ採取

  llms:
    description: "Agent実行とコスト連携"
    responsibilities:
      - Tool Job作成
      - 調査プロンプト生成
      - 結果要約保存

  payment:
    description: "従量課金管理"
    responsibilities:
      - 見積もり/実績コスト計算
      - 予算上限判定
      - 課金監査ログ記録

  tachyon_api:
    description: "Webhook受信とオーケストレーション"
    responsibilities:
      - endpoint公開
      - 署名/冪等検証
      - 非同期ジョブ連携
```

### 仕様のYAML定義

```yaml
x_api_metered_pricing:
  currency: "USD"
  unit: "nanodollar"
  version: "2026-02"
  notes:
    - "実単価はX公式の最新価格に追従する"
    - "下記は初期設定値。導入時に運用チーム確認必須"

  endpoints:
    get_bookmarks:
      pricing_model: "per_request"
      unit_price_usd: 0.0025
      unit_price_nanodollar: 2500000
      free_quota_per_day: 1000

    get_post_detail:
      pricing_model: "per_request"
      unit_price_usd: 0.0010
      unit_price_nanodollar: 1000000
      free_quota_per_day: 3000

    search_recent_posts:
      pricing_model: "per_request"
      unit_price_usd: 0.0030
      unit_price_nanodollar: 3000000
      free_quota_per_day: 500

    get_user_profile:
      pricing_model: "per_request"
      unit_price_usd: 0.0005
      unit_price_nanodollar: 500000
      free_quota_per_day: 5000

cost_guardrails:
  per_request_max_usd: 0.10
  per_day_max_usd: 50
  per_operator_monthly_max_usd: 1000

bookmark_webhook:
  endpoint: "/v1/x/webhook/bookmarks"
  signature_header: "x-x-signature"
  timestamp_header: "x-x-timestamp"
  replay_window_seconds: 300
  idempotency_key: "event_id"
  async_job_type: "x_bookmark_investigation"

agent_investigation:
  prompt_template: "bookmark_investigation_v1"
  outputs:
    - summary
    - key_claims
    - risk_flags
    - followup_actions
```

## 実装方針

### アーキテクチャ設計

- Clean Architectureに従い、X API clientはprovider層に配置
- webhookハンドラーはinterface_adapter/handlerで受け、usecaseへ委譲
- 課金計算はPaymentコンテキストへ寄せ、LLMS側は課金ロジックを持たない
- Agent実行はTool Job経由で非同期化し、Webhook同期処理時間を短く保つ

### 技術選定

- HTTP client: 既存のRust HTTPスタック（axum + reqwest系）に合わせる
- 監査ログ: 既存のexecution costテーブルと関連付け可能なスキーマを利用
- 署名検証: HMAC-SHA256（X仕様に合わせて調整）

## タスク分解

### フェーズ1: 要件定義と価格確定 🔄
- [ ] X API最新料金表の調査と運用合意
- [ ] 課金対象エンドポイントの確定
- [ ] 予算ガードレール値の初期設定

### フェーズ2: クライアント実装 📝
- [ ] X API clientの基盤実装（認証/リトライ/タイムアウト）
- [ ] 課金メタデータ収集と見積もり実装
- [ ] 実績記録と差分ログ実装

### フェーズ3: Webhook + Agent連携 📝
- [ ] webhook受信エンドポイント実装
- [ ] 署名・冪等検証
- [ ] Bookmark起点の調査Tool Job作成

### フェーズ4: 検証と運用準備 📝
- [ ] シナリオテスト追加
- [ ] 失敗時リトライ/デッドレター戦略の確認
- [ ] 運用ドキュメント更新（単価更新手順含む）

## テスト計画

- 単体テスト
  - 課金計算（free quota境界、上限超過、端数処理）
  - 署名検証（正常系/異常系/期限切れ）
- 統合テスト
  - webhook受信 → job作成 → 調査結果保存
  - 重複event_idの冪等制御
- シナリオテスト
  - `apps/tachyon-api/tests/scenarios/` へ追加し、`mise run docker-scenario-test` で検証

## Playwright MCPによる動作確認

### 実施タイミング
- [ ] 実装完了後の初回動作確認
- [ ] PRレビュー前の最終確認

### 動作確認チェックリスト
- [ ] Bookmarkイベント受信後にジョブ一覧へ反映される
- [ ] 調査結果のサマリーがUI上で確認できる
- [ ] エラー時にリトライ状態が視認できる

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| X API価格改定により単価が陳腐化 | 高 | 単価を設定駆動にし、月次で見直しを運用タスク化 |
| webhookスパイクでジョブが滞留 | 中 | キューイング + 同時実行数制御 + backpressure |
| 署名検証の仕様差異 | 高 | sandbox環境で署名検証テストを先行実施 |
| 調査コストの過剰発生 | 高 | 事前見積もりと月次上限ガードを必須化 |

## 参考資料

- X API公式ドキュメント（Pricing / Webhooks / Bookmarks）
- Tool Jobs実装メモ
- NanoDollar仕様: `docs/src/architecture/nanodollar-system.md`

## 完了条件

- [ ] X API clientが従量課金対応で実装されている
- [ ] 単価・見積もり・実績が監査可能な形で記録される
- [ ] Bookmark webhook起点の調査フローが実行できる
- [ ] シナリオテストが追加され、`mise run docker-scenario-test` が通る
- [ ] 運用ドキュメントに単価更新手順が記載される

## 備考

- 本taskdocでは初期単価を仮置きしている。実装開始時に必ず最新の公式価格へ更新する。
