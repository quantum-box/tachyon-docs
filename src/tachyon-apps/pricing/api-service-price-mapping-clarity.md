# APIサービス価格マッピング UI 改修

## 概要
- 対象画面: `/v1beta/[tenant_id]/pricing/services/[id]`
- 目的: API サービス価格マッピングの文脈を明確にし、調達原価リンクと Tooltip で意思決定を支援する。

## 主要変更点
1. **GraphQL 拡張**
   - `servicePriceMappings` 応答に `procurementPrice` 要約（`resourceType`, `unitType`, `baseCost`, `currency`, `effectiveFrom`, `effectiveUntil`, `description`, `updatedAt`）を追加。
   - `ServicePriceMapping` に `priceMode` フィールドを新設し、`fixed`/`procurement_linked` をフロントから判別可能にした。

2. **UI 更新**
   - 価格タイプ列にサブ説明を追加（例: 「プロンプトトークン従量課金（100万トークン単位）」）。
   - 調達価格 ID を新規タブで開くリンクに変更し、Tooltip に調達原価サマリーを表示。
   - Tooltip 内容: コスト（通貨・単位）、リソース種別、有効期間、任意説明、最終更新日時。
   - 調達情報欠損時は「調達価格が見つかりません」を表示。

3. **価格調達画面連携**
   - `/procurement/prices?highlight=<procurement_id>` で対象行をスクロール位置に合わせ、ハイライト表示（401 の場合は DB には保持される）。

4. **テスト/検証**
   - GraphQL コード生成 (`mise run codegen`)・型更新完了。
   - `mise run tachyon-api-scenario-test` でシナリオ一式成功（`AuthQuery::me` オペレーター取得を修正）。
   - Playwright 手動確認: Tooltip 表示、調達リンク遷移（ハイライト動作は `hostApiPricing` 401 のため保留）。

## データベース変更
- `packages/order/migrations/20251015093000_add_price_mode_to_service_price_mappings.up.sql`
  - `service_price_mappings.price_mode` 列（`VARCHAR(32)`、既定 `fixed`）を追加。
- `packages/order/migrations/20251015093100_sync_price_mode_with_procurement_linked.up.sql`
  - `procurement_price_id` を持つ既存レコードの `price_mode` を `procurement_linked` に更新。

## 既知の制約
- 調達価格画面 (`hostApiPricing`) が 401 を返す場合、UI ハイライトは確認できない（GraphQL 上は利用可能）。
- `yarn ts --filter=tachyon` は既存の `profit-analysis` 型不整合で失敗するため未解決。

## 関連ファイル
- GraphQL: `apps/tachyon/src/app/v1beta/[tenant_id]/pricing/services/queries/get-service-price-mappings.graphql`
- React: `apps/tachyon/src/app/v1beta/[tenant_id]/pricing/services/[id]/components/price-mapping-list.tsx`
- Procurement: `apps/tachyon/src/app/v1beta/[tenant_id]/procurement/components/ProcurementPriceList.tsx`
- i18n: `apps/tachyon/src/lib/i18n/v1beta-translations.ts`
- Seeds: `scripts/seeds/n1-seed/007-procurement-suppliers.yaml`, `scripts/seeds/n1-seed/010-order-service-price-mappings.yaml`
- Auth: `packages/auth/src/interface_adapter/controller/resolver.rs`

## 参照タスク
- `docs/src/tasks/completed/v0.16.0/add-price-mapping-clarity-ui/task.md`
