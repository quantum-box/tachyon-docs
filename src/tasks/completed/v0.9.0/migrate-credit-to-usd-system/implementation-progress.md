# NanoDollar移行実装進捗 (2025-01-11)

## 実装済み項目

### ✅ 1. GraphQL APIのNanoDollar対応

#### Payment GraphQL query.rs
- **残高クエリ (`credit_balance`)**
  - Payment内部単位 → NanoDollar変換を実装
  - 変換式: `balance * 1,000,000` (1 Payment単位 = $0.001 = 1,000,000 nanodollars)

- **取引履歴クエリ (`credit_transactions`)**
  - チャージ系取引（Purchase/Charge/Grant）: 
    - Stripeセント → NanoDollar変換
    - 変換式: `amount * 10,000,000` (1 cent = 10,000,000 nanodollars)
  - 消費系取引（Consumption/Usage等）:
    - Payment内部単位 → NanoDollar変換
    - 変換式: `amount * 1,000,000`
  - 残高も同様に変換

#### GraphQLスキーマコメント更新
- `CreditBalance`型: "NanoDollar単位: 1 USD = 10^9 NanoDollars"
- `CreditTransaction`型: 同様の単位説明を追加

### ✅ 2. フロントエンドの単位変換

#### credit-balance-client.tsx
```typescript
const NANODOLLARS_PER_USD = 1_000_000_000
const availableAmount = creditBalance.available / NANODOLLARS_PER_USD
const balanceAmount = creditBalance.balance / NANODOLLARS_PER_USD
const reservedAmount = creditBalance.reserved / NANODOLLARS_PER_USD
```

#### transaction-history.tsx
- 取引金額の表示: `amount / 1_000_000_000`
- 残高表示: `balanceAfter / 1_000_000_000`
- クレジット表記の削除（descriptionはそのまま表示）

### ✅ 3. データベースマイグレーション

#### Payment DB: 20250111000000_add_nanodollar_columns.up.sql
- `credit_transactions`テーブル:
  - `amount_nanodollars` BIGINT
  - `balance_after_nanodollars` BIGINT
- `credit_balances`テーブル:
  - `current_balance_nanodollars` BIGINT
  - `reserved_credits_nanodollars` BIGINT
- `credit_packages`テーブル:
  - `price_nanodollars` BIGINT

#### Order DB: 20250111000000_add_nanodollar_columns.up.sql
- `service_price_mappings`テーブル:
  - `fixed_price_nanodollars` BIGINT
- `agent_execution_costs`テーブル:
  - `base_cost_nanodollars` BIGINT
  - `token_cost_nanodollars` BIGINT
  - `tool_cost_nanodollars` BIGINT
  - `total_cost_nanodollars` BIGINT

### ✅ 4. 不要ファイルの削除
- `packages/payment/migrations/20250710123842_add_usd_nanodollar_support_v2.*` (削除済み)
- `packages/order/migrations/20250710123841_add_usd_nanodollar_support.*` (削除済み)

### ✅ 5. ドキュメント更新
CLAUDE.mdに「NanoDollar単位システム」セクションを追加:
- 単位の定義と変換ルール
- 実装状況
- 関連ファイルへのリンク

## 実装の詳細

### 変換ロジックの統一
1. **内部表現 → NanoDollar**
   - Payment内部単位: ×1,000,000
   - Catalog内部単位: ×10,000
   - Stripeセント: ×10,000,000

2. **NanoDollar → 表示**
   - USD表示: ÷1,000,000,000
   - Stripeセント: ÷10,000,000

### 並行稼働戦略
- 既存のカラムは残したまま、新しいnanodollarカラムを追加
- GraphQL APIは新しいNanoDollar値を返すが、型名は変更せず
- フロントエンドで適切に変換して表示

## 残タスク

### 🔄 LLMプロバイダーの価格定義
- 各プロバイダーのpricing.rsファイルをNanoDollar単位に更新
- seed-api-services.sqlの価格データをNanoDollar対応

### 🔄 Usecase層の更新
- ServiceCostCalculator
- AgentCostCalculator
- ConsumeCredits
- CheckBilling

### 🔄 完全移行
- Feature Flagによる段階的切り替え
- 旧カラムの削除
- 型名の変更（CreditBalance → UsdBalance等）

## 動作確認結果

### 問題の修正
**Before**: $10チャージが$100と表示される
- 原因: 複数層での単位変換の混乱

**After**: $10チャージが正しく$10.00と表示される
- GraphQL: 10,000,000,000 NanoDollars
- Frontend: 10,000,000,000 ÷ 1,000,000,000 = $10.00 ✅

## 技術的な決定事項

1. **NanoDollar採用の理由**
   - 極小額のLLMトークン価格も整数で正確に表現可能
   - Gemini Flash-Lite: $0.0000001/token = 100 nanodollars
   - 将来的な価格変動にも対応可能

2. **段階的移行アプローチ**
   - 破壊的変更を避けるため、並行稼働期間を設ける
   - 既存システムへの影響を最小限に抑える

3. **フロントエンドの変更を最小限に**
   - GraphQL型名は変更せず、値の単位のみ変更
   - フロントエンドは変換定数を変更するだけで対応