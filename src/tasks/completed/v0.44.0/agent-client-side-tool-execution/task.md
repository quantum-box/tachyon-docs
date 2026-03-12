# Agent API: ユーザー定義ツール（クライアントサイド実行）

## 概要

現在のAgent APIではサーバー組み込みのツール（`read_file`, `execute_command`等）のみ利用可能。本タスクでは、ユーザー（APIクライアント）がリクエスト時に**カスタムツール定義**を渡し、LLMがそれらを呼んだ場合に**クライアント側で実行**できる仕組みを追加する。

サーバー組み込みツールは従来どおりサーバーが実行し、ユーザー定義ツールだけクライアントに委譲する**ハイブリッド方式**。

## 背景と動機

### ユースケース

1. **クライアントアプリ独自のツール**: IDE統合、ローカルDB検索、社内API呼び出し等、サーバーには実装できないツールをLLMに使わせたい
2. **MCPサーバーのクライアント側接続**: クライアントが接続しているMCPサーバーのツールをLLM経由で呼びたい
3. **ワークフロー統合**: LLMの判断でクライアント側のアクション（通知送信、UI操作等）をトリガーしたい

### 参考実装

- **OpenAI Responses API**: `tools` に `function` 型を定義 → LLMが呼ぶ → クライアントが結果を返す
- **Anthropic Messages API**: `tools` にカスタムツール定義 → `tool_use` ブロック → `tool_result` を返す
- **Vercel AI SDK**: `tools` オプションでクライアントサイドツールを定義

## 現状のアーキテクチャ

### サーバー組み込みツール一覧

| カテゴリ | ツール名 | 制御フラグ |
|---------|---------|-----------|
| Filesystem | `read_file`, `write_to_file`, `list_directory`, ... | `tool_access.filesystem` |
| Command | `execute_command` | `tool_access.command` |
| Web Search | `search_with_llm` | `tool_access.web_search` |
| URL Fetch | `fetch_url` | `tool_access.url_fetch` |
| Coding Agent | `execute_coding_agent_job` | `tool_access.coding_agent_job` |
| Sub Agent | `execute_sub_agent` | `tool_access.sub_agent` |
| MCP | `use_mcp_tool`, `search_tools` | MCP Hubの有無 |
| 常時有効 | `TodoWrite`, `ask_followup_question`, `attempt_completion` | なし |

### 現在のフロー

```
Client                          Server (Agent API)
  │                                │
  │  POST /agent/execute           │
  │  { task, tool_access }         │
  │ ─────────────────────────────> │
  │                                │
  │  SSE: tool_call                │  ← LLMがサーバーツールを呼ぶ
  │ <───────────────────────────── │
  │                                │  ← サーバーが実行
  │  SSE: tool_result              │  ← 結果をLLMに返して再帰
  │ <───────────────────────────── │
  │                                │
  │  SSE: say / done               │
  │ <───────────────────────────── │
```

### 主要ファイル

| ファイル | 役割 |
|---------|------|
| `packages/llms/src/adapter/axum/agent_handler.rs` | HTTPハンドラー（SSEエンドポイント） |
| `packages/llms/src/usecase/execute_agent.rs` | ExecuteAgent usecase |
| `packages/llms/src/usecase/resume_agent.rs` | ResumeAgent usecase |
| `packages/llms/src/agent/recursive.rs` | RecursiveAgent（メインループ） |
| `packages/llms/src/agent/chat_stream.rs` | AttemptApiRequest（LLM呼び出し＋ツール実行） |
| `packages/llms/src/agent/tool/mod.rs` | ToolExecutor trait + DefaultToolExecutor |
| `packages/llms/src/agent/tool_access.rs` | ToolAccessConfig |
| `packages/llms/src/agent/tool_definitions.rs` | ツール定義生成 |
| `packages/llms/src/agent/types.rs` | AgentChunkEvent（SSEイベント型） |

## 設計

### 目標: サーバーツール＋ユーザー定義ツールのハイブリッド

```
Client                          Server (Agent API)
  │                                │
  │  POST /agent/execute           │
  │  { task,                       │
  │    tool_access: {...},         │  ← サーバーツールの有効化
  │    client_tools: [             │  ← ユーザー定義ツール
  │      { name, description,      │
  │        parameters }            │
  │    ] }                         │
  │ ─────────────────────────────> │
  │                                │
  │  SSE: tool_call (read_file)    │  ← サーバーツール → サーバーが実行
  │ <───────────────────────────── │
  │  SSE: tool_result              │
  │ <───────────────────────────── │
  │                                │
  │  SSE: tool_call (my_custom)    │  ← ユーザー定義ツール
  │ <───────────────────────────── │
  │  SSE: tool_call_args           │
  │ <───────────────────────────── │
  │  SSE: tool_call_pending        │  ← クライアントに実行を委譲
  │ <───────────────────────────── │
  │                                │
  │  [クライアントがツールを実行]    │
  │                                │
  │  POST /agent/tool-result       │  ← 結果を返す
  │ ─────────────────────────────> │
  │                                │
  │  SSE: tool_result              │  ← LLMに結果を返して再帰継続
  │ <───────────────────────────── │
  │                                │
  │  SSE: say / done               │
  │ <───────────────────────────── │
```

### リクエストの `client_tools` フィールド

OpenAI/Anthropic互換のJSON Schemaベースのツール定義:

```json
{
  "task": "Check the weather and notify the team",
  "tool_access": {
    "web_search": true
  },
  "client_tools": [
    {
      "name": "send_slack_notification",
      "description": "Send a notification to a Slack channel",
      "parameters": {
        "type": "object",
        "properties": {
          "channel": {
            "type": "string",
            "description": "The Slack channel name"
          },
          "message": {
            "type": "string",
            "description": "The message to send"
          }
        },
        "required": ["channel", "message"]
      }
    },
    {
      "name": "query_internal_db",
      "description": "Query the internal database for user information",
      "parameters": {
        "type": "object",
        "properties": {
          "query": { "type": "string" }
        },
        "required": ["query"]
      }
    }
  ],
  "model": "anthropic/claude-sonnet-4.5"
}
```

**ポイント**:
- `tool_access` でサーバー組み込みツールを有効化（従来どおり）
- `client_tools` でユーザー定義ツールを追加（新規）
- 両方を同時に指定可能（ハイブリッド）
- `client_tools` が空 or 未指定なら従来と完全に同じ動作

### ツール実行の振り分け

```
LLMがツール呼び出しを生成
  │
  ├── tool_name がサーバー組み込みツール？
  │   YES → DefaultToolExecutor で実行（従来どおり）
  │
  └── tool_name が client_tools に含まれる？
      YES → ClientToolExecutor で実行
            → tool_call_pending SSEイベント送信
            → クライアントからの結果を待つ
```

実装: `HybridToolExecutor` が `DefaultToolExecutor` と `ClientToolExecutor` をラップし、ツール名に基づいてディスパッチする。

### 新規SSEイベント: `tool_call_pending`

クライアント定義ツールが呼ばれた際にクライアントに送信。クライアントはこのイベントを受信後、ツールを実行し `POST /agent/tool-result` で結果を返す。

```json
{
  "type": "tool_call_pending",
  "tool_id": "t_abc123",
  "tool_name": "send_slack_notification",
  "args": {
    "channel": "#general",
    "message": "Weather update: Sunny, 25°C"
  }
}
```

既存の `tool_call` + `tool_call_args` イベントはストリーミング中に送信され（従来どおり）、`tool_call_pending` はツール呼び出しの引数がすべて揃った時点で1回だけ送信される。クライアントは `tool_call_pending` を受信したときにツール実行を開始すればよい。

### 新規エンドポイント: `POST /agent/tool-result`

```
POST /v1/llms/chatrooms/{chatroom_id}/agent/tool-result
```

**リクエスト:**
```json
{
  "tool_id": "t_abc123",
  "result": "Message sent to #general successfully",
  "is_error": false
}
```

**レスポンス:** `200 OK` (空ボディ)

- `tool_id` で待機中の `ClientToolExecutor` にマッチ
- `is_error: true` の場合、エラーメッセージとしてLLMに返す（LLMがリカバリを試みる）

### サーバー側の状態管理

```rust
/// 実行中エージェントのクライアントツール結果チャネルを管理
struct ClientToolRegistry {
    /// key: "{chatroom_id}:{tool_id}"
    pending: Arc<DashMap<String, oneshot::Sender<ToolResultSubmission>>>,
}
```

フロー:
1. `HybridToolExecutor` がクライアントツール呼び出しを検出
2. `oneshot` チャネルを作成し、`ClientToolRegistry` に登録
3. `tool_call_pending` SSEイベントを送信
4. `receiver.await` で結果を待つ（タイムアウト付き）
5. `/agent/tool-result` エンドポイントが `sender.send(result)` で結果を渡す
6. 結果をLLMに返し、再帰ループを継続

### タイムアウトとエラーハンドリング

| シナリオ | 対応 |
|---------|------|
| クライアントが結果を返さない | 5分タイムアウト → LLMにタイムアウトエラーを返す（1回リトライ後終了） |
| クライアントがエラーを返す | `is_error: true` → エラーメッセージをLLMに返しリカバリ試行 |
| SSE接続が切れる | `ClientToolRegistry` から該当エントリを削除、チャネルをdrop |
| 不正なtool_id | `404 Not Found`（該当するpendingツールが見つからない） |
| ツール名の衝突 | クライアントツール名がサーバーツール名と一致する場合は `400 Bad Request` |

### LLMへのツール定義の渡し方

```
サーバー組み込みツール定義（tool_access フラグに基づく）
  + client_tools のツール定義
  → マージしてLLMに渡す
```

- `tool_definitions.rs` の `generate_tool_definitions()` を拡張
- クライアントツール定義はJSON Schemaのまま追加（変換不要）
- JSON tool call モードでもXML tool call モードでも動作

## 実装計画

### Phase 1: 型定義とリクエスト拡張 ✅

1. ✅ **`ClientToolDefinition` 構造体** (`agent/tool/client.rs`)
   - `name: String`, `description: String`, `parameters: serde_json::Value`
   - `validate_client_tool_names()` でサーバーツール名との衝突チェック

2. ✅ **`AgentExecuteRequest` の拡張** (`agent_handler.rs`)
   - `client_tools: Option<Vec<ClientToolDefinition>>` フィールド追加

3. ✅ **`AgentChunkEvent::ToolCallPending` の追加** (`types.rs`)
   - `ToolCallPending { tool_id, tool_name, args }` 構造体
   - SSE event name: `"tool_call_pending"`

4. ✅ **ツール定義マージ** (`tool_definitions.rs`)
   - `generate_tool_definitions_with_client_tools()` でクライアントツールをJSON Schemaに変換して追加

### Phase 2: ToolExecutor実装 ✅

5. ✅ **`ClientToolExecutor`** (`agent/tool/client.rs`)
   - `oneshot` チャネルでツール結果を待つ（5分タイムアウト）
   - `parent_chunk_tx` 経由で `tool_call_pending` イベントをSSEストリームに送信
   - `ToolExecutionContext.tool_call_id` でLLMのtool call IDを伝搬

6. ✅ **`HybridToolExecutor`** (`agent/tool/client.rs`)
   - `HashSet<String>` でクライアントツール名を保持
   - ツール名に基づいて `DefaultToolExecutor` / `ClientToolExecutor` に振り分け

7. ✅ **`ClientToolRegistry`** (`agent/tool/client.rs`)
   - `DashMap` でpendingチャネル（chatroom_id:tool_id → oneshot sender）を管理
   - `remove_all_for_chatroom()` でSSE切断時のクリーンアップ対応

### Phase 3: エンドポイントと統合 ✅

8. ✅ **`POST /agent/tool-result` エンドポイント** (`agent_handler.rs`)
   - Executor/MultiTenancy の認証チェック
   - `ClientToolRegistry` Extension経由で結果を渡す
   - utoipa OpenAPI アノテーション付き

9. ✅ **AttemptApiRequest の対応** (`chat_stream.rs`)
   - `client_tools` フィールドを追加、`with_client_tools()` builder
   - JSON tool call mode時に `generate_tool_definitions_with_client_tools()` を使用
   - `ToolExecutionContext.tool_call_id` にLLMのtool IDを伝搬

10. ✅ **ExecuteAgent usecaseの対応** (`execute_agent.rs`)
    - `client_tools` と `client_tool_registry` をInputDataに追加
    - client_tools指定時に `HybridToolExecutor` を構築して `with_tool_executor()` で注入
    - `tachyon-api/router.rs` で `ClientToolRegistry` をExtensionとして登録

### Phase 4: テスト

11. ✅ **ユニットテスト** (`agent/tool/client.rs`)
    - `ClientToolRegistry` のregister/submit/remove操作
    - ツール名衝突バリデーション

12. 📝 **シナリオテスト** (TODO)
    - サーバーツール＋クライアントツールのハイブリッド実行
    - クライアントツールのみの実行
    - タイムアウト・エラーケース

## APIリクエスト例

### ハイブリッド実行（サーバーツール + ユーザー定義ツール）

```bash
curl -N -X POST http://localhost:50054/v1/llms/chatrooms/ch_test/agent/execute \
  -H "Authorization: Bearer dummy-token" \
  -H "x-operator-id: tn_01hjryxysgey07h5jz5wagqj0m" \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Search for the latest weather in Tokyo and send it to #general on Slack",
    "tool_access": {
      "web_search": true
    },
    "client_tools": [
      {
        "name": "send_slack_notification",
        "description": "Send a notification to a Slack channel",
        "parameters": {
          "type": "object",
          "properties": {
            "channel": { "type": "string" },
            "message": { "type": "string" }
          },
          "required": ["channel", "message"]
        }
      }
    ],
    "model": "anthropic/claude-sonnet-4.5"
  }'
```

### SSEレスポンス例

```
event: say
data: {"type":"say","index":0,"text":"I'll search for the weather first..."}

event: tool_call
data: {"type":"tool_call","tool_id":"t_001","tool_name":"search_with_llm"}

event: tool_call_args
data: {"type":"tool_call_args","tool_id":"t_001","args":{"query":"Tokyo weather today"}}

event: tool_result
data: {"type":"tool_result","tool_id":"t_001","result":"Sunny, 25°C...","is_finished":true}

event: say
data: {"type":"say","index":1,"text":"Now I'll send the notification..."}

event: tool_call
data: {"type":"tool_call","tool_id":"t_002","tool_name":"send_slack_notification"}

event: tool_call_args
data: {"type":"tool_call_args","tool_id":"t_002","args":{"channel":"#general","message":"Tokyo: Sunny, 25°C"}}

event: tool_call_pending
data: {"type":"tool_call_pending","tool_id":"t_002","tool_name":"send_slack_notification","args":{"channel":"#general","message":"Tokyo: Sunny, 25°C"}}
```

(ここでクライアントが `POST /agent/tool-result` で結果を返す)

```
event: tool_result
data: {"type":"tool_result","tool_id":"t_002","result":"Message sent successfully","is_finished":true}

event: say
data: {"type":"say","index":2,"text":"Done! I've sent the weather update to #general."}

event: done
data:
```

### クライアントツールのみ（サーバーツールなし）

```bash
curl -N -X POST http://localhost:50054/v1/llms/chatrooms/ch_test/agent/execute \
  -H "Authorization: Bearer dummy-token" \
  -H "x-operator-id: tn_01hjryxysgey07h5jz5wagqj0m" \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Look up user john@example.com in our database",
    "client_tools": [
      {
        "name": "query_user_db",
        "description": "Query user database by email",
        "parameters": {
          "type": "object",
          "properties": {
            "email": { "type": "string" }
          },
          "required": ["email"]
        }
      }
    ],
    "model": "anthropic/claude-sonnet-4.5"
  }'
```

## 考慮事項

### セキュリティ
- ツール結果の送信は認証必須（Bearer token + operator ID）
- chatroom_idの所有者チェック
- ツール結果のサイズ制限（デフォルト10MB）
- クライアントツール名がサーバー組み込みツール名と衝突する場合はリジェクト

### パフォーマンス
- `oneshot` チャネルは軽量、1ツール呼び出しにつき1チャネル
- SSE KeepAlive で接続維持
- クライアントツール待機中もサーバーリソースは最小限（async wait）

### 互換性
- `client_tools` が未指定なら従来と完全に同じ動作
- 既存のフロントエンドUIは変更不要
- `tool_access` との共存：サーバーツールの有効/無効は独立

### 将来拡張
- クライアントツールのストリーミング結果（プログレス報告）
- ツール定義のテナント単位での永続化（毎回渡さなくてよい）
- クライアントツールの権限制御（特定ユーザーのみ利用可能）

## 進捗

- [x] 現状調査・アーキテクチャ分析
- [x] 設計ドキュメント作成
- [x] Phase 1: 型定義とリクエスト拡張
- [x] Phase 2: ToolExecutor実装
- [x] Phase 3: エンドポイントと統合
- [ ] Phase 4: テスト