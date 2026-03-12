# Agent API Codex/Claude CLI統括実行

## 概要
Agent API から Codex CLI / Claude Code CLI を外部プロセスとして起動し、ジョブ生成・監視・課金メトリクスを一元管理するための仕組みを整備した。`packages/agents` クレートが Tool Job Manager・CLI ランナー・永続化ヘルパーを提供し、同クレートの `axum` feature を経由して `tachyon-api` に REST エンドポイント (`/v1/agent/tool-jobs`) を追加する。LLMS コマンドスタックは `create_tool_job` ツールを通じて Agent 実行から CLI を呼び出し、AI Studio の Tool Jobs 画面（`/v1beta/[tenant_id]/ai/tool-jobs`、開発時: `http://localhost:16000/v1beta/tn_01hjryxysgey07h5jz5wagqj0m/ai/tool-jobs`）で状態とログを可視化する。

## コンポーネント構成
| レイヤー | 役割 | 主な実装 |
| --- | --- | --- |
| ToolJobManager | CLI ジョブの生成・状態遷移・キャンセル・課金サマリ補完を担当する in-memory オーケストレータ。`AGENT_JOB_STORE_DIR` が設定されていれば JSON として結果を永続化。 | `packages/agents/src/manager.rs`, `packages/agents/src/storage.rs` |
| CLI ランナー | Codex/Claude CLI の引数生成・標準出力整形・課金フィールド付与を行う。 | `packages/agents/src/codex_runner.rs`, `packages/agents/src/claude_runner.rs` |
| REST API | `ToolJobManager` を Axum ルーターとして公開し、作成/取得/一覧/キャンセルをサポート。 | `packages/agents/src/axum.rs`, `apps/tachyon-api/src/router.rs` |
| Agent コマンドスタック | `create_tool_job` ツールで CLI ジョブを起動し、待機 + ポーリングで結果を JSON としてエージェントへ返す。 | `packages/llms/src/usecase/command_stack/tool_executor.rs` |
| Tool Access ポリシー | `tool_access.create_tool_job` を `execute_agent` / `resume_agent` の入力で制御し、テナントごとの CLI 利用可否を切り替える。 | `packages/llms/src/usecase/command_stack/tool_access.rs`, `packages/llms/src/adapter/axum/agent_handler.rs` |
| フロントエンド | `/v1beta/[tenant_id]/ai/tool-jobs` 以下で一覧・詳細・セッションビューを表示。SWR で REST API をポーリングし、Codex/Claude のログを streaming view へ描画。 | `apps/tachyon/src/app/v1beta/[tenant_id]/ai/tool-jobs/` |

## API 仕様
### 共通要件
- ヘッダー: `Authorization: Bearer dummy-token`, `x-operator-id`（必須）, `x-user-id`（任意）, `x-platform-id`（任意）
- 応答本体は `ToolJobResponse` を `{"job": ...}` または `{"jobs": [...]}` で返却。`executor` は `operator_id` / `user_id` / `platform_id` を含む。
- すべてのエンドポイントで `errors::Error` を直接 Axum のレスポンスに変換し、400/401/403/404/409/402/500/503 をステータスにマッピング。
- リクエストに含まれる `executor` フィールドはサーバー側で `auth::Executor` / `auth::MultiTenancy` から再設定されるため、クライアントはヘッダーでコンテキストを伝えるだけでよい。

### ToolJobResponse の主なフィールド
| フィールド | 説明 |
| --- | --- |
| `id` | ULID。REST や UI の識別子として利用。 |
| `provider` | `"codex"` / `"claude_code"`。CLI ランナー種別。 |
| `status` | `queued` / `running` / `succeeded` / `failed` / `cancelled`。 |
| `prompt`, `context_paths`, `output_profile`, `environment`, `metadata` | 実行引数。`metadata` には CLI 特有の追加設定を JSON で保存。 |
| `normalized_output` | `{"format":"json","body":{...}}`。CLI 側の整形済み結果。 |
| `raw_events` | Codex JSON Lines (`codex.thread.started` など) や標準出力/標準エラーを `event_type` + `payload` で保持。 |
| `billing` | `estimated_nanodollar` / `observed_nanodollar`。CLI ランナーが埋められない場合は `ToolJobManager` がデフォルト 50,000,000 nanodollar を補完。 |
| `session_id` | Codex の `thread_id` を転記。複数ジョブで同一セッションを追跡。 |
| `resume_session_id` | リトライ時に Codex へ `resume <id>` を挿入するための入力値。 |
| `error_message` | `failed` / `cancelled` 時の説明。 |

### POST /v1/agent/tool-jobs
- 本番は `202 Accepted` を返し、裏側で tokio タスクが CLI を実行する。`executor.operator_id` は必須。Claude を選ぶ場合はサーバー側の `ANTHROPIC_API_KEY` を検証する。
- 代表的なリクエスト例:
```json
{
  "provider": "codex",
  "prompt": "Summarize README",
  "context_paths": ["README.md"],
  "environment": {
    "CODEX_API_KEY": "{{ secret }}"
  },
  "metadata": {
    "estimated_nanodollar": 120000000,
    "output_schema": "schemas/tool-job.json",
    "extra_args": ["--max-turns", "12"],
    "prompt_mode": "argument_only"
  },
  "executor": {
    "operator_id": "tn_01hjryxysgey07h5jz5wagqj0m",
    "user_id": "us_01hs2yepy5hw4rz8pdq2wywnwt"
  }
}
```
- 成功時レスポンス:
```json
{
  "job": {
    "id": "01J8AT3WPRJZQ0TB10KS6R7MKR",
    "provider": "codex",
    "status": "queued",
    "prompt": "Summarize README",
    "executor": {"operator_id": "tn_01hj..."},
    "created_at": "2025-11-05T12:34:56Z",
    "updated_at": "2025-11-05T12:34:56Z"
  }
}
```

### GET /v1/agent/tool-jobs/{job_id}
- `job_id` は ULID 文字列。存在しない場合は 404。成功時は `ToolJobCreatedResponse` と同じ形式で最新スナップショットを返す。

### GET /v1/agent/tool-jobs
- 全ジョブを作成日時降順で返却。`raw_events` / `artifacts` / `billing` も含まれるため、UI 側は必要フィールドのみ抽出する。

### POST /v1/agent/tool-jobs/{job_id}/cancel
- tokio タスクを `JoinHandle::abort()` で中断し、`status=cancelled` を返す。完了済みジョブに対して呼び出した場合も成功レスポンスを返す（状態が `cancelled` に更新される）。

## ToolJobManager の挙動
- `ToolJobManager::create_job` は `ToolJobSnapshot` を生成後、非同期タスクを spawn。`jobs: RwLock<HashMap<Ulid, JobState>>` と `tasks: Mutex<HashMap<Ulid, JoinHandle>>` で状態と実行ハンドルを保持する。
- 状態遷移
  1. `queued`: 作成直後。
  2. `running`: ランナー実行開始。
  3. `succeeded`: `ToolJobResult` を格納し、`raw_events`・`normalized_output` を保存。
  4. `failed`: エラー文字列を `error_message` に保存。
  5. `cancelled`: `cancel_job` / `cancel_on_timeout` により明示的に停止。
- `ToolJobResult.billing` が空の場合は `estimated_cost` / `observed_cost` ともに `NanoDollar::new(50_000_000)` を入れる。
- `AGENT_JOB_STORE_DIR` を指定すると `job_id.json` で JSON を書き出す。書き込み失敗時は `tracing::error!` に出力するが API レスポンスは成功させる。
- `list_jobs` は `join_all` で `JobState` を複製し、`created_at` 降順でソートしたベクタを返す。

## CLI ランナー
### Codex CLI (`codex exec --json`)
- 実行パスは `CODEX_CLI_PATH`（未設定時は `codex`）+ `CodexProfile::base_args = ["exec", "--json"]`。
- `context_paths` は `--context <path>` として複数渡す。`output_profile` は `--output-profile` にマッピング。
- `metadata` による拡張:
  - `extra_args`: CLI 引数配列を追記。
  - `output_schema`: `--output-schema <path>` を追加。
  - `output_last_message`: `--output-last-message <path>` を追加。
  - `prompt_mode`: `argument_only` / `skip` / `--flag` を切り替え。
  - `estimated_nanodollar`: Billing 推定値として転記。
- `resume_session_id` が指定された場合は `codex resume <session_id>` 形式で先頭に差し込み、既存セッションを継続する。
- 標準出力を 1 行ずつ JSON 判定し、`thread.started` / `agent_message` / `turn.completed` などを `ToolJobEvent` に積む。非 JSON テキストは `stdout.segment` としてまとまった文字列で保存。

### Claude Code CLI (`claude --print`)
- フィーチャーフラグ `agents/claude` を有効化してビルド。`CLAUDE_CODE_PATH`（未設定時は `~/.volta/bin/claude`）と `ANTHROPIC_API_KEY` が必須。
- `metadata` で `timeout_sec` / `permission_mode` / `max_turns` / `output_format` を可変にし、`client.with_*` へ伝播。`output_format=stream-json` の場合は `--verbose` を自動で付与。
- 現状は CLI 側の streaming をそのまま 1 つの文字列として取得し、`ToolJobEvent` には単一の `stdout` イベントで保存。`normalized_output` には JSON 変換された本体を格納する。

## Agent コマンドスタック統合
- `packages/llms/src/usecase/command_stack/tool_access.rs` に `create_tool_job: bool` を追加し、`tool_access.create_tool_job=false` の場合は `ToolError` を返して CLI 呼び出しを抑止する。`execute_agent` / `resume_agent` の REST/GraphQL 入力でフラグを上書きできる。
- `create_tool_job` ツールの主な引数:
  - `prompt`（必須）
  - `provider`: `"codex"` / `"claude_code"`。省略時は `codex`。
  - `operator_id` / `platform_id` / `user_id`: 未指定時は Multi-Tenancy や `TOOL_JOB_OPERATOR_ID` / `TOOL_JOB_USER_ID` 環境変数を参照。
  - `context_paths`, `environment`, `metadata`, `output_profile`
  - `wait_timeout_seconds`（既定 180 秒）、`poll_interval_millis`（既定 250ms）、`cancel_on_timeout`
- ループ内で `manager.get_job` をポーリングし、`succeeded` になったらジョブ全体を JSON として LLM へ返却する。`normalized_output` が存在する場合は最上位 `normalized_output` フィールドにも展開する。

## UI / モニタリング
- AI Studio > **Tool Jobs**（`apps/tachyon/src/app/v1beta/[tenant_id]/ai/tool-jobs/`）で REST API のレスポンスを表示。`tool-job-events.tsx` は `raw_events` を時系列で描画し、`sessions/[session_key]` では複数ジョブの `session_id` をまとめてチャット表示する。
- サイドバー設定と翻訳キーは `apps/tachyon/src/lib/i18n/v1beta-translations.ts` と `sidebar-config.ts` で管理。
- `ToolJobSessions` タブは `session_id` をクエリ引数にして `GET /v1/agent/tool-jobs` の結果をフィルタリングする。

## テスト / 検証
- Rust: `cargo test -p agents`, `cargo check -p tachyon-api`, `cargo check -p llms`。
- TypeScript: `yarn lint --filter=tachyon`, `yarn ts --filter=tachyon`。
- シナリオテスト: `mise run tachyon-api-scenario-test` が `apps/tachyon-api/tests/scenarios/tool_job_rest.yaml` を実行。`scripts/test/bin/mock-codex-cli` を `CODEX_CLI_PATH` に設定してモック JSON (`{"result":{"summary":"mocked"}}`) を返す。
- 手動検証: `cargo run -p agents --example run_codex_job -- "Write a haiku about Tachyon"`。Codex CLI が JSON Lines で `thread.started` → `agent_message` → `turn.completed` → 生成テキスト（例:「タキオンや 光より速く 夢を運ぶ」）を返し、`ToolJobResult.raw_events` に保存される。
- 動作確認ログ: `docs/src/tasks/completed/v0.23.0/agent-api-orchestrates-codex/verification-report.md`（2025-11-05）。

## 関連資料
- タスクドキュメント: `docs/src/tasks/completed/v0.23.0/agent-api-orchestrates-codex/task.md`
- REST シナリオ: `apps/tachyon-api/tests/scenarios/tool_job_rest.yaml`
- MCP / Tool Access 仕様: `docs/src/tachyon-apps/llms/agent-api/tool-execution.md`, `docs/src/tachyon-apps/llms/agent-api/mcp-initialization-performance.md`
