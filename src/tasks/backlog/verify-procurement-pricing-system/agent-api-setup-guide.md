# Agent API価格設定セットアップガイド

## 概要
Agent APIを動作させるためには、調達価格（Procurement）と販売価格（Service Price Mapping）の両方を設定する必要があります。このドキュメントでは、Agent APIの実装調査に基づいた正確な価格設定手順を説明します。

## 前提条件
- MySQLデータベースが起動していること
- 以下のデータベースが作成されていること：
  - `tachyon_apps_order`
  - `tachyon_apps_procurement`
  - `tachyon_apps_payment`（Stripe統合用）

## Agent APIの価格計算の仕組み

### 現在の実装（AgentCostCalculator）
Agent APIは内部で固定のコスト値を使用しています：
- **基本コスト**: 10クレジット/実行
- **トークンコスト**: 
  - プロンプト: 0.01クレジット/トークン
  - 完了: 0.02クレジット/トークン
- **ツール使用コスト**:
  - MCPツール: 20-50クレジット/使用
  - 一般ツール: 20-50クレジット/使用

**注意**: 内部では0.1クレジット精度のため、すべての値は10倍で保存されます。

### 商品IDマッピング（ハードコード箇所）
```rust
// packages/llms/src/usecase/execute_agent.rs:99-101
fn get_product_id_for_provider(&self, provider_name: &str) -> Result<ProductId> {
    let product_id_str = match provider_name {
        "openai" => "pd_01hjn234567890abcdefgh1234",     // ChatGPT API
        "anthropic" => "pd_01hjn234567890abcdefgh5678",  // Claude API  
        "google_ai" => "pd_01hjn234567890abcdefgh9012",  // Gemini API
        _ => {
            return Err(errors::Error::type_error(format!(
                "Unknown provider for product mapping: {}",
                provider_name
            )))
        }
    };
    // ...
}
```

## 必要な価格設定

### 1. 調達価格の設定（Procurement）

現在のAgent API実装では調達価格は直接使用されていませんが、将来の動的価格設定のために設定しておくことを推奨します。

#### 必要なテーブル：
- `suppliers` - サプライヤー情報
- `supply_contracts` - 供給契約
- `procurement_prices` - 調達価格

### 2. 販売価格の設定（Product & Pricing）

#### 必要なテーブル：
- `products` - 製品情報（ChatGPT API、Claude API、Gemini API）
- `product_usage_pricing` - 従量課金設定（JSON形式）
- `service_price_mappings` - 価格マッピング
- `pricing_plans` - 価格プラン（割引率含む）

#### 重要な設定：
```yaml
resource_type: "agent_execution"  # Agent API実行時に使用されるリソースタイプ
```

## セットアップ手順

### ステップ1: 既存のシードデータを使用

Agent APIはすでに提供されているシードデータで動作します：

1. **調達価格**: `scripts/seed-procurement-data.sql`
2. **販売価格**: `scripts/seed-pricing-data.sql`

これらのファイルにはすでに必要な商品ID（ChatGPT API、Claude API、Gemini API）が含まれています。

### ステップ2: シードデータの実行

```bash
# 調達価格の設定
mysql -h 127.0.0.1 -P 15000 -u root tachyon_apps_procurement < ./scripts/seed-procurement-data.sql

# 販売価格の設定  
mysql -h 127.0.0.1 -P 15000 -u root tachyon_apps_order < ./scripts/seed-pricing-data.sql
```

### ステップ3: 従量課金設定の追加（オプション）

現在のAgent API実装は内部の固定価格を使用していますが、将来的に動的価格設定を使用する場合は以下のテーブルに設定を追加します：

```sql
-- product_usage_pricingテーブルに従量課金レートを設定
INSERT INTO tachyon_apps_order.product_usage_pricing (
    id,
    product_id,
    metric_name,
    pricing_model,
    rates,
    effective_from,
    created_at,
    updated_at
) VALUES (
    'pup_agent_api_001',
    'pd_01hjn234567890abcdefgh1234',  -- ChatGPT API
    'agent_execution',
    'TIERED',
    '{
        "base_rate": 10,
        "prompt_token_rate": 0.01,
        "completion_token_rate": 0.02,
        "tool_usage_rates": {
            "mcp_search": 50,
            "mcp_read": 20,
            "mcp_write": 30,
            "mcp_exec": 40,
            "web_search": 50,
            "code_execution": 30,
            "file_operation": 20
        }
    }',
    NOW(),
    NOW(),
    NOW()
);
```

### ステップ4: 価格設定の確認

```sql
-- 商品の確認
SELECT 
    id,
    name,
    sku_code,
    status
FROM tachyon_apps_order.products
WHERE id IN (
    'pd_01hjn234567890abcdefgh1234',  -- ChatGPT API
    'pd_01hjn234567890abcdefgh5678',  -- Claude API
    'pd_01hjn234567890abcdefgh9012'   -- Gemini API
);

-- 価格プランの確認（割引率）
SELECT 
    plan_code,
    display_name,
    discount_rates
FROM tachyon_apps_order.pricing_plans
WHERE tenant_id = 'tn_01hjryxysgey07h5jz5wagqj0m';
```

## Agent APIの実際のコスト計算

### 内部固定価格（AgentCostCalculator）
```rust
// packages/llms/src/usecase/agent_cost_calculator.rs:38-60
impl AgentCostCalculator {
    pub fn new() -> Self {
        let mut tool_costs = HashMap::new();

        // MCPツール使用料金（内部値: 0.1クレジット単位）
        tool_costs.insert("mcp_search".to_string(), 500);   // 50クレジット
        tool_costs.insert("mcp_read".to_string(), 200);     // 20クレジット
        tool_costs.insert("mcp_write".to_string(), 300);    // 30クレジット
        tool_costs.insert("mcp_exec".to_string(), 400);     // 40クレジット

        // 一般ツール使用料金（内部値: 0.1クレジット単位）
        tool_costs.insert("web_search".to_string(), 500);        // 50クレジット
        tool_costs.insert("code_execution".to_string(), 300);    // 30クレジット
        tool_costs.insert("file_operation".to_string(), 200);    // 20クレジット

        Self {
            base_cost: 100, // 10クレジット/実行（内部値: 100 = 10クレジット）
            token_costs: TokenCosts {
                prompt: 0.01,     // クレジット/トークン（実際の値）
                completion: 0.02, // クレジット/トークン（実際の値）
            },
            tool_costs,
        }
    }
}
```

### コスト計算の流れ
1. **事前見積もり**（estimate_cost）
   - 基本コスト: 10クレジット
   - 予想トークン数から概算

2. **実行中の追跡**
   - ストリーム処理中にトークン使用量を記録
   - ツール使用回数をカウント

3. **最終計算**（calculate_total_cost）
   ```
   total_cost = base_cost + 
                (prompt_tokens × 0.01) + 
                (completion_tokens × 0.02) + 
                Σ(tool_usage_costs)
   ```

## トラブルシューティング

### エラー: "Product not found for provider"
**原因**: LLMプロバイダーに対応する商品IDが見つからない
**解決**: 以下の商品IDが存在することを確認：
- OpenAI: `pd_01hjn234567890abcdefgh1234`
- Anthropic: `pd_01hjn234567890abcdefgh5678`
- Google AI: `pd_01hjn234567890abcdefgh9012`

### エラー: "INSUFFICIENT_CREDITS"
**原因**: クレジット残高不足
**解決**: 
1. クレジット残高を確認
2. 必要に応じてクレジットをチャージ
3. 開発環境では`BILLING_ENABLED=false`で課金を無効化

### 商品IDが見つからない場合
```sql
-- 必要な商品を手動で追加
INSERT INTO tachyon_apps_order.products (
    id, tenant_id, name, sku_code, status, kind,
    publication_status, created_at, updated_at
) VALUES 
('pd_01hjn234567890abcdefgh1234', 'tn_01hjryxysgey07h5jz5wagqj0m', 'ChatGPT API', 'API-CHATGPT-001', 'ACTIVE', 'SERVICE', 'PUBLIC', NOW(), NOW()),
('pd_01hjn234567890abcdefgh5678', 'tn_01hjryxysgey07h5jz5wagqj0m', 'Claude API', 'API-CLAUDE-001', 'ACTIVE', 'SERVICE', 'PUBLIC', NOW(), NOW()),
('pd_01hjn234567890abcdefgh9012', 'tn_01hjryxysgey07h5jz5wagqj0m', 'Gemini API', 'API-GEMINI-001', 'ACTIVE', 'SERVICE', 'PUBLIC', NOW(), NOW());
```

## 環境別設定

### 開発環境（デフォルト）
```env
BILLING_ENABLED=false  # 課金無効（NoOpPaymentApp使用）
```
- 価格設定は必要だが、実際の課金は発生しない
- コスト計算は行われるが、クレジット消費はしない

### ステージング環境
```env
BILLING_ENABLED=true
STRIPE_SECRET_KEY=sk_test_...
```
- 課金有効（テストStripe使用）
- 本番と同じ価格設定を使用

### 本番環境
```env
BILLING_ENABLED=true
STRIPE_SECRET_KEY=sk_live_...
```
- 課金有効（本番Stripe使用）
- 正式な価格設定を使用

## 関連ドキュメント
- [LLM Billing実装ルール](../../../CLAUDE.md#llm-billing実装ルール)
- [コスト計算ルール](../../../CLAUDE.md#コスト計算ルール)
- [Agent API仕様](../../../services/tachyon/agent-api.md)

## まとめ

Agent APIを動作させるために必要な最小限の設定：

1. **商品IDの存在確認**: ChatGPT API、Claude API、Gemini APIの商品がproductsテーブルに存在すること
2. **シードデータの実行**: `seed-procurement-data.sql`と`seed-pricing-data.sql`を実行
3. **環境変数の設定**: 開発環境では`BILLING_ENABLED=false`でOK

現在のAgent API実装は内部の固定価格を使用しているため、複雑な価格設定は不要です。将来的に動的価格設定に移行する場合は、product_usage_pricingテーブルやservice_price_mappingsテーブルの設定が必要になります。