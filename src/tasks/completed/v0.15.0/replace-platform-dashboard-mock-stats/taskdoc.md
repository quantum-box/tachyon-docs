# プラットフォームダッシュボード統計の実値化 - Task Log

## 2025-10-12

- 📝 GraphQLスキーマを再確認し、`creditBalance` / `pricingPolicies` / `promptLogs` の取得項目を列挙。
- 🔄 `page.tsx` に `TenantDashboardMetrics` クエリを組み込み、`buildMetricCards` でカード値・ヒントを再計算。
- 🔄 AI実行数の比較ロジックを `calculateAiUsageWindows` に抽出し、ゼロ除算時のフォールバックを追加。
- 🔄 課金残高カードを NanoDollar→USD 変換 + 相対時間表示に更新。
- 🔄 価格ポリシーカードで ACTIVE/DRAFT 集計を実装し、ヒント文言を辞書に反映。
- 🔄 i18n辞書（`v1beta-translations.ts`）をカード新文言で更新。
- ✅ `mise run check` / `yarn --cwd apps/tachyon lint` 完了。`yarn --cwd apps/tachyon ts` は既知の CRM 翻訳未定義で失敗するため保留（チーム共有済み）。
- 📝 Playwrightシナリオ化は別タスク検討（ダッシュボード初期表示の安定化後に対応）
