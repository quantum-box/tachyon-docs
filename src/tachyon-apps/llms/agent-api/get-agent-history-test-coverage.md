# GetAgentHistory 履歴再生テスト仕様

## 背景

GetAgentHistory ユースケースは ExecuteAgent が保存したチャット履歴を `AgentChunk` 配列へ再構成する。履歴フォーマットには `<task>` タグや `[tool] Result:` プレフィックス、MCP 呼び出しタグなど多様な表現が含まれ、退行を防ぐために実運用同等のメッセージパターンを網羅する単体テストを整備した。

## 対象範囲

- 対象ユースケース: `packages/llms/src/usecase/get_agent_history.rs`
- 依存モジュール: `messages_to_chunk` 変換ロジック、`MockChatMessageRepository`
- テスト戦略: tokio ベースの非同期単体テストで履歴再生の期待結果を比較検証する。

## メッセージパターンと期待結果

| メッセージ種別 | 入力例 | 期待される `AgentChunk` |
| --- | --- | --- |
| `<task>` タグ付きユーザーメッセージ | `<task>\nList repository status\n</task>` | ユーザー発言 (`ChunkSnapshot::User`) としてタグ除去後の本文を保持 |
| `[tool] Result:` プレーンテキスト | `[tool] Result:\n["status output"]` | `ChunkSnapshot::ToolResult` として `is_finished=true` で格納 |
| `<attempt_completion>` タグ | `<attempt_completion>...` | `ChunkSnapshot::AttemptCompletion` に結果テキストと `command` 情報を復元 |
| `<thinking>` 包含メッセージ | `<thinking>Analyzing</thinking>Final` | `ChunkSnapshot::Thinking` → `ChunkSnapshot::Say` シーケンスへ展開 |
| `<write_to_file>` ショートカット | `<write_to_file>...</write_to_file>` | ToolCall → ToolCallArgs(JSON) → ToolResult(success) |
| `<ask_followup_question>` | `<ask_followup_question>...</ask_followup_question>` | `ChunkSnapshot::Ask` として質問文と選択肢配列を保持 |
| `<use_mcp_tool>` MCP 呼び出し | `<use_mcp_tool>...</use_mcp_tool>Finished.` | ToolCall → ToolCallArgs → Say の順に復元 |

## テストケース一覧

1. 空履歴を返す既存テストを維持し、認可チェックが 1 回だけ呼ばれることを検証。
2. 基本的なユーザー/アシスタント往復メッセージを `ChunkSnapshot` へ変換する。
3. ExecuteAgent が永続化する一連のメッセージ (task / tool result / attempt completion) を再生し、期待されるチャンクシーケンスと一致させる。
4. `<thinking>` タグを中間チャンクとして保持し、最終回答を `Say` チャンクに分割する。
5. `<write_to_file>` などのツールショートカットを ToolCall/Args/Result に変換する。
6. `<ask_followup_question>` を Ask チャンクとして復元し、選択肢を `Vec<String>` に展開する。
7. `<use_mcp_tool>` を ToolCall/Args/Say の組み合わせで復元し、MCP 呼び出し完了後の補足テキストを `Say` に移送する。

## テスト実行方法

```bash
mise run test -- llms get_agent_history
```

もしくは対象クレートのみを高速に検証する場合は以下を利用する。

```bash
cargo nextest run -p llms --lib get_agent_history
```

## 関連タスク

- [docs/src/tasks/completed/v0.17.2/get-agent-history-test-coverage/task.md](../../tasks/completed/v0.17.2/get-agent-history-test-coverage/task.md)

## 今後の拡張指針

- 新しいタグやメッセージフォーマットを導入する際は、`messages_to_chunk` に実装追加後、本仕様にパターンと期待チャンクの対応表を追記する。
- MCP 以外のツール呼び出しスキーマ (例: `exec_command`) を導入した場合は、ToolCallArgs の検証フィールドを増やし、テストで JSON 構造も比較する。
