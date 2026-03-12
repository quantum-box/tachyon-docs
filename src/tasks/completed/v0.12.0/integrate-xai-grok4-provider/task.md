---
title: "xAI Grok-4 プロバイダ統合"
type: "feature"
emoji: "🛰️"
topics:
  - "LLM"
  - "xAI"
  - "Procurement"
  - "Rust"
published: true
targetFiles:
  - "packages/providers/xai"
  - "packages/llms/src"
  - "apps/tachyon-api/src/di.rs"
  - "packages/procurement/src/pricing_registry.rs"
  - "scripts/seeds/n1-seed/007-procurement-suppliers.yaml"
  - "scripts/seed-pricing-data.sql"
  - "apps/tachyon/src/app/v1beta/[tenant_id]/ai/data/models.ts"
github: "https://github.com/quantum-box/tachyon-apps"
---

# xAI Grok-4 プロバイダ統合

## 概要

xAI の Grok-4 ファミリーを Tachyon LLM プラットフォームに追加し、推論 API へのルーティング・価格計算・調達情報を一貫して管理できるようにする。Rust 製プロバイダ実装を新設し、調達・料金管理のシードデータを最新レートで更新する。

## 背景・目的

- 既存は OpenAI / Anthropic / Google AI / Groq のみ対応しており、xAI の Grok-4 が利用できない。
- Grok 系モデルは推論コストに対する性能比が高いため、エンタープライズ顧客からの要望が増加している。
- 調達・課金の整備（ProcurementPrice や PricingRegistry）をセットで整えることで、販売価格シミュレーションと請求処理を破綻なく運用可能にする。

期待される成果:

- xAI Grok-4 系モデルを選択可能な状態にする（UI・API 双方）。
- 最新の公式料金（USD 基準）を NanoDollar へ変換し、シードデータで再現。
- 料金・調達情報を Procurement コンテキストに登録し、PricingRegistry から参照できるようにする。
- Grok-4 Fast の Reasoning / Non-Reasoning 両SKUを扱えるようにし、別SKUの alias (`grok-4-fast`/`grok-4-fast-reasoning-latest` 等) にも対応する。

## 詳細仕様

### 機能要件

1. `packages/providers/xai`（新規）に xAI Grok-4 チャット API クライアントと `LLMProvider` 実装を提供する。
2. `LLMProviders` 初期化で xAI プロバイダを登録し、`provider_name` は `"xai"` 固定とする。
3. `tachyon-api` の DI で xAI プロバイダを初期化・登録し、`PricingRegistry` にも xAI 用プロバイダを追加する。
4. Procurement シードに xAI サプライヤー / 契約 / Grok-4 系トークン価格（prompt, completion, tool 使用料がある場合は別途）を追加する。
5. `apps/tachyon` など UI 層のモデル選択ダイアログへ Grok-4 モデルリスト（最低限 `grok-4`, `grok-4-mini` など）を表示する。
6. GraphQL/REST 経由でモデル一覧や価格情報を取得した際に xAI モデルが返却されること。

### 非機能要件

- 認証: xAI API Key を `XAI_API_KEY` 環境変数で設定。キー未設定時は起動時にわかりやすいエラーを出す。
- 障害時: HTTP エラー・レートリミット時にプロバイダ固有の `provider_error"xai"` を返す。
- 可観測性: tracing ログでリクエスト ID とモデル名を出力する。
- パフォーマンス: 90% タイルで 2 秒以内のレスポンスを目標（外部 API 依存のためタイムアウト 15 秒程度）。

### コンテキスト別の責務

```yaml
contexts:
  llms:
    responsibilities:
      - "Grok-4 モデルへのチャットリクエスト送信"
      - "LLMProviders / ChatStreamProviders への登録"
      - "モデル一覧 API への露出"
  procurement:
    responsibilities:
      - "xAI サプライヤー / 契約 / 調達価格 (ProcurementPrice) の管理"
      - "PricingRegistry での xAI 価格プロバイダ登録"
  catalog:
    responsibilities:
      - "サービス価格マッピングに xAI 調達原価を参照可能にする"
  tachyon-ui:
    responsibilities:
      - "モデル選択 UI で Grok-4 ファミリーを表示"
      - "価格シミュレーションで xAI モデルの原価を使用"
```

### 仕様のYAML定義

> ✅ 公式料金を取得後、以下テンプレートに数値を反映する。金額は NanoDollar（1 USD = 1,000,000,000 ND）換算。

```yaml
xai_pricing:
  collected_at: 2025-09-21T04:28:16Z
  currency: USD
  models:
    - name: "grok-4"
      prompt_usd_per_million: 3.00
      completion_usd_per_million: 15.00
      cached_prompt_usd_per_million: 0.75
      prompt_nanodollar_per_token: 3000
      completion_nanodollar_per_token: 15000
      cached_prompt_nanodollar_per_token: 750
      max_context: 131072
    - name: "grok-4-fast-reasoning"
      aliases:
        - "grok-4-fast"
        - "grok-4-fast-reasoning-latest"
      prompt_usd_per_million: 0.20
      completion_usd_per_million: 0.50
      cached_prompt_usd_per_million: 0.05
      prompt_nanodollar_per_token: 200
      completion_nanodollar_per_token: 500
      cached_prompt_nanodollar_per_token: 50
      max_context: 131072
    - name: "grok-4-fast-non-reasoning"
      aliases:
        - "grok-4-fast-non-reasoning-latest"
      prompt_usd_per_million: 0.20
      completion_usd_per_million: 0.50
      cached_prompt_usd_per_million: 0.05
      prompt_nanodollar_per_token: 200
      completion_nanodollar_per_token: 500
      cached_prompt_nanodollar_per_token: 50
      max_context: 131072
  notes:
    - "Large contexts above 256k tokens incur $6.00 input and $30.00 output per million tokens for Grok-4"
```

公式料金は 2025-09-21 時点の公式公開値。更新があれば当該 YAML を差し替える。

## 実装方針

- Rust クレート: 既存 `packages/providers/groq` を参考に構成（`chat.rs`, `pricing.rs`, `model_names.rs` 等）。HTTP クライアントは `reqwest`、認証ヘッダは `Authorization: Bearer {XAI_API_KEY}`。
- モデル一覧: xAI のカタログ API（必要に応じて `/v1/models`）でレスポンス形式を確認。静的定義でも問題なければ最新安定モデルを定義し、`model_names` モジュールで列挙。
- 価格管理: 公式料金ページから取得した USD 単価を NanoDollar へ変換し、`pricing.rs` で `ModelPricing` として保持。Procurement シードと整合させる。
- DI: `tachyon-api/src/di.rs` の LLM 初期化コードに xAI を追加し、`LLMProviders` へ登録。ストリーミング API は未実装のため `ChatStreamProviders` への登録は保留。
- UI: `apps/tachyon/src/app/v1beta/[tenant_id]/ai/data/models.ts` など静的リストへ xAI エントリを追加し、タグやカラーリングを既存パターンに合わせる。

## タスク分解

### フェーズ1: 価格リサーチと設計 ✅ (2025-09-21 完了)
- [x] 公式ドキュメントで Grok-4 / Grok-4 Fast 料金体系を確認
- [x] 料金取得日時と参照 URL を記録
- [x] NanoDollar 換算ロジックを整理

### フェーズ2: Rust プロバイダ実装 ✅
- [x] `packages/providers/xai` クレート生成
- [x] `LLMProvider` / `ChatProvider` 実装
- [x] モデルリスト・検証テスト追加

### フェーズ3: DI & PricingRegistry 連携 ✅
- [x] `tachyon-api/src/di.rs` へ登録
- [x] `PricingRegistry` の推測ロジックへ xAI 条件追加
- [x] `LLMProviders` 初期化更新

### フェーズ4: シードデータ更新 ✅
- [x] `scripts/seeds/n1-seed/007-procurement-suppliers.yaml` に xAI (Grok 4 / Grok 4 Fast) 追加
- [x] `scripts/seed-pricing-data.sql` に xAI プロダクト・価格マッピング追加
- [x] 必要なら `yaml-seeder` 用データ生成

### フェーズ5: UI 反映 ✅
- [x] モデル選択 UI の静的リスト更新
- [x] 価格表示箇所への追加（Procurement/Billing UI）

### フェーズ6: テスト・検証 ✅
- [x] 単体テスト（モデル/価格変換）
- [x] `mise run check` / `mise run ci-node`
- [x] シード適用テスト（ローカル DB）

## テスト計画

- Rust: `cargo nextest run -p xai`（新規クレート用テスト）、`mise run check`。
- Node: `yarn ts --filter=tachyon` で型整合性確認。
- シード: `mise run up` → `scripts/seed-pricing-data.sql` 適用で整合性確認。
- 料金: 価格変換の単体テストで NanoDollar 計算誤差を 1 ND 以下に抑える。

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| xAI API 仕様変更 | 中 | リリースノート監視・API バージョン固定 (`2024-12-01` 等) |
| 料金更新頻度が高い | 中 | `AGENTS.md` に取得手順を記載し、定期レビューを促す |
| シード適用時の ULID 重複 | 低 | `mise run ulid` で新規生成し、既存 ID と重複確認 |
| ChatStreamProvider 未対応 | 中 | まず非対応として実装、Streaming 要求が出たら追加検討 |

## 参考資料

- xAI API Pricing: https://api.x.ai/docs/pricing
- xAI API Models: https://api.x.ai/docs/models
- 既存プロバイダ実装: `packages/providers/groq`, `packages/providers/anthropic`
- 仕様ドキュメント: `docs/src/services/tachyon/llm-xai-grok4.md`

## 完了条件

- [x] xAI プロバイダクレートがビルド・テストを通過
- [x] DI / PricingRegistry / UI へ xAI モデルが反映
- [x] シードデータに xAI 調達情報を追加し、`mise run up` 後に参照可能
- [x] Grok-4 料金のソースと取得日時を `AGENTS.md` に記載
- [x] タスクドキュメント更新（料金値反映・進捗マーク）
- [x] 仕様ドキュメント `docs/src/services/tachyon/llm-xai-grok4.md` 作成

## 備考

- 価格情報は 2025-09-21 時点の最新を参照。更新時はこのタスクに追記するか別途タスクを切る。
- Streaming 対応は外部依存が大きいため別タスク化を推奨。
