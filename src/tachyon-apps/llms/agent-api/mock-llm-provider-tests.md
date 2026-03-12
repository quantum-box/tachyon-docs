---
title: "Agent API Mock LLM Provider Test Strategy"
emoji: "🧪"
topics:
  - LLMS
  - Agent API
  - Testing
published: true
targets:
  - packages/providers/llms_provider/src/tests.rs
  - packages/llms/src/usecase/execute_agent.rs
  - packages/llms/src/usecase/get_agent_history.rs
lastUpdated: 2025-10-22
---

# Agent API Mock LLM Provider Test Strategy

## 概要

Agent API と GetAgentHistory ユースケースを外部 API へ依存せず決定論的に検証するため、`ScriptedChatStreamProvider` を導入し、モックチャンクを用いたユースケーステストを整備した。これにより `cargo test -p llms -- execute_agent` / `-- get_agent_history` が常に安定して実行でき、Ask や Tool 呼び出しなどの複雑なシーケンスも再現できる。

## モックプロバイダー仕様

| 項目 | 内容 |
| --- | --- |
| 実装 | `packages/providers/llms_provider/src/tests.rs` の `ScriptedChatStreamProvider` |
| 対応モデル | 既定で `<provider>/mock-agent` を返却。`with_supported_models` で上書き可能 |
| 返却チャンク | `ChatStreamChunk::Text` / `Usage` など事前定義済み配列を順番にストリーム配信 |
| 利用方法 | `ChatStreamProviders` に登録し、`ExecuteAgent` 内で既定プロバイダーとして利用 |
| 目的 | Streaming/Agent 機能を持つ LLM を模倣し、課金や外部ネットワークに依存しないテスト環境を提供 |

### サンプル

```rust
let scripted_provider = Arc::new(ScriptedChatStreamProvider::new(
    "openai",
    vec![
        ChatStreamChunk::Text(Text {
            text: "Hello from scripted provider".to_string(),
        }),
        ChatStreamChunk::Usage(Usage {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30,
        }),
    ],
));
```

## ユースケーステスト強化

### ExecuteAgent

- `execute_agent_returns_scripted_chunks`：モックチャンクが `AgentChunk::Say` と `Usage` に変換されることを確認。
- `execute_agent_emits_thinking_chunks`：`<thinking>` タグを Thinking/Say のシーケンスとして復元。
- `execute_agent_emits_single_ask_without_tool_events`：`<ask_followup_question>` を単一 `AgentChunk::Ask` として扱い、`ToolCall` 系チャンクが発生しないことを検証。

### GetAgentHistory

- `test_get_agent_history_replays_execute_agent_patterns`：ExecuteAgent が保存する `<task>` / `[tool] Result:` / `<attempt_completion>` を履歴チャンクへ再構成。
- `test_get_agent_history_parses_mcp_tool_call`：`<use_mcp_tool>` を ToolCall → ToolCallArgs → Say に展開。
- `test_get_agent_history_preserves_thinking_tags`：Thinking/Say の分割を確認し、履歴 API 側の再生互換性を担保。

## テスト実行手順

```bash
mise run test -- llms execute_agent
mise run test -- llms get_agent_history
# もしくは
cargo nextest run -p llms --lib execute_agent
cargo nextest run -p llms --lib get_agent_history
```

## 運用上の注意

- プロバイダー差し替えはテスト専用とし、本番設定では既存のプロバイダー登録フローを用いる。
- 新たなチャンク種別やタグを追加した場合は、`ScriptedChatStreamProvider` に対応チャンクを追加し、ユースケーステストで期待シーケンスを明文化する。

## 関連タスク

- [docs/src/tasks/completed/v0.17.2/agent-api-mock-llm-provider/task.md](../../../tasks/completed/v0.17.2/agent-api-mock-llm-provider/task.md)
