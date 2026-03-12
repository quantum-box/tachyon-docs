# 調達・価格設定システムAPI仕様

## GraphQL API仕様

### 調達管理API

#### Queries

##### procurement_prices_by_tenant
```graphql
query GetProcurementPrices($tenantId: String!) {
  procurementPricesByTenant(tenantId: $tenantId) {
    id
    contractId
    resourceType  # "gpt-4-prompt-tokens", "claude-3-opus-completion-tokens"
    unitType      # "per_million_tokens", "per_request"
    baseCost      # 基本価格
    currency      # "USD", "JPY"
    tierPricing {
      minVolume
      maxVolume
      unitPrice
    }
    effectiveFrom
    effectiveUntil
    description
    supplier {
      id
      name
      contactEmail
      contactPhone
      address
      status
    }
    contract {
      id
      contractNumber
      contractName
      status
      supplierId
      tenantId
      description
      startDate
      endDate
      supplier {
        id
        name
      }
    }
    createdAt
    updatedAt
  }
}
```

##### supply_contracts_by_tenant
```graphql
query GetSupplyContracts($tenantId: String!) {
  supplyContractsByTenant(tenantId: $tenantId) {
    id
    tenantId
    supplierId
    contractNumber
    contractName
    description
    startDate
    endDate
    status  # "DRAFT", "ACTIVE", "EXPIRED", "TERMINATED"
    supplier {
      id
      name
      contactEmail
      contactPhone
      address
      status
    }
    createdAt
    updatedAt
  }
}
```

##### suppliers_by_tenant
```graphql
query GetSuppliers($tenantId: String!) {
  suppliersByTenant(tenantId: $tenantId) {
    id
    tenantId
    name
    contactEmail
    contactPhone
    address
    status  # "Active", "Inactive", "Suspended"
    createdAt
    updatedAt
  }
}
```

### 価格設定API

#### Queries

##### pricing_policies_by_tenant
```graphql
query GetPricingPolicies($tenantId: String!) {
  pricingPoliciesByTenant(tenantId: $tenantId) {
    id
    tenantId
    policyName
    description
    baseMarkupRate
    minMarkupRate
    maxMarkupRate
    status  # "ACTIVE", "DRAFT", "ARCHIVED"
    rules {
      id
      ruleType  # "VOLUME", "SEGMENT", "PROMOTION", "COMPETITIVE"
      priority
      conditions
      adjustmentType  # "PERCENTAGE", "FIXED", "OVERRIDE"
      adjustmentValue
      effectiveFrom
      effectiveUntil
    }
    createdAt
    updatedAt
  }
}
```

##### customer_segments_by_tenant
```graphql
query GetCustomerSegments($tenantId: String!) {
  customerSegmentsByTenant(tenantId: $tenantId) {
    id
    tenantId
    segmentName
    description
    discountRate
    criteria
    createdAt
    updatedAt
  }
}
```

##### calculate_current_price
```graphql
query CalculateCurrentPrice($input: CalculatePriceInput!) {
  calculateCurrentPrice(input: $input) {
    resourceType
    unitType
    baseCost
    markupRate
    finalPrice
    currency
    appliedRules {
      ruleId
      ruleName
      adjustment
    }
  }
}

input CalculatePriceInput {
  tenantId: String!
  resourceType: String!
  quantity: Float
  segmentId: String
}
```

#### Mutations

##### create_pricing_policy
```graphql
mutation CreatePricingPolicy($input: CreatePricingPolicyInput!) {
  createPricingPolicy(input: $input) {
    id
    policyName
    status
  }
}

input CreatePricingPolicyInput {
  tenantId: String!
  policyName: String!
  description: String
  baseMarkupRate: Float!
  minMarkupRate: Float!
  maxMarkupRate: Float!
}
```

##### add_pricing_rule
```graphql
mutation AddPricingRule($input: AddPricingRuleInput!) {
  addPricingRule(input: $input) {
    id
    ruleType
    priority
  }
}

input AddPricingRuleInput {
  policyId: String!
  ruleType: String!
  priority: Int!
  conditions: JSON!
  adjustmentType: String!
  adjustmentValue: Float!
  effectiveFrom: DateTime
  effectiveUntil: DateTime
}
```

##### activate_pricing_policy
```graphql
mutation ActivatePricingPolicy($policyId: String!) {
  activatePricingPolicy(policyId: $policyId) {
    id
    status
  }
}
```

## REST API統合ポイント

### Agent API課金統合

```yaml
# Agent実行時の価格計算フロー
1. リクエスト受信:
   - Agent実行リクエストを受信
   - 使用予定モデルとトークン見積もり

2. 価格取得:
   - PricingServiceから現在価格を取得
   - 顧客セグメント割引を適用
   - ボリューム割引を計算

3. 課金チェック:
   - PaymentAppで残高確認
   - 実行可能性を判定

4. 実行と記録:
   - Agent実行
   - 実際の使用量を記録
   - 最終コストを計算
   - クレジット消費を記録
```

### 価格更新フロー

```yaml
# 調達価格更新時の処理
1. 調達価格更新:
   - 新しい調達価格を登録
   - 有効期間を設定

2. 顧客価格再計算:
   - アクティブな価格ポリシーを取得
   - 各ポリシーのルールを適用
   - 新しい顧客価格を計算

3. 価格履歴記録:
   - 価格変更履歴に記録
   - 変更理由を保存

4. 通知:
   - 影響を受ける顧客に通知（未実装）
   - 管理者に変更レポート送信（未実装）
```

## データ型定義

### リソースタイプ
```yaml
# LLMトークン
- gpt-4-prompt-tokens
- gpt-4-completion-tokens
- gpt-4-turbo-prompt-tokens
- gpt-4-turbo-completion-tokens
- claude-3-opus-prompt-tokens
- claude-3-opus-completion-tokens
- claude-3-sonnet-prompt-tokens
- claude-3-sonnet-completion-tokens

# ツール使用
- mcp-tool-execution
- web-search-query
- code-execution
```

### 単位タイプ
```yaml
- per_million_tokens  # 百万トークンあたり
- per_request        # リクエストあたり
- per_execution      # 実行あたり
- per_hour          # 時間あたり
```

### 価格ルールタイプ
```yaml
VOLUME:      # ボリューム割引
  conditions:
    min_quantity: 1000000
    max_quantity: 10000000
  adjustment: -10  # 10%割引

SEGMENT:     # 顧客セグメント割引
  conditions:
    segment_id: "enterprise"
  adjustment: -15  # 15%割引

PROMOTION:   # プロモーション
  conditions:
    code: "LAUNCH2024"
    valid_until: "2024-12-31"
  adjustment: -20  # 20%割引

COMPETITIVE: # 競合価格調整
  conditions:
    competitor: "OpenAI"
    target_margin: 5
  adjustment: "dynamic"
```