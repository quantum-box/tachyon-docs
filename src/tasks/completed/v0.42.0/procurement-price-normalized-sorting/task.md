---
title: Procurement Price Catalog - Backend Normalized Sorting
type: improvement
emoji: "📊"
topics:
  - Rust
  - GraphQL
  - Backend
published: true
targetFiles:
  - packages/procurement/src/graphql/query.rs
  - packages/procurement/src/graphql/types.rs
  - apps/tachyon/src/app/v1beta/[tenant_id]/procurement/components/ProcurementPriceList.tsx
github: https://github.com/quantum-box/tachyon-apps
---

# Procurement Price Catalog - Backend Normalized Sorting

## 概要

Procurement Price Catalogテーブルの価格ソートをバックエンドで正規化して実行する。現在のフロントエンド実装では、異なる通貨（JPY/USD）や異なる単位（トークン/リクエスト/GB）を単純な数値比較でソートしているため、実際の価値を反映したソートができない。

## 背景・目的

### 現状の問題

1. **通貨の混在**: ¥3,000 JPY と $30.00 USD を単純比較すると、¥3,000が大きい値として扱われる
   - 実際は ¥3,000 JPY ≈ $20 USD なので、$30.00 USD の方が高価

2. **単位の混在**: 以下の価格は直接比較できない
   - ¥3,000 JPY / 100万トークン
   - ¥15 JPY / リクエスト
   - ¥10 JPY / GB

3. **ユーザー体験**: 価格でソートしても意味のある順序にならない

### 目的

- バックエンドで通貨と単位を正規化した比較用価格を計算
- 正規化された価格でソートすることで、実際の価値に基づいた順序を提供

## 詳細仕様

### 機能要件

1. **正規化価格フィールドの追加**
   - GraphQL `ProcurementPrice` 型に `normalizedPriceUsd: Float` を追加
   - 全ての価格をUSD換算し、共通単位（例：1トークンあたり）に正規化

2. **バックエンドソートの実装**
   - GraphQLクエリに `sortBy` と `sortDirection` パラメータを追加
   - `sortBy: "normalizedPrice"` で正規化価格によるソートを実行

3. **通貨換算ロジック**
   - JPY → USD 換算レートを使用（設定可能にする）
   - または、全ての価格をNanoDollarで統一して保存

4. **単位正規化ロジック**
   - トークンベースの価格: そのまま使用
   - リクエストベースの価格: 平均トークン数で換算（要検討）
   - ストレージベースの価格: 別カテゴリとして扱う

### 非機能要件

- パフォーマンス: ソートはDB/バックエンドで実行し、フロントエンドの負荷を軽減
- 拡張性: 新しい通貨や単位が追加されても対応可能な設計

### GraphQL スキーマ変更案

```graphql
type ProcurementPrice {
  id: ID!
  resourceType: String!
  supplier: String!
  baseCost: Float!
  currency: String!
  unit: String!
  # New field for normalized sorting
  normalizedPriceUsd: Float
}

input ProcurementPriceSortInput {
  field: ProcurementPriceSortField!
  direction: SortDirection!
}

enum ProcurementPriceSortField {
  RESOURCE_TYPE
  SUPPLIER
  NORMALIZED_PRICE
  EFFECTIVE_FROM
}

enum SortDirection {
  ASC
  DESC
}

type Query {
  getAllProcurementPrices(
    tenantId: ID!
    sort: ProcurementPriceSortInput
  ): ProcurementPricesResponse!
}
```

## 実装方針

### アーキテクチャ設計

1. **Rust バックエンド**
   - `packages/procurement/src/graphql/query.rs` でソートロジックを実装
   - 通貨換算レートは設定ファイルまたはDB設定から取得

2. **フロントエンド**
   - 価格ソートをバックエンドに委譲
   - 他のカラム（リソース名、サプライヤー名など）は引き続きフロントエンドでソート可能

### 実装ステップ

1. [x] ドメイン層 - 正規化価格計算サービス (`packages/procurement/domain/src/price_normalizer.rs`)
   - JPY→USD (1 USD = 150 JPY)、PerRequest→PerMillionTokens (1000 tokens/request) の正規化
   - 9つのユニットテスト + 1 doctest（全てpass）
2. [x] GraphQL型定義の追加 (`packages/procurement/src/graphql/types.rs`)
   - `ProcurementPriceSortDirection` enum (Asc/Desc)
   - `ProcurementPriceSortInput` InputObject
   - `ProcurementPriceType` に `normalizedPriceUsd: Option<f64>` 追加
3. [x] GraphQLリゾルバー更新 (`packages/procurement/src/graphql/query.rs`)
   - `sort: Option<ProcurementPriceSortInput>` 引数追加
   - `convert_to_procurement_price_type` で正規化計算呼び出し
   - None値は末尾に配置するソートロジック
4. [x] フロントエンドGraphQLクエリ更新 (`getAllProcurementPrices.graphql`)
   - `$sort: ProcurementPriceSortInput` 変数 + `normalizedPriceUsd` フィールド追加
5. [x] フロントエンドコンポーネント更新 (`ProcurementPriceList.tsx`)
   - baseCostソート時はnormalizedPriceUsdで比較
   - JPYまたはper_million_tokens以外の場合に正規化価格を表示
6. [x] Storybook更新 (`ProcurementPriceList.stories.tsx`)
   - モックデータにnormalizedPriceUsd追加

### 検証ステップ
- [x] `cargo check -p procurement_domain -p procurement` pass
- [x] ユニットテスト 9/9 + doctest 1/1 pass
- [x] GraphQLスキーマ再生成（GENERATE_TACHYON_SCHEMA=1）
- [x] `yarn codegen --filter=tachyon` pass
- [x] `yarn ts --filter=tachyon` - procurement関連エラーなし（既存の自動生成型エラー3件のみ）

## タスク分解

### 主要タスク
- [x] 要件定義の明確化（単位正規化の方針決定）
- [x] 技術調査・検証
- [x] 実装
  - [x] GraphQL スキーマ更新
  - [x] バックエンドソートロジック実装
  - [x] フロントエンド更新
- [x] テスト・品質確認
- [ ] ドキュメント更新

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 単位の正規化が複雑 | 高 | 同じ単位カテゴリ内でのみソートを許可する |
| 通貨レートの変動 | 中 | 定期的にレートを更新、またはNanoDollar統一 |
| パフォーマンス低下 | 低 | インデックス追加、キャッシュ活用 |

## 参考資料

- 現在のフロントエンド実装: `apps/tachyon/src/app/v1beta/[tenant_id]/procurement/components/ProcurementPriceList.tsx`
- 価格取得GraphQL: `apps/tachyon/src/app/v1beta/[tenant_id]/procurement/queries/getAllProcurementPrices.graphql`
- NanoDollar仕様: `docs/src/architecture/nanodollar-system.md`

## 完了条件

- [x] 正規化価格フィールドがGraphQLで取得可能
- [x] バックエンドでのソートが動作する
- [x] フロントエンドの価格ソートがバックエンドを使用する
- [x] 異なる通貨・単位の価格が正しい順序でソートされる

## 関連タスク

- 前提タスク: `procurement-price-table-sorting` (完了) - フロントエンドソート機能の実装
