# Sub Agent機能

## Overview

親agentの実行中に、同一システム内のAgent APIを再帰的に呼び出し、子agent（sub agent）にサブタスクを委譲する機能。親agentが複雑なタスクを分割し、専門化された子agentに処理を任せることができる。

## Use Cases

- **タスク分割**: 大規模なリサーチタスクを複数のサブタスクに分解して処理
- **専門化**: 子agentに異なるモデル・ツール設定・カスタム指示を適用
- **コンテキスト分離**: 子agentが独自のChatRoomとExecutionStateを持つことで、親のコンテキストウィンドウを圧迫しない

## `execute_sub_agent` ツール

### パラメータ

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|------------|------|------|-----------|------|
| `task` | string | ✅ | - | 子agentに実行させるタスクの説明 |
| `model` | string | - | 親と同じ | 子agentが使用するモデル |
| `max_requests` | integer | - | 10 | 子agentの最大リクエスト数 |
| `tool_access` | object | - | 親の設定を継承 | 子agentのツールアクセス設定 |
| `context` | string | - | - | 子agentに渡す追加コンテキスト |
| `user_custom_instructions` | string | - | - | 子agent向けのカスタム指示 |
| `timeout_seconds` | integer | - | 300 | タイムアウト（秒） |

### 結果の形式

```json
{
  "status": "completed",
  "sub_agent_execution_id": "exec_01...",
  "sub_agent_chatroom_id": "ch_01...",
  "response": "子agentの最終応答テキスト",
  "usage": {
    "total_input_tokens": 1500,
    "total_output_tokens": 800,
    "iterations": 3
  }
}
```

エラー時:
```json
{
  "status": "failed",
  "sub_agent_execution_id": "exec_01...",
  "error": "エラーメッセージ"
}
```

## Architecture

### 実行フロー

```
親 RecursiveAgent
  │
  ├── AttemptApiRequest (LLM呼び出し)
  │     └── ToolInvoker
  │           └── execute_sub_agent ツール
  │                 ├── 新規ChatRoom自動作成
  │                 ├── ExecuteAgent usecase再帰呼び出し
  │                 ├── ストリーム中継（AgentChunk → parent_chunk_tx）
  │                 ├── ストリーム全消費 → 結果テキスト抽出
  │                 └── 結果JSON を親ToolResult として返却
  │
  └── MessageCollection (メッセージ管理)
```

### Key Components

- **`sub_agent.rs`**: `handle_execute_sub_agent` 関数。子agentの起動・ストリーム消費・結果抽出を行う
- **`AgentChunk` / `AgentChunkEvent`**: チャンクの構造体化により、`agent: Option<AgentSource>` フィールドでsub-agentのチャンクを識別
- **`AgentSource`**: `chatroom_id` を持ち、どのsub-agentからのチャンクかを識別
- **`ExecuteAgent`**: `OnceLock` ベースの自己参照DIパターンで、再帰的な子agent起動を実現
- **Chatroom自動作成**: `ChatRoomRepository` を使い、子agent実行開始時にchatroomレコードをDBに作成（FK制約対応）

### 既存Tool Jobとの比較

| 項目 | Tool Job (coding_agent) | Sub Agent |
|------|------------------------|-----------|
| 実行先 | 外部CLIツール | 同システム内Agent API |
| プロセス | 別プロセス/ワーカー | 同一プロセス内（async task） |
| モデル | 外部ツール依存 | 自由に指定可能 |
| ツール | 外部ツールのツール | システムのツール一式 |
| 課金 | 外部ツールの課金 | 内部Billing統合 |

## Streaming

Sub-agentのチャンクは `parent_chunk_tx` を通じて親agentのSSEストリームにリアルタイム中継される。

- 中継チャンクには `agent: { chatroom_id: "ch_..." }` フィールドが付与される
- フロント側では `agent` フィールドの有無でsub-agentメッセージを識別し、tealカラーのネスト表示で描画
- 親agentのコンテキスト（メッセージ履歴）には要約JSONのみが入り、コンテキスト分離の価値を維持

## Constraints

- **再帰深度**: 1段のみ（子agentは `sub_agent: false` に強制され、さらにsub-agentを呼べない）
- **同期実行**: 子agentの完了を待ってから結果を親に返す
- **タイムアウト**: デフォルト300秒
- **リソース制御**: 子agentの `max_requests` はデフォルト10
- **Billing**: 子agentのコストは `parent_execution_id` で親executionに紐づけ

## REST API

既存のAgent実行エンドポイントを使用:

```
POST /v1/llms/chatrooms/:id/agent/execute
```

`tool_access` パラメータで `sub_agent: true` を指定するとsub-agentツールが有効化される（デフォルト: `true`）。

```json
{
  "model": "glm-4.7-flash",
  "message": "Use the sub_agent tool to research about AI",
  "tool_access": {
    "sub_agent": true
  }
}
```

## Related Files

- `packages/llms/src/agent/tool/sub_agent.rs` - Sub-agent ツール実装
- `packages/llms/src/agent/recursive.rs` - RecursiveAgent（ストリーム中継）
- `packages/llms/src/usecase/execute_agent.rs` - ExecuteAgent usecase（chatroom自動作成）
- `packages/llms/domain/src/agent_execution_state.rs` - parent_execution_id フィールド
- `packages/llms/src/agent/tool_access.rs` - ToolAccessConfig（sub_agent フラグ）
- `packages/llms/src/agent/chat_stream.rs` - AgentChunk / AgentChunkEvent 定義

## Version History

- v0.39.0: 初期実装（同期モード、再帰深度1段、ストリーム中継、chatroom自動作成）
