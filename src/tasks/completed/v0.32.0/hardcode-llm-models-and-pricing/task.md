# LLMモデル定義と料金のハードコード化

## 概要

現状、LLMモデル一覧とCatalog（課金対象モデル）が別管理されており、不整合が発生している。
プロバイダー側にモデル定義と料金をハードコードし、Catalogがそれを参照する形に統一する。

## 背景・課題

### 現状の問題
- **プロバイダー**: 13モデル提供（ハードコード）
- **Catalog（DB）**: 6モデルのみ登録
- `require_agent_product=false` で全モデル取得、`true` でCatalog登録モデルのみ
- モデル追加時にDB（シード）更新が必要で、忘れると不整合

### 現状のデータフロー
```
Provider（ハードコード）         Catalog（DB）
  └── モデル一覧                  └── product_usage_pricing
        ↓                               ↓
  get_supported_models()          list_agent_api_models()
        ↓                               ↓
        └───────── 突合 ─────────────────┘
                    ↓
              モデル一覧API
```

## 設計

### 新しいデータフロー
```
Provider（ハードコード）  ←── 真実の源
  ├── モデル一覧
  ├── 料金（nanodollar/token）
  └── 機能フラグ
        ↓ 自動参照
Catalog（コード）
  └── Provider定義をProductとして扱う
        ↓ 上書き（オプション）
IaCマニフェスト（Platform/Operator）
  └── 有効/無効、料金上書き
```

### プロバイダー側の変更

```rust
// packages/providers/anthropic/src/pricing.rs（新規）
use llms_domain::NanoDollar;

pub struct ModelPricing {
    pub model_id: &'static str,
    pub input_price: NanoDollar,   // per token
    pub output_price: NanoDollar,  // per token
}

pub fn model_pricing() -> Vec<ModelPricing> {
    vec![
        ModelPricing {
            model_id: "anthropic/claude-opus-4.5",
            input_price: NanoDollar::new(15_000),   // $0.000015
            output_price: NanoDollar::new(75_000),  // $0.000075
        },
        ModelPricing {
            model_id: "anthropic/claude-sonnet-4.5",
            input_price: NanoDollar::new(3_000),    // $0.000003
            output_price: NanoDollar::new(15_000),  // $0.000015
        },
        ModelPricing {
            model_id: "anthropic/claude-haiku-4.5",
            input_price: NanoDollar::new(1_000),    // $0.000001
            output_price: NanoDollar::new(5_000),   // $0.000005
        },
        // ...
    ]
}
```

### Catalog側の変更

```rust
// CatalogAppService トレイト
impl CatalogAppService for CatalogApp {
    async fn list_agent_api_models(&self) -> Result<Vec<AgentCatalogModel>> {
        // DB読みをやめて、Providerの定義から生成
        let models = self.model_registry.all_models();
        Ok(models.into_iter().map(|m| AgentCatalogModel {
            product_id: ProductId::from_model_id(&m.id), // 決定論的生成
            provider: m.provider.clone(),
            model: m.name.clone(),
            // ...
        }).collect())
    }

    async fn calculate_service_cost(&self, ...) -> Result<ServiceCostBreakdown> {
        // Provider定義の料金を使用
        let pricing = self.model_registry.get_pricing(&model_id)?;
        // IaCマニフェストで上書きがあればそちらを優先
        let effective_pricing = self.apply_tenant_overrides(tenant_id, pricing)?;
        // 計算
    }
}
```

### IaCマニフェストでの上書き

```yaml
# scripts/seeds/n1-seed/003-iac-manifests.yaml
spec:
  providers:
    - name: anthropic
      provider_type: ai
      config:
        api_key: xxx

  # 新規追加
  llm_models:
    # 許可リスト（省略時は全モデル有効）
    enabled:
      - anthropic/claude-sonnet-4.5
      - anthropic/claude-haiku-4.5
      - openai/gpt-5
    # 禁止リスト
    disabled:
      - anthropic/claude-opus-4.5  # コスト高いので無効化
    # 料金上書き（マージン追加等）
    pricing_overrides:
      - model: anthropic/claude-sonnet-4.5
        input_price: 4000   # nanodollar（上乗せ）
        output_price: 18000
```

## 実装タスク

### Phase 1: プロバイダー側に料金定義追加 ✅ **完了（既存）**
- [x] `packages/providers/llms_provider/src/v2/mod.rs` に `ModelPricing` 追加（既存）
- [x] `packages/providers/anthropic/src/pricing.rs` 作成（既存）
- [x] `packages/providers/openai/src/pricing.rs` 作成（既存）
- [x] `packages/providers/google_ai/src/pricing.rs` 作成（既存）
- [x] `packages/providers/aws/src/bedrock/pricing.rs` 作成（既存）

**発見**: `procurement_domain::ModelPricing`と`PricingProvider`トレイトが既に存在し、各プロバイダーは`pricing.rs`で料金をNanoDollar単位で定義済み。

### Phase 2: モデルレジストリ作成 ✅ **完了**
- [x] `packages/llms/src/registry/model_registry.rs` 作成
- [x] 全プロバイダーのモデル定義を集約（`ChatStreamProviders` + `PricingRegistry`）
- [x] `ModelId` から `ProductId` への決定論的変換（`generate_product_id_for_model`）

**実装内容**:
```rust
// packages/llms/src/registry/model_registry.rs
pub struct ModelRegistry {
    chat_stream_providers: Arc<ChatStreamProviders>,
    pricing_registry: Arc<PricingRegistry>,
}

// モデルIDから決定論的にProductIdを生成
pub fn generate_product_id_for_model(model_id: &str) -> String {
    // SHA-256ハッシュ → Crockford Base32 → "pd_"プレフィックス
}
```

### Phase 3: Catalog統合 ✅ **完了**
- [x] `GetSupportedModels`のDB依存を排除
- [ ] ~~`list_agent_api_models()` をレジストリ参照に変更~~（不要になった）
- [ ] `calculate_service_cost()` をレジストリ料金参照に変更（将来タスク）
- [ ] `get_product_id_for_model()` を決定論的生成に変更（将来タスク）

**実装内容**:
- `GetSupportedModels`からCatalog DB参照（`list_agent_api_models()`呼び出し）を削除
- `SupportedFeature::Agent`フラグでフィルタリング（プロバイダー定義が真実の源）
- `require_agent_product=true`でも動作は同じ（後方互換性維持）

### Phase 4: IaCマニフェスト対応 📝 **将来タスク**
- [ ] `ProjectConfig` スキーマに `llm_models` セクション追加
- [ ] テナント別のモデル有効/無効切り替え
- [ ] テナント別の料金上書き

**スコープ**: テナント別カスタマイズは今回のスコープ外。基本機能（DB依存排除）を先に完了。

### Phase 5: クリーンアップ 🔄 **進行中**
- [ ] `require_agent_product` パラメータを非推奨化（削除は将来）
- [ ] DB `product_usage_pricing` のLLM関連データ削除（または廃止）
- [x] シナリオテストは変更不要（`require_agent_product=false`でテスト済み）

## 削除対象

- `GET /v1/llms/models?require_agent_product=xxx` の `require_agent_product` パラメータ
- `product_usage_pricing` テーブルのLLMモデル関連エントリ
- `catalog::App::list_agent_api_models()` のDB参照ロジック

## 移行の注意点

- 既存の料金計算ロジックとの互換性を維持
- 既存のシナリオテストが通ることを確認
- NanoDollar単位系は維持

## 参考

- 現在のモデル料金: CLAUDE.md の「LLMモデル料金（NanoDollar単位）」セクション
- IaCマニフェスト: `scripts/seeds/n1-seed/003-iac-manifests.yaml`

---

## 実装サマリー（2025-01-15）

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `packages/llms/src/registry/model_registry.rs` | 新規作成: モデルと料金の統合レジストリ |
| `packages/llms/src/registry/mod.rs` | `model_registry`モジュールをエクスポート |
| `packages/llms/src/usecase/get_supported_models.rs` | DB依存を排除、プロバイダー定義のみに依存 |

### 主な変更点

1. **`ModelRegistry`の追加**: `ChatStreamProviders`と`PricingRegistry`を統合し、モデル情報と料金を一元管理

2. **`generate_product_id_for_model`関数**: モデルIDからSHA-256ハッシュを計算し、決定論的なProductIdを生成

3. **`GetSupportedModels`の簡素化**:
   - 旧: プロバイダーモデル + Catalog DB照合
   - 新: プロバイダーモデルのみ（`SupportedFeature::Agent`でフィルタ）

### 後方互換性

- `require_agent_product`パラメータは非推奨だが動作する
- APIレスポンス形式は変更なし
- シナリオテストは変更なしで通過

### 残作業

1. **料金計算の移行**: `calculate_service_cost`が`PricingRegistry`を参照するように変更
2. **ProductId生成の統一**: `get_product_id_for_model`を決定論的生成に変更
3. **DB削除**: `product_usage_pricing`テーブルのLLMモデル関連データ削除
4. **IaC対応**: テナント別モデル制限・料金上書き機能（将来タスク）
