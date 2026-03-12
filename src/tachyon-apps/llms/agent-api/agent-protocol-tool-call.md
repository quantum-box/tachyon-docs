# AgentProtocol ToolCall統合

## 概要

AgentProtocol の内容をシステムプロンプトに直接注入する方式を廃止し、他ツールと同じ `ToolCall` フローで取得・適用できるようにした。`ToolAccessConfig` に `agent_protocol` フラグを追加し、タスク開始時には `agent_protocol` ツールの結果が履歴に保存される構造へ刷新した。

## 背景・目的

- **可視性の向上**: 従来は AgentProtocol の Markdown を実行前にプロンプトへ挿入していたため、フロントから見ると「ツール利用」として観測できなかった。ToolCall ベースに統一することで、UI 上のタイムラインに AgentProtocol が 1 つのステップとして表示される。
- **履歴の永続化**: ToolCall として記録されるため、再開時（Resume）でも AgentProtocol が履歴に残り、再評価されない。
- **制御の統一**: `ToolAccessConfig` で他ツールと同じように有効/無効を制御できるため、利用可否を明示できる。

## コンポーネント構成

| レイヤー | 役割 | 主な実装 |
| --- | --- | --- |
| ToolAccessConfig | `agent_protocol` フラグを追加し、ツールの有効/無効を制御。デフォルトは `true`。 | `packages/llms/src/usecase/command_stack/tool_access.rs` |
| AgentProtocolToolContext | AgentProtocol 取得結果を ToolCall チャンクとして保持するコンテキスト。 | `packages/llms/src/usecase/execute_agent.rs` |
| ToolCall 生成 | AgentProtocol の取得/自動選択結果を `agent_protocol` ToolCall に変換。 | `packages/llms/src/adapter/axum/agent_handler.rs` |
| System Prompt | `agent_protocol` ツールの説明を追加。プロンプトへの直接注入は削除。 | `packages/llms/src/usecase/command_stack/system_prompt.rs` |
| SSE ストリーム | ToolCall/ToolCallArgs/ToolResult として SSE イベントを送信。旧 `agent_protocol` 専用イベントは削除。 | `packages/llms/src/adapter/axum/agent_handler.rs` |

## API 仕様

### ToolAccessConfig

```rust
pub struct ToolAccessConfig {
    pub filesystem: bool,
    pub command: bool,
    pub create_tool_job: bool,
    pub agent_protocol: bool,  // 新規追加
}
```

- デフォルト値: すべて `true`
- `agent_protocol_disabled()` メソッドで無効状態を判定可能

### AgentExecuteRequest

```rust
pub struct AgentToolAccessRequest {
    pub filesystem: Option<bool>,
    pub command: Option<bool>,
    pub create_tool_job: Option<bool>,
    pub agent_protocol: Option<bool>,  // 新規追加
}
```

- すべてのフィールドは `Option<bool>` で、未指定時は `true` がデフォルト

### agent_protocol ToolCall

#### ToolCall イベント

```json
{
  "type": "tool_call",
  "tool_id": "agent_protocol:ap_01xxxxx",
  "tool_name": "agent_protocol"
}
```

#### ToolCallArgs イベント

```json
{
  "type": "tool_call_args",
  "tool_id": "agent_protocol:ap_01xxxxx",
  "args": {
    "protocol_id": "ap_01xxxxx",
    "protocol_name": "Example Protocol",
    "match_mode": "auto",
    "match_score": 0.95,
    "match_reason": "High relevance to task description",
    "title": "Example Protocol Title",
    "description": "Protocol description"
  }
}
```

#### ToolResult イベント

```json
{
  "type": "tool_result",
  "tool_id": "agent_protocol:ap_01xxxxx",
  "result": "# Agent Protocol\n\nThis is the protocol markdown content...",
  "is_finished": true
}
```

### 実行フロー

1. **エージェント実行開始**: `POST /v1/llms/chatrooms/{chatroom_id}/agent/execute` で `tool_access.agent_protocol` が `true` の場合、AgentProtocol の取得/自動選択を実行
2. **ToolCall 生成**: 取得した AgentProtocol を `build_agent_protocol_tool_chunks()` で ToolCall/ToolCallArgs/ToolResult に変換
3. **SSE ストリーム送信**: 変換したチャンクを SSE イベントとして送信（`agent_protocol_chunks_for_stream`）
4. **履歴保存**: `AgentProtocolToolContext` として保存され、再開時（Resume）でも再利用される

### モード

- **Manual**: `agent_protocol_id` が指定されている場合、該当プロトコルを取得
- **Auto**: `agent_protocol_mode` が `Auto` の場合、タスク内容に基づいて自動選択
- **Disabled**: `tool_access.agent_protocol` が `false` の場合、AgentProtocol を利用しない

## 実装詳細

### ToolCall 生成ロジック

```rust
fn build_agent_protocol_tool_chunks(
    resource: &AgentProtocolResource,
    mode: AgentProtocolMode,
    score: Option<f32>,
    reason: Option<&str>,
) -> Vec<AgentChunk> {
    let tool_id = format!("agent_protocol:{}", resource.id);
    let args = json!({
        "protocol_id": resource.id,
        "protocol_name": resource.protocol_name,
        "match_mode": mode.as_str(),
        "match_score": score,
        "match_reason": reason,
        "title": resource.title,
        "description": resource.description,
    });
    
    vec![
        AgentChunk::ToolCall(ToolCall {
            tool_id: tool_id.clone(),
            tool_name: "agent_protocol".to_string(),
        }),
        AgentChunk::ToolCallArgs(ToolCallArgs {
            tool_id: tool_id.clone(),
            args,
        }),
        AgentChunk::ToolResult(ToolResult {
            tool_id,
            result: format_agent_protocol_prompt(resource),
            is_finished: true,
        }),
    ]
}
```

### System Prompt 統合

`system_prompt.rs` では、`agent_protocol` ツールの説明を追加しているが、プロンプトへの直接注入は削除されている。ツール説明は以下の形式:

```
## agent_protocol
Description: Fetch the tenant-defined AgentProtocol instructions (Markdown playbooks) for this task. Call this once before planning when AgentProtocol mode is enabled so you can follow the prescribed steps.
Parameters:
- mode: (required) "manual" or "auto"
- protocol_id: (optional) When mode is "manual", specify the protocol ULID (e.g., ap_01xxxx).
```

## 互換性

- **既存 API レスポンス**: `AgentChunk` として ToolCall/ToolResult を返すため、既存のクライアントコードと互換性がある
- **レート制限・課金**: テキスト出力のみのため、既存のレート制限・課金計算に影響しない
- **再開時（Resume）**: 履歴に保存された ToolResult を再利用するため、AgentProtocol が再評価されない

## 関連ドキュメント

- [Agent API 概要](./overview.md)
- [Tool Execution](./tool-execution.md)
- [Agent Command Stack](../agent.md)

