# tachyond ローカル動作確認

## 概要

tachyond Worker をローカルで実行し、ECS 上の tachyon-api に QUIC 接続して Tool Job が正常に動作することを確認する。

## 前提条件

- [x] tachyon-api が ECS にデプロイ済み（`api.n1.tachy.one`, `quic.n1.tachy.one:4433`）
- [x] GitHub Actions ワークフロー作成済み（`release-tachyond.yml`）
- [x] tachyond バイナリのリリース（v0.1.0）
- [x] Worker 用 Service Account & API Key 作成
- [x] ECS tachyon-api の環境変数修正・起動確認
- [x] Worker のローカル起動 & ECS 接続確認
- [x] E2E テスト（Tool Job 送信→Worker処理→結果確認）
- [x] Worker バグ修正（ステータス比較、Ctrl+C、重複dequeue）
- [x] Claude Code プロバイダー E2E（ファイル作成、IaC移行タスク）

## 進捗

### ワークフロー修正 (2026-01-30)

リリースワークフローでいくつかの問題を修正:

1. **Blacksmith ランナー移行**: `ubuntu-latest` → `blacksmith-4vcpu-ubuntu-2404`（リポジトリ全体がBlacksmithに移行済み）
2. **macOS x86_64 削除**: `macos-latest` が ARM64 ランナーになったため、`x86_64-apple-darwin` ビルドを削除。macOS は ARM64 (`aarch64-apple-darwin`) のみ提供
3. **ARM Linux クロスコンパイル修正**: `openssl-sys` の vendored feature を使用してOpenSSLをソースからビルドするように変更。`CC_aarch64_unknown_linux_gnu` 環境変数も追加

### Worker 改善 (2026-01-30〜31)

1. **auth_token CLI 引数追加**: `--auth-token` / `TACHYON_AUTH_TOKEN` で Bearer トークンまたは pk_ API キーを渡せるように
2. **HttpJobQueue 実装**: Redis/SQS 不要の HTTP ポーリングキュー。`GET /v1/agent/tool-jobs` で Queued ステータスのジョブを取得
3. **デフォルト変更**: `queue_type` を `http` に、`callback_url` を `https://api.n1.tachy.one` に変更
4. **QUIC フォールバック**: QUIC 接続失敗時に NoopEventPublisher にフォールバック（Redis 不要）

### ECS 環境変数修正 (2026-01-30)

`cluster/n1-aws/quic_streaming.tf` に不足していた環境変数を追加:
- `COGNITO_JWK_URL`: JWT 検証用
- `ROOT_ID`: system-config テナント ID
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY`, `XAI_API_KEY`: LLM プロバイダー（暫定、IaC マニフェスト移行予定）

### Worker 接続確認 (2026-01-31)

ローカル tachyond Worker が ECS tachyon-api に正常接続:
- Worker 登録成功（`wkr_01kg96qgjcmch3fxba21845cb8`）
- QUIC gateway 接続成功（`quic.n1.tachy.one:4433`）
- HTTP ポーリングループ動作中（3秒間隔）
- QUIC heartbeat 送信成功

### Worker バグ修正 (2026-01-31) ✅

E2E テスト中に発見・修正した3つのバグ:

1. **ステータス比較の大文字小文字問題**: `j.status == "Queued"` だが API は `"queued"`（小文字）を返却
   - 修正: `eq_ignore_ascii_case("queued")` に変更
2. **Ctrl+C でプロセスが終了しない**: `tokio::select!` が select ポイントでしか ctrl_c を監視せず、内部の `dequeue()` / `sleep()` 中はシグナルを捕捉できなかった
   - 修正: `tokio::pin!(ctrl_c)` でピン留めし、sleep フェーズと dequeue フェーズの両方で `tokio::select!` で監視
3. **同一ジョブの重複処理**: API ステータスが processing 中も `"queued"` のまま → Worker が同じジョブを再取得
   - 修正: `HttpJobQueue` に `in_flight: Arc<Mutex<HashSet<String>>>` を追加。dequeue 時に挿入、ack/nack 時に除去

### E2E テスト (2026-01-31) ✅

#### OpenCode プロバイダー

2つの Tool Job で基本 E2E 検証完了:

| Job ID | Prompt | Result | Status |
|--------|--------|--------|--------|
| `01KG96W2B2QQVKG69QQQ7VHZBG` | "Say hello in Japanese" | `こんにちは！` | ✅ succeeded |
| `01KG97F8HEM0M623FBADEQW9CW` | "What is 2+2?" | `4` | ✅ succeeded |

- Worker が HTTP ポーリングで queued ジョブを取得
- OpenCode プロバイダー経由で LLM 実行
- コールバックで結果を API に送信
- ジョブステータスが `succeeded` に更新
- **注意**: OpenCode はテキスト応答のみ対応。ファイル操作（tool use）は未サポート

#### Claude Code プロバイダー

Claude Code CLI 経由のツール実行を検証:

| Job ID | Prompt | Result | Status |
|--------|--------|--------|--------|
| (file creation) | "Create /tmp/hello-tachyond.py and run it" | ファイル作成＋実行成功 | ✅ succeeded |
| (IaC migration) | ECS環境変数のIaCマニフェスト移行 | terraform 2ファイル修正 | ✅ succeeded |

- `CLAUDE_CODE_PATH=$(which claude)` で CLI パスを指定する必要あり（デフォルトの Volta パスだと見つからない）
- Claude Code はファイル読み書き・コマンド実行を含む本格的なタスクを実行可能
- IaC移行テストでは `quic_streaming.tf` と `lambda.tf` から4つの LLM APIキー環境変数を削除し、IaCマニフェスト管理へのコメントに置換

### Claude Code Tool Job による IaC 移行テスト (2026-01-31)

`docs/src/tasks/backlog/ecs-env-to-iac-manifest/task.md` のタスクを Tool Job 経由で実行:

**プロンプト要約**: taskdocを読み、tachyon-apiのECSタスク定義とLambdaから不要なLLM APIキー環境変数を削除

**Claude Code の実行内容**:
1. taskdoc を読み取り
2. `quic_streaming.tf` と `lambda.tf` を検索・読み取り
3. 4つの環境変数（`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY`, `XAI_API_KEY`）を削除
4. コメント `# LLM Provider API Keys — now managed via IaC manifests + AWS Secrets Manager` に置換

**結果**: git diff で正常な変更を確認。未コミット状態で保留中。

### 本番 API 利用時のテナント設定

本番の tachyon-api (`api.n1.tachy.one`) に対して Tool Job を実行する際は、tachyon テナントを使用する:

- **テナント ID**: `tn_01hjjn348rn3t49zz6hvmfq67p`（tachyon テナント）
- **operator-id ヘッダー**: `x-operator-id: tn_01hjjn348rn3t49zz6hvmfq67p`
- **Worker 起動**: `TOOL_JOB_OPERATOR_ID=tn_01hjjn348rn3t49zz6hvmfq67p`
- **理由**: LLM プロバイダー設定（IaCマニフェスト・Secrets Manager）が tachyon テナントに紐づいているため、APIキー解決が正しく行われる

開発テナント (`tn_01hjryxysgey07h5jz5wagqj0m`) はローカル開発・テスト用。本番 ECS では tachyon テナントを使うこと。

**E2E 検証済み (2026-01-31)**:

| Job ID | Tenant | Prompt | Result | Status |
|--------|--------|--------|--------|--------|
| `01KG9JEYATC85MW0X9500BTMCP` | tachyon | "What is the capital of Japan?" | `Tokyo` | ✅ succeeded |

### API Key について

**開発テナント** (`tn_01hjryxysgey07h5jz5wagqj0m`):
- Service Account: `sa_01tachyondworker00001` (name: `tachyond-worker`)
- API Key: `pk_eXhUuUShsel6h3ylt1d7GnmRv/p8JhqxN5yahyFfgOg=`（id: `pk_01kg6ttg7crf54pxsysn2rj2e3`）
- ToolJobWorkerPolicy 付与済み

**tachyon テナント** (`tn_01hjjn348rn3t49zz6hvmfq67p`) — 本番 API 利用時:
- Service Account: `sa_01kg9gh674har28je31r4myk26` (name: `tachyond-worker-tachyon`)
- API Key: `pk_f47HQrLM7ZndHYIALYU0ftJxmqPr2VbnCA6lk7tpWhM=`（id: `pk_01kg9gh6q8jf4v1ckvbs7g4z66`）
- ToolJobWorkerPolicy 付与済み

## タスク

### 1. tachyond バイナリのリリース ✅

```bash
# GitHub Actions で手動トリガー
gh workflow run release-tachyond.yml \
  -f version=v0.1.0 \
  -f create_release=true
```

**ビルドターゲット（修正後）:**
- `x86_64-unknown-linux-gnu` (Blacksmith)
- `aarch64-unknown-linux-gnu` (Blacksmith + vendored OpenSSL)
- `aarch64-apple-darwin` (macOS GitHub hosted)

### 2. OpenCode サーバー起動

```bash
opencode serve --port 4096 --hostname 0.0.0.0
```

ブラウザで `http://localhost:4096` にアクセスし、プロバイダー認証を完了する。

### 3. tachyond Worker 起動

```bash
# 環境変数設定（worker モードのCLIオプション）
export QUIC_GATEWAY_ADDR=quic.n1.tachy.one:4433
export QUIC_SERVER_NAME=quic.n1.tachy.one
export OPENCODE_API_URL=http://localhost:4096
export TOOL_JOB_OPERATOR_ID=tn_01hjryxysgey07h5jz5wagqj0m

# Worker 起動（GitHub Releases からダウンロードしたバイナリ）
tachyond worker
```

**Worker の主要オプション:**
| オプション | 環境変数 | デフォルト |
|-----------|---------|---------|
| `--queue-type` | `QUEUE_TYPE` | `http` |
| `--callback-url` | `CALLBACK_URL` | `https://api.n1.tachy.one` |
| `--auth-token` | `TACHYON_AUTH_TOKEN` | `dummy-token` |
| `--use-quic-streaming` | `USE_QUIC_STREAMING` | `true` |
| `--quic-gateway-addr` | `QUIC_GATEWAY_ADDR` | `quic.n1.tachy.one:4433` |
| `--operator-id` | `TOOL_JOB_OPERATOR_ID` | `tn_01hjryxysgey07h5jz5wagqj0m` |

### 4. Tool Job 実行テスト

```bash
# OpenCode で簡単なテスト（開発テナント）
curl -X POST "https://api.n1.tachy.one/v1/agent/tool-jobs" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dummy-token" \
  -H "x-operator-id: tn_01hjryxysgey07h5jz5wagqj0m" \
  -d '{"provider":"open_code","prompt":"Say hello in Japanese","output_profile":"default"}'

# Claude Code でツール実行を含むタスク（本番 tachyon テナント）
curl -X POST "https://api.n1.tachy.one/v1/agent/tool-jobs" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dummy-token" \
  -H "x-operator-id: tn_01hjjn348rn3t49zz6hvmfq67p" \
  -d '{"provider":"claude_code","prompt":"Create /tmp/hello.py that prints hello world and run it"}'
```

**本番利用時の Worker 起動例**:
```bash
QUIC_GATEWAY_ADDR=quic.n1.tachy.one:4433 \
QUIC_SERVER_NAME=quic.n1.tachy.one \
TOOL_JOB_OPERATOR_ID=tn_01hjjn348rn3t49zz6hvmfq67p \
TACHYON_AUTH_TOKEN=pk_f47HQrLM7ZndHYIALYU0ftJxmqPr2VbnCA6lk7tpWhM= \
CLAUDE_CODE_PATH=$(which claude) \
tachyond worker
```

### 5. 確認項目

- [x] QUIC 接続が確立される（ログで `Connected to QUIC gateway` を確認）
- [x] Worker が API に登録される（`Worker registered successfully`）
- [x] HTTP ポーリングが動作する（`Using HTTP polling queue`）
- [x] Tool Job が Worker に配信される（HTTP ポーリングで Queued ジョブを取得）
- [x] OpenCode 経由で LLM レスポンスが返る
- [x] Job ステータスが `succeeded` になる
- [x] Ctrl+C で正常終了する

### ローカル動作確認: IaC + Secrets 経由のプロバイダー解決 (2026-01-31) ✅

`fallback_to_env=false` の状態で `mise run up-tachyon` によるローカル起動を確認。

**確認結果:**

| 項目 | 結果 |
|------|------|
| tachyon-api 起動（env fallback 無効） | ✅ 正常起動 |
| IaC + `.secrets.json` 経由のプロバイダー解決 | ✅ tavily, firecrawl, openai, anthropic, google_ai, zai すべて解決成功 |
| Health endpoint | ✅ 200 OK |
| GraphQL endpoint | ✅ 正常応答 |
| Tool Jobs REST API | ✅ 正常応答 |
| QUIC Gateway | ✅ `0.0.0.0:4433` で起動 |
| Redis job queue | ✅ 初期化完了 |

**ログ確認ポイント:**
- `Secret retrieved successfully` が各プロバイダーで出力
- `SecretResolver` が `$secret_ref` を正常に解決
- system-config フォールバックで tavily の WARN あり（致命的ではない）
- LLM API Key 環境変数なしで正常に起動完了

### AI レビュー対応 (2026-02-01) ✅

PR #1042, #1022 の AI レビュー指摘を修正:

- QUIC client の `insecure_skip_verify` デフォルトを `false` に変更（secure-by-default）
- `InFlightGuard` Drop パターンで panic 時の in_flight リーク防止
- `ToolJobWorkerPolicy` に `ListToolJobs` / `GetToolJob` アクション追加
- HTTP queue の metadata フィールド欠損修正（`output_profile`, `resume_session_id`, `use_worktree`, `auto_merge`）
- TLS ルート証明書読み込みエラーの適切なハンドリング
- ECS タスク定義に `SENTRY_DSN` 追加
- HTTP polling queue のリトライカウント・nack delay 実装

## 関連タスク

- 完了済み: `docs/src/tasks/in-progress/add-opencode-provider/` - OpenCode プロバイダー追加
- 関連: `docs/src/tasks/backlog/ecs-env-to-iac-manifest/` - ECS 環境変数の IaC マニフェスト移行（Claude Code Tool Job で部分実行テスト済み）

## 関連ファイル

| ファイル | 説明 |
|---------|------|
| `apps/tachyond/` | Worker daemon |
| `apps/tachyond/src/worker.rs` | Worker モード実装（QUIC接続、ジョブポーリング等） |
| `.github/workflows/release-tachyond.yml` | リリースワークフロー |
| `cluster/n1-aws/quic_streaming.tf` | ECS/QUIC インフラ |
| `packages/streaming/src/client.rs` | QUIC クライアント実装 |
| `packages/llms/src/agent/tool_job/stream/publisher.rs` | QUIC イベント Publisher |
