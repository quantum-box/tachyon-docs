# USD課金システム

## 概要

Tachyon AppsのUSD課金システムは、NanoDollar単位を基盤とした高精度な課金メカニズムです。従来のクレジット制から完全にUSD建てに移行し、透明性の高い料金体系を提供します。

## 料金体系

### USDパッケージ

```yaml
usd_packages:
  - name: "Starter Pack"
    amount_usd: 10       # $10
    price_jpy: 1500      # ¥1,500
    price_usd: 10        # $10
    bonus: 0             # ボーナスなし
    
  - name: "Standard Pack"
    amount_usd: 100      # $100
    price_jpy: 15000     # ¥15,000
    price_usd: 100       # $100
    bonus: 5             # 5%ボーナス（$105相当）
    
  - name: "Premium Pack"
    amount_usd: 1000     # $1,000
    price_jpy: 150000    # ¥150,000
    price_usd: 1000      # $1,000
    bonus: 10            # 10%ボーナス（$1,100相当）
```

### Agent API料金

```yaml
agent_api_pricing:
  # 基本実行料金
  base_costs:
    execution: 100_000_000  # $0.10/実行 = 100,000,000 nanodollars
  
  # モデル別トークン料金（NanoDollar/token）
  model_costs:
    # Anthropic
    claude-3.5-sonnet:
      prompt: 3_000         # $0.000003/token
      completion: 15_000    # $0.000015/token
    
    claude-opus-4:
      prompt: 15_000        # $0.000015/token
      completion: 75_000    # $0.000075/token
    
    # OpenAI
    gpt-4.1:
      prompt: 2_000         # $0.000002/token
      completion: 8_000     # $0.000008/token
    
    gpt-4o-mini:
      prompt: 150           # $0.00000015/token
      completion: 600       # $0.0000006/token
  
  # ツール使用料金
  tool_costs:
    # MCP Tools
    mcp_search: 500_000_000      # $0.50
    mcp_read: 200_000_000        # $0.20
    mcp_write: 300_000_000       # $0.30
    mcp_exec: 400_000_000        # $0.40
    
    # Standard Tools
    web_search: 500_000_000      # $0.50
    code_execution: 300_000_000  # $0.30
    file_operation: 200_000_000  # $0.20
    database_query: 300_000_000  # $0.30
```

## 利用フロー

### 1. USD購入

```typescript
// フロントエンド: パッケージ選択
const purchasePackage = async (packageId: string) => {
  const response = await fetch('/api/billing/purchase', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-operator-id': tenantId,
    },
    body: JSON.stringify({
      packageId,
      paymentMethod: 'stripe',
    }),
  });
  
  const { checkoutUrl } = await response.json();
  window.location.href = checkoutUrl; // Stripeチェックアウトへ
};
```

### 2. 残高確認

```graphql
query GetUsdBalance {
  usdBalance {
    currentBalanceNanodollars
    availableBalanceNanodollars
    reservedNanodollars
    currentBalanceUsd  # フロントエンド表示用
    currency
  }
}
```

### 3. Agent実行と課金

```typescript
// Agent実行時の料金見積もりと課金
const executeAgent = async (prompt: string) => {
  // 1. 事前見積もり
  const estimate = await estimateCost(prompt);
  
  // 2. 残高確認
  if (estimate.totalNanodollars > balance.availableNanodollars) {
    throw new Error('Insufficient funds');
  }
  
  // 3. Agent実行（ストリーミング）
  const stream = await fetch('/api/agent/execute', {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  });
  
  // 4. 実行完了後、実際の使用量で課金
  // （バックエンドで自動処理）
};
```

## 課金ポリシー

### 課金タイミング

```yaml
billing_timing:
  agent_execution:
    reservation: "実行開始時に見積もり額を予約"
    charge: "実行完了時に実際の使用量で確定"
    release: "予約額と実際の差額を解放"
  
  failed_execution:
    policy: "エラー時は基本料金のみ課金"
    refund: "システムエラーは全額返金"
```

### 無料利用枠

```yaml
free_tier:
  trial_credits:
    new_user: 5_000_000_000  # $5相当
    validity: 30_days
    
  monthly_credits:
    basic_plan: 0
    pro_plan: 10_000_000_000    # $10相当
    enterprise_plan: 100_000_000_000  # $100相当
```

## 料金計算例

### 例1: 簡単な質問応答

```yaml
scenario: "What is the weather today?"
model: claude-3.5-sonnet
tokens:
  prompt: 50
  completion: 100
tools: [web_search]

calculation:
  base_cost: 100_000_000            # $0.10
  prompt_cost: 50 × 3_000 = 150_000  # $0.00015
  completion_cost: 100 × 15_000 = 1_500_000  # $0.0015
  tool_cost: 500_000_000            # $0.50 (web_search)
  
  total: 601_650_000 nanodollars    # $0.60165
```

### 例2: コード生成タスク

```yaml
scenario: "Create a React component with tests"
model: claude-3.5-sonnet
tokens:
  prompt: 500
  completion: 2000
tools: [mcp_write, code_execution]

calculation:
  base_cost: 100_000_000            # $0.10
  prompt_cost: 500 × 3_000 = 1_500_000  # $0.0015
  completion_cost: 2000 × 15_000 = 30_000_000  # $0.03
  tool_costs:
    mcp_write: 300_000_000          # $0.30
    code_execution: 300_000_000     # $0.30
  
  total: 731_500_000 nanodollars    # $0.7315
```

## 請求書と取引履歴

### 取引履歴の取得

```graphql
query GetTransactionHistory($startDate: DateTime!, $endDate: DateTime!) {
  usdTransactions(
    filter: {
      dateRange: { start: $startDate, end: $endDate }
    }
  ) {
    items {
      id
      amountNanodollars
      amountUsd
      transactionType
      description
      metadata {
        agentExecutionId
        model
        tokenUsage {
          prompt
          completion
        }
        toolsUsed
      }
      createdAt
    }
    totalAmountNanodollars
    totalAmountUsd
  }
}
```

### 月次請求書

```yaml
invoice_format:
  summary:
    total_usage_usd: "$1,234.56"
    total_purchases_usd: "$1,000.00"
    bonus_credits_usd: "$100.00"
    ending_balance_usd: "$865.44"
  
  details:
    - date: "2025-01-15"
      type: "Agent Execution"
      model: "claude-3.5-sonnet"
      tokens: 5432
      tools: ["web_search", "mcp_write"]
      amount_usd: "$2.45"
    
    - date: "2025-01-16"
      type: "USD Purchase"
      package: "Standard Pack"
      amount_usd: "$100.00"
      bonus_usd: "$5.00"
```

## エラーハンドリング

### 残高不足

```typescript
// フロントエンドでの処理
const handleInsufficientFunds = (required: bigint, available: bigint) => {
  const shortage = required - available;
  const shortageUsd = Number(shortage) / 1_000_000_000;
  
  return {
    error: 'INSUFFICIENT_FUNDS',
    message: `残高が不足しています。あと$${shortageUsd.toFixed(2)}必要です。`,
    action: {
      label: 'USDを購入',
      url: '/billing/purchase',
    },
  };
};
```

### 料金上限アラート

```yaml
spending_limits:
  daily_limit:
    default: 100_000_000_000      # $100/day
    configurable: true
    
  monthly_limit:
    default: 3000_000_000_000     # $3,000/month
    configurable: true
    
  per_execution_limit:
    default: 50_000_000_000       # $50/execution
    configurable: true
    
  alerts:
    - threshold: 80%
      action: "email_notification"
    - threshold: 90%
      action: "slack_notification"
    - threshold: 100%
      action: "block_execution"
```

## 管理画面機能

### 利用状況ダッシュボード

```typescript
interface UsageDashboard {
  // 期間別集計
  dailyUsage: {
    date: string;
    totalNanodollars: bigint;
    totalUsd: number;
    executionCount: number;
  }[];
  
  // モデル別使用量
  modelUsage: {
    model: string;
    tokenCount: number;
    costNanodollars: bigint;
    costUsd: number;
  }[];
  
  // ツール使用統計
  toolUsage: {
    tool: string;
    usageCount: number;
    costNanodollars: bigint;
    costUsd: number;
  }[];
}
```

### コスト最適化レポート

```yaml
optimization_suggestions:
  - type: "model_recommendation"
    current: "claude-opus-4"
    suggested: "claude-3.5-sonnet"
    potential_savings: "75% on token costs"
    
  - type: "caching_opportunity"
    pattern: "Repeated similar queries"
    suggestion: "Enable response caching"
    potential_savings: "$50-100/month"
    
  - type: "batch_processing"
    current: "Individual API calls"
    suggested: "Batch similar requests"
    potential_savings: "20% on base costs"
```

## APIリファレンス

### REST API

```yaml
endpoints:
  # 残高確認
  GET /api/billing/balance:
    response:
      currentBalanceNanodollars: number
      availableBalanceNanodollars: number
      currency: string
  
  # 購入
  POST /api/billing/purchase:
    request:
      packageId: string
      paymentMethod: string
    response:
      checkoutUrl: string
      sessionId: string
  
  # 取引履歴
  GET /api/billing/transactions:
    query:
      startDate: string
      endDate: string
      limit: number
      offset: number
    response:
      items: Transaction[]
      total: number
      hasMore: boolean
```

### GraphQL API

```graphql
type Mutation {
  # USD購入の開始
  initiatePurchase(input: PurchaseInput!): PurchaseSession!
  
  # 使用制限の設定
  updateSpendingLimits(input: SpendingLimitsInput!): SpendingLimits!
}

type Subscription {
  # リアルタイム残高更新
  balanceUpdates(tenantId: ID!): UsdBalance!
  
  # 実行コストのリアルタイム追跡
  executionCostUpdates(executionId: ID!): ExecutionCost!
}
```

## まとめ

Tachyon AppsのUSD課金システムは、NanoDollar単位による高精度な課金と、透明性の高い料金体系を特徴としています。リアルタイムの残高管理、詳細な利用履歴、柔軟な支払いオプションにより、ユーザーは安心してAIサービスを利用できます。