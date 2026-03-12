# 開発用動作確認手順

Agent Worktree Self-Editing 機能のローカル開発環境での動作確認手順。

## 前提条件

- Docker / Docker Compose がインストール済み
- Rust toolchain がインストール済み
- Codex CLI または Claude Code CLI がインストール済み（実際のコード編集を行う場合）

## 手順

### 1. Docker環境を起動

```bash
# DB（MySQL）とRedisを起動（DBポートをホストに公開）
docker compose -f compose.yml -f compose.sqlx.yml up -d db redis

# DBが起動するまで待機（約30秒）
# 確認コマンド:
docker compose -f compose.yml -f compose.sqlx.yml ps db
```

### 2. tachyon-apiを起動

```bash
# 必要な環境変数を設定してホストで直接実行
SQLX_OFFLINE=true \
ANTHROPIC_API_KEY="sk-dummy" \
OPENAI_API_KEY="sk-dummy" \
XAI_API_KEY="xai-dummy" \
GOOGLE_AI_API_KEY="dummy" \
cargo run -p tachyon-api --release

# port 50054 でリスニング開始を確認
# ログ: INFO tachyon_api: version: x.x.x
```

### 3. tachyon-code Workerを起動（別ターミナル）

```bash
# --repo-path でWorktree機能を有効化
cargo run -p tachyon-code --release -- worker --repo-path $(pwd)

# ログ出力を確認:
# INFO Starting Tool Job Worker worker_id=worker-xxx repo_path=Some("...")
# INFO Worker ready, starting poll loop
```

**注意**: `--repo-path` を指定しないと Worktree 機能が無効になり、`use_worktree=true` を指定しても警告が出るだけで通常モードで実行されます。

### 4. Tool Jobを作成してテスト

```bash
curl -X POST http://localhost:50054/v1/agent/tool-jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dummy-token" \
  -H "x-operator-id: tn_01hjryxysgey07h5jz5wagqj0m" \
  -d '{
    "provider": "claude_code",
    "prompt": "echo hello",
    "use_worktree": true
  }'
```

**レスポンス例:**
```json
{
  "job_id": "01KECDPSGF39RHHA1XNCRJXD90",
  "status": "pending"
}
```

### 5. 確認ポイント

#### Workerログで以下を確認

```
INFO Processing job job_id=01KECDPSGF39RHHA1XNCRJXD90 use_worktree=true
INFO Created worktree for job worktree_path="/.../worktree-01KECDPSGF39RHHA1XNCRJXD90" branch=agent/task-01KECDPSGF39RHHA1XNCRJXD90
INFO Cleaned up worktree job_id=01KECDPSGF39RHHA1XNCRJXD90
INFO Job completed successfully job_id=01KECDPSGF39RHHA1XNCRJXD90
INFO Callback sent successfully job_id=01KECDPSGF39RHHA1XNCRJXD90
```

#### Worktree APIで確認

```bash
# ジョブ処理中はworktreeが表示される
curl http://localhost:50054/v1/agent/worktrees \
  -H "Authorization: Bearer dummy-token" \
  -H "x-operator-id: tn_01hjryxysgey07h5jz5wagqj0m"

# ジョブ完了後は空配列（クリーンアップ済み）
# {"worktrees": []}
```

#### Job状態を確認

```bash
curl http://localhost:50054/v1/agent/tool-jobs/01KECDPSGF39RHHA1XNCRJXD90 \
  -H "Authorization: Bearer dummy-token" \
  -H "x-operator-id: tn_01hjryxysgey07h5jz5wagqj0m"
```

## 期待される動作

1. **Tool Job作成** → `pending` 状態でジョブが作成される
2. **Workerがピックアップ** → `processing` 状態に遷移
3. **Worktree作成** → `<repo>.worktree/worktree-<job_id>` ディレクトリが作成される
4. **ブランチ作成** → `agent/task-<job_id>` ブランチが作成される
5. **Coding Agent実行** → Worktree内でコード編集（Codex/Claude Code）
6. **クリーンアップ** → Worktreeが削除される
7. **Callback送信** → API に結果が通知される
8. **Job完了** → `succeeded` または `failed` 状態に遷移

## トラブルシューティング

### "use_worktree=true but no worktree manager available"

Workerを `--repo-path` なしで起動しています。以下のように再起動してください：

```bash
cargo run -p tachyon-code --release -- worker --repo-path $(pwd)
```

### DBに接続できない

`compose.sqlx.yml` を使用して DB ポートを公開する必要があります：

```bash
docker compose -f compose.yml -f compose.sqlx.yml up -d db
```

### Callback送信に失敗

tachyon-api が起動していることを確認してください。デフォルトの callback URL は `http://localhost:50054` です。

## 環境構成図

```
┌─────────────────────────────────────────────────────────────┐
│  ローカル開発環境                                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐      ┌──────────────┐                    │
│  │  tachyon-api │◀────▶│    Redis     │ (port 6379)        │
│  │  (port 50054)│      │   Streams    │                    │
│  └──────┬───────┘      └──────┬───────┘                    │
│         │                     │                             │
│         │ callback            │ dequeue                     │
│         │                     ▼                             │
│         │              ┌──────────────┐                    │
│         └─────────────▶│ tachyon-code │                    │
│                        │    worker    │                    │
│                        └──────┬───────┘                    │
│                               │                             │
│                               ▼                             │
│                        ┌──────────────┐                    │
│                        │   Worktree   │                    │
│                        │  (一時的)    │                    │
│                        └──────────────┘                    │
│                                                              │
│  ┌──────────────┐                                          │
│  │    MySQL     │ (port 15000 via compose.sqlx.yml)        │
│  └──────────────┘                                          │
└─────────────────────────────────────────────────────────────┘
```
