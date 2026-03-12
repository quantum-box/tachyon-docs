# Pricing Phase 4B: ServicePriceMapping / PricingPlan 削除

## 概要

Phase 4Aで旧`PricingService`/`PricingEngine`を削除済み。
Phase 4Bでは`profit`パッケージのリファクタリング完了後に、残存する旧価格管理コード（`ServicePriceMapping`/`PricingPlan`）を削除する。

## 背景

`packages/profit/`が`ServicePriceMappingRepository`に直接依存しているため、Phase 4Aでは安全に削除できなかった。
profitパッケージを`PricingApp`経由に移行した後に実施する。

## 前提条件

- [x] Phase 4A完了（PR #1116）: 旧PricingService/PricingEngine削除、トレイト統合
- [x] `packages/profit/`の`ServicePriceMappingRepository`依存をPricingApp経由に移行（packages/analytics にリネーム済み）

## ステータス

- [x] Step 1: profitパッケージのServicePriceMapping依存を調査・移行
- [x] Step 2: ServicePriceMapping / PricingPlan 削除
- [x] Step 3: CatalogAppServiceから旧メソッド削除
- [x] Step 4: 旧GraphQLクエリ/ミューテーション削除
- [x] Step 5: 旧RESTエンドポイント削除
- [x] Step 6: 旧シナリオテスト削除
- [x] Step 7: 最終検証（`mise run check` パス確認済み）

## 削除対象

### ドメインファイル（削除済み）

| ファイル | 理由 |
|---------|------|
| `packages/catalog/src/service_pricing/service_price_mapping.rs` | 旧価格マッピング |
| `packages/catalog/src/service_pricing/pricing_plan.rs` | 旧価格プラン |
| `packages/catalog/src/service_pricing/sqlx_service_price_mapping_repository.rs` | 旧SQLxリポジトリ |
| `packages/catalog/src/service_pricing/sqlx_pricing_plan_repository.rs` | 旧SQLxリポジトリ |

### Usecase（削除済み）

| ファイル | 理由 |
|---------|------|
| `packages/catalog/src/usecase/create_pricing_plan.rs` | 旧プラン作成 |
| `packages/catalog/src/usecase/update_pricing_plan.rs` | 旧プラン更新 |
| `packages/catalog/src/usecase/set_service_price_mapping.rs` | 旧マッピング設定 |
| `packages/catalog/src/usecase/get_service_price_history.rs` | 旧履歴取得 |
| `packages/catalog/src/usecase/calculate_service_cost.rs` | 旧コスト計算（削除対象の型に依存） |

### CatalogAppServiceトレイトメソッド（削除済み）

- `calculate_service_cost()` — 旧ProductId指定のコスト計算
- `calculate_service_cost_with_currency()` — 通貨指定付きコスト計算
- `get_effective_price()` — 旧有効価格取得
- `get_effective_price_with_currency()` — 通貨指定付き有効価格取得

### GraphQL（削除済み）

- `service_price_mappings` クエリ
- `pricing_plans` クエリ
- `calculate_service_cost` クエリ
- `service_price_history` / `service_price_history_by_period` / `latest_service_price_history` クエリ
- 全ミューテーション（noopプレースホルダーに置換）
- `ServicePriceMapping` / `PricingPlan` / `CreatePricingPlanInput` / `UpdatePricingPlanInput` 型

### REST（削除済み）

- `POST /v1/catalog/service-cost/estimate` — 旧コスト見積もり
- `POST /v1/payment/verify-service-cost` — payment側の検証エンドポイント

### シナリオテスト（削除済み）

- `catalog_service_price_mapping.scenario.md`
- `catalog_service_price_mapping_create.scenario.md`
- `catalog_service_cost.scenario.md`
- `payment_service_cost_check.scenario.md`

## 外部参照の修正（完了済み）

| ファイル | 修正内容 |
|---------|---------|
| `apps/tachyon-api/src/di.rs` | 旧リポジトリの生成・ビルダー呼び出し削除 |
| `apps/tachyon-cli/src/services.rs` | モックの旧メソッド削除 |
| `apps/tachyon-cli/src/agent_builtin.rs` | `calculate_service_cost` → `calculate_service_cost_for_llm_model` に移行 |
| `packages/analytics/src/app.rs` | `ServicePriceMappingRepository` 依存削除 |
| `packages/analytics/src/service/profit_service.rs` | `service_price_mapping_repo` 削除、`calculate_summary()` スタブ化 |
| `packages/llms/examples/*.rs` | ビルダーから旧リポジトリ設定削除 |
| `packages/llms/src/usecase/completion_chat.rs` | `calculate_service_cost` → `calculate_service_cost_for_llm_model` に移行 |
| `packages/llms/src/usecase/stream_completion_chat.rs` | 同上 + `StreamBillingContext` から `product_id` を `provider_name`/`model_name` に変更 |
| `packages/llms/tests/**` / `packages/llms/src/**/test*.rs` | モックの旧メソッド削除 |
| `apps/stockmind/src/main.rs` | NoOpCatalogApp から旧メソッド削除 |
| `packages/crm/bin/sync_hubspot_products.rs` | ビルダーから旧リポジトリ設定削除 |
| `packages/payment/src/adapter/axum/mod.rs` | `verify_service_cost` エンドポイント削除 |

## リスク

| 項目 | リスク | 対策 |
|------|--------|------|
| profit依存 | ~~HIGH~~ 解消済み | analytics にリネーム・リファクタリング済み |
| GraphQL破壊的変更 | MEDIUM | フロントエンドで使用箇所がないことを確認 |
| RESTエンドポイント | LOW | 外部利用がないことを確認 |

## 気づき・メモ

- `service_cost_calculator.rs` はデータ型（`UsageInfo`, `CostItem`, `ServiceCostBreakdown`, `DiscountInfo`）が他コンテキストで使用されているため保持。`ServiceCostCalculator` 構造体のみ削除。
- `ServicePriceHistoryRepository` と関連ファイルは削除スコープ外として保持。
- `CatalogLlmPricingFallback` の `LlmPricingFallbackProvider` 実装は ServicePriceMapping とは無関係のため保持。
- `calculate_service_cost` から `calculate_service_cost_for_llm_model` への移行: `product_id` ベースから `provider_name`/`model_name` ベースに変更。テナントID は `None`（フラットプロバイダー価格）を使用。
