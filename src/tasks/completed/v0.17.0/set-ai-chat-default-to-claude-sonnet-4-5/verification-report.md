---
title: "AIチャット既定モデル変更 動作確認レポート"
type: "tech"
emoji: "🧪"
topics: ["LLM", "UI", "Anthropic"]
published: false
---

## 実施概要
- 2025-10-19 Playwright MCP を用いて `/v1beta/tn_01hjryxysgey07h5jz5wagqj0m/ai/chat/new` を検証。サインイン後にチャット作成画面へ遷移し、既定モデルがClaude Sonnet 4.5であることを確認した。
- 追加で `?model=anthropic/claude-opus-4-1-20250805` 指定時にOpusが保持されること、モデル取得失敗時のエラー表示に変化がないことを確認。
- スクリーンショット: `/var/tmp/playwright-mcp/20251019-chat-default-sonnet.png` に保存。

## チェックリスト
- [x] `http://localhost:16000/v1beta/tn_01hjryxysgey07h5jz5wagqj0m/ai/chat/new` にアクセスした際、URLクエリが無指定でもClaude Sonnet 4.5が選択されることを確認
- [x] 既存の `model` クエリパラメーターが有効な場合に上書きされないことを確認
- [x] モデルリスト取得失敗時の挙動に変更がないことを確認

## 結果
- 判定: 成功
- 詳細:
  - 既定選択・クエリ指定・エラー時挙動のすべてで期待通りの結果を得た。
  - `mise run check` および `yarn --cwd apps/tachyon lint` を再実行し、CIと同等の検証が完了。
