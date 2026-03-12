# BYO Worker (Bring Your Own Worker) Setup Guide

BYO Workerは、自分のマシン（ローカルPC、自社サーバー等）でTool Job Workerを実行するための仕組みです。

## 概要

```
┌─────────────────────────────────────────────────────────────────┐
│  AWS Cloud                                                       │
│  ┌─────────────────────┐    ┌─────────────────────┐            │
│  │  Lambda             │───▶│  SQS                │            │
│  │  Main Agent         │    │  tool_job_queue     │            │
│  │  (Tachyon API)      │    │                     │            │
│  └─────────────────────┘    └──────────┬──────────┘            │
│            ▲                           │                        │
│            │ HTTPS callback            │ HTTPS (dequeue)        │
└────────────│───────────────────────────│────────────────────────┘
             │                           │
             │                           ▼
┌────────────│───────────────────────────────────────────────────┐
│  Your Machine (Local PC / Server)                               │
│            │                                                    │
│  ┌─────────┴───────────────────────────────────────────────┐  │
│  │  Tool Job Worker (Docker)                                │  │
│  │                                                          │  │
│  │  - SQS からジョブを取得                                  │  │
│  │  - Claude Code / Codex でコード編集                      │  │
│  │  - Git worktree で安全に作業                             │  │
│  │  - PR作成・コミット                                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Local Repository:                                               │
│  /path/to/repo.worktree/                                        │
│    ├── worktree-job-001/                                        │
│    └── worktree-job-002/                                        │
└──────────────────────────────────────────────────────────────────┘
```

## メリット

- **自分のAPI Keyを使用**: Claude/Codex/GitHubの認証情報は自分のものを使用
- **ローカルリソース**: 自分のマシンのCPU/メモリでCoding Agentを実行
- **セキュアな編集**: コードは自分のマシン内で編集、外部に送信されない
- **スマホからも操作可能**: TachyonのMain AgentはクラウドなのでどこからでもJob発行可能

## 前提条件

- Docker がインストールされていること
- Tachyon アカウントと API Key（`pk_xxxxx`）
- Claude Code または Codex の API Key
- GitHub Token（PR作成機能を使う場合）

## クイックスタート

### 1. Tachyon API Keyの取得

1. Tachyon UI にログイン
2. Settings > API Keys に移動
3. 新しいAPI Keyを作成（`ToolJobWorkerPolicy` を付与）

### 2. Workerの起動

```bash
docker run -d \
  --name tool-job-worker \
  -e TACHYON_API_KEY=pk_xxxxx \
  -e CLAUDE_CODE_API_KEY=sk-ant-xxxxx \
  -e GITHUB_TOKEN=ghp_xxxxx \
  -v /path/to/repos:/repos \
  -v ~/.gitconfig:/root/.gitconfig:ro \
  -v ~/.ssh:/root/.ssh:ro \
  public.ecr.aws/tachyon/tool-job-worker:latest
```

### 3. 動作確認

```bash
# ログを確認
docker logs -f tool-job-worker

# 正常に起動すると以下のようなログが表示される
# [INFO] Worker registered: wkr_01xxx
# [INFO] SQS credentials received, polling started
# [INFO] Listening for jobs...
```

## 環境変数

| 変数名 | 必須 | 説明 |
|--------|------|------|
| `TACHYON_API_KEY` | ✅ | Tachyon Public API Key（Worker登録・認証用） |
| `CLAUDE_CODE_API_KEY` | △ | Claude Code CLI用（Claude使用時） |
| `CODEX_API_KEY` | △ | Codex CLI用（Codex使用時） |
| `GITHUB_TOKEN` | △ | PR作成用（PR作成機能使用時） |
| `GIT_USER_NAME` | - | コミット時のユーザー名（デフォルト: "Tachyon Bot"） |
| `GIT_USER_EMAIL` | - | コミット時のメールアドレス |

## ボリュームマウント

| ホストパス | コンテナパス | 説明 |
|-----------|-------------|------|
| `/path/to/repos` | `/repos` | リポジトリとworktreeの保存先 |
| `~/.gitconfig` | `/root/.gitconfig` | Git設定（read-only推奨） |
| `~/.ssh` | `/root/.ssh` | SSH鍵（GitHub認証用、read-only推奨） |

## 認証フロー

1. **Worker起動時**: `TACHYON_API_KEY` でTachyon APIに登録リクエスト
2. **API検証**: Tachyon APIがAPI Keyを検証し、Worker用ポリシーを確認
3. **クレデンシャル発行**: STS AssumeRoleで一時的なSQSクレデンシャルを発行
4. **ポーリング開始**: 一時クレデンシャルでSQSからジョブを取得
5. **定期更新**: クレデンシャル期限切れ前に自動更新（デフォルト: 1時間）

## Worktree機能

Tool JobでWorktree機能を使用すると、以下のフローで安全にコード編集が行われます：

1. **Worktree作成**: `git worktree add -b agent/task-<job_id>`
2. **コード編集**: Worktree内でClaude Code/Codexが編集
3. **CIチェック**: `mise run ci` でテスト実行（オプション）
4. **コミット**: 変更をコミット
5. **PR作成**: `gh pr create` でPR作成
6. **クリーンアップ**: Worktree削除

## トラブルシューティング

### Worker登録に失敗する

```
[ERROR] Failed to register worker: 401 Unauthorized
```

**原因**: API Keyが無効、または`ToolJobWorkerPolicy`が付与されていない

**対処**:
1. API Keyが正しいか確認
2. Tachyon UIでAPI Keyに`ToolJobWorkerPolicy`が付与されているか確認

### SQSからメッセージを受信できない

```
[ERROR] SQS receive error: AccessDenied
```

**原因**: STS一時クレデンシャルが期限切れ、または発行に失敗

**対処**:
1. Workerを再起動
2. ネットワーク接続を確認
3. AWSリージョン設定を確認

### Git操作に失敗する

```
[ERROR] git push failed: Permission denied (publickey)
```

**原因**: SSH鍵が正しくマウントされていない

**対処**:
1. `~/.ssh` のマウント設定を確認
2. SSH鍵がGitHubに登録されているか確認
3. `ssh -T git@github.com` で接続テスト

### Worktree作成に失敗する

```
[ERROR] fatal: '<path>' is already checked out at '<other_path>'
```

**原因**: 同じブランチが既に別のworktreeでチェックアウトされている

**対処**:
1. `git worktree list` で既存のworktreeを確認
2. 不要なworktreeを `git worktree remove <path>` で削除

## 高度な設定

### 複数リポジトリの管理

複数のリポジトリを扱う場合は、それぞれのリポジトリをマウント：

```bash
docker run -d \
  --name tool-job-worker \
  -e TACHYON_API_KEY=pk_xxxxx \
  -v /path/to/repo1:/repos/repo1 \
  -v /path/to/repo2:/repos/repo2 \
  public.ecr.aws/tachyon/tool-job-worker:latest
```

### カスタムCLIツール

独自のCLIツールを追加する場合は、Dockerイメージを拡張：

```dockerfile
FROM public.ecr.aws/tachyon/tool-job-worker:latest

# カスタムツールをインストール
RUN apt-get update && apt-get install -y your-tool

# 環境変数を設定
ENV CUSTOM_TOOL_PATH=/usr/bin/your-tool
```

### リソース制限

メモリ使用量を制限する場合：

```bash
docker run -d \
  --name tool-job-worker \
  --memory=4g \
  --cpus=2 \
  -e TACHYON_API_KEY=pk_xxxxx \
  public.ecr.aws/tachyon/tool-job-worker:latest
```

## セキュリティ考慮事項

- **API Keyの管理**: `TACHYON_API_KEY` は漏洩しないよう厳重に管理
- **ネットワーク**: WorkerはアウトバウンドのHTTPS接続のみ必要（インバウンドは不要）
- **ボリューム**: 機密情報を含むファイルは `:ro`（read-only）でマウント推奨
- **最小権限**: 必要なリポジトリのみをマウント

## 関連ドキュメント

- [Tool Job API](../llms/tool-jobs.md)
- [Worktree管理](./worktree-management.md)
- [インフラ構築ガイド](./infrastructure-setup.md)
