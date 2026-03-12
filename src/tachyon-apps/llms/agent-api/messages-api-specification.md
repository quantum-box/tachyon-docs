# Agent Messages API 仕様

## エンドポイント

| パス | 説明 |
|------|------|
| `GET /v1/llms/chatrooms/{chatroom_id}/agent/messages` | チャットルーム経由（後方互換） |
| `GET /v1/llms/sessions/{session_id}/agent/messages` | 独立セッション経由 |

### 必須ヘッダー

| ヘッダー | 例 | 説明 |
|----------|-----|------|
| `Authorization` | `Bearer dummy-token` | 認証トークン |
| `x-operator-id` | `tn_01hjryxysgey07h5jz5wagqj0m` | オペレーターID |

### パラメータ

| パラメータ | 型 | 位置 | 必須 | 説明 |
|-----------|-----|------|------|------|
| `chatroom_id` / `session_id` | `string` | Path | ✓ | `ch_...` または `as_...` 形式のID |
| `limit` | `number` | Query | ✗ | 最大取得件数 |
| `offset` | `number` | Query | ✗ | ページネーションオフセット |

> Session版エンドポイントは `ch_` プレフィックスのIDも受け付け、内部で chatroom ハンドラに委譲する。

### ポリシー

`llms:GetAgentHistory` アクションの権限が必要。

---

## レスポンス形式

```json
{
  "messages": [
    {
      "type": "user",
      "text": "Fix the login bug",
      "id": "01KJCXKFHMD4VD46GBRN6P85NM",
      "user_id": "us_01hs2yepy5hw4rz8pdq2wywnwt",
      "created_at": "2026-02-26T12:08:30Z"
    },
    {
      "type": "thinking",
      "index": 0,
      "text": "Let me analyze the login flow to find the bug...",
      "is_finished": true
    },
    {
      "type": "say",
      "index": 1,
      "text": "I found the issue in the authentication middleware. The session token validation...",
    },
    {
      "type": "tool_call",
      "tool_id": "tool_1",
      "tool_name": "read_file",
      "is_client_tool": false
    },
    {
      "type": "tool_call_args",
      "tool_id": "tool_1",
      "args": {"path": "src/auth/middleware.rs"}
    },
    {
      "type": "tool_result",
      "tool_id": "tool_1",
      "result": "pub fn validate_session(...) { ... }",
      "is_finished": true
    },
    {
      "type": "attempt_completion",
      "result": "Fixed the login bug by adding proper session validation...",
      "command": "cargo test -- auth",
      "is_finished": true
    },
    {
      "type": "usage",
      "prompt_tokens": 4250,
      "completion_tokens": 380,
      "total_tokens": 4630,
      "total_cost": 0.0185
    }
  ]
}
```

### SSEストリームとの違い

| 項目 | Execute API (SSE) | Messages API |
|------|-------------------|--------------|
| `thinking` イベント | **フィルタ（送信されない）** | **含まれる** |
| チャンク粒度 | 1文字ずつ（ストリーミング） | **統合済み**（正規化後） |
| イベント順序 | リアルタイム | 永続化順（`event_seq` ASC） |

Messages API は SSE で送信されない `thinking` イベントも含む完全な履歴を返す。また、ストリーミング中に1文字ずつ送信された `say`/`thinking`/`attempt_completion` チャンクは、連続する同種のチャンクが1つのメッセージに統合される。

---

## チャンク統合ロジック（正規化）

`normalize_session_history_messages()` 関数がDBから取得した生イベントを統合する。

### 統合対象

| イベント型 | 統合条件 | 統合方法 |
|-----------|---------|---------|
| `thinking` | 同一エージェントの連続するチャンク | テキスト結合、最終チャンクの `is_finished: true` を採用 |
| `say` | 同一エージェントの連続するチャンク | テキスト結合 |
| `attempt_completion` | 同一エージェントの連続するチャンク | `result` テキスト結合、最初に見つかった `command` を採用 |

### 統合されないイベント

以下のイベントはそのまま返される（統合なし）:

- `tool_call`
- `tool_call_args`
- `tool_result`
- `tool_call_pending`
- `user`
- `ask`
- `usage`
- `tool_job_started`

### マルチエージェント対応

各チャンクには `agent: Option<AgentSource>` フィールドがあり、サブエージェントからのチャンクは異なる `AgentSource` を持つ。

**統合はエージェント単位で行われる:**
- メインエージェント（`agent: null`）のチャンク同士は統合される
- サブエージェントのチャンク同士（同一 `chatroom_id`）は統合される
- **異なるエージェントのチャンクは統合されない**（エージェント変更時にフラッシュ）

```json
// メインエージェントのsay
{"type": "say", "index": 0, "text": "Main agent response"}

// サブエージェントのsay（agentフィールド付き）
{"agent": {"chatroom_id": "ch_sub123"}, "type": "say", "index": 0, "text": "Sub-agent response"}
```

### 統合の具体例

**DB内の生イベント（128個のthinkingチャンク）:**
```
thinking: {text: "L", is_finished: false}
thinking: {text: "e", is_finished: false}
thinking: {text: "t", is_finished: false}
...
thinking: {text: ".", is_finished: true}
```

**Messages APIのレスポンス（1つのthinkingメッセージ）:**
```json
{"type": "thinking", "index": 0, "text": "Let me think about this...", "is_finished": true}
```

---

## イベント永続化の仕組み

### 永続化タイミング

エージェント実行中に以下のタイミングでイベントが永続化される:

1. **ユーザーメッセージ**: `ExecuteAgent::execute()` 内で、履歴チェック後・実行開始前に永続化
2. **AgentProtocolチャンク**: ストリーム開始前（chatroom版のみ）
3. **全ストリーミングチャンク**: SSE送信と同時に `append_event()` で永続化（thinkingを含む）

```
ユーザーメッセージ永続化 (execute_agent.rs)
  ↓
AgentProtocolチャンク永続化 (agent_handler.rs)
  ↓
ストリーミング開始
  ├── チャンク生成 → append_event() → SSE送信
  ├── チャンク生成 → append_event() → (thinkingはSSEフィルタ)
  └── ...
```

### データベーススキーマ

#### `agent_sessions` テーブル

```sql
CREATE TABLE agent_sessions (
    id              VARCHAR(29) NOT NULL,     -- セッションID (ch_... or as_...)
    legacy_chatroom_id VARCHAR(29) NULL,      -- マイグレーション互換用
    tenant_id       VARCHAR(29) NOT NULL,
    owner_id        VARCHAR(29) NOT NULL,
    name            VARCHAR(255) NOT NULL,
    metadata        JSON NULL,
    created_at      DATETIME(6) NOT NULL,
    updated_at      DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_agent_sessions_legacy_chatroom (legacy_chatroom_id),
    INDEX idx_agent_sessions_tenant_created (tenant_id, created_at DESC)
);
```

#### `agent_message_events` テーブル

```sql
CREATE TABLE agent_message_events (
    event_seq   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,  -- 順序保証用
    id          CHAR(26) NOT NULL,                        -- ULID
    session_id  VARCHAR(29) NOT NULL,                     -- FK → agent_sessions.id
    event_type  VARCHAR(64) NOT NULL,                     -- イベント型名
    payload_json JSON NOT NULL,                           -- AgentChunk全体のJSON
    created_at  DATETIME(6) NOT NULL,
    PRIMARY KEY (event_seq),
    UNIQUE KEY uk_agent_message_events_id (id),
    INDEX idx_agent_message_events_session_seq (session_id, event_seq),
    CONSTRAINT fk_agent_message_events_session
        FOREIGN KEY (session_id) REFERENCES agent_sessions (id)
        ON DELETE CASCADE
);
```

**設計ポイント:**
- `event_seq` (AUTO_INCREMENT) でイベントの挿入順序を保証（`ORDER BY event_seq ASC`）
- `id` (ULID) はイベントの一意識別子
- `payload_json` には `AgentChunk` 全体がシリアライズされる（`agent` フィールド含む）
- `event_type` はインデックスではなく参考値（実際のイベント型は `payload_json` から復元）

### グレースフルデグラデーション

マイグレーション未適用環境への対応:

- `append_event`: テーブル未存在時（MySQL error 1146）は警告ログのみで `Ok(())` を返す
- `list_events`: テーブル未存在時は空の `Vec` を返す
- `ensure_session_from_chatroom`: テーブル未存在時はスキップ

これによりマイグレーション前でもAPI自体は動作する（履歴なしの状態）。

---

## Resume時のイベント→メッセージ変換

`ExecuteAgent::events_to_messages()` がDBのイベントをLLMプロバイダーに渡す `Message` 形式に変換する。

### 変換ルール

| イベント型 | Message形式 |
|-----------|-------------|
| `User` | `Message::user(text)` |
| `Say` | assistant メッセージのコンテンツに追記 |
| `Thinking` | `<thinking>...</thinking>` タグで囲んでassistantメッセージに追記 |
| `ToolCall` + `ToolCallArgs` | assistantメッセージの `tool_calls` 配列に追加 |
| `ToolResult` | `Message::tool(tool_id, result)` |
| `Ask` | `<ask_followup_question>` XMLブロックとしてassistantメッセージに追記 |
| `AttemptCompletion` | `<attempt_completion>` XMLブロックとしてassistantメッセージに追記 |
| `Usage`, `ToolCallPending`, `ToolJobStarted` | 無視（メッセージに含めない） |

この変換により、中断した実行を正確な会話コンテキストで再開できる。

---

## リクエスト例

### 基本的な取得

```bash
curl -s http://localhost:50354/v1/llms/sessions/as_01kjcxkfhmd4vd46gbrn6p85nm/agent/messages \
  -H "Authorization: Bearer dummy-token" \
  -H "x-operator-id: tn_01hjryxysgey07h5jz5wagqj0m"
```

### チャットルーム経由

```bash
curl -s http://localhost:50354/v1/llms/chatrooms/ch_01jmy8dvmwbxww4vvkwfhx6twy/agent/messages \
  -H "Authorization: Bearer dummy-token" \
  -H "x-operator-id: tn_01hjryxysgey07h5jz5wagqj0m"
```

---

## 実装ファイル

| ファイル | 責務 |
|---------|------|
| `adapter/axum/agent_handler.rs` | HTTPハンドラ、`normalize_session_history_messages()` |
| `usecase/get_agent_history.rs` | GetAgentHistory ユースケース |
| `usecase/execute_agent.rs` | `events_to_messages()`（Resume用変換） |
| `repository.rs` | `AgentSessionHistoryRepository` トレイト |
| `adapter/gateway/sqlx_agent_session_history_repository.rs` | SQLx実装 |
| `agent/types.rs` | `AgentChunk`, `AgentChunkEvent`, `MessageCollection` |
| `migrations/20260224000000_create_agent_sessions_and_message_events.up.sql` | DBスキーマ |
