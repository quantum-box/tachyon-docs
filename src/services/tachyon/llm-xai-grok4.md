---
title: xAI Grok-4 プロバイダ統合
description: Tachyon Apps における xAI Grok-4 ファミリー統合の仕様と運用手順
published: true
---

# xAI Grok-4 プロバイダ統合

## 概要

xAI の Grok-4 ファミリー（Grok 4 / Grok 4 Fast Reasoning / Grok 4 Fast Non-Reasoning / Grok Code Fast 1）を Tachyon LLM プラットフォームへ追加し、バックエンドの推論ルーティング・調達／価格計算・UI 上のモデル選択を一貫して利用できるようにした。Rust 製プロバイダ `packages/providers/xai` を新設し、`LLMProviders`・`PricingRegistry`・Procurement シード・Tachyon UI をそれぞれ更新している。

## 対象範囲

- LLM コンテキスト（Rust）: `packages/providers/xai`, `packages/llms`
- Tachyon API DI: `apps/tachyon-api/src/di.rs`
- Procurement / Pricing シード: `scripts/seeds/n1-seed/007-procurement-suppliers.yaml`, `scripts/seed-pricing-data.sql`
- Tachyon UI モデル一覧: `apps/tachyon/src/app/v1beta/[tenant_id]/ai/data/models.ts`

## バックエンド構成

### プロバイダクレート
- `packages/providers/xai`
  - `chat.rs`: `/v1/chat/completions` へ JSON リクエストを送信し、`LLMProvider` と `ChatProvider` を実装。
  - `ai_models.rs`: Grok 4 系の代表モデル ID を列挙し、`LLMModel` の配列 `XAI_MODELS` を提供。
  - `pricing.rs`: `XaiPricingProvider` が NanoDollar 換算済みのトークン単価を `ModelPricing` として返却。
  - `provider_info.rs`: `ProviderInfoProvider` を実装し、モデル説明・レートリミット・ユースケース等のメタデータを catalog コンテキストへ供給。
- API ベース URL: `https://api.x.ai/v1`
- 認証: `Authorization: Bearer <XAI_API_KEY>`（環境変数必須）。未設定の場合は起動時に `XAI_API_KEY must be set to use xAI provider` を panic。
- エラーハンドリング: HTTP 失敗・JSON 解析失敗時に `errors::Error::provider_error("xai", ...)` を返却し、LLM エコシステム全体で一貫した 4xx/5xx のマッピングが行える。
- 可観測性: `tracing` で `request`, `response` を debug ログ出力し、モデル名と HTTP ステータスを追跡可能。

### DI / Registry
- `packages/llms` の `LLMProviders` 初期化で `Arc::new(xai::Xai::new_with_default())` を登録し、`LLMProviders::add` によって既存プロバイダ群へ追加。
- `ChatStreamProviders` は未対応（ストリーミング API が提供され次第、別タスクで検討）。
- `apps/tachyon-api/src/di.rs` 内の `LlmsModule` で xAI プロバイダと `XaiPricingProvider` を DI 登録し、`PricingRegistry::register_provider("xai", ...)` へ追加。

## 料金テーブル（NanoDollar）

公式料金を 2025-09-21T04:28:16Z 時点の USD 公開値から換算した。

| モデル | プロンプト ND/トークン | 完了 ND/トークン | キャッシュ ND/トークン | コンテキスト | エイリアス |
|--------|------------------------|-------------------|-------------------------|-------------|-------------|
| grok-4 | 3,000 | 15,000 | 750 | 131,072 tokens | - |
| grok-4-fast-reasoning | 200 | 500 | 50 | 131,072 tokens | `grok-4-fast`, `grok-4-fast-reasoning-latest` |
| grok-4-fast-non-reasoning | 200 | 500 | 50 | 131,072 tokens | `grok-4-fast-non-reasoning-latest` |
| grok-code-fast-1 | 150 | 600 | — | 65,536 tokens | - |

> 1 USD = 1,000,000,000 NanoDollar 換算。大型コンテキスト (256K 超) の追加単価は xAI 公開情報に従い注記のみ管理。

## 調達・価格データ

- サプライヤー: `scripts/seeds/n1-seed/007-procurement-suppliers.yaml`
  - `suppliers.id = sp_01k5n8ppfh2mb4pm1e5r563bc9` として xAI を追加。
  - `supply_contracts.id = sc_01k5n8psgake98fdhs55mdvaqy` で「xAI Grok Enterprise 2025」契約を登録。
  - `procurement_prices` に Grok 4 系リソースタイプを NanoDollar 換算済みで追加 (`grok-4-prompt-tokens` 等)。
- サービス価格マッピング: `scripts/seed-pricing-data.sql`
  - `API-GROK4FAST-001`（Reasoning）向け製品を追加し、対応する `service_price_mappings` に調達原価 ID (`proc_01k5ndyxn5hjv3bcrknq9kvjw9` など) を紐付けた。Non-Reasoning / Code Fast 分も調達原価 ID を参照するマッピングを追加済み。
  - 既存テナント `tn_01hjryxysgey07h5jz5wagqj0m` の販売価格サンプルを更新し、マークアップ率を 1.3–1.4 倍で設定。
- シード投入手順: `mise run up` で MySQL を起動後、`cargo run -p yaml-seeder -- apply dev scripts/seeds/n1-seed`（本番は `apply prod`）と `mysql -h 127.0.0.1 -P 15000 -u root < scripts/seed-pricing-data.sql` を実行。

## UI / カタログ更新

- `apps/tachyon/src/app/v1beta/[tenant_id]/ai/data/models.ts`
  - モデルタイプに `Grok` を追加し、Grok 4 系および `grok-code-fast-1` をリスト末尾に掲載。
  - `strengths` フィールドで推奨ユースケースを記述し、既存 UI のフィルタリングとタグ表示に連携。
- `catalog` モジュールは `XaiProviderInfo` から取得したメタデータを GraphQL / REST モデル一覧 API で返却。

## 運用と設定

- 環境変数: `XAI_API_KEY`（Tachyon API, background worker いずれも必須）。Secrets Manager / `.env.local` へ追加すること。
- Rate Limit: 既定契約では RPM 600 / TPM 8,000,000。高頻度利用時は xAI へクォーター拡張を申請。
- エラーメッセージ: Provider 側 4xx/5xx は `provider_error("xai", ...)` としてフロントまで伝播。UI 側は既存の Provider エラー表示コンポーネントで取り扱う。
- 監視: `tracing` ログに `provider=xai` が付与されるため、Grafana Loki のクエリ `provider="xai"` で抽出可能。

## テストと検証

- Rust: `cargo nextest run -p xai` でプロバイダ単体テスト、`mise run check` でワークスペース検証。
- Node: `yarn ts --filter=tachyon` で型チェック。
- DB シード: `cargo run -p yaml-seeder -- validate scripts/seeds/n1-seed/007-procurement-suppliers.yaml` で検証モード実行可能。
- エンドツーエンド: `apps/tachyon-api` の GraphQL `models` クエリで `providerId = "xai"` のレコードが返ることを確認。

## 既知の制約

- ストリーミング API は未実装（xAI 側の公式サポート待ち）。`ChatStreamProviders` への登録は保留。
- xAI の Tool Calling はベータ提供のため未対応。必要なら `chat.rs` に arguments payload の追加実装が必要。
- `grok-4` の 256K 超コンテキスト単価は注記のみ管理しており、Procurement では別 SKU を未作成。

## 参考資料

- xAI Pricing: <https://api.x.ai/docs/pricing>（取得日時: 2025-09-21T04:28:16Z）
- タスクドキュメント: `docs/src/tasks/completed/v0.12.0/integrate-xai-grok4-provider/task.md`
- 調達・価格シード: `scripts/seeds/n1-seed/007-procurement-suppliers.yaml`, `scripts/seed-pricing-data.sql`
