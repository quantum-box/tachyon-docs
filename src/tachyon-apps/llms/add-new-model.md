# LLMモデル追加手順

新しいLLMモデルをプロバイダーに追加し、agent APIで利用可能にするための手順。

## 概要

モデル追加には以下の箇所を更新する必要がある:

| # | ファイル | 目的 |
|---|---------|------|
| 1 | `packages/providers/{provider}/src/ai_models.rs` | モデル定数・定義 |
| 2 | `packages/providers/{provider}/src/pricing.rs` | トークン料金 |
| 3 | `packages/providers/{provider}/src/provider_info.rs` | モデル情報・説明 |
| 4 | `packages/providers/{provider}/src/chat.rs` | **サポートモデル一覧** |
| 5 | `scripts/seeds/n1-seed/005-order-products.yaml` | カタログバリアント登録 |
| 6 | `scripts/seeds/n1-seed/007-procurement-suppliers.yaml` | 調達価格（任意） |

## 手順詳細

### Step 1: プロバイダークレートの更新

#### 1-1. モデル定義 (`ai_models.rs`)

```rust
pub mod model_names {
    pub const NEW_MODEL: &str = "new-model-name";
}

pub const PROVIDER_MODELS: &[LLMModel] = &[
    LLMModel {
        name: model_names::NEW_MODEL,
        context_length: 2_000_000,
        model_type: "chat",
    },
];
```

#### 1-2. 料金設定 (`pricing.rs`)

NanoDollar単位で設定（1 USD = 1,000,000,000 NanoDollars）。

```rust
map.insert(
    "new-model-name",
    ModelPricing {
        model_name: "new-model-name".to_string(),
        input_token_cost: NanoDollar::new(200),
        output_token_cost: NanoDollar::new(500),
        cached_input_token_cost: Some(NanoDollar::new(50)),
        cache_creation_input_token_cost: None,
    },
);
```

#### 1-3. モデル情報 (`provider_info.rs`)

- `build_model_info()` の match 分岐に追加
- `get_all_models_info()` の配列にモデル名を追加

#### 1-4. サポートモデル一覧 (`chat.rs`) ⚠️ 最も忘れやすい

`ChatStreamProviderV2::get_supported_models()` に `ModelInfo` を追加する。
**これを忘れると `/v1/llms/models` APIに表示されない。**

```rust
ModelInfo {
    id: "provider/new-model-name".to_string(),
    name: "new-model-name".to_string(),
    description: Some("Description here".to_string()),
    context_window: Some(2_000_000),
    max_output_tokens: Some(16_384),
    supported_features: vec![
        SupportedFeature::Streaming,
        SupportedFeature::FunctionCalling,
        SupportedFeature::SystemPrompt,
        SupportedFeature::JsonMode,
        SupportedFeature::Agent,  // agent APIで使う場合は必須
    ],
},
```

### Step 2: カタログバリアント登録

`scripts/seeds/n1-seed/005-order-products.yaml` の3テーブルにレコードを追加する。
IDは `mise run ulid` で生成。

#### 2-1. `tachyon_apps_order.product_variants`

```yaml
- id: pv_{ULID}
  product_id: pd_01jy5ms9f16xpgjk6a4hkp9knn  # Agent API プロダクト
  tenant_id: tn_01jcjtqxah6mhyw4e5mahg02nd    # Hostテナント
  code: new-model-name
  name: New Model Display Name
  status: ACTIVE
  publication_status: PUBLIC
  publication_name: New Model Display Name
  publication_description: null
  metadata:
    provider: provider_name    # openai, anthropic, google_ai, xai 等
    model: new-model-name
    service_type: agent_api
    context_window: 2000000
    release_tag: "2026-02"
  created_at: 2026-02-06 00:00:00.000000
  updated_at: 2026-02-06 00:00:00.000000
```

#### 2-2. `tachyon_apps_order.variant_procurement_links`

```yaml
- id: vpl_{ULID}
  tenant_id: tn_01jcjtqxah6mhyw4e5mahg02nd
  variant_id: pv_{上で作成したバリアントのID}
  supplier_id: provider_name
  procurement_code: new-model-name
  metadata:
    contract_id: sc_01hqzd456789012mnopqrstuvw
    legacyMigrated: false
  created_at: 2026-02-06 00:00:00.000000
  updated_at: 2026-02-06 00:00:00.000000
```

#### 2-3. `tachyon_apps_order.product_usage_pricing`

```yaml
- id: pup_{ULID}
  product_id: pd_01jy5ms9f16xpgjk6a4hkp9knn
  tenant_id: tn_01jcjtqxah6mhyw4e5mahg02nd
  variant_id: pv_{上で作成したバリアントのID}
  metadata:
    model: new-model-name
    provider: provider_name
    service_type: agent_api
  usage_rates:
    base_fee:
      description: 基本実行料金
      minimum_units: 1
      rate_per_unit: 10000
      rate_per_unit_nanodollar: 100000000
      rate_type: base_fee
      unit: execution
    prompt_tokens:
      description: プロンプトトークンの使用料
      minimum_units: 1
      rate_per_unit: 0.2
      rate_per_unit_nanodollar: 200        # NanoDollar/token
      rate_type: prompt_tokens
      unit: token
    completion_tokens:
      description: 完了トークンの使用料
      minimum_units: 1
      rate_per_unit: 0.5
      rate_per_unit_nanodollar: 500        # NanoDollar/token
      rate_type: completion_tokens
      unit: token
  created_at: 2026-02-06 00:00:00
  updated_at: 2026-02-06 00:00:00
```

### Step 3: 反映

```bash
# シードをDBに投入
mise run docker-seed

# APIを再起動（baconが変更を検知しない場合）
docker compose restart tachyon-api
```

### Step 4: 確認

```bash
# モデル一覧APIに表示されるか
curl -s "http://0.0.0.0:${TACHYON_API_HOST_PORT}/v1/llms/models?supported_feature=agent" \
  -H "x-operator-id: tn_01hjryxysgey07h5jz5wagqj0m" \
  -H "Authorization: Bearer dummy-token" | jq '.models[] | select(.id | test("new-model"))'

# agent APIで実行できるか（チャットルームを事前に作成）
curl -s -X POST "http://0.0.0.0:${TACHYON_API_HOST_PORT}/v1/llms/chatrooms/{chatroom_id}/agent/execute" \
  -H "Content-Type: application/json" \
  -H "x-operator-id: tn_01hjryxysgey07h5jz5wagqj0m" \
  -H "Authorization: Bearer dummy-token" \
  -d '{"task":"Hello"}'
```

## よくあるエラーと原因

| エラーメッセージ | 原因 | 対処 |
|----------------|------|------|
| モデル一覧に表示されない | `chat.rs` の `get_supported_models()` 未追加 | Step 1-4 を実施 |
| "not available for this tenant" | カタログバリアント未登録 | Step 2-1 を実施 |
| "No price mapping found" | `product_usage_pricing` 未登録 | Step 2-3 を実施 |
| 変更が反映されない | API再起動忘れ | `docker compose restart tachyon-api` |
