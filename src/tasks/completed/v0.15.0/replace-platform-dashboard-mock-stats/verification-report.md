# Verification Report: Replace Platform Dashboard Mock Stats

## 概要
- フロントエンド実装完了。lint / `mise run check` 実行済み。
- TypeScript チェックは既知の CRM 翻訳未定義エラーで失敗（本タスク外）。

## 実施予定の確認項目
- [ ] シナリオテスト（Playwright MCP）
- [x] `mise run check`
- [x] `yarn --cwd apps/tachyon lint`
- [ ] `yarn --cwd apps/tachyon ts`（CRM 翻訳未定義で失敗中）

## メモ
- `yarn --cwd apps/tachyon ts` は `crm` 辞書未整備によりエラー（既存課題）。
