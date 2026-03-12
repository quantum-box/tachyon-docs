# 調達・価格設定システム（Procurement & Pricing System）

## 概要

調達・価格設定システムは、Agent APIを含む各種サービスの価格設定を管理し、原価（調達価格）から利益を乗せて顧客提供価格を決定するためのシステムです。市場価格の変動に応じた柔軟な価格調整と、適切な利益管理を実現します。

## システム設計

### ドメイン設計

システムは2つの独立したコンテキストで構成されています：

#### 1. 調達コンテキスト（Procurement Context）
- **責務**: サプライヤーからの原価管理、調達契約の管理
- **主要集約**: Supplier（サプライヤー）、SupplyContract（調達契約）、ProcurementPrice（調達価格）
- **パッケージ**: `packages/procurement/`

#### 2. 価格設定コンテキスト（Pricing Context）
- **責務**: 顧客向け価格の決定、価格ポリシーの管理
- **主要集約**: PricingPolicy（価格設定ポリシー）、PriceList（価格表）、CustomerSegment（顧客セグメント）
- **パッケージ**: `packages/payment/src/domain/pricing/`

### コンテキスト境界と責務

```yaml
procurement_context:
  responsibilities:
    - "サプライヤー管理"
    - "調達契約の管理"
    - "原価情報の記録"
    - "為替レート管理"
    - "ボリュームディスカウント管理"
  
  boundaries:
    - "顧客向け価格決定は行わない"
    - "請求処理は行わない"
    - "在庫管理は対象外（デジタル商品のため）"

pricing_context:
  responsibilities:
    - "価格ポリシーの管理"
    - "マークアップ率の設定"
    - "顧客セグメント別価格"
    - "プロモーション価格管理"
    - "価格履歴の管理"
  
  boundaries:
    - "調達交渉は行わない"
    - "支払い処理は行わない"
    - "在庫管理は対象外"
```

## 主要機能

### 調達管理（Procurement）

#### 1. 調達原価一覧（Provider Costs）
- **パス**: `/v1beta/[operatorId]/procurement`
- **機能**:
  - 各リソースタイプの調達原価を一覧表示
  - フィルタリング（リソースタイプ、サプライヤー、ステータス）
  - 統計情報表示（総数、アクティブ数など）
  - 階層価格（Tier Pricing）の表示

#### 2. サプライヤー管理
- **パス**: `/v1beta/[operatorId]/procurement/suppliers`
- **機能**:
  - サプライヤー情報の管理（LLMプロバイダー、インフラプロバイダー等）
  - ステータス管理（Active/Inactive/Suspended）
  - 契約関連情報の表示

#### 3. 契約管理
- **パス**: `/v1beta/[operatorId]/procurement/contracts`
- **機能**:
  - 調達契約の一覧表示
  - 契約期間の管理
  - ボリュームディスカウントの設定

### 価格設定（Pricing）

#### 1. 価格ポリシー管理
- **パス**: `/v1beta/[operatorId]/pricing`
- **機能**:
  - 価格ポリシーの作成・編集
  - 基本マークアップ率の設定（最小・最大・デフォルト）
  - ポリシーのアクティベーション

#### 2. 価格ルール管理
- **パス**: `/v1beta/[operatorId]/pricing/[policyId]`
- **機能**:
  - ルールタイプ別の価格調整設定
    - Volume（使用量ベース）
    - Seasonal（季節要因）
    - Customer（顧客セグメント）
    - Promotion（プロモーション）
    - Custom（カスタムルール）
  - ルール優先度の管理
  - 価格シミュレーション機能

#### 3. 顧客セグメント管理
- **パス**: `/v1beta/[operatorId]/pricing/segments`
- **機能**:
  - 顧客セグメントの定義
  - セグメント別価格設定
  - セグメント条件の設定

#### 4. 価格分析ダッシュボード
- **パス**: `/v1beta/[operatorId]/pricing/analysis`
- **機能**:
  - 収益分析（総収益、平均収益）
  - マークアップ分析（平均率、分布）
  - 最適化提案（利益最大化の提案）

## API仕様

### GraphQL Query

```graphql
# 調達価格の取得
query GetProcurementPrices($tenantId: ID!) {
  procurement_prices_by_tenant(tenant_id: $tenantId) {
    id
    resourceType
    unitType
    baseCost
    currency
    effectiveFrom
  }
}

# 価格ポリシーの取得
query GetPricingPolicies($tenantId: ID!) {
  pricing_policies_by_tenant(tenant_id: $tenantId) {
    id
    policyName
    baseMarkupRate
    status
    rules {
      id
      ruleType
      priority
      adjustmentType
      adjustmentValue
    }
  }
}

# 現在価格の計算
query CalculateCurrentPrice($input: PriceCalculationInput!) {
  calculate_current_price(input: $input) {
    finalPrice
    currency
    appliedRules {
      ruleName
      adjustment
    }
  }
}
```

### GraphQL Mutation

```graphql
# 価格ポリシーの作成
mutation CreatePricingPolicy($input: CreatePricingPolicyInput!) {
  create_pricing_policy(input: $input) {
    id
    policyName
    status
  }
}

# 価格ルールの追加
mutation AddPricingRule($input: AddPricingRuleInput!) {
  add_pricing_rule(input: $input) {
    id
    ruleType
    priority
  }
}

# ポリシーのアクティベーション
mutation ActivatePricingPolicy($id: ID!) {
  activate_pricing_policy(id: $id) {
    id
    status
  }
}
```

## データモデル

### 主要テーブル

#### 調達関連
- `suppliers`: サプライヤー情報
- `supply_contracts`: 調達契約
- `procurement_prices`: 調達価格

#### 価格設定関連
- `pricing_policies`: 価格ポリシー
- `pricing_rules`: 価格ルール
- `customer_prices`: 顧客価格
- `customer_segments`: 顧客セグメント
- `price_change_history`: 価格変更履歴

### リソースタイプ

現在サポートされているリソースタイプ：

```yaml
llm_resources:
  # OpenAI
  - gpt-4-turbo-prompt-tokens
  - gpt-4-turbo-completion-tokens
  - gpt-4o-prompt-tokens
  - gpt-4o-completion-tokens
  
  # Anthropic
  - claude-3-opus-prompt-tokens
  - claude-3-opus-completion-tokens
  - claude-3-sonnet-prompt-tokens
  - claude-3-sonnet-completion-tokens
  
  # ツール使用
  - mcp-tool-usage
  - web-search-usage
  - code-execution-usage
  
  # その他
  - agent-execution-base
  - storage-gb-month
  - api-requests
```

## 価格計算ロジック

### 基本計算式

```
顧客価格 = 調達価格 × (1 + マークアップ率/100)
```

### ルール適用順序

1. **基本マークアップ**: ポリシーで定義された基本率を適用
2. **ボリューム割引**: 使用量に応じた割引を適用
3. **顧客セグメント**: セグメント別の調整を適用
4. **プロモーション**: 期間限定の特別価格を適用
5. **カスタムルール**: その他の条件に基づく調整

### 計算例

```yaml
# GPT-4 Turboの価格計算例
procurement_cost: 10.00      # $10/百万トークン（調達価格）
base_markup: 50%            # 基本マークアップ率
volume_discount: -10%       # 大口割引
segment_adjustment: +5%     # プレミアムセグメント

計算過程:
1. 基本価格: $10.00 × 1.5 = $15.00
2. ボリューム割引: $15.00 × 0.9 = $13.50
3. セグメント調整: $13.50 × 1.05 = $14.18
最終価格: $14.18/百万トークン
```

## 統合ポイント

### PaymentContextとの統合

```rust
// PricingServiceインターフェース
#[async_trait]
pub trait PricingService: Send + Sync {
    async fn get_current_price(
        &self,
        tenant_id: &TenantId,
        resource_type: &str,
    ) -> Result<CustomerPrice>;
    
    async fn calculate_cost(
        &self,
        tenant_id: &TenantId,
        usage: &ResourceUsage,
    ) -> Result<Cost>;
}
```

### LLMsContextでの利用

```rust
// AgentCostCalculatorでの動的価格計算
pub struct AgentCostCalculatorV2 {
    pricing_service: Arc<dyn PricingService>,
}

impl AgentCostCalculatorV2 {
    pub async fn calculate_token_cost(
        &self,
        tenant_id: &TenantId,
        model: &str,
        prompt_tokens: u32,
        completion_tokens: u32,
    ) -> Result<Cost> {
        // 動的に価格を取得して計算
    }
}
```

## LLM API調達チェックと課金フロー

- モデル単価は `PricingRegistry` のプロバイダー定義から取得し、`ProcurementAppService::get_llm_cost()` がモデル名から provider を判定する。
- 調達単価が見つからない場合、`AgentCostCalculator` は warn を出して見積もりを 0 にフォールバックする。実課金は Catalog の fixed 価格に依存する。
- 固定価格は `service_price_mappings` の `fixed_price_nanodollars` を参照し、未設定時は `ServiceCostCalculator` が `BusinessLogicError` を返す。
- `procurement_price_id` の参照は収益分析（`ProfitService`）で利用され、請求計算には直接使われない。
- 価格マッピングの初期投入は `scripts/seeds/n1-seed/005-order-products.yaml` と `scripts/seeds/n1-seed/010-order-service-price-mappings.yaml` を参照する。

## 管理UI

### コンポーネント構成

#### 調達管理
- `ProcurementPriceList`: 調達原価一覧コンポーネント
- `SupplierList`: サプライヤー一覧コンポーネント
- `SupplyContractList`: 契約一覧コンポーネント

#### 価格設定
- `PricingPolicyList`: ポリシー一覧コンポーネント
- `PricingPolicyDialog`: ポリシー作成・編集ダイアログ
- `PricingRuleList`: ルール一覧コンポーネント
- `PricingRuleDialog`: ルール追加・編集ダイアログ
- `PriceSimulator`: 価格シミュレーションコンポーネント
- `CustomerSegmentList`: 顧客セグメント一覧
- `PriceAnalysis`: 価格分析ダッシュボード

## 今後の拡張予定

### フェーズ5: 運用機能強化
- 価格変更履歴の可視化
- 監査ログの詳細表示
- 価格変更通知機能
- バッチ価格更新機能

### フェーズ6: 自動化機能
- 為替レート自動更新
- 競合価格分析
- AIによる価格最適化提案
- 需要予測に基づく動的価格調整

### フェーズ7: 分析機能強化
- 顧客別収益分析
- 価格弾力性分析
- A/Bテスト機能
- カスタムレポート作成

## 関連ドキュメント

- [Tachyonサービス概要](./overview.md)
- [Agent API仕様](./agent-api.md)
- [課金システム仕様](../payment/billing-system.md)
- [マルチテナンシー構造](../../tachyon-apps/authentication/multi-tenancy.md)
- [タスクdoc: LLM API調達要件の現状調査](../../tasks/completed/v0.27.0/llm-api-procurement-check/task.md)
