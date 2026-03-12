# フェーズ2 キュー統合 動作確認ガイド

## 概要
このガイドでは、フェーズ2「キューベースの非同期処理」の実装をUIから手動でテストする手順を説明します。

## 実装内容

### 1. packages/queue クレート
汎用的なJob Queue抽象化レイヤーを提供：

- **Redis Streams バックエンド (`RedisJobQueue`)**: Consumer Groups、XAUTOCLAIM、遅延ジョブ対応
- **SQLx バックエンド (`SqlxJobQueue`)**: MySQL用のtool_job_queueテーブル

### 2. キュー統合
- `CreateToolJob` usecase: `execution_state_id`がある場合、ジョブをキューに投入
- `HandleToolJobCallback` usecase: 失敗時に指数バックオフでキューに再投入

### 3. Tool Jobワーカー
`packages/llms/bin/tool_job_worker.rs`:
- Redis Streamsからジョブをdequeue
- `CodexRunner`/`ClaudeCodeRunner`/`CursorAgentRunner`で実行
- コールバックエンドポイントへ結果を送信

## アーキテクチャ

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
│   tachyon   │     │   tachyon-api   │     │    Redis    │
│  (Frontend) │────▶│  (Agent API)    │────▶│   Streams   │
└─────────────┘     └─────────────────┘     └──────┬──────┘
                                                   │
                    ┌─────────────────┐            │
                    │ tool_job_worker │◀───────────┘
                    │   (Worker)      │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Codex/Claude   │
                    │      CLI        │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │    Callback     │
                    │   (API POST)    │
                    └─────────────────┘
```

## UI動作確認手順

### 前提条件

以下のサービスが起動している必要があります：

| サービス | 起動コマンド | 説明 |
|----------|--------------|------|
| インフラ | `mise run up` | MySQL、Redis等 |
| バックエンド | `mise run dev-backend` | tachyon-api |
| フロントエンド | `mise run dev` | Next.js開発サーバー |
| **ワーカー** | `mise run tool-job-worker` | Tool Jobワーカー |

### 手順1: サービスの起動

```bash
# ターミナル1: インフラ起動
mise run up

# ターミナル2: バックエンドAPI起動
mise run dev-backend

# ターミナル3: フロントエンド起動
mise run dev

# ターミナル4: Tool Jobワーカー起動
mise run tool-job-worker
```

ワーカーが正常に起動すると以下のログが表示されます：

```
Starting Tool Job Worker...
  Redis URL: redis://127.0.0.1:6379
  Callback URL: http://localhost:50054
INFO Starting Tool Job Worker worker_id=worker-xxx redis_url=redis://127.0.0.1:6379
INFO Worker ready, starting poll loop
```

### 手順2: Tool Jobs画面にアクセス

1. ブラウザで開く: http://localhost:16000/v1beta/tn_01hjryxysgey07h5jz5wagqj0m/ai/tool-jobs
2. サイドバーから **AI Studio > Tool Jobs** をクリック

### 手順3: Tool Jobの作成（REST API経由）

Tool Jobs画面から新規ジョブを作成するか、curlで直接作成：

```bash
curl -X POST http://localhost:50054/v1/agent/tool-jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dummy-token" \
  -H "x-operator-id: tn_01hjryxysgey07h5jz5wagqj0m" \
  -d '{
    "provider": "Codex",
    "prompt": "Pythonでhello worldを出力する関数を作成してください",
    "context_paths": [],
    "environment": {},
    "metadata": {}
  }'
```

### 手順4: Agent Chat経由での作成

1. **AI Studio > Chat** に移動
2. 新しいチャットルームを作成
3. 設定パネルを開き、**Tool Access** セクションで `coding_agent_job` を有効化
4. メッセージを送信:

```
Pythonでhello worldを出力するスクリプトを作成してください。
execute_coding_agent_jobツールをasync_mode: trueで使用してください。
```

5. Agentが `execute_coding_agent_job` ツールを呼び出す
6. Tool Jobがキューに投入される

### 手順5: ワーカーログの確認

ワーカーを起動したターミナルで以下のログを確認：

```
INFO Processing job job_id=tj_xxx queue_id=xxx provider=Codex retry_count=0
INFO Job completed successfully job_id=tj_xxx
INFO Callback sent successfully job_id=tj_xxx
```

### 手順6: Tool Jobs画面での確認

1. Tool Jobs画面をリロード
2. 作成したジョブのステータスを確認:
   - `PENDING`: キュー待ち
   - `RUNNING`: 実行中
   - `SUCCEEDED`: 成功
   - `FAILED`: 失敗

3. ジョブをクリックして詳細を確認

## 期待される動作

### 成功ケース

1. Tool Job作成 → DBに保存 + キューに投入
2. ワーカーがキューからジョブを取得
3. Codex/Claude CLIを実行
4. 結果をコールバックAPIに送信
5. `agent_tool_job_results`テーブルに結果を保存
6. UI上でステータスが`SUCCEEDED`に更新

### 失敗・リトライケース

1. Tool Job作成 → DBに保存 + キューに投入
2. ワーカーがジョブを実行 → 失敗
3. コールバックAPIに失敗結果を送信
4. リトライ可能な場合（retry_count < max_attempts）:
   - 指数バックオフでキューに再投入
   - ステータスを`PENDING_RETRY`に更新
5. 再度ワーカーがジョブを取得して実行
6. 成功するか、リトライ上限に達するまで繰り返し

## トラブルシューティング

### ワーカーが起動しない

```bash
# Redisが起動しているか確認
redis-cli ping
# 期待される応答: PONG

# Redisが起動していない場合
docker compose up -d redis
```

### ジョブがキューに投入されない

- REST API経由の作成では`execution_state_id`がないためキューに投入されない（同期実行）
- Agent Chat経由で`async_mode: true`を指定した場合のみキューに投入される

### コールバックが失敗する

```bash
# tachyon-apiが起動しているか確認
curl http://localhost:50054/health
```

ワーカーログでエラーを確認：
```
ERROR Callback failed job_id=xxx status=404 body=...
```

### リトライが動作しない

1. `HandleToolJobCallback`に`JobQueue`が注入されているか確認
2. `ToolJobRetryConfig`の設定を確認（デフォルト: max_attempts=3）

## データベース確認クエリ

### Tool Job一覧
```sql
SELECT id, provider, status, retry_count, created_at, completed_at
FROM tachyon_apps_llms.agent_tool_jobs
ORDER BY created_at DESC LIMIT 10;
```

### Tool Job結果
```sql
SELECT id, tool_job_id, status, error_message, created_at
FROM tachyon_apps_llms.agent_tool_job_results
ORDER BY created_at DESC LIMIT 10;
```

### Agent実行状態（リトライ状態含む）
```sql
SELECT id, status, pending_tool_job_id, retry_count, created_at
FROM tachyon_apps_llms.agent_execution_states
WHERE status IN ('PendingToolJob', 'PendingRetry')
ORDER BY created_at DESC LIMIT 10;
```

## Redis確認コマンド

### キュー内のジョブ確認
```bash
redis-cli XINFO STREAM tool_job_queue
```

### Consumer Group情報
```bash
redis-cli XINFO GROUPS tool_job_queue
```

### Pending（処理中）ジョブ
```bash
redis-cli XPENDING tool_job_queue tool_job_workers
```

## まとめ

フェーズ2のキュー統合により、以下が可能になりました：

1. ✅ Redis Streams / SQLx ベースの汎用Job Queue
2. ✅ `CreateToolJob` からのキュー投入
3. ✅ `HandleToolJobCallback` からのリトライ再投入
4. ✅ 独立したワーカープロセスでのジョブ実行
5. ✅ 指数バックオフによるリトライ機能

次のステップ：
- [ ] Docker Compose でのワーカー自動起動
- [ ] Lambdaタイムアウト回避の検証
- [ ] 監視・アラート機能の追加
