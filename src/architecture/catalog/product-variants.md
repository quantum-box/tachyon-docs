# Catalog Product Variants

## 概要

Catalogコンテキストでは 2025-11-01 時点で `product_variants` テーブルを追加し、既存の `products` に対して 1:n でモデルやプランのバリアントを管理できるようにしました。これにより、Anthropic 等 LLM プロバイダーのモデル種別を Variant として正規化し、Order/Payment/Procurement との連携単位を揃えます。

## データモデル

| テーブル | 主なカラム | 説明 |
| --- | --- | --- |
| `products` | `id`, `tenant_id`, `name`, ... | 既存のカタログ商品エンティティ。Variant はこの商品 ID にぶら下がる |
| `product_variants` | `id`, `product_id`, `tenant_id`, `code`, `status`, `metadata` | Provider モデルやプランを表す細分化された提供形態。`code` は供給元 API のモデル識別子を格納 |
| `variant_procurement_links` | `id`, `tenant_id`, `variant_id`, `supplier_id`, `procurement_code`, `metadata` | Variant と調達コンテキストの Supplier をマッピングする中間テーブル。調達契約や原価に紐付く情報はここで管理 |
| `product_usage_pricing` | `product_id`, `variant_id`, `usage_rates` | Variant 単位での従量課金レートを格納するため `variant_id` を追加 |

`product_variants` では提供側のメタデータのみを扱い、調達先や契約コードといった原価情報は `variant_procurement_links` に切り出しました。`metadata` カラムには外部 API のモデル情報など、公開・課金に必要な属性を JSON で格納します。

### マイグレーション

`packages/order/migrations/20251101093000_add_product_variants.up.sql` にて以下を実施します。

1. `product_variants` テーブルの新規作成
2. `product_usage_pricing` への `variant_id` 追加と外部キー制約

適用コマンド:

```bash
mise run sqlx-migrate ./packages/order
```

続けて `packages/order/migrations/20251104121500_split_variant_procurement.up.sql` で Variant から `supplier_id` を削除し、`variant_procurement_links` を作成します。既存データはマイグレーション内でリンクテーブルへ移送されます。

## アプリケーション層の変更

- Catalog: `ProductVariantRepository` と SQLx 実装を追加。`CatalogApp` では `FindProductByName` に Variant リポジトリを注入し、モデル名検索が Variant 優先で解決される。
- Order: 商品作成/更新ユースケースから Variant を作成・更新。GraphQL 入力は提供情報（`code` や公開情報）に限定し、調達マッピングは Procurement SDK を経由して操作する。
- Payment: Stripe/Square 同期で Variant ID と procurement link から得た metadata を統合し、外部決済プロバイダーにも Variant 単位の SKU を伝播する。
- Procurement: `VariantProcurementLinkRepository` を追加し、`tachyon_apps::procurement::ProcurementApp` から Variant ↔ Supplier 関連付けを提供。GraphQL/CLI/API から CRUD できるようにした。
- Tachyon API / CLI / CRM / LLMs: CatalogApp ビルダーの依存関係に Variant リポジトリを追加。

## データ移行手順

1. 旧来のモデル=商品構成を確認し、`code` ベースで Variant を再生成。
2. Migration 適用後、`product_variants` に既存モデルを `yaml-seeder` 等で投入。
3. `variant_procurement_links` に Supplier / 調達コードのマッピングを移送（マイグレーションで自動付与済みの場合は検証のみ）。
4. `product_usage_pricing` の既存レコードに `variant_id` を設定（例: モデル名→Variant ID で更新）。
5. Order/Payment 側で Variant ID を受け渡しできることを確認し、Stripe 価格定義にも Variant ごとの SKU を追加。

## 実装状況 (v0.22.0)

### 完了済み ✅

- ✅ Seed データ (`scripts/seeds/n1-seed/011-order-product-variants.yaml`) へ Variant と VariantProcurementLink の初期値を追加
- ✅ GraphQL クライアント/管理 UI の Variant 編集フローで調達マッピングも参照・更新できるよう改善
  - Tachyon UI: `/v1beta/[tenant_id]/orders/catalog_product` で Variant CRUD と調達マッピング設定を実装
  - Bakuure 管理UI: Variant ごとの調達リンク表示を追加
- ✅ シナリオテスト (`apps/tachyon-api/tests/scenarios/catalog_product_variant_crud.yaml`) を追加し、Variant CRUD と調達リンク CRUD の両方をカバー

### 今後のTODO

- データ移行・検証（ステージング → 本番環境での移行手順の実証）
- Payment側の統合テスト拡充と `bakuure-ui` の GraphQL ドキュメント追従
