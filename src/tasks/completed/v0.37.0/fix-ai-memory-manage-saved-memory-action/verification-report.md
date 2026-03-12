# 動作確認レポート - AIメモリー権限制御のシード修正

## 確認項目

- [ ] `yaml-seeder apply dev scripts/seeds/n1-seed/008-auth-policies.yaml` を実行し、`ai_memory:ManageSavedMemory` アクションが `context=ai_memory` で投入されること。
- [ ] Saved Memory API (例: `/v1beta/tenants/.../saved-memories`) が `NotFoundError` を返さないこと。
- [ ] AgentChat で Saved Memory コマンドを実行した際、Agent と同じ LLM プロバイダー鍵が使われること（OpenAI のダミーキーで 401 が発生しない）。

## メモ

- まだ動作確認は未実施。実装完了後に更新する。
