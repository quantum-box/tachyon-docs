---
title: "価格マッピングUIの説明強化"
type: "improvement"
emoji: "🧭"
topics:
  - frontend
  - pricing
  - procurement
published: false
targetFiles:
  - apps/tachyon/src/app/v1beta/[tenant_id]/pricing/services/[id]/components/price-mapping-list.tsx
  - apps/tachyon/src/app/v1beta/[tenant_id]/pricing/services/[id]/components/price-mapping-dialog.tsx
  - apps/tachyon/src/app/v1beta/[tenant_id]/procurement/components/ProcurementPriceList.tsx
  - apps/tachyon/src/lib/i18n/v1beta-translations.ts
  - apps/tachyon/src/gen/graphql.ts
github: ""
---

# 価格マッピングUIの説明強化

## 概要

- 価格マッピング一覧に説明テキストを追加し、各行が「プロンプトトークン料金」「完了トークン料金」など直感的に分かるようにする。
- `Procurement ID` をクリック可能にして該当の調達価格詳細へ遷移できるようにする（新規タブで開く）。
- `Procurement ID` にマウスオーバーした際、調達価格のサマリー（ベースコスト・通貨・有効期間）をツールチップで表示し、マッピング編集前の確認を容易にする。

## 背景・目的

- 現状の価格マッピング UI は列ラベルのみでは文脈が分かりづらく、どのリソースタイプに紐づくかを理解するのに時間がかかる。
- 調達 ID をコピーするには手入力が必要で、別画面で調達価格を検索する負担が大きい。
- 調達価格の詳細を UI 上ですぐ確認できないため、誤った ID を設定してしまうリスクがある。

## 詳細仕様

### 機能要件

1. 価格マッピング一覧（`PriceMappingList`）で、各行の左側に説明サブテキストを追加する。
   - `PROMPT_TOKENS` → 「プロンプトトークン料金（1M tokensあたり）」など翻訳辞書で管理。
   - `COMPLETION_TOKENS` → 「完了トークン料金（1M tokensあたり）」。
2. `Procurement ID` を `Button` or `Link` でラップし、クリックで `/v1beta/[tenant_id]/procurement/prices?highlight=<procurement_id>`（新規クエリ追加予定）に遷移。
3. `Procurement ID` に hover したとき、`hostApiPricing` と `procurementPricesByTenant` の GraphQL 応答から調達情報を取得し、Tooltip に以下情報を表示する：
   - ベースコスト（USD / 単位）
   - 契約ステータス・契約番号（存在する場合）
   - 有効期間
4. 調達情報が存在しない場合は「調達情報が見つかりません」メッセージを表示。
5. 価格マッピングの GraphQL クエリに調達価格のサマリーを組み込み、フロントで追加フェッチが不要になるようにする。

### 非機能要件

- UI 表示更新は既存テーマに合わせる（Shadcn UI コンポーネントを利用）。
- Tooltip 表示はアクセシビリティ属性（`aria-label`）に配慮する。
- クリック時の遷移は SPA 内リンクで行い、ページ遷移後に対象の行へスクロールするアンカー処理を検討。

## 実装方針

1. GraphQL スキーマ更新
   - `servicePriceMappings` クエリで関連する `procurementPrice` の要約情報を返すようバックエンドのリゾルバーを拡張。
   - `apps/tachyon/src/gen/graphql.ts` を再生成。
2. フロントエンド更新
   - `PriceMappingList` に説明列と Tooltip を追加。
   - `ProcurementPriceList` に `?highlight=` パラメータ対応を追加し、スクロール＋強調表示を実装。
3. 翻訳辞書更新
   - 新たなラベル／Tooltip テキストを `v1betaTranslations` に追加（英語・日本語）。
4. スタイル／アクセシビリティ
   - Tooltip 内の情報整形、`kbd` タグなど活用して視認性を高める。

## タスク分解

### フェーズ1: 調査・API拡張 ✅
- [x] 既存 GraphQL スキーマとリゾルバーの依存関係を確認
- [x] 調達価格サマリー用の型／リゾルバー追加案を整理
- [x] 新しいクエリ／フィールドのテスト戦略を検討

### フェーズ2: フロント実装 ✅
- [x] 価格マッピング一覧の UI 改修（説明テキスト・リンク・Tooltip）
- [x] `ProcurementPriceList` のハイライト対応
- [x] 追加した翻訳キーの適用確認

### フェーズ3: 動作確認 ✅
- [x] `mise run codegen` を実行し型差分を吸収
- [x] サービス画面でリンク遷移＆Tooltip 表示を手動確認（Playwright 利用、Procurement画面は `hostApiPricing` が401のためハイライトのみ未確認）
- [x] シナリオテストに調達価格検証ケースを追加し `catalog_service_price_mapping_create.yaml` を更新（`multi_tenancy_access` シナリオは `AuthQuery::me` のオペレーター収集ロジックを修正し再実行で成功）

## テスト計画

- 手動テスト：Claude Sonnet 4.5 のサービス画面で Tooltip 内容とリンク遷移を確認。
- GraphQL レベル：`servicePriceMappings` クエリに新フィールドを追加した際のユースケーステストを更新。
- シナリオテスト：既存の `catalog_service_price_mapping_create.yaml` に調達 ID 表示確認の Step を追加検討。

## リスクと対策

| リスク | 対策 |
|--------|------|
| 調達価格が存在しないケースで Tooltip が空になる | フロントでフォールバックメッセージ表示 |
| リンク先ページで対象行が見つからない | ハイライト処理に対する graceful fallback を実装 |
| GraphQL 応答サイズ増大 | 必要最小限のフィールドに限定する |

## スケジュール

- 2025-10-15: タスクドキュメント作成
- 2025-10-16: GraphQL 拡張＆ UI 実装
- 2025-10-17: 動作確認・ドキュメント更新

## 実装メモ

- `packages/catalog/src/graphql/types.rs` の `build_agent_api_price_mappings()` を再調整し、デモ用 `pd_agent_api_service` もシード済みの `proc_...` ID と整合するよう修正。`scripts/seeds/n1-seed/007-procurement-suppliers.yaml` / `010-order-service-price-mappings.yaml` に Google / Claude 4 系の調達データを追加し、`target/debug/yaml-seeder apply dev ...` で個別適用済み。
- `apps/tachyon-api/tests/scenarios/catalog_service_price_mapping_create.yaml` に調達価格取得ステップを追加し、`mise run tachyon-api-scenario-test` 経由で全シナリオ成功を確認（実行ログ上で success まで確認済み）。
- `mise run codegen` → `yarn run ts --filter=tachyon` を最新状態で実行済み。`mise run seeding` はフル適用で重複挿入が発生するため、必要箇所（007 / 010）のみ個別投入で回避している。
- 2025-10-15: ローカル Playwright で価格マッピング表の文言と Tooltip を確認。調達価格リンクは新規タブで開くよう変更済み。Procurement 一覧は `hostApiPricing` が 401 を返すためハイライト適用の UI は未確認（クエリ自体は `curl` で 200 を確認）。`yarn ts --filter=tachyon` は `profit-analysis` 系型定義の不整合で失敗する既知エラーあり。
- 2025-10-16: Playwright 経由で Hook エラー（`Rendered more hooks than during the previous render`）が発生したため、`ProcurementPriceList` の重複 `useEffect` を整理し `loading` 時もフック数が変動しないよう修正。ツールチップおよび調達リンク動作を再確認済み。
- 2025-10-16: TiDB マイグレーションのガイドラインに従い、`packages/order/migrations/20251015093000_add_price_mode_to_service_price_mappings.up.sql` から DML を除去し、後続の `20251015093100_sync_price_mode_with_procurement_linked` を追加。DDL と DML を分離した上で、既存データの `price_mode` を `procurement_linked` へ更新する処理を別マイグレーションに移行した。
- 2025-10-16: `AuthQuery::me` の `operators` 取得で、プラットフォームヘッダー有無に関わらずユーザー紐づけ済みオペレーターをすべて集約するよう修正（`packages/auth/src/interface_adapter/controller/resolver.rs`）。`mise run tachyon-api-scenario-test` が全シナリオ成功に復帰。

## 完了条件

- 価格マッピング一覧で説明と Tooltip が表示され、調達 ID がリンクとして機能する。
- 調達価格画面で該当 ID がハイライトされる。
- GraphQL/前提テストが通過し、タスクドキュメントが最新状態に更新されている。
