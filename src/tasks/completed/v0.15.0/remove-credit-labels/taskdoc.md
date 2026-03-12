# Frontend balance terminology refresh - Task Log

## 2025-10-11

- 📝 初期調査: `rg "credit"` / `rg "クレジット"` で表示箇所を洗い出し。
- 🔄 i18n辞書を全面更新 (pricing/self-service/signup/v1beta 等) し、USD残高基調の表現へ統一。
- 🔄 Billing/チャージダイアログの文言・ラベルを「Add funds / 残高チャージ」に変更し、トーストやエラーも調整。
- 🔄 Agent API / LLM料金ページの数値表示をUSD換算へ差し替え、補助カードのラベルを更新。
- 🔄 Self Service カタログの商品表記をクレジットパックからチャージパックへ変更。
- 🔄 Storybook用モック・設定画面のラベルを残高用語に変更。
- ✅ `yarn ts --filter=@tachyon-apps/frontend-auth` (再利用) / `yarn ts --filter=tachyon` / `yarn lint --filter=tachyon` / `mise run check` 実行済み。
- 📝 次ステップ: Playwrightシナリオの更新要否を確認し、必要なら別タスク化。
