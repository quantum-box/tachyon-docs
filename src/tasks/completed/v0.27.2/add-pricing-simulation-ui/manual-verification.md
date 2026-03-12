# 手動動作確認手順（Pricing Simulation）

## 前提
- Tachyon が起動済み（`mise run up-tachyon`）
- ログイン済み
- テナントID: `tn_01hjryxysgey07h5jz5wagqj0m`

## 1. 価格ポリシーの事前作成（GraphQL）
UIの作成ダイアログはスキーマ不整合の可能性があるため、GraphQLで作成する。

- エンドポイント: `http://localhost:50054/v1/graphql`
- ヘッダー:
  - `Authorization: Bearer dummy-token`
  - `x-operator-id: tn_01hjryxysgey07h5jz5wagqj0m`

### Mutation
```graphql
mutation CreatePricingPolicy(
  $tenantId: String!
  $policyName: String!
  $description: String
  $baseMarkupRate: Float!
  $minMarkupRate: Float!
  $maxMarkupRate: Float!
) {
  createPricingPolicy(
    tenantId: $tenantId
    policyName: $policyName
    description: $description
    baseMarkupRate: $baseMarkupRate
    minMarkupRate: $minMarkupRate
    maxMarkupRate: $maxMarkupRate
  ) {
    id
    policyName
    baseMarkupRate
    minMarkupRate
    maxMarkupRate
  }
}
```

### Variables 例
```json
{
  "tenantId": "tn_01hjryxysgey07h5jz5wagqj0m",
  "policyName": "Manual Simulation Policy",
  "description": "Manual pricing simulation policy",
  "baseMarkupRate": 30.25,
  "minMarkupRate": 10,
  "maxMarkupRate": 50
}
```

## 2. UIでの確認
- URL: `http://localhost:16000/v1beta/tn_01hjryxysgey07h5jz5wagqj0m/pricing/analysis`
- 確認ポイント:
  1. 作成したポリシーがセレクトに表示される
  2. マークアップ入力が `min`/`max` でバリデーションされる
  3. 「シミュレーションを実行」で結果が表示される
  4. 概要カードの `original` / `simulated` が期待値
  5. テーブルが表示される（価格未設定の場合は影響が 0/空になる）

## 3. APIでシミュレーション確認（任意）
UIと同じ内容をAPIで確認したい場合。

### Query
```graphql
query PricingSimulation(
  $tenantId: String!
  $policyId: String!
  $newMarkupRate: Float
) {
  pricingSimulation(
    tenantId: $tenantId
    policyId: $policyId
    newMarkupRate: $newMarkupRate
  ) {
    originalMarkupRate
    simulatedMarkupRate
    estimatedRevenueImpact
    priceChanges {
      resourceType
      currentPrice
      newPrice
      changeAmount
      changePercentage
    }
  }
}
```

### Variables 例
```json
{
  "tenantId": "tn_01hjryxysgey07h5jz5wagqj0m",
  "policyId": "<createPricingPolicyで取得したID>",
  "newMarkupRate": 40.75
}
```

## 4. ローカル保存の確認（任意）
シミュレーション実行後にページをリロードし、入力値と実行時刻が復元されることを確認する。
