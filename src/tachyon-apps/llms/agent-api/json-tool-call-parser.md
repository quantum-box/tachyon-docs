# JSON Tool Call Parser

## 概要

Agent APIのループ処理において、従来のXML形式パーサー (`XmlStreamParser`) に加え、OpenAI/Anthropic標準の JSON形式 `tool_calls` をパースできる `JsonToolCallEventParser` を実装した。REST APIの `use_json_tool_calls` パラメータで切り替え可能。

## アーキテクチャ

### パーサー切り替えの仕組み

```
REST API (use_json_tool_calls: true/false)
  │
  ▼
ExecuteAgentInputData / ResumeAgentInputData
  │
  ├─► AttemptApiRequest.with_json_tool_calls()  ← パーサー選択 + ツール定義注入
  │
  └─► RecursiveAgent.start_new_task()  ← システムプロンプト選択
```

- **XML モード (デフォルト)**: システムプロンプトにXMLツール定義を埋め込み、`XmlStreamParser` でパース
- **JSON モード**: `Options.tools` にJSON Schemaツール定義を注入し、`JsonToolCallEventParser` でパース

### データフロー

```
Provider Stream
  │
  ├─ ChatStreamChunk::Text(text)
  ├─ ChatStreamChunk::ToolCall { id, name, arguments }
  ├─ ChatStreamChunk::Thinking { text, is_finished }
  └─ ChatStreamChunk::Usage { ... }
  │
  ▼  (JsonToolCallEventParser)
  │
  ├─ ToolCallEvent::Text(text)
  ├─ ToolCallEvent::ToolStart { id, name }
  ├─ ToolCallEvent::Parameter { id, arguments }
  ├─ ToolCallEvent::ToolEnd { id }
  └─ ToolCallEvent::Thinking { text, is_finished }
  │
  ▼  (RecursiveAgent loop)
```

## 主要コンポーネント

### 1. `parse_tool_call.rs` — JSON Tool Call Parser

`ChatStreamChunk::ToolCall` を `ToolCallEvent` ストリーム（ToolStart → Parameter → ToolEnd）に変換する。`Stream` トレイトを実装し、空テキストや Usage チャンクは自動スキップ。

### 2. `tool_definitions.rs` — Tool Definition Generator

`ToolAccessConfig` に基づいて JSON Schema 形式のツール定義を生成。Filesystem、Command、MCP、Coding Agent Job、Sub-Agent、Web Search 等を条件付きで含める。

### 3. `system_prompt.rs` — JSON Mode System Prompt

JSON モード用のシステムプロンプトを生成。XML ツール定義は含まず、ツール定義は `Options.tools` 経由で API に渡す。

### 4. `chat_stream.rs` — AttemptApiRequest

`with_json_tool_calls()` メソッドで JSON モードを有効化。パーサーの差し替えと `Options.tools` へのツール定義注入を制御。

### 5. `types.rs` — MessageCollection Tool Call Tracking

`PendingToolCallInfo` で ToolCall + ToolCallArgs を追跡し、ToolResult 時に `tool_call_id` 付きメッセージを生成。OpenAI Chat Completions API の `role: "tool"` + `tool_call_id` 形式に対応。

## REST API

### Execute Agent

```
POST /v1/llms/chatrooms/{chatroom_id}/agent/execute
```

```json
{
  "task": "ファイルを読んで内容を要約して",
  "use_json_tool_calls": true,
  "model": "openai/gpt-4.1",
  "auto_approve": true,
  "max_requests": 10
}
```

| パラメータ | 型 | デフォルト | 説明 |
|---|---|---|---|
| `use_json_tool_calls` | `bool?` | `false` | `true` で JSON モード有効化 |

### プロバイダー対応状況

全プロバイダーで `ChatStreamChunk::ToolCall` イベントを出力可能:

| プロバイダー | Chat Completions | Responses API |
|---|---|---|
| OpenAI | ✅ ToolCallDeltaAccumulator | ✅ GPT-5 streaming |
| Anthropic | ✅ | - |
| AWS Bedrock | ✅ | - |
| Google AI | ✅ | - |
| Claude Code | ✅ | - |
| xAI | ✅ | - |
| Groq | ✅ | - |
| Perplexity AI | ✅ | - |
| OpenCode | ✅ | - |
| Z.AI | ✅ | - |

## 関連ファイル

- `packages/llms/src/agent/parse_tool_call.rs` — JSON パーサー
- `packages/llms/src/agent/tool_definitions.rs` — ツール定義生成
- `packages/llms/src/agent/system_prompt.rs` — システムプロンプト
- `packages/llms/src/agent/chat_stream.rs` — AttemptApiRequest
- `packages/llms/src/agent/types.rs` — MessageCollection
- `packages/llms/src/agent/core/builder.rs` — AgentBuilder
- `packages/llms/src/usecase/execute_agent.rs` — ExecuteAgent usecase
- `packages/llms/src/usecase/resume_agent.rs` — ResumeAgent usecase
- `packages/llms/src/adapter/axum/agent_handler.rs` — REST handler
- `packages/llms/domain/src/message.rs` — Message domain (tool_call_id)

## 既知の制限事項

- `tool_call_id` はまだ DB に永続化されないため、Resume 時にプロバイダーが `tool_call_id` の相関を要求する場合に問題が生じる可能性がある（将来対応予定）
- JSON モードは `use_json_tool_calls: true` で明示的に有効化する必要がある（将来的にモデル設定で自動選択を検討）
