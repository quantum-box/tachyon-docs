# Pricing Context Phase 3 & 4: 既存システム接続 + 旧コード廃止

## 概要

Phase 1-2 で構築した階層型テナント価格設定システム（Pricing Context）を、
既存の LLM 課金フロー（BillingAwareRecursiveAgent → CatalogApp → PricingRegistry）に統合する。

## 背景

現在の LLM 課金フローは `PricingRegistry` からハードコードされた調達原価を直接参照しており、
テナント階層（Host → Platform → Operator）ごとのマークアップが反映されない。

**現状:**
```
BillingAwareRecursiveAgent
  → CatalogApp::calculate_service_cost_for_llm_model(provider, model, usage)
    → PricingRegistry (ハードコード原価) → 全テナント同一料金
```

**目標:**
```
BillingAwareRecursiveAgent
  → CatalogApp::calculate_service_cost_for_llm_model_v2(tenant_id, provider, model, usage)
    → PricingApp::resolve_price(tenant_id, sku_code)
      → Host原価 → Platform markup → Operator markup + adjustments
      → テナント別の販売価格で課金
```

## ステータス

- [x] Phase 3 Step 1: SKUシードデータ作成
- [x] Phase 3 Step 2: デフォルト RateCard シードデータ
- [x] Phase 3 Step 3: CatalogAppService トレイト拡張
- [x] Phase 3 Step 4: 機能フラグ `context.pricing_v2`
- [x] Phase 3 Step 5: BillingAwareRecursiveAgent 統合
- [x] Phase 3 Step 6: DI 配線更新
- [x] Phase 3 Step 7: シナリオテスト拡張
- [x] Phase 4A Step 1: 機能フラグ削除 (PR #1116)
- [x] Phase 4A Step 2: 旧 PricingService/PricingEngine 削除 (PR #1116)
- [x] Phase 4A Step 3: v2 メソッド統合 + CatalogApp クリーンアップ (PR #1116)
- [ ] Phase 4B Step 1: ServicePriceMapping 削除 → 別タスク: `todo/pricing-phase4b-service-price-mapping-removal`

## Phase 3: 既存システムとの接続

### Step 1: SKUシードデータ作成

**新規ファイル:** `scripts/seeds/n1-seed/009-pricing-skus.yaml`

全LLMモデルの SKU を pricing_skus テーブルに投入。各モデルにつき最大4種類:
- `{model}-input-token` (LlmInputToken)
- `{model}-output-token` (LlmOutputToken)
- `{model}-cached-input-token` (CachedInputToken) ※対応モデルのみ
- `{model}-cache-creation-token` (CacheCreationInputToken) ※Anthropic/Bedrock のみ

**対象モデル:**

| Provider | Models |
|----------|--------|
| anthropic | claude-opus-4-6, claude-sonnet-4-6, claude-sonnet-4, claude-haiku-4, claude-3-5-haiku |
| openai | gpt-5.2, gpt-4.1, gpt-4.1-mini, gpt-4.1-nano, gpt-4o, gpt-4o-mini, o3, o3-mini |
| google_ai | gemini-3-0-pro-preview, gemini-3-0-flash-preview, gemini-2-5-flash-lite |
| xai | grok-4, grok-4-fast, grok-code-fast-1 |
| zai | glm-5, glm-4.7, glm-4.7-flashx, glm-4.7-flash |
| bedrock | bedrock/claude-4-6-opus, bedrock/claude-4-5-sonnet, bedrock/claude-4-5-haiku |

SKU metadata: `{ "provider": "anthropic", "model": "claude-sonnet-4-6" }`

### Step 2: デフォルト RateCard シードデータ

**新規ファイル:** `scripts/seeds/n1-seed/010-pricing-rate-cards.yaml`

- Host: RateCard なし（未設定 = PassThrough、調達原価そのまま）
- Platform (`tn_01hjryxysgey07h5jz5wagqj0m`): 全SKUに Markup 25%

### Step 3: CatalogAppService トレイト拡張

**対象ファイル:**
- `packages/catalog/src/app.rs` — CatalogAppService trait + CatalogApp impl

新メソッド追加:
```rust
async fn calculate_service_cost_for_llm_model_v2(
    &self,
    tenant_id: &TenantId,
    provider_name: &str,
    model_name: &str,
    usage: &UsageInfo,
) -> errors::Result<ServiceCostBreakdown>;
```

CatalogApp に `pricing_app: Option<Arc<dyn tachyon_apps::pricing::PricingApp>>` を追加。

### Step 4: 機能フラグ

**対象ファイル:** `scripts/seeds/n1-seed/007-feature-flags.yaml`

- key: `context.pricing_v2`
- enabled: false (デフォルト OFF)

### Step 5: BillingAwareRecursiveAgent 統合

**対象ファイル:** `packages/llms/src/agent/billing_aware.rs`

Feature flag ON 時に `calculate_service_cost_for_llm_model_v2()` を呼ぶ。
OFF 時は従来通り `calculate_service_cost_for_llm_model()` を呼ぶ。

### Step 6: DI 配線更新

**対象ファイル:** `apps/tachyon-api/src/di.rs`

- CatalogApp 構築時に `pricing_app` を注入
- BillingAwareRecursiveAgent に FeatureFlagApp を渡す

### Step 7: シナリオテスト拡張

**対象ファイル:** `apps/tachyon-api/tests/scenarios/pricing_rest.scenario.md`

価格解決テストステップ追加。

## Phase 4: 旧コード廃止

### Step 1: v2 メソッド統合
旧メソッドの内部実装を v2 に切り替え。tenant_id なしの場合は Host（PassThrough）で計算。

### Step 2: 旧 PricingService 削除
`packages/catalog/src/pricing/` の service.rs, engine.rs, domain/ を削除。

### Step 3: ServicePriceMapping 削除
`packages/catalog/src/service_pricing/` の service_price_mapping.rs, pricing_plan.rs を削除。

### Step 4: 機能フラグ削除
`context.pricing_v2` フラグを削除し新コードパスのみに統一。

### Step 5: CatalogApp クリーンアップ
不要になったリポジトリフィールドと Builder メソッドを削除。

## 主要ファイル

| ファイル | 変更内容 |
|---------|---------|
| `scripts/seeds/n1-seed/009-pricing-skus.yaml` | 新規: SKUシード |
| `scripts/seeds/n1-seed/010-pricing-rate-cards.yaml` | 新規: RateCardシード |
| `scripts/seeds/n1-seed/007-feature-flags.yaml` | 変更: pricing_v2 フラグ追加 |
| `packages/catalog/src/app.rs` | 変更: v2 メソッド追加、pricing_app 依存追加 |
| `packages/llms/src/agent/billing_aware.rs` | 変更: v2 分岐追加 |
| `apps/tachyon-api/src/di.rs` | 変更: CatalogApp に pricing_app 注入 |
| `packages/catalog/src/pricing/` | Phase 4 で削除 |
| `packages/catalog/src/service_pricing/service_price_mapping.rs` | Phase 4 で削除 |
| `packages/catalog/src/service_pricing/pricing_plan.rs` | Phase 4 で削除 |

## 検証方法

1. `mise run docker-seed` → pricing_skus に全モデルSKU登録確認
2. `POST /v1/pricing/resolve` でテナント階層価格解決が動作
3. `mise run tachyon-api-scenario-test` 全パス
4. Feature flag ON → Agent API で階層マークアップ適用後の料金で課金
5. Feature flag OFF → 従来通りの料金で課金（後方互換）
6. Phase 4 後 → `mise run docker-ci` 全パス

## 気づき・メモ

- (実装中に追記)
