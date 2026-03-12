# Agent Tool Jobs

## 概要

Agent Tool Jobsは、外部のコーディングエージェントCLI（Codex、Claude Code、Cursor Agent）を統合して、LLMエージェントが複雑なコーディングタスクを委譲できる機能です。

## 対応プロバイダー

### Codex CLI
- **プロバイダー名**: `codex`
- **コマンド形式**: `codex exec --json "<prompt>"`
- **環境変数**: `CODEX_CLI_PATH` (デフォルト: `codex`)
- **Resume対応**: あり

### Claude Code CLI
- **プロバイダー名**: `claude_code`
- **コマンド形式**: `claude -p "<prompt>" --output-format stream-json`
- **環境変数**: `CLAUDE_CODE_CLI_PATH` (デフォルト: `claude`)
- **Resume対応**: あり
- **認証**: `claude setup-token` で初回設定が必要

### Cursor Agent CLI
- **プロバイダー名**: `cursor_agent`
- **コマンド形式**: `cursor-agent --print --output-format json --model auto "<prompt>"`
- **環境変数**: `CURSOR_AGENT_CLI_PATH` (デフォルト: `cursor-agent`)
- **Resume対応**: あり（`--resume-session <session_id>`）
- **認証**: `cursor-agent login` で初回設定が必要

## アーキテクチャ

### コンポーネント構成

```yaml
components:
  agents:
    location: packages/agents
    responsibility: ステートレスなツール実行レイヤー
    exports:
      - ToolRunner trait
      - CodexRunner / ClaudeCodeRunner / CursorAgentRunner
      - ToolJobCreateRequest / ToolJobResult

  llms:
    location: packages/llms
    responsibility: Tool Job管理とステートマシン
    components:
      - CreateToolJob / GetToolJob / ListToolJobs / CancelToolJob Usecase
      - SqlxToolJobRepository
      - agent_tool_jobs テーブル

  tachyon-api:
    location: apps/tachyon-api
    responsibility: REST/GraphQL APIエンドポイント
    endpoints:
      - POST /v1/agent/tool-jobs
      - GET /v1/agent/tool-jobs/:job_id
      - GET /v1/agent/tool-jobs
      - POST /v1/agent/tool-jobs/:job_id/cancel
      - GET /v1/agent/tool-jobs/providers
```

### データフロー

```
User/LLM → REST API → CreateToolJob Usecase → ToolRunner → External CLI
                                   ↓
                          SqlxToolJobRepository → agent_tool_jobs table
```

## REST API仕様

### ツールジョブ作成

```http
POST /v1/agent/tool-jobs
Authorization: Bearer <token>
x-operator-id: <operator_id>
x-user-id: <user_id>

{
  "provider": "cursor_agent",
  "prompt": "Write a haiku about coding",
  "context_paths": ["/path/to/workspace"],
  "metadata": {
    "model": "auto"
  }
}
```

レスポンス:
```json
{
  "job": {
    "job_id": "tj_...",
    "provider": "cursor_agent",
    "status": "succeeded",
    "prompt": "Write a haiku about coding",
    "result": {
      "output": "...",
      "session_id": "..."
    },
    "created_at": "2025-01-01T00:00:00Z",
    "completed_at": "2025-01-01T00:00:05Z"
  }
}
```

### ツールジョブ取得

```http
GET /v1/agent/tool-jobs/:job_id
Authorization: Bearer <token>
x-operator-id: <operator_id>
```

### ツールジョブ一覧取得

```http
GET /v1/agent/tool-jobs?provider=cursor_agent&limit=10
Authorization: Bearer <token>
x-operator-id: <operator_id>
```

### ツールジョブキャンセル

```http
POST /v1/agent/tool-jobs/:job_id/cancel
Authorization: Bearer <token>
x-operator-id: <operator_id>
```

### プロバイダー一覧取得

```http
GET /v1/agent/tool-jobs/providers
```

レスポンス:
```json
{
  "providers": ["codex", "claude_code", "cursor_agent"]
}
```

## Resume機能

Codex、Claude Code、Cursor Agentはすべてセッションの継続（Resume）に対応しています。

### 仕組み

1. 初回実行時、CLIは `session_id` を返す
2. `ToolJobResult` に `session_id` が記録される
3. Resume時、`resume_session_id` を指定してリクエスト
4. CLIは前回のセッションを継続して実行

### リクエスト例

```http
POST /v1/agent/tool-jobs
{
  "provider": "cursor_agent",
  "prompt": "続けて実装してください",
  "resume_session_id": "d55bdf0a-9f54-4ce0-9066-bab9553a9187"
}
```

## Docker環境での認証情報永続化

開発環境では、Dockerコンテナ内のCLI認証情報を永続化するため、以下のボリュームマウントを使用します：

```yaml
# compose.yml
volumes:
  - ./.cursor-agent/config:/root/.config/cursor:cached
  - ./.claude/config:/root/.config/claude:cached
  - ./.codex/config:/root/.config/codex:cached
```

### 初回ログイン

```bash
# Cursor Agent
docker compose exec tachyon-api cursor-agent login

# Claude Code
docker compose exec tachyon-api claude setup-token

# Codex
docker compose exec tachyon-api codex login
```

ログイン後、認証情報は各ディレクトリに保存され、コンテナ再起動後も保持されます。

## フロントエンド統合

### Tool Jobs管理画面

- **URL**: `/v1beta/{tenant_id}/ai/tool-jobs`
- **機能**:
  - プロバイダー選択（Codex / Claude Code / Cursor Agent）
  - プロンプト入力
  - コンテキストパス指定
  - ジョブ一覧表示
  - ジョブ詳細表示
  - Resume機能（対応プロバイダーのみ）

### 型定義

```typescript
// apps/tachyon/src/lib/agent-tool-jobs.ts
export type ToolJobProvider = "codex" | "claude_code" | "cursor_agent";

export type ToolJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";
```

## OpenCode プロバイダー

### 概要

OpenCodeはTool Jobプロバイダーの一つで、`opencode serve` APIを利用してコーディングタスクを実行します。

### プロバイダー設定

- **プロバイダー名**: `opencode`
- **環境変数**: `OPENCODE_API_URL` (デフォルト: `http://127.0.0.1:4096`)
- **Resume対応**: あり（セッションベース）

### Worktree対応

`use_worktree=true` かつ provider=OpenCode の場合、ジョブごとに独立した作業ディレクトリで `opencode serve` を動的起動します。

**フロー:**
```
ジョブ投入 (use_worktree=true, provider=opencode)
  ↓
tachyond worker (process_job)
  ├── WorktreeManager.create() → worktree-<job_id>/
  ├── spawn opencode serve --port 0 in worktree dir
  │    └── wait for /global/health → get actual port
  ├── OpenCodeRunner::from_config(port=N)
  │    └── create_session → send_prompt_stream → events
  ├── kill opencode process
  └── WorktreeManager.remove() / push_and_create_pr()
```

**ManagedOpenCodeServer:**
- `spawn_in_dir()`: TCP bind port=0 で空きポート取得 → worktreeディレクトリで起動
- `wait_healthy()`: `/global/health` を500ms間隔でポーリング（30秒タイムアウト）
- `shutdown()`: `process.kill()` + `wait()` で確実に終了
- `kill_on_drop(true)` でパニック時もプロセスリーク防止

`use_worktree=false` の場合は従来通りデフォルトURL（localhost:4096）を使用。

## QUICストリーミング

### 概要

Tool Job実行中のイベントをQUICプロトコル経由でリアルタイム配信する仕組みです。

### パイプライン

```
opencode serve → OpenCodeRunner → QuicEventPublisher
  → QUIC Gateway → tachyon-api → SSE → フロントエンド
```

### 設定

| 環境変数 | 説明 | デフォルト |
|---------|------|-----------|
| `QUIC_GATEWAY_ENABLED` | QUIC Gatewayの有効化 | `true` |
| `USE_QUIC_STREAMING` | QUICストリーミングの使用 | `true` |
| `QUIC_INSECURE` | 自己署名証明書の許可（ローカル開発用） | `false` |

- **ローカル**: 自己署名証明書 + `QUIC_INSECURE=true`
- **本番**: `quic.n1.tachy.one:4433`（Let's Encrypt）

### フロントエンド

`useToolJobStream` hookで `text_delta` イベントをリアルタイム表示。QUICが切断されても5秒ポーリングでフォールバック。

## Worker選択機能

### 概要

Tool Jobの実行先ワーカー（PC）を指定できる機能。未指定の場合は全ワーカーが取得可能。

### API

```http
POST /v1/agent/tool-jobs
{
  "provider": "opencode",
  "prompt": "Fix the bug",
  "worker_id": "wk_01abc..."
}
```

### レスポンス

```json
{
  "job": {
    "job_id": "tj_...",
    "assigned_worker_id": "wk_01abc...",
    ...
  }
}
```

### 動作

- `assigned_worker_id` が `None`: 全ワーカーが `dequeue()` で取得可能（従来通り）
- `assigned_worker_id` が設定済み: 該当ワーカーのみが取得

### フロントエンド

Worker選択ドロップダウンを提供。"Any worker (auto)" がデフォルト。ワーカー一覧は `/v1/agent/workers` APIから30秒間隔で取得（activeのみ）。

## 参考資料

- [Codex CLI Orchestration](./codex-cli-orchestration.md)
- [Tool Execution](./tool-execution.md)
- [OpenCode Provider](../../providers/opencode.md)
- [Worktree管理](../../agents/worktree-management.md)
- タスクドキュメント: `docs/src/tasks/completed/v0.26.0/cursor-agent-cli-tool-integration/`
- タスクドキュメント: `docs/src/tasks/completed/v0.26.0/agents-crate-stateless-refactoring/`
- タスクドキュメント: `docs/src/tasks/completed/v0.49.0/tool-job-quic-opencode-worktree/`
