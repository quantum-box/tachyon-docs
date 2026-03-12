---
title: "bakuure 本番 /product/* ページ 500エラー修正"
type: bug
emoji: "🐛"
topics:
  - bakuure-ui
  - GraphQL
  - storefrontProducts
published: true
targetFiles:
  - apps/bakuure-ui/src/app/product/product_list.graphql
  - apps/bakuure-ui/src/features/ProductListForCustomer/ProductListForCustomer.graphql
  - apps/bakuure-ui/src/features/ProductPriceTableForCustomer/ProductPriceTableForCustomer.graphql
  - apps/bakuure-ui/src/features/ProductSimurator/ProductSimurator.graphql
  - apps/bakuure-ui/src/app/product/simulator/page.tsx
  - apps/bakuure-ui/src/app/product/list/page.tsx
  - apps/bakuure-ui/src/app/product/price/page.tsx
  - apps/bakuure-ui/src/features/ProductPriceTableForCustomer/index.tsx
  - apps/bakuure-ui/src/features/ProductSimurator/PlanList.tsx
  - apps/bakuure-ui/src/features/ProductSimurator/index.tsx
  - apps/bakuure-ui/src/gen/validator.ts
---

# bakuure 本番 /product/* ページ 500エラー修正

## 概要

本番 bakuure の `/product/simulator`, `/product/list`, `/product/price` ページが 500 エラーを返す問題を修正する。GraphQL クエリを管理者用 `products` から公開用 `storefrontProducts` に切り替える。

## 背景・目的

- **問題**: 上記3ページが `products` クエリ（tachyon-api 管理者用 SDK API）を使用している
- **原因**: 本番 bakuure-api は `dummy-token` で tachyon-api に接続しており、`products` クエリのポリシーチェック（`order:ListAllProducts`）で 403 Forbidden → フロントで 500 エラー
- **解決策**: `storefrontProducts` クエリ（公開用 Commerce REST API 経由、ポリシーチェック不要）に切り替える
- **影響範囲**: フロントエンド（bakuure-ui）のみ。バックエンド変更なし

## 詳細仕様

### フィールド互換性

ページが使っているフィールドはすべて `StorefrontProduct` 型にも存在する:

| フィールド | Product | StorefrontProduct | 使用ページ |
|-----------|---------|-------------------|-----------|
| `id` | String! | String! | 全ページ |
| `name` | String! | String! | 全ページ |
| `description` | String | String | list, price |
| `listPrice` | Int! | Int! | 全ページ |
| `kind` | Kind! (enum) | String! | simulator |
| `billingCycle` | RecurringBillingFrequency! (enum) | String! | 全ページ |

**注意**: `kind` と `billingCycle` が enum 型 → String 型に変わるため、コンポーネント内の enum 参照を文字列リテラルに置換する必要がある。

### レスポンス構造の差異

```yaml
# 旧: products クエリ
products:
  totalCount: Int!        # ← storefrontProducts にはない
  pageInfo:               # ← storefrontProducts にはない
    limit: Int!
    offset: Int!
    hasNextPage: Boolean!
  items: [Product!]!

# 新: storefrontProducts クエリ
storefrontProducts:
  items: [StorefrontProduct!]!
  limit: Int!             # トップレベルに直接
  offset: Int!            # トップレベルに直接
```

### enum → 文字列リテラル対応表

```yaml
Kind:
  Plan: "PLAN"
  Product: "PRODUCT"
  Option: "OPTION"

RecurringBillingFrequency:
  Monthly: "MONTHLY"
  Yearly: "YEARLY"
```

## 実装方針

フロントエンドのみの変更。バックエンド・スキーマ変更なし。

### 変更ファイル一覧

#### 1. GraphQL クエリ・フラグメント（4ファイル）

- `apps/bakuure-ui/src/app/product/product_list.graphql`
  - `products(limit, offset)` → `storefrontProducts(limit, offset)`
  - `totalCount`, `pageInfo` 削除
  - クエリ名: `getProuctsForCustomer` → `getStorefrontProductsForCustomer`

- `apps/bakuure-ui/src/features/ProductListForCustomer/ProductListForCustomer.graphql`
  - `fragment ... on Product` → `fragment ... on StorefrontProduct`

- `apps/bakuure-ui/src/features/ProductPriceTableForCustomer/ProductPriceTableForCustomer.graphql`
  - `fragment ... on Product` → `fragment ... on StorefrontProduct`

- `apps/bakuure-ui/src/features/ProductSimurator/ProductSimurator.graphql`
  - `fragment ... on Product` → `fragment ... on StorefrontProduct`

#### 2. ページコンポーネント（3ファイル）

- `apps/bakuure-ui/src/app/product/simulator/page.tsx`
- `apps/bakuure-ui/src/app/product/list/page.tsx`
- `apps/bakuure-ui/src/app/product/price/page.tsx`

共通変更:
- `sdk.getProuctsForCustomer` → `sdk.getStorefrontProductsForCustomer`
- `products.items` → `storefrontProducts.items`

#### 3. コンポーネント（enum → 文字列リテラル）

- `apps/bakuure-ui/src/features/ProductPriceTableForCustomer/index.tsx`
  - `RecurringBillingFrequency.Monthly` → `'MONTHLY'`

- `apps/bakuure-ui/src/features/ProductSimurator/PlanList.tsx`
  - `RecurringBillingFrequency.Monthly` → `'MONTHLY'`

- `apps/bakuure-ui/src/features/ProductSimurator/index.tsx`
  - `Kind.Plan` → `'PLAN'`, `Kind.Product` → `'PRODUCT'`, `Kind.Option` → `'OPTION'`
  - `RecurringBillingFrequency.Monthly` → `'MONTHLY'`, `.Yearly` → `'YEARLY'`
  - `useState<RecurringBillingFrequency>` → `useState<string>`
  - `CartAmount` の `cycle` prop 型: `RecurringBillingFrequency` → `string`

#### 4. 自動生成ファイル

- `apps/bakuure-ui/src/gen/graphql.ts` → `yarn codegen --filter=bakuure-ui` で再生成
- `apps/bakuure-ui/src/gen/validator.ts` → codegen 無効化済み（手動で不要な enum 参照を削除）

## タスク分解

- [ ] GraphQL クエリ・フラグメントの変更
- [ ] ページコンポーネントの変更
- [ ] コンポーネントの enum → 文字列リテラル変更
- [ ] validator.ts の不要な enum 参照削除
- [ ] `yarn codegen --filter=bakuure-ui` 実行
- [ ] `yarn ts --filter=bakuure-ui` 型チェック通ること確認
- [ ] `yarn lint --filter=bakuure-ui` 通ること確認
- [ ] コミット・PR作成・マージ
- [ ] Amplify 自動デプロイ後、本番確認

## 動作確認チェックリスト

### 本番確認（Amplify デプロイ後）

- [ ] `/product/list` が 200 で表示される（商品一覧テーブル）
- [ ] `/product/price` が 200 で表示される（価格テーブル）
- [ ] `/product/simulator` が 200 で表示される
- [ ] simulator: 月額/年額切り替えが動作する
- [ ] simulator: プラン選択・ハードウェア選択が動作する
- [ ] simulator: 数量変更で金額が再計算される
- [ ] `/shop` は引き続き正常に動作する（既に `storefrontProducts` を使用中）

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| enum 値が実際のバックエンド値と異なる | 高 | tachyon-api schema.graphql で `PLAN`/`MONTHLY` 等を確認済み |
| `totalCount`/`pageInfo` を使っている箇所がある | 低 | 3ページとも `items` のみ使用。ページネーション未実装 |
| validator.ts の手動修正が codegen で上書きされる | 低 | codegen.yml で validator 生成は無効化（コメントアウト）されている |

## 参考資料

- 既存の `storefrontProducts` 使用例: `apps/bakuure-ui/src/app/shop/_components/shop.graphql`
- StorefrontProduct 型定義: `apps/bakuure-api/src/handler/graphql/sdk/commerce_model.rs`
- bakuure-api スキーマ: `apps/bakuure-api/schema.graphql`

## 完了条件

- [ ] `yarn ts --filter=bakuure-ui` パス
- [ ] `yarn lint --filter=bakuure-ui` パス
- [ ] PR マージ
- [ ] 本番で `/product/list`, `/product/price`, `/product/simulator` が 500 エラーなく表示される
