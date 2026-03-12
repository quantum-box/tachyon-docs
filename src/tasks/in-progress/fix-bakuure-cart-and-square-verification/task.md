# Fix Bakuure Cart Bugs

## Status: ✅ 完了

## Overview
bakuure ECの3つのバグを修正するタスク。

## Bugs

### Bug 1: カート商品名がID表示 ✅
- **症状**: カートに商品追加後、商品名の代わりに `pd_01kjg...` のようなproduct IDが表示される
- **原因**: `GqlCartItem` GraphQL型に `productName` フィールドがない。`cart.graphql` クエリでも取得していない。`cart-contents.tsx` が `item.productName ?? item.productId` でフォールバックし、常にIDが表示される
- **修正**: `cart/page.tsx` でカートアイテム取得後、各 `productId` に対して `storefrontProduct` クエリで商品名を取得し、`productName` をマージしてコンポーネントに渡す

### Bug 2: カート価格が$0.00 ✅
- **症状**: サーバー側では¥1,000の商品が、カート画面で`$0.00`と表示される
- **原因**: `bakuure-ui/src/lib/format-price.ts` に `formatNanodollarAsJpy()` がなく、`formatNanodollarAsUsd()` のみ。USD変換ではNanoDollar値が小さすぎて$0.00になる
- **修正**: `formatNanodollarAsJpy()` を追加し、`cart-contents.tsx` と `cart-summary.tsx` で使用するように変更。送料表示も `$0.00` → `¥0` に修正

### Bug 3: 管理画面の注文ページで400エラー ✅
- **症状**: `bakuure-admin-ui` の注文ページで `WeeklyCard`/`MonthlyCard` が `recurringRevenue` API呼び出しで400エラーを受け、ページ全体がクラッシュ
- **原因**: `WeeklyCard`/`MonthlyCard` コンポーネントにエラーハンドリングがなく、APIエラーが未処理例外として伝播
- **修正**: try-catch を追加し、APIエラー時は ¥0 をフォールバック表示

## Modified Files
- `apps/bakuure-ui/src/lib/format-price.ts` - `formatNanodollarAsJpy` 追加
- `apps/bakuure-ui/src/app/shop/cart/page.tsx` - 商品名解決ロジック追加
- `apps/bakuure-ui/src/app/shop/cart/_components/cart-contents.tsx` - JPY表示に切替
- `apps/bakuure-ui/src/app/shop/cart/_components/cart-summary.tsx` - JPY表示に切替
- `apps/bakuure-admin-ui/src/app/(v1)/[tenant]/orders/components/weekly-card.tsx` - エラーハンドリング追加
- `apps/bakuure-admin-ui/src/app/(v1)/[tenant]/orders/components/monthly-card.tsx` - エラーハンドリング追加
