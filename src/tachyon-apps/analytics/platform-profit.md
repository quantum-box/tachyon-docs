# プラットフォーム利益ダッシュボード

## 概要

Platform テナントが Operator へ提供するサービスの収益性を横断的に可視化する機能です。Pricing コンテキストが管理する販売価格と、Procurement コンテキストの調達コストを突き合わせ、Stripe 決済手数料を控除した粗利益と利益率を算出します。

## ドメイン構成

- **profit::ProfitService**  
  Catalog の `ServicePriceMapping` と Procurement の `ProcurementPrice` を参照し、サービス×価格タイプ単位の `ProfitBreakdown` を生成します。
- **procurement::App::fee_schedule**  
  Provider ごとの Stripe 手数料（可変料率 + 固定額）を返します。未設定の場合は `ProfitService` のデフォルト手数料 (2.9% + $0.30) を利用します。
- **ProfitSummary**  
  Breakdown の合計から `totalRevenue / totalProcurementCost / totalStripeFees / grossProfit / grossMarginPercent` を算出します。Breakdown 全体の件数を `breakdown_total` として保持し、GraphQL でページネーション可能にしています。

## GraphQL API

- Query 名: `platformProfitSummary`
- 主な引数  
  - `tenantId` (Platform TenantId 必須)  
  - `operatorId` (オプション。指定しない場合は Platform 全体)  
  - `serviceIds` (サービス ULID の配列)  
  - `range` (`from` / `to` の ISO8601 日付)  
  - `breakdownOffset` / `breakdownLimit` (ページネーション)
- 返却フィールド  
  - サマリー: `currency`, `totalRevenue`, `totalProcurementCost`, `totalStripeFees`, `grossProfit`, `grossMarginPercent`, `breakdownTotal`  
  - Breakdown: `serviceId`, `serviceName`, `operatorId`, `priceType`, `revenue`, `procurementCost`, `stripeFees`, `profit`, `marginPercent`
- 実装ファイル  
  - `packages/profit/src/graphql/query.rs`  
  - `apps/tachyon-api/schema.graphql`

## フロントエンド UI

- ページ: `apps/tachyon/src/app/v1beta/[tenant_id]/platform/profit/page.tsx`
- コンポーネント: `ProfitDashboard`  
  - フィルター入力（Operator / Service / 期間）  
  - Stripe 手数料表示のオン・オフ切り替え  
  - サマリーカード（Revenue / Procurement cost / Stripe fees / Gross profit / Margin）  
  - Breakdown テーブル（ページサイズ 10、前後ページ操作）  
  - 金額表示はドル小数第3位まで固定で表示

## データフロー

1. UI から GraphQL `platformProfitSummary` をクエリし、初期状態は Platform 全体の最新価格を取得します。  
2. バックエンドは Pricing から API サービスを列挙し、期間内有効な `ServicePriceMapping` を抽出。対応する `ProcurementPrice` を解決します。  
3. Stripe 手数料を控除して利益額を算出し、Breakdown とサマリーを返却します。  
4. フロントエンドは Breakdowns をページネーションし、トグル操作時に手数料控除後の値だけをクライアント計算で再描画します。

## テスト

- Rust 単体テスト: `cargo test -p profit`  
  - マイナス値の拒否、Stripe 手数料計算の検証  
- GraphQL シナリオ: `apps/tachyon-api/tests/scenarios/platform_profit_summary.yaml`  
  - Breakdown が返却されること、ページネーション引数の検証
- フロントユーティリティ: `yarn --cwd apps/tachyon vitest run …/platform/profit/components/utils.test.ts`

## 参照

- タスクドキュメント: `docs/src/tasks/completed/v0.15.0/platform-profit-calculation/task.md`
- 関連ドメイン実装: `packages/profit`, `packages/catalog`, `packages/procurement`
