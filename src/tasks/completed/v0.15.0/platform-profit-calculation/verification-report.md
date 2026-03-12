# Verification Report

## 実行したテスト
- [x] `mise run check`
- [ ] `mise run ci-node`
- [x] `cargo test -p profit`
- [x] `yarn ts --filter=tachyon`
- [x] `yarn lint --filter=tachyon`
- [ ] Playwright MCP シナリオ

## メモ
- `procurement::App::fee_schedule` で Stripe 手数料情報（料率/固定額）を `ConfigurationProvider` から取得し、`profit::ProfitService` 側で差分計算に利用。
- GraphQL スキーマ更新後に `yarn codegen --filter=tachyon` を実行済み。
- `yarn --cwd apps/tachyon vitest run src/app/v1beta/[tenant_id]/platform/profit/components/utils.test.ts` でユーティリティ関数の動作を確認。フルスイートは既存の I18n プロバイダー未設定で失敗するため未実行。
- `mise run tachyon-api-scenario-test` で GraphQL シナリオ全体を実行。`プラットフォーム利益サマリーが取得できる` シナリオが 76ms/59ms で通過し、Breakdown/Total が期待どおり返却されることを確認。
