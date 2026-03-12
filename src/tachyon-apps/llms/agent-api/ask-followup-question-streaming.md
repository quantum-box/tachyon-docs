---
title: "ExecuteAgent Ask Followup Streaming"
emoji: "🤖"
topics:
  - LLMS
  - Agent API
  - Streaming
published: true
targets:
  - packages/llms/src/usecase/command_stack/chat_stream.rs
  - packages/llms/src/usecase/command_stack/types.rs
  - packages/llms/src/usecase/get_agent_history.rs
  - packages/llms/src/usecase/execute_agent.rs
lastUpdated: 2025-10-22
---

# ExecuteAgent Ask Followup Streaming

## 概要

`ask_followup_question` ツールを用いたフォローアップ質問が、`ExecuteAgent` の SSE ストリームおよび `GetAgentHistory` API で一意の `ask` イベントとして扱われるようにした際の挙動を整理する。重複イベントの排除と履歴保全を目的とする。

## ストリーミング仕様

- `agent` 実行中に `<ask_followup_question>` ブロックを受信した場合、`AttemptApiRequest` は以下のチャンクのみを配信する。
  - `AgentChunk::Ask` ・・・質問文と選択肢を JSON 形式で `options` に保持。
- `AgentChunk::ToolCall` / `AgentChunk::ToolCallArgs` は発生しない。
- `Ask` 受信後は後続イテレーションを行わず、Usage チャンクなどの付随イベントも送信されない。

## 履歴復元

- `MessageCollection::new_from_chunks` および `push_chunk` は `AgentChunk::Ask` を `<ask_followup_question>` ブロックとしてメッセージに保持する。
- `GetAgentHistory` はストレージに保存された `<ask_followup_question>` を復元し、クライアントに `ask` イベントとして返却する。

## 影響範囲

- `packages/llms/src/usecase/command_stack/chat_stream.rs` … Ask チャンク組み立てロジックの調整。
- `packages/llms/src/usecase/command_stack/types.rs` … `<ask_followup_question>` ブロック保持のためのフォーマッタ追加。
- `packages/llms/src/usecase/get_agent_history.rs` … `Ask` チャンクのスナップショット対応と回帰テスト追加。
- `packages/llms/src/usecase/execute_agent.rs` … Ask が単発で配信されることを確認するユニットテスト追加。

## テスト

- `cargo nextest run -p llms --lib` … Ask チャンク関連の単体テストを含めて成功。
- `GetAgentHistory` 用ユニットテスト `test_get_agent_history_parses_ask_followup_question` を追加。

## 運用メモ

- 既存クライアントが `tool_call` / `tool_call_args` ベースで Ask を検知していた場合は、`ask` イベントへ検知ロジックを移行する。
- 履歴 API で `<ask_followup_question>` ブロックを返すため、エスケープ処理は既存の XML ブロックと同様に行う。
