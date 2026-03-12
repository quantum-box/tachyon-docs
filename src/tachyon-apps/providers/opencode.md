# OpenCode Provider

## Overview

OpenCode is an AI coding agent CLI tool that provides access to ChatGPT Pro capabilities via a local HTTP server. The OpenCode provider integrates this into the tachyon-apps LLM provider system, enabling Tool Job execution through QUIC-connected workers.

## Architecture

```
[ tachyon-api (ECS) ]
        ↑ QUIC (4433)
[ tachyond Worker (local) ]
        ↓ HTTP
[ OpenCode server (localhost:4096) ]
        ↓
[ ChatGPT Pro / OpenAI API ]
```

- OpenCode server handles authentication and session management
- tachyond Worker connects to tachyon-api via QUIC and executes Tool Jobs locally
- tachyon-apps interacts with OpenCode's HTTP API

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCODE_API_URL` | `http://localhost:4096` | OpenCode server URL |
| `OPENCODE_BASE_URL` | `http://localhost:4096` | Alternative URL variable |
| `OPENCODE_SERVER_USERNAME` | `opencode` | HTTP Basic Auth username |
| `OPENCODE_SERVER_PASSWORD` | - | HTTP Basic Auth password |
| `OPENCODE_MODEL_PROVIDER_ID` | - | Default model provider (e.g. `openai`) |
| `OPENCODE_MODEL_ID` | - | Default model ID (e.g. `gpt-5.1-codex`) |

### IaC Manifest (Optional)

```yaml
- config:
    base_url: http://localhost:4096
    username: opencode
    password:
      $secret_ref: opencode/server_password
  name: opencode
  provider_type: ai
```

## Model Selection

モデルは object 形式（`providerID`/`modelID`）で指定する必要がある。文字列形式（`openai/gpt-5.3-codex`）は 400 エラーとなる。

### 優先順位

1. `ToolRunnerRequest.metadata.model` （ジョブ単位の指定）
2. 環境変数 `OPENCODE_MODEL_PROVIDER_ID`/`OPENCODE_MODEL_ID`
3. フォールバック: `openai/gpt-5.1-codex`

### 利用可能なモデル

| Provider | Model ID | Description |
|----------|----------|-------------|
| `openai` | `gpt-5.1-codex` | GPT-5.1 Codex |
| `openai` | `gpt-5.2` | GPT-5.2 |
| `openai` | `gpt-5.3-codex` | GPT-5.3 Codex |
| `anthropic` | `claude-4.5-sonnet` | Claude 4.5 Sonnet |

### モデル指定例

```json
{
  "model": {
    "providerID": "openai",
    "modelID": "gpt-5.3-codex"
  }
}
```

## Pricing

OpenCode uses ChatGPT Pro subscription, so no per-token API charges apply. Internal NanoDollar tracking is set to 0.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/session` | POST | Create session |
| `/session/:id/prompt` | POST | Send prompt (synchronous) |
| `/session/:id/prompt_async` | POST | Send prompt (async) |
| `/session/:id/message` | POST | Send message with model object |
| `/session/:id/shell` | POST | Execute shell command |
| `/session/:id/permissions/:permissionID` | POST | Respond to permission request |
| `/global/health` | GET | Health check |
| `/global/event` | GET (SSE) | Global event stream |

### SSE Event Format (v1.1.65+)

OpenCode Serve はイベントを `payload` エンベロープでラップする:

```json
{
  "directory": "...",
  "payload": {
    "type": "message.part.updated",
    "properties": {
      "part": { "type": "text", "sessionID": "..." },
      "delta": "hello"
    }
  }
}
```

| イベント種別 | パス | 説明 |
|-------------|------|------|
| テキストデルタ | `payload.properties.delta` | `part.type == "text"` の場合 |
| 推論内容 | `payload.properties.delta` | `part.type == "reasoning"` の場合 |
| トークン使用量 | `payload.properties.part.tokens` | `part.type == "step-finish"` の場合 |
| セッション完了 | `payload.type == "session.idle"` | + `payload.properties.sessionID` |
| 権限要求 | `payload.type == "permission.requested"` | パーミッション応答が必要 |

### Shell API

Shell API は `agent` フィールドと `model` object が必須:

```json
{
  "agent": "build",
  "command": "ls -la",
  "model": {
    "providerID": "openai",
    "modelID": "gpt-5.1-codex"
  }
}
```

### Permission Auto-Response

`OpenCodeRunner` は SSE ストリーム内の `permission.requested` イベントを検知し、デフォルトで自動承認（`allow: true`）する。

## Tool Job Integration

OpenCode is available as a Tool Job provider:

```bash
curl -X POST "https://api.n1.tachy.one/v1/agent/tool-jobs" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -H "x-operator-id: <operator_id>" \
  -d '{"provider":"open_code","prompt":"your prompt","output_profile":"default"}'
```

### Session Management

- `ToolJobResult.session_id` にセッション ID を返却
- `resume_session_id` 指定時は既存セッションを再利用
- セッション再開時はセッション削除をスキップ

### UI SSE Streaming

Tool Jobs 詳細画面では、ジョブが `queued`/`running` 状態の場合に SSE ストリーミングが自動接続される。

- "Streaming" インジケーター（緑色アニメーション）がステータスバッジの横に表示
- SSE イベントが配信されない場合の SWR ポーリング（5秒間隔）フォールバック
- ジョブ完了後にポーリング自動停止

関連ファイル:
- `apps/tachyon/src/hooks/useToolJobStream.ts` - SSE ストリーミング hook
- `apps/tachyon/src/app/v1beta/[tenant_id]/ai/tool-jobs/tool-job-detail-client.tsx` - 統合

## Infrastructure

### ECS/QUIC Endpoints

| Endpoint | Protocol | Purpose |
|----------|----------|---------|
| `api.n1.tachy.one` | HTTPS (443) | HTTP API |
| `quic.n1.tachy.one:4433` | QUIC (UDP) | Worker connection |

### tachyond Worker

The tachyond daemon runs locally and connects to the platform via QUIC:

```bash
export QUIC_GATEWAY_ADDR=quic.n1.tachy.one:4433
export TACHYON_API_KEY=pk_xxxxx
export OPENCODE_API_URL=http://localhost:4096
export OPENCODE_SERVER_USERNAME=opencode
export OPENCODE_SERVER_PASSWORD=<your-password>

./tachyond worker
```

### OpenAI Subscription Login

1. `OPENCODE_SERVER_PASSWORD=*** opencode serve --hostname 127.0.0.1 --port 4096` でサーバー起動
2. `http://127.0.0.1:4096` にブラウザでアクセスし、OpenAI アカウントでログイン
3. `curl -u opencode:<password> http://127.0.0.1:4096/global/health` でヘルスチェック

## Related Files

| File | Description |
|------|-------------|
| `packages/providers/opencode/` | Provider crate |
| `packages/providers/opencode/src/client.rs` | HTTP client (SSE/shell/permissions) |
| `packages/providers/opencode/src/types.rs` | Model/event types |
| `packages/llms/src/agent/tool_job/runners/opencode.rs` | OpenCodeRunner |
| `apps/tachyon/src/hooks/useToolJobStream.ts` | Frontend SSE hook |
| `apps/tachyond/` | Worker daemon |
| `cluster/n1-aws/quic_streaming.tf` | ECS/QUIC infrastructure |

## Related Documentation

- Taskdoc: `docs/src/tasks/completed/v0.41.0/tachyond-opencode-serve-integration/`
- Previous: `docs/src/tasks/completed/v0.38.0/add-opencode-provider/`
- [BYO Worker Setup](../agents/byo-worker-setup.md)
- [Tachyond Architecture](../../architecture/tachyond.md)
