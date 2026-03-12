# フロントエンドUSD対応実装ガイド

## 概要

このドキュメントでは、クレジットシステムのUSD対応をフロントエンドで実装する方法を説明します。

## 実装済みコンポーネント

### 1. 通貨ユーティリティ

**ファイル**: `/apps/tachyon/src/lib/currency.ts`

通貨フォーマットと変換のためのユーティリティ関数：
- `formatCurrency()`: 金額を通貨に応じてフォーマット
- `getCurrencySymbol()`: 通貨シンボルを取得
- `convertCreditsToAmount()`: クレジットを通貨金額に変換
- `getMinimumPurchaseAmount()`: 最小購入金額を取得

### 2. USD対応コンポーネント

#### CreditBalanceWithCurrency
**ファイル**: `/apps/tachyon/src/app/v1beta/[tenant_id]/billing/components/credit-balance-with-currency.tsx`

通貨に応じたクレジット残高表示：
- JPY/USD自動切り替え
- USD表示時は参考為替レート表示
- 多言語対応（英語/日本語）

#### TransactionHistoryWithCurrency
**ファイル**: `/apps/tachyon/src/app/v1beta/[tenant_id]/billing/components/transaction-history-with-currency.tsx`

通貨対応の取引履歴表示：
- 通貨に応じた金額フォーマット
- 取引タイプの多言語ラベル
- USD表示時の適切な小数点処理

#### PurchaseCreditsDialogWithCurrency
**ファイル**: `/apps/tachyon/src/app/v1beta/[tenant_id]/billing/components/purchase-credits-dialog-with-currency.tsx`

通貨対応のクレジット購入ダイアログ：
- 通貨別パッケージ設定
- 最小購入金額の通貨別設定
- USDの場合はセント単位変換

### 3. GraphQLクエリ

**ファイル**: `/apps/tachyon/src/features/billing/queries/usd-billing.graphql`

USD対応の新しいGraphQLクエリ：
- `GetCreditBalanceWithCurrency`: 通貨指定での残高取得
- `GetCreditTransactionsWithCurrency`: 通貨指定での取引履歴
- `GetExchangeRates`: 為替レート取得
- `GetUsdPackages`: USDパッケージ一覧
- `PurchaseCreditsWithCurrency`: 通貨指定での購入
- `SetTenantCurrency`: テナント通貨設定

## 実装方法

### 1. Feature Flagの確認

```tsx
// Feature Flagの確認
const { data: featureFlags } = useQuery(GetFeatureFlagsDocument, {
  variables: { tenantId }
})

const isUsdEnabled = featureFlags?.featureFlags.find(
  flag => flag.key === 'usd_pricing'
)?.enabled || false

const currency = isUsdEnabled ? 'USD' : 'JPY'
```

### 2. 既存コンポーネントの置き換え

```tsx
// Before
import { CreditBalanceClient } from './components/credit-balance-client'

// After
import { CreditBalanceWithCurrency } from './components/credit-balance-with-currency'

// 使用例
<CreditBalanceWithCurrency
  creditBalance={creditBalance}
  currency={currency}
  tenantId={tenantId}
  accessToken={accessToken}
/>
```

### 3. 通貨フォーマットの適用

```tsx
import { formatCurrency } from '@/lib/currency'

// 金額表示
const formattedAmount = formatCurrency(amount, currency)

// クレジット変換
const creditAmount = convertCreditsToAmount(credits, currency)
```

## 移行手順

### Phase 1: 準備
1. Feature Flag `usd_pricing` を作成
2. 通貨ユーティリティをインポート
3. GraphQLスキーマを更新（`yarn codegen`）

### Phase 2: コンポーネント更新
1. 新しいUSD対応コンポーネントを配置
2. Feature Flagに基づいて条件分岐
3. 既存コンポーネントと並行運用

### Phase 3: 切り替え
1. Feature Flagを有効化
2. USD表示の動作確認
3. 問題があればFeature Flagで即座にロールバック

## 注意事項

### 1. 金額変換
- JPY: 1 credit = ¥1（整数表示）
- USD: 1 credit = $0.01（小数点2桁表示）
- 内部では常にクレジット単位で保存

### 2. Stripe統合
- USDの場合はセント単位で送信
- `Math.round(amount * 100)` で変換

### 3. 多言語対応
- USD表示時は英語優先
- 日付フォーマットも locale に応じて変更

### 4. 最小購入金額
- JPY: ¥500
- USD: $5.00

## テスト方法

1. Feature Flagをテスト環境で有効化
2. 以下の項目を確認：
   - 残高表示の通貨切り替え
   - 取引履歴の金額フォーマット
   - 購入ダイアログの通貨別パッケージ
   - 為替レート表示（参考値）
   - 多言語ラベルの切り替え

## トラブルシューティング

### 通貨が正しく表示されない
- Feature Flagの状態を確認
- GraphQLクエリのcurrencyパラメータを確認
- ブラウザキャッシュをクリア

### 金額計算が合わない
- クレジット→通貨変換の係数を確認
- USDの場合は100で割っているか確認
- 小数点処理が適切か確認