# マルチテナンシー設定管理API仕様書

## 概要

マルチテナンシー設定管理APIは、Host/Platform/Operatorの階層構造における設定の取得、更新、継承を管理するGraphQL APIです。

## GraphQL スキーマ

### Types

```graphql
"""テナントタイプ"""
enum TenantType {
  HOST
  PLATFORM
  OPERATOR
}

"""継承タイプ"""
enum InheritanceType {
  """必須継承：変更不可"""
  MANDATORY
  
  """完全上書き可能"""
  ALLOW_OVERRIDE
  
  """親設定の範囲内で制限"""
  ALLOW_SUBSET
  
  """親設定に追加可能"""
  ALLOW_EXTEND
}

"""継承ルール"""
type InheritanceRule {
  """対象フィールドのパス（例: "currency", "ai.daily_limit"）"""
  fieldPath: String!
  
  """継承タイプ"""
  inheritanceType: InheritanceType!
  
  """説明"""
  description: String
}

"""継承ポリシー"""
type InheritancePolicy {
  """ルール一覧"""
  rules: [InheritanceRule!]!
  
  """ポリシーバージョン"""
  version: String!
}

"""テナント情報"""
type TenantInfo {
  id: ID!
  name: String!
  type: TenantType!
  platformId: ID
  hostId: ID
}

"""統合設定"""
type TenantConfiguration {
  """テナント情報"""
  tenant: TenantInfo!
  
  """プロバイダー設定（IaC）"""
  providers: ProviderConfiguration
  
  """課金設定（Payment）"""
  billing: BillingConfiguration
  
  """AI利用設定（LLMs）"""
  aiUsage: AiUsageConfiguration
  
  """有効な設定"""
  availableSettings: AvailableSettings!
}

"""利用可能な設定"""
type AvailableSettings {
  operator: Boolean!
  platform: Boolean!
  host: Boolean!
}
```

### Provider Configuration (IaC)

```graphql
"""プロバイダー設定"""
type ProviderConfiguration {
  """プロバイダーリスト"""
  providers: [ProviderConfig!]!
  
  """テナントID"""
  tenantId: ID!
  
  """継承元"""
  inheritedFrom: TenantType
}

"""個別プロバイダー設定"""
type ProviderConfig {
  """プロバイダー名"""
  name: String!
  
  """プロバイダータイプ（stripe, openai, keycloak等）"""
  providerType: String!
  
  """設定値（機密情報はマスク）"""
  config: JSON!
  
  """暗号化されているか"""
  encrypted: Boolean!
}

"""プロバイダー設定階層"""
type ProviderConfigHierarchy {
  """Host設定"""
  hostConfig: ProviderConfiguration
  
  """Platform設定"""
  platformConfig: ProviderConfiguration
  
  """Operator設定"""
  operatorConfig: ProviderConfiguration
  
  """有効な設定（マージ済み）"""
  effectiveConfig: ProviderConfiguration!
  
  """適用されたルール"""
  appliedRules: [InheritanceRule!]!
}
```

### Billing Configuration (Payment)

```graphql
"""課金設定"""
type BillingConfiguration {
  """テナントID"""
  tenantId: ID!
  
  """課金有効フラグ"""
  isBillingEnabled: Boolean!
  
  """無料トライアルクレジット"""
  freeTrialCredits: Int
  
  """マイナス残高許可"""
  allowNegativeBalance: Boolean!
  
  """内部利用時の課金スキップ"""
  skipBillingForInternal: Boolean!
  
  """月額クレジット上限"""
  monthlyCreditLimit: Int
  
  """通貨"""
  currency: String!
  
  """税率"""
  taxRate: Float!
  
  """請求サイクル"""
  billingCycle: String!
  
  """プラン"""
  plan: String
  
  """カスタム価格設定"""
  customPricing: Boolean!
  
  """継承元"""
  inheritedFrom: TenantType
}

"""課金設定階層"""
type BillingConfigHierarchy {
  """Host設定"""
  hostConfig: BillingConfiguration
  
  """Platform設定"""
  platformConfig: BillingConfiguration
  
  """Operator設定"""
  operatorConfig: BillingConfiguration
  
  """有効な設定（マージ済み）"""
  effectiveConfig: BillingConfiguration!
  
  """適用されたルール"""
  appliedRules: [InheritanceRule!]!
}
```

### AI Usage Configuration (LLMs)

```graphql
"""AI利用設定"""
type AiUsageConfiguration {
  """テナントID"""
  tenantId: ID!
  
  """日次トークン上限"""
  dailyTokenLimit: Int
  
  """月次トークン上限"""
  monthlyTokenLimit: Int
  
  """利用可能なモデル"""
  enabledModels: [String!]!
  
  """デフォルトモデル"""
  defaultModel: String!
  
  """カスタムプロンプト"""
  customPrompts: [CustomPrompt!]!
  
  """レート制限"""
  rateLimits: RateLimitConfig!
  
  """モデル別制限"""
  modelLimits: [ModelLimit!]!
  
  """コスト管理設定"""
  costControls: CostControlConfig!
  
  """継承元"""
  inheritedFrom: TenantType
}

"""カスタムプロンプト"""
type CustomPrompt {
  name: String!
  content: String!
  category: String!
}

"""レート制限設定"""
type RateLimitConfig {
  requestsPerMinute: Int!
  requestsPerHour: Int!
  requestsPerDay: Int!
}

"""モデル別制限"""
type ModelLimit {
  modelName: String!
  dailyTokenLimit: Int
  maxContextLength: Int!
  priority: Int!
}

"""コスト管理設定"""
type CostControlConfig {
  dailyCostLimit: Int
  monthlyCostLimit: Int
  alertThreshold: Int!
  autoStopEnabled: Boolean!
}
```

### Queries

```graphql
type Query {
  """テナント設定を取得"""
  tenantConfiguration(tenantId: ID!): TenantConfiguration!
  
  """プロバイダー設定階層を取得"""
  providerConfigHierarchy(tenantId: ID!): ProviderConfigHierarchy!
  
  """課金設定階層を取得"""
  billingConfigHierarchy(tenantId: ID!): BillingConfigHierarchy!
  
  """AI利用設定階層を取得"""
  aiUsageConfigHierarchy(tenantId: ID!): AiUsageConfigHierarchy!
  
  """継承ポリシーを取得"""
  inheritancePolicy(category: ConfigCategory!): InheritancePolicy!
}

"""設定カテゴリ"""
enum ConfigCategory {
  PROVIDERS
  BILLING
  AI_USAGE
}
```

### Mutations

```graphql
type Mutation {
  """プロバイダー設定を更新"""
  updateProviderConfig(
    tenantId: ID!
    config: ProviderConfigurationInput!
  ): ProviderConfiguration!
  
  """課金設定を更新"""
  updateBillingConfig(
    tenantId: ID!
    config: BillingConfigurationInput!
  ): BillingConfiguration!
  
  """AI利用設定を更新"""
  updateAiUsageConfig(
    tenantId: ID!
    config: AiUsageConfigurationInput!
  ): AiUsageConfiguration!
}

input ProviderConfigurationInput {
  providers: [ProviderConfigInput!]!
}

input ProviderConfigInput {
  name: String!
  providerType: String!
  config: JSON!
  encrypted: Boolean!
}

input BillingConfigurationInput {
  isBillingEnabled: Boolean
  freeTrialCredits: Int
  allowNegativeBalance: Boolean
  skipBillingForInternal: Boolean
  monthlyCreditLimit: Int
}

input AiUsageConfigurationInput {
  dailyTokenLimit: Int
  monthlyTokenLimit: Int
  enabledModels: [String!]
  defaultModel: String
  customPrompts: [CustomPromptInput!]
  rateLimits: RateLimitConfigInput
  modelLimits: [ModelLimitInput!]
  costControls: CostControlConfigInput
}
```

## API使用例

### 1. テナント設定の取得

```graphql
query GetTenantConfiguration {
  tenantConfiguration(tenantId: "tn_01hjjn348rn3t49zz6hvmfq67p") {
    tenant {
      id
      name
      type
      platformId
      hostId
    }
    availableSettings {
      operator
      platform
      host
    }
    providers {
      providers {
        name
        providerType
        encrypted
      }
    }
    billing {
      isBillingEnabled
      currency
      taxRate
      monthlyCreditLimit
    }
    aiUsage {
      dailyTokenLimit
      enabledModels
      defaultModel
    }
  }
}
```

### 2. 設定階層の取得

```graphql
query GetBillingHierarchy {
  billingConfigHierarchy(tenantId: "tn_01hjjn348rn3t49zz6hvmfq67p") {
    hostConfig {
      isBillingEnabled
      freeTrialCredits
    }
    platformConfig {
      isBillingEnabled
      monthlyCreditLimit
      currency
    }
    operatorConfig {
      isBillingEnabled
      allowNegativeBalance
    }
    effectiveConfig {
      isBillingEnabled
      freeTrialCredits
      monthlyCreditLimit
      currency
      allowNegativeBalance
    }
    appliedRules {
      fieldPath
      inheritanceType
      description
    }
  }
}
```

### 3. 設定の更新

```graphql
mutation UpdateBillingConfig {
  updateBillingConfig(
    tenantId: "tn_01hjjn348rn3t49zz6hvmfq67p"
    config: {
      freeTrialCredits: 5000
      allowNegativeBalance: true
      monthlyCreditLimit: 100000
    }
  ) {
    tenantId
    freeTrialCredits
    allowNegativeBalance
    monthlyCreditLimit
    inheritedFrom
  }
}
```

## エラーハンドリング

### エラーコード

| コード | 説明 | 対処法 |
|--------|------|--------|
| UNAUTHORIZED | 認証エラー | 有効なアクセストークンを使用 |
| FORBIDDEN | 権限不足 | 適切な権限を持つユーザーで実行 |
| TENANT_NOT_FOUND | テナントが見つからない | テナントIDを確認 |
| INVALID_CONFIG | 設定値が無効 | 継承ルールに従った値を設定 |
| INHERITANCE_VIOLATION | 継承ルール違反 | 必須継承項目は変更不可 |

### エラーレスポンス例

```json
{
  "errors": [
    {
      "message": "Cannot override mandatory field: currency",
      "extensions": {
        "code": "INHERITANCE_VIOLATION",
        "field": "currency",
        "rule": "MANDATORY"
      }
    }
  ]
}
```

## レート制限

- 設定取得: 100 requests/minute/tenant
- 設定更新: 10 requests/minute/tenant
- 階層取得: 50 requests/minute/tenant

## セキュリティ

### 認証
- Bearer token認証必須
- ヘッダー: `Authorization: Bearer <token>`

### 権限
- Operator設定: `settings:operator:*`
- Platform設定: `settings:platform:*`
- Host設定: `settings:host:*`

### 暗号化
- APIキーやシークレットは暗号化して保存
- 取得時は`encrypted: true`でマスク表示
- 更新時のみ平文で送信（HTTPS必須）

## 変更履歴

- v1.0.0 (2025-01-21): 初版リリース