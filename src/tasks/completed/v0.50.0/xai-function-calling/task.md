# xAI プロバイダーに OpenAI 互換 Function Calling を実装

## 概要

Agent API で xAI/Grok モデルを使用すると、ツールコールが一切動作しない。
xAI プロバイダーが OpenAI 互換の function calling（`tools`/`tool_calls`）を未実装のため。

## 問題

### 本番で確認した症状
- XML モード: Grok がツール定義をシステムプロンプトで受け取るが、XML 形式のツールコールを出力しない → ツール未実行
- JSON モード: `Options.tools` をセットしても `ChatRequest` に `tools` フィールドがなく API に送信されない → ツール未実行

### 根本原因
`packages/providers/xai/src/chat.rs`:
- `ChatRequest` に `tools` / `tool_choice` フィールドなし
- `ResponseMessage` に `tool_calls` フィールドなし
- `chat_stream_v2` が `ChatStreamChunk::Text` しか返さない

追加の根本原因（ローカル動作確認で発見）:
- `execute_agent.rs` / `resume_agent.rs` で auto-detected `needs_json_tool_calls` が `AttemptApiRequest` にのみ適用され、`RecursiveAgent` のシステムプロンプト生成には元の `input.use_json_tool_calls`（= false）が渡されていた
- 結果: APIリクエストには `tools` パラメータが送信されるが、システムプロンプトにはXMLツール定義が含まれ、レスポンスパースがJSON modeのためXMLツールコールが無視されるという矛盾状態

## 修正方針

OpenAI プロバイダー（`packages/providers/openai/src/chat/stream_v2.rs`）を参考に:

1. **`ChatRequest` 拡張**: `tools`, `tool_choice` フィールド追加
2. **`ChatMessage` 拡張**: `tool_calls`, `tool_call_id` フィールド追加
3. **`ResponseMessage` 拡張**: `tool_calls` フィールド追加
4. **`chat_stream_v2` 修正**: レスポンスの `tool_calls` を `ChatStreamChunk::ToolCall` に変換
5. **メッセージ変換修正**: domain `Message` の `tool_calls`/`tool_call_id` を保持
6. **auto-detection統一**: `needs_json_tool_calls` をシステムプロンプト生成にも適用

## 実装チェックリスト

- [x] `ChatRequest` に `tools`/`tool_choice` 追加
- [x] `ChatMessage` に `tool_calls`/`tool_call_id` 追加
- [x] `ResponseMessage` に `tool_calls` 追加
- [x] レスポンスの `tool_calls` → `ChatStreamChunk::ToolCall` 変換
- [x] メッセージ変換で `tool_calls`/`tool_call_id` を保持
- [x] `chat()` 関数にも `tools` 対応追加
- [x] xAI/OpenAI/zAI プロバイダー自動 JSON tool call モード有効化
- [x] `needs_json_tool_calls` を `RecursiveAgent` のシステムプロンプト生成にも統一適用
- [x] `mise run check` ビルド成功
- [x] `mise run clippy` 警告なし（新規）
- [x] ローカル Docker 環境で動作確認 ✅

## ローカル動作確認結果 (2026-02-20)

### テスト結果

| テスト | 修正前 | 修正後 |
|--------|--------|--------|
| ツールコールイベント | `say` にXMLテキスト埋め込み（パースされず） | `tool_call` SSEイベントとして構造化 |
| prompt_tokens | 3645（XMLツール定義がプロンプトに含まれる） | 1062-1607（JSON modeでスリム） |
| execute_command | 実行不可 | 正常実行、`echo hello` → `hello` 出力 |
| TodoWrite | 実行不可 | 正常呼び出し＆実行 |

### 動作確認コマンド例
```bash
# chatroom作成
curl -s http://localhost:50154/v1/llms/chatrooms \
  -H 'Authorization: Bearer dummy-token' \
  -H 'x-operator-id: tn_01hjryxysgey07h5jz5wagqj0m' \
  -H 'Content-Type: application/json' \
  -d '{"name": "xai-fc-test"}'

# agent実行（execute_commandテスト）
curl -s -N http://localhost:50154/v1/llms/chatrooms/<chatroom_id>/agent/execute \
  -H 'Authorization: Bearer dummy-token' \
  -H 'x-operator-id: tn_01hjryxysgey07h5jz5wagqj0m' \
  -H 'Content-Type: application/json' \
  -d '{
    "task": "Run the command echo hello using execute_command tool",
    "model": "xai/grok-4-1-fast-non-reasoning",
    "auto_approve": true,
    "tool_access": {"command": true, "filesystem": true}
  }'
```

## 対象ファイル
- `packages/providers/xai/src/chat.rs` (メイン変更: function calling対応)
- `packages/llms/src/usecase/execute_agent.rs` (自動JSON検出 + システムプロンプト統一)
- `packages/llms/src/usecase/resume_agent.rs` (resume時も同様)
