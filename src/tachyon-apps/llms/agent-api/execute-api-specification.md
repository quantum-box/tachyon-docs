# Agent Execute API 仕様

## エンドポイント

| パス | 説明 |
|------|------|
| `POST /v1/llms/chatrooms/{chatroom_id}/agent/execute` | チャットルーム経由（後方互換） |
| `POST /v1/llms/sessions/{session_id}/agent/execute` | 独立セッション経由 |

レスポンスは `Content-Type: text/event-stream` の SSE ストリーム。

### 必須ヘッダー

| ヘッダー | 例 | 説明 |
|----------|-----|------|
| `Authorization` | `Bearer dummy-token` | 認証トークン |
| `x-operator-id` | `tn_01hjryxysgey07h5jz5wagqj0m` | オペレーターID |
| `Content-Type` | `application/json` | — |
| `x-idempotency-key` | (任意) | 重複実行防止キー |

---

## リクエストボディ

### `AgentExecuteRequest`

| フィールド | 型 | 必須 | デフォルト | 説明 |
|-----------|------|------|-----------|------|
| `task` | `string` | ✓ | — | エージェントに実行させるタスク（自然言語） |
| `model` | `string?` | ✗ | プロバイダーのデフォルト | モデル指定。`provider/model` 形式（例: `anthropic/claude-haiku-4-5`）またはモデル名のみ |
| `auto_approve` | `bool` | ✗ | `false` | ツール実行を自動承認するか |
| `max_requests` | `number` | ✗ | `10` | LLMラウンドトリップの最大回数 |
| `tool_access` | `AgentToolAccessRequest` | ✗ | 全て`false` | ツールカテゴリ別の有効/無効フラグ |
| `user_custom_instructions` | `string?` | ✗ | `null` | システムプロンプトに追記するカスタム指示 |
| `assistant_name` | `string?` | ✗ | `null` | アシスタントの表示名 |
| `additional_tool_description` | `string?` | ✗ | `null` | 各ツールのヘルプテキストに追記する説明 |
| `agent_protocol_id` | `string?` | ✗ | `null` | AgentProtocol ID（`ap_...`形式） |
| `agent_protocol_mode` | `string` | ✗ | `"disabled"` | `"disabled"` / `"auto"` / `"manual"` |
| `mcp_hub_config_json` | `string?` | ✗ | `null` | MCP Hub設定のJSON文字列 |
| `chatroom_name_generation` | `string` | ✗ | `"first_only"` | `"first_only"` / `"always"` / `"never"` |
| `use_json_tool_calls` | `bool?` | ✗ | `null` | JSON Schema形式のfunction calling を使用するか |
| `client_tools` | `ClientToolDefinition[]?` | ✗ | `null` | クライアント側で実行するカスタムツール定義 |

### モデル指定の自動検出

`model` にプロバイダープレフィックスなしでモデル名のみ指定した場合、以下の規則で自動検出される:

| パターン | プロバイダー |
|---------|-------------|
| `gpt-*` | OpenAI |
| `claude-*` | Anthropic |
| `gemini*` | Google AI |
| その他 | `provider/model` 形式が必須 |

### `AgentToolAccessRequest`

各フィールドは `bool?`（省略時 = `false` として扱われる）。

| フィールド | 有効になるツール | 説明 |
|-----------|----------------|------|
| `filesystem` | `read_file`, `write_to_file`, `append_to_file`, `replace_in_file`, `list_files`, `search_files` | ファイル操作 |
| `command` | `execute_command` | シェルコマンド実行 |
| `coding_agent_job` | `execute_coding_agent_job` | 外部AIコーディングエージェント（Codex/Claude Code等）への委譲 |
| `agent_protocol` | `agent_protocol` | AgentProtocol利用（`agent_protocol_mode` に必須） |
| `web_search` | `search_with_llm` | Google Custom Search API によるWeb検索 |
| `url_fetch` | `fetch_url` | Firecrawl API によるURL取得・スクレイピング |
| `sub_agent` | `execute_sub_agent` | 子エージェントの起動 |

> **常に利用可能なツール**: `ask_followup_question`, `attempt_completion` は `tool_access` に関係なく常にシステムプロンプトに含まれる。

### `ClientToolDefinition`

クライアント側で実行するカスタムツールの定義。

| フィールド | 型 | 必須 | デフォルト | 説明 |
|-----------|------|------|-----------|------|
| `name` | `string` | ✓ | — | ツール名（snake_case）。サーバー組み込みツール名と重複不可 |
| `description` | `string` | ✓ | — | LLMに提示する説明文 |
| `parameters` | `object` | ✓ | — | 入力パラメータのJSON Schema |
| `fire_and_forget` | `bool` | ✗ | `false` | `true`: サーバーは結果を待たず即座にLLMを続行 |

**サーバー組み込みツール名（衝突不可）:**
`read_file`, `write_to_file`, `append_to_file`, `replace_in_file`, `list_directory`, `list_files`, `search_files`, `execute_command`, `use_mcp_tool`, `search_tools`, `access_mcp_resource`, `execute_coding_agent_job`, `execute_sub_agent`, `agent_protocol`, `search_with_llm`, `fetch_url`, `TodoWrite`, `ask_followup_question`, `attempt_completion`

---

## XML mode vs JSON mode

ツール定義・呼び出しの形式は2種類あり、`use_json_tool_calls` で切り替える。

### XML mode（デフォルト）

- ツール定義をシステムプロンプトにXML形式で埋め込む
- LLMが `<tool_name>...</tool_name>` 形式のXMLで応答
- `XmlToolCallEventParser` でパース
- 全プロバイダーで動作

```
LLMの出力例:
<read_file>
<path>src/main.rs</path>
</read_file>
```

### JSON mode

- ツール定義をプロバイダーのネイティブ function calling API（`Options.tools`）でJSON Schemaとして送信
- プロバイダーのネイティブツール呼び出し機構で応答
- `JsonToolCallEventParser` でパース

**自動有効化される条件:**
1. `use_json_tool_calls: true` を明示指定
2. `client_tools` が指定されている場合
3. プロバイダーが `openai` / `xai` / `zai` の場合（XML非対応）

---

## SSE イベント型

レスポンスは `event: <type>\ndata: <json>\n\n` 形式のSSEストリーム。最終イベントは `event: done`。

### `say` — テキスト出力

エージェントの発話テキスト。ストリーミング中は1文字ずつ送信される。

```json
{"type": "say", "index": 0, "text": "I'll analyze the logs."}
```

| フィールド | 型 | 説明 |
|-----------|------|------|
| `index` | `u32` | テキストチャンクの連番 |
| `text` | `string` | テキスト内容 |

### `thinking` — 推論・思考内容

エージェントの内部推論。**SSEストリームでは送信されない**（セキュリティ上フィルタ）。Messages API でのみ取得可能。

```json
{"type": "thinking", "index": 0, "text": "...", "is_finished": false}
```

| フィールド | 型 | 説明 |
|-----------|------|------|
| `index` | `u32` | チャンク連番 |
| `text` | `string` | 思考テキスト |
| `is_finished` | `bool` | `true` で思考ブロック完了 |

> **注意**: `thinking` イベントはDBには永続化されるが、SSEストリームではフィルタされる。完全な思考内容は Messages API (`GET /agent/messages`) で取得できる。

### `tool_call` — ツール呼び出し開始

```json
{"type": "tool_call", "tool_id": "tool_1", "tool_name": "read_file", "is_client_tool": false}
```

| フィールド | 型 | 説明 |
|-----------|------|------|
| `tool_id` | `string` | ツール呼び出しの一意ID |
| `tool_name` | `string` | ツール名 |
| `is_client_tool` | `bool` | クライアントツールか |

### `tool_call_args` — ツール引数

`tool_call` の直後に送信される。

```json
{"type": "tool_call_args", "tool_id": "tool_1", "args": {"path": "src/main.rs"}}
```

### `tool_result` — ツール実行結果

```json
{"type": "tool_result", "tool_id": "tool_1", "result": "fn main() { ... }", "is_finished": true}
```

| フィールド | 型 | 説明 |
|-----------|------|------|
| `tool_id` | `string` | 対応するツール呼び出しID |
| `result` | `string` | 実行結果（文字列） |
| `is_finished` | `bool` | ストリーミング完了フラグ |

### `tool_call_pending` — クライアントツール待ち

LLMがクライアント定義ツールを呼び出した際に発行される。

```json
{
  "type": "tool_call_pending",
  "tool_id": "ct_abc",
  "tool_name": "query_database",
  "args": {"sql": "SELECT * FROM users"},
  "fire_and_forget": false
}
```

**クライアントの対応:**
1. `args` を使ってツールをローカル実行
2. `POST /agent/tool-result` に `tool_id` と結果を送信（タイムアウト: 5分）
3. `fire_and_forget: true` の場合は送信不要（サーバーは即座にLLMを続行）

### `ask` — フォローアップ質問

エージェントがユーザーに質問する場合。

```json
{"type": "ask", "text": "Which method do you prefer?", "options": ["JWT", "OAuth2"]}
```

| フィールド | 型 | 説明 |
|-----------|------|------|
| `text` | `string` | 質問テキスト |
| `options` | `string[]` | 選択肢（空配列の場合あり） |

### `attempt_completion` — タスク完了提案

エージェントがタスク完了を提案。ストリーミングで段階的に送信される場合あり。

```json
{
  "type": "attempt_completion",
  "result": "Fixed the bug by adding null check...",
  "command": "cargo test",
  "is_finished": true
}
```

| フィールド | 型 | 説明 |
|-----------|------|------|
| `result` | `string` | 完了結果の説明 |
| `command` | `string?` | 結果を確認するためのCLIコマンド |
| `is_finished` | `bool?` | ストリーミング完了フラグ |

### `user` — ユーザーメッセージ（エコー）

```json
{
  "type": "user",
  "text": "Fix the login bug",
  "id": "01JEXAMPLE...",
  "user_id": "us_01hs2...",
  "created_at": "2026-02-26T12:00:00Z"
}
```

### `usage` — トークン使用量

各LLMラウンドトリップ完了後に送信。

```json
{
  "type": "usage",
  "prompt_tokens": 4250,
  "completion_tokens": 380,
  "total_tokens": 4630,
  "cache_creation_input_tokens": null,
  "cache_read_input_tokens": 2048,
  "total_cost": 0.0185
}
```

| フィールド | 型 | 説明 |
|-----------|------|------|
| `prompt_tokens` | `number` | 入力トークン数 |
| `completion_tokens` | `number` | 出力トークン数 |
| `total_tokens` | `number` | 合計トークン数 |
| `cache_creation_input_tokens` | `number?` | キャッシュ書き込みトークン（Claude） |
| `cache_read_input_tokens` | `number?` | キャッシュ読み込みトークン |
| `total_cost` | `number?` | 推定コスト（USD） |

### `tool_job_started` — 外部ツールジョブ開始

`execute_coding_agent_job` で外部ジョブが作成された際に送信。

```json
{"type": "tool_job_started", "tool_id": "tool_1", "job_id": "tj_456", "provider": "codex"}
```

### `error` — エラー

```json
{"type": "error", "code": "PAYMENT_REQUIRED", "message": "Insufficient credits"}
```

**主要エラーコード:**

| コード | 説明 |
|--------|------|
| `PAYMENT_REQUIRED` | クレジット不足 |
| `EXECUTION_ERROR` | 一般的な実行エラー |
| `STREAM_ERROR` | ストリーミング中のエラー |
| `AGENT_PROTOCOL_DISABLED` | `tool_access.agent_protocol` が無効 |
| `AGENT_PROTOCOL_NOT_FOUND` | 指定されたProtocol IDが存在しない |
| `INVALID_CLIENT_TOOL` | クライアントツール名がサーバーツールと衝突 |
| `SESSION_NOT_FOUND` | セッションが存在しない |
| `TENANT_RESOLUTION_FAILED` | テナント解決エラー |

### `done` — ストリーム終了

```json
{"type": "done"}
```

最後に必ず1回送信される。

---

## 実行フロー

### 1. 初期化

```
リクエスト受信
  ↓
認証・ポリシーチェック (llms:ExecuteAgent)
  ↓
モデル解決 (product_id/variant_id → model → デフォルト)
  ↓
冪等性チェック (x-idempotency-key)
  ↓
MCP Hub初期化 (任意)
  ↓
AgentProtocol解決 (chatroom版のみ, manual/auto)
```

### 2. セッション/履歴

```
セッションブートストラップ
  - Chatroom版: ensure_session_from_chatroom()
  - Session版: get_session() で存在確認
  ↓
イベント履歴ロード (list_events)
  ↓
ユーザーメッセージ永続化 (append_event) ← 履歴チェック後
  ↓
履歴あり → Resume（過去メッセージ + 新タスク）
履歴なし → 新規実行
```

### 3. エージェント実行

```
BillingAwareRecursiveAgent
  ↓
課金チェック (check_billing)
  ↓
RecursiveAgent.execute()
  ├── システムプロンプト生成
  ├── LLM呼び出し
  ├── XML/JSONパーサーでツールコール抽出
  ├── ツール実行 (DefaultToolExecutor or HybridToolExecutor)
  ├── 結果をLLMにフィードバック
  └── max_requests まで繰り返し
```

### 4. ストリーミング出力

```
AgentChunk生成
  ↓
セッション履歴に永続化 (append_event) ← 全チャンク
  ↓
thinkingイベントをフィルタ ← SSEからは除外
  ↓
SSE送信
```

---

## Chatroom版 vs Session版の差異

| 項目 | Chatroom (`ch_...`) | Session (`as_...`) |
|------|---------------------|-------------------|
| セッションブートストラップ | `ensure_session_from_chatroom()` | `get_session()` で存在確認のみ |
| AgentProtocol | 対応（manual/auto） | 非対応（無視） |
| チャットルーム名生成 | `chatroom_name_generation` 尊重 | 常に `never` |
| イベント永続化 | セッション + チャットルーム | セッションのみ |

Session版は `ch_` プレフィックスのIDも受け付ける（後方互換性）。

---

## 関連エンドポイント

### Resume: `POST /v1/llms/chatrooms/{id}/agent/resume`

中断されたエージェント実行を再開する。既存の実行状態とメッセージ履歴を引き継ぐ。

### Status: `GET /v1/llms/{chatrooms|sessions}/{id}/agent/status`

```json
{"is_running": true, "progress": 45, "state": {...}}
```

### Tool Result: `POST /v1/llms/{chatrooms|sessions}/{id}/agent/tool-result`

クライアントツールの実行結果を送信。

```json
{"tool_id": "ct_abc", "result": "query returned 5 rows", "is_error": false}
```

| ステータス | 説明 |
|-----------|------|
| `200` | 結果が受理された |
| `404` | 対応するtool_callがない（タイムアウトまたは不正なID） |

---

## リクエスト例

### 最小リクエスト

```json
{
  "task": "What is 2 + 2?",
  "auto_approve": true
}
```

### ファイル操作付き

```json
{
  "task": "Read src/main.rs and fix any compilation errors",
  "model": "anthropic/claude-sonnet-4-20250514",
  "auto_approve": true,
  "max_requests": 10,
  "tool_access": {
    "filesystem": true,
    "command": true
  }
}
```

### クライアントツール付き

```json
{
  "task": "Look up customer info and send a Slack notification",
  "model": "openai/gpt-4.1",
  "auto_approve": true,
  "max_requests": 15,
  "client_tools": [
    {
      "name": "query_database",
      "description": "Run a read-only SQL query and return result rows as JSON.",
      "parameters": {
        "type": "object",
        "properties": {
          "sql": {"type": "string", "description": "SQL SELECT query"}
        },
        "required": ["sql"]
      }
    },
    {
      "name": "send_slack_message",
      "description": "Send a message to a Slack channel (fire-and-forget).",
      "parameters": {
        "type": "object",
        "properties": {
          "channel": {"type": "string"},
          "text": {"type": "string"}
        },
        "required": ["channel", "text"]
      },
      "fire_and_forget": true
    }
  ]
}
```

> `client_tools` を指定すると JSON mode が自動的に有効になるため、`use_json_tool_calls: true` の明示指定は不要。

---

## 実装ファイル

| ファイル | 責務 |
|---------|------|
| `adapter/axum/agent_handler.rs` | HTTPハンドラ、SSEストリーム構築 |
| `usecase/execute_agent.rs` | 実行ユースケース、モデル解決、履歴管理 |
| `agent/recursive.rs` | RecursiveAgent（マルチターン実行ループ） |
| `agent/chat_stream.rs` | AttemptApiRequest（LLM呼び出し＋ツール実行） |
| `agent/system_prompt.rs` | システムプロンプト生成 |
| `agent/parse_xml.rs` | XMLストリームパーサー |
| `agent/parse_tool_call.rs` | JSONツールコールパーサー |
| `agent/tool_access.rs` | ToolAccessConfig |
| `agent/tool/client.rs` | ClientToolExecutor |
| `agent/billing_aware.rs` | BillingAwareRecursiveAgent |
