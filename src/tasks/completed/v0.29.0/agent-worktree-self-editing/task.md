---
title: "Worktree分離によるAgent自己編集の安定化"
type: "feature"
emoji: "🌳"
topics:
  - AgentAPI
  - ToolJobs
  - GitWorktree
  - SelfImprovement
published: true
targetFiles:
  - apps/tachyon-api
  - packages/agents
  - packages/llms
github: https://github.com/quantum-box/tachyon-apps
---

# Worktree分離によるAgent自己編集の安定化

## 概要

Tachyon AgentがTool Jobで自身のコードベースを編集する際、hot reloadによる再起動問題を回避するため、mainのagentプロセスが別worktreeのプロジェクトを操作し、完了後にmainブランチへマージする仕組みを構築する。

## 背景・目的

### 親タスクの完了状況（2025-12-30）

[tachyon-agent-autonomous-coding-loop](../v0.26.0/tachyon-agent-autonomous-coding-loop/task.md) タスクがv0.26.0で完了し、以下の基盤が既に実装されている：

- ✅ **Tool Job Worker**: `packages/llms/bin/tool_job_worker.rs` - Redis/SQSからジョブを取得して実行
- ✅ **Queue基盤**: `packages/queue/` - Redis Streams / SQS / SQLxベースの汎用ジョブキュー
- ✅ **GitHub連携**: Webhook受信、Issue/PRコメント投稿、APIクライアント
- ✅ **ECSデプロイ**: AWS Fargate Spot上のワーカー運用
- ✅ **devcontainer**: `.devcontainer/tool-job-worker/` - ワーカー開発用devcontainer設定

この基盤の上に、本タスクではworktree分離によるAgent自己編集の安定化を構築する。

### 現状の問題

1. **Hot Reload問題**: Tachyon Agentがtool jobで自分のコードベース（`apps/tachyon-api`など）を編集すると、開発サーバーのhot reloadが発動し、agent自身が再起動してしまう
2. **実行コンテキスト喪失**: 再起動によりagent実行状態（会話ログ、pending tool jobs）が失われる可能性がある
3. **自己改善ループの中断**: 連続的な自己改善サイクルが中断され、人間の介入が必要になる
4. **Coding Agentの監督不在**: Claude Code/Codexを直接呼び出すだけでは、進捗確認・品質チェック・問題検出ができない

### 解決策: Lambda + ECS Worker アーキテクチャ

**設計方針**: Main AgentをLambdaで実行し、Tool実行は全てECS Workerに委譲する。

**この設計のメリット**:
- **プロセス分離**: Lambdaはリクエストごとに独立したプロセスで実行されるため、hot reload問題が根本的に解消
- **ステートレス**: 状態はDBに永続化され、`resume` APIでコンテキスト復元
- **既存基盤の活用**: v0.26.0で実装済みのTool Job Worker（ECS）をそのまま使用
- **スケーラビリティ**: LambdaとECSはそれぞれ独立してスケール

```
┌─────────────────────────────────────────────────────────────────┐
│  AWS Lambda                                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Main Agent (tachyon-api Lambda)                         │   │
│  │  - ユーザーとの会話処理（REST/GraphQL）                  │   │
│  │  - Tool Job発行                                          │   │
│  │  - 状態をDBに永続化して即座に終了                        │   │
│  │  - コールバック受信後にresume                            │   │
│  │  - マージ判断・PR作成指示                                │   │
│  └────────────────────┬────────────────────────────────────┘   │
│                       │ enqueue (SQS)                           │
└───────────────────────│─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  AWS SQS                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  tool_job_queue                                          │   │
│  │  - at-least-once配送                                     │   │
│  │  - DLQ対応                                               │   │
│  └────────────────────┬────────────────────────────────────┘   │
└───────────────────────│─────────────────────────────────────────┘
                        │ dequeue
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  AWS ECS Fargate (Tool Job Worker)                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Worktree Manager                                        │   │
│  │  - git worktree add (Editing Worktree作成)               │   │
│  │  - branch作成 (agent/task-<id>)                          │   │
│  │  - worktreeクリーンアップ                                │   │
│  └────────────────────┬────────────────────────────────────┘   │
│                       │                                         │
│                       ▼                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Coding Agent (Claude Code / Codex CLI)                  │   │
│  │  - Editing Worktree内でコード編集                        │   │
│  │  - テスト実行 (mise run ci)                              │   │
│  │  - ビルド確認                                            │   │
│  └────────────────────┬────────────────────────────────────┘   │
│                       │                                         │
│                       ▼                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  結果処理                                                │   │
│  │  - diff取得                                              │   │
│  │  - コミット作成                                          │   │
│  │  - PR作成 or push                                        │   │
│  │  - callback送信                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                        │ callback (HTTPS)
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  AWS Lambda (callback handler)                                   │
│  - Tool Job結果を受信                                           │
│  - AgentExecutionState更新                                       │
│  - 必要に応じてAgent resume                                      │
│  - GitHub Issueへのコメント投稿                                  │
└─────────────────────────────────────────────────────────────────┘
```

### コンポーネント構成

```yaml
components:
  main_agent:
    role: "オーケストレーター"
    runtime: "AWS Lambda"
    characteristics:
      - リクエストごとに独立したプロセス
      - ステートレス（状態はDBに永続化）
      - 短時間で終了（Tool Job発行後すぐにreturn）
    responsibilities:
      - ユーザーとの対話 (REST/GraphQL API)
      - Tool Job発行（SQSへenqueue）
      - コールバック受信とresume
      - マージ判断・PR作成指示
    does_not_do:
      - 直接のコード編集
      - 長時間実行（全てWorkerに委譲）

  tool_job_worker:
    role: "実行者"
    runtime: "AWS ECS Fargate Spot"
    location: "Editing Worktree内で実行"
    characteristics:
      - SQSからジョブをdequeue
      - 長時間実行に対応（5-30分/job）
      - Worktree内で隔離されたコード編集
    responsibilities:
      - Worktree作成・管理
      - Coding Agent (Claude Code/Codex) 実行
      - CI/テスト実行
      - diff取得・コミット作成
      - PR作成 or push
      - callback送信
    existing_implementation:
      - packages/llms/bin/tool_job_worker.rs
      - ECS Fargate Spot（v0.26.0でデプロイ済み）

  coding_agent:
    role: "道具"
    runtime: "Claude Code / Codex CLI"
    location: "ECS Worker内で実行"
    examples:
      - Claude Code CLI
      - Codex CLI
    responsibilities:
      - コード編集
      - ファイル操作
    existing_implementation:
      - packages/agents/src/claude_runner.rs
      - packages/agents/src/codex_runner.rs
```

### 期待される成果

1. **安定した自己改善ループ**: Agentが自身のコードを編集しても再起動しない
2. **継続的な自律運用**: GitHub Issue/Alertから自動的にタスクを起票し、修正→検証→マージのサイクルを回す
3. **品質保証**: worktreeでの編集後にCI/テストを実行してからmainにマージ

## 詳細仕様

### 機能要件

1. **Worktree管理機能**
   - [x] `git worktree add` による編集用worktreeの作成
   - [x] worktreeごとの作業ブランチ自動作成（`agent/task-<ulid>`形式）
   - [x] 編集完了後のworktreeクリーンアップ

2. **Tool Job拡張**
   - [x] `create_tool_job` に `use_worktree` パラメータ追加
   - [x] worktree内でのCoding Agent実行
   - [x] 編集結果のdiff取得

3. **マージ処理**
   - [x] worktree作業完了後のPR作成 or 直接マージ
   - [x] コンフリクト検出と通知
   - [x] マージ後のworktree削除

4. **監視・状態管理**
   - [x] worktree一覧API（REST）
   - [x] 長時間放置worktreeの検出と通知
   - [ ] worktree作業の進捗可視化（UI）

5. **デプロイパターン対応**
   - [x] フルマネージド（Lambda + ECS）- Terraform定義完了
   - [x] BYO Worker（Lambda + ローカルWorker）- Terraform + ドキュメント完了
   - [x] 開発用（ローカル + ローカル）- docker-compose対応済み

### 非機能要件

- **分離性**: worktreeでの編集がmain worktreeに影響しない
- **耐障害性**: worktree作成失敗時のフォールバック処理
- **クリーンアップ**: 未使用worktreeの自動削除（TTL: 24h）
- **同時実行**: 複数worktreeでの並行作業をサポート（最大5つ推奨）

### コンテキスト別の責務

```yaml
contexts:
  agents:
    description: "ステートレス実行レイヤー（v0.26.0でリファクタリング済み）"
    existing_responsibilities:
      - ToolRunner trait（CLI実行の抽象化）
      - CodexRunner / ClaudeCodeRunner / CursorAgentRunner
    new_responsibilities:
      - WorktreeManagerの実装
      - worktree作成・削除・一覧取得

  llms:
    description: "LLM/Agent実行基盤（Tool Job管理含む）"
    existing_responsibilities:
      - Tool Job Usecase群（Create/Get/List/Cancel）
      - SqlxToolJobRepository（DB永続化）
      - Tool Job Worker（bin/tool_job_worker.rs）
      - コールバック処理
    new_responsibilities:
      - Worker登録API
      - worktree情報のTool Jobへの統合
      - SQS一時クレデンシャル発行

  queue:
    description: "汎用ジョブキュー基盤（v0.26.0で実装済み）"
    existing_responsibilities:
      - JobQueue trait
      - Redis Streams / SQS / SQLx バックエンド
      - at-least-once配送、リトライ機能

  tachyon_api:
    description: "外部APIエントリーポイント"
    new_responsibilities:
      - Worker登録REST API
      - Worktree管理REST API
      - クレデンシャル更新API
```

### データモデル定義

```yaml
# Worktree管理エンティティ
worktree:
  fields:
    id:
      type: WorktreeId
      description: "ULID（wt_プレフィックス）"
    path:
      type: String
      description: "worktreeのファイルシステムパス"
    branch_name:
      type: String
      description: "作業ブランチ名（agent/task-<ulid>）"
    tool_job_id:
      type: Option<ToolJobId>
      description: "関連するTool Job ID"
    status:
      type: WorktreeStatus
      description: "worktreeの状態"
    created_at:
      type: DateTime
    updated_at:
      type: DateTime

# Worktreeステータス
worktree_status:
  variants:
    - Creating     # worktree作成中
    - Ready        # 編集可能
    - Working      # Tool Job実行中
    - Completed    # 作業完了（マージ待ち）
    - Merged       # マージ済み
    - Failed       # 作業失敗
    - Cleanup      # クリーンアップ中
```

### シーケンス図

```plantuml
@startuml
actor User
participant "Lambda\n(Main Agent)" as Lambda
queue "SQS" as SQS
participant "ECS Worker" as Worker
participant "Coding Agent\n(Claude Code)" as Coding
database "Git Repository" as Git
database "RDS Aurora" as DB

== タスク起票 ==
User -> Lambda : 自己修正依頼（REST/GraphQL）
Lambda -> Lambda : タスク分析
Lambda -> DB : 状態保存

== Tool Job発行 ==
Lambda -> SQS : enqueue(tool_job)
Lambda --> User : 202 Accepted (job_id)

== Worker処理 ==
Worker -> SQS : dequeue
Worker -> Worker : Worktree作成
Worker -> Git : git worktree add -b agent/task-<id>
Worker -> Coding : Claude Code / Codex 実行
Coding -> Coding : コード編集
Coding --> Worker : result JSON

== CI/テスト ==
Worker -> Worker : mise run ci
alt CI成功
    Worker -> Git : git add && commit
    Worker -> Git : git push -u origin
    Worker -> Git : gh pr create
else CI失敗
    Worker -> Worker : エラー記録
end

== Callback ==
Worker -> Lambda : POST /v1/llms/agent/tool-job-callback
Lambda -> DB : 状態更新
Lambda --> User : 通知（Webhook/Email）

== クリーンアップ ==
Worker -> Git : git worktree remove
Worker -> SQS : ack
@enduml
```

### Lambda ↔ Worker 通信プロトコル

```yaml
communication_protocol:
  # Lambda → SQS → Worker: Tool Job
  tool_job_payload:
    fields:
      job_id: string
      provider: "ClaudeCode" | "Codex"
      prompt: string
      use_worktree: boolean
      auto_merge: boolean
      metadata:
        context_paths: string[]
        output_profile: string

  # Worker → Lambda: Callback
  tool_job_callback:
    endpoint: POST /v1/llms/agent/tool-job-callback
    fields:
      tool_job_id: string
      status: "SUCCEEDED" | "FAILED"
      result_json:
        summary: string
        diff_stats:
          files_changed: int
          insertions: int
          deletions: int
        pr_url: string | null
        commit_sha: string | null
      error_message: string | null
      started_at: datetime
      completed_at: datetime

  # Worker登録
  worker_registration:
    endpoint: POST /v1/agent/workers/register
    request:
      # Authorization: Bearer <TACHYON_API_KEY>
    response:
      worker_id: string
      sqs_queue_url: string
      sqs_credentials:
        access_key_id: string
        secret_access_key: string
        session_token: string
        expiration: datetime
      callback_url: string
      heartbeat_interval_seconds: int

  # クレデンシャル更新
  credential_refresh:
    endpoint: POST /v1/agent/workers/refresh-credentials
    # 期限切れ前に呼び出し
```

## 実装方針

### フェーズ1: Worktree Manager基盤

**WorktreeManager実装** (`packages/agents/src/worktree/manager.rs`)

```rust
use std::path::PathBuf;
use std::process::Command;

pub struct WorktreeManager {
    base_repo_path: PathBuf,
    worktrees_dir: PathBuf,
}

impl WorktreeManager {
    pub fn new(base_repo_path: PathBuf) -> Self {
        let worktrees_dir = base_repo_path.parent()
            .unwrap()
            .join(format!("{}.worktree", base_repo_path.file_name().unwrap().to_str().unwrap()));
        Self { base_repo_path, worktrees_dir }
    }

    /// 新しいworktreeを作成
    pub async fn create(&self, task_id: &str) -> errors::Result<WorktreeInfo> {
        let branch_name = format!("agent/task-{}", task_id);
        let worktree_name = format!("worktree-{}", task_id);
        let worktree_path = self.worktrees_dir.join(&worktree_name);

        // git worktree add
        let output = Command::new("git")
            .current_dir(&self.base_repo_path)
            .args(["worktree", "add", worktree_path.to_str().unwrap(), "-b", &branch_name])
            .output()
            .map_err(|e| errors::Error::InternalServerError(format!("Failed to create worktree: {}", e)))?;

        if !output.status.success() {
            return Err(errors::Error::InternalServerError(
                String::from_utf8_lossy(&output.stderr).to_string()
            ));
        }

        Ok(WorktreeInfo {
            path: worktree_path,
            branch_name,
            task_id: task_id.to_string(),
        })
    }

    /// worktreeでの作業完了後にマージ
    pub async fn merge_and_cleanup(&self, worktree_path: &PathBuf) -> errors::Result<MergeResult> {
        // 1. worktreeのブランチ名取得
        // 2. mainにチェックアウト
        // 3. ブランチをマージ
        // 4. worktreeを削除
        // 5. ブランチを削除
        todo!()
    }

    /// worktree一覧取得
    pub async fn list(&self) -> errors::Result<Vec<WorktreeInfo>> {
        let output = Command::new("git")
            .current_dir(&self.base_repo_path)
            .args(["worktree", "list", "--porcelain"])
            .output()
            .map_err(|e| errors::Error::InternalServerError(format!("Failed to list worktrees: {}", e)))?;

        // パース処理
        todo!()
    }
}

pub struct WorktreeInfo {
    pub path: PathBuf,
    pub branch_name: String,
    pub task_id: String,
}

pub struct MergeResult {
    pub merged: bool,
    pub conflicts: Vec<String>,
    pub commit_sha: Option<String>,
}
```

### フェーズ2: Tool Job統合

**create_tool_job拡張**

```yaml
# Tool Job作成時のパラメータ拡張
tool_job_request:
  fields:
    prompt:
      type: String
      required: true
    working_directory:
      type: Option<String>
      description: "編集対象のworktreeパス（省略時はmain worktree）"
    use_worktree:
      type: bool
      default: false
      description: "trueの場合、自動でworktreeを作成して作業"
    auto_merge:
      type: bool
      default: false
      description: "作業完了後に自動マージするか"
```

### フェーズ3: 自動化フロー

1. Agent APIが「自己修正」タスクを受信
2. `use_worktree=true` でTool Job作成
3. WorktreeManagerがworktreeを作成
4. Coding Agentがworktree内で編集
5. CIチェック（`mise run ci`）
6. 成功時に自動マージ or PR作成
7. worktreeクリーンアップ

## タスク分解

### デプロイパターン

本システムは3つのデプロイパターンをサポートする：

| パターン | Main Agent | Queue | Worker | 用途 |
|---------|-----------|-------|--------|------|
| **フルマネージド** | Lambda | SQS | ECS Fargate | 本番（全部クラウド） |
| **BYO Worker** | Lambda | SQS | ユーザーのPC/サーバー | 本番（自分のマシンで編集） |
| **開発用** | ローカル | Redis Streams | ローカル | 開発・デバッグ |

**BYO Worker（Bring Your Own Worker）パターン:**
- ユーザーが自分のClaude API Key / GitHub Tokenを使用
- 自分のマシンのリソースでCoding Agentを実行
- Tachyonはオーケストレーションのみ提供
- スマホからでも自分のPCで編集作業を実行可能

### フェーズ0: Worker配布基盤 ✅

**共通API（実装済み）:**
- [x] Worker登録API実装 (`POST /v1/agent/workers/register`)
- [x] Worker用Policy定義追加
- [x] クレデンシャル更新API (`POST /v1/agent/workers/refresh-credentials`)
- [x] Heartbeat API (`POST /v1/agent/workers/heartbeat`)

**フルマネージド（Lambda + ECS）- Terraform定義済み:**
- [x] Lambda用tachyon-apiデプロイ設定 (`cluster/n1-aws/lambda.tf`)
- [x] ECS Task Definition（Worker用）(`cluster/n1-aws/tool_job_worker.tf`)
- [x] SQS Queue + DLQ設定 (`cluster/n1-aws/sqs.tf`)
- [x] IAMロール設定（Lambda, ECS, SQS）(`cluster/n1-aws/byo_worker.tf`)
- [x] Public ECRリポジトリ作成 (`cluster/n1-aws/byo_worker.tf`)

**BYO Worker（Lambda + ローカル）:**
- [x] SQS一時クレデンシャル発行（STS AssumeRole実装）
  - `packages/agents/src/sts/mod.rs` - CredentialIssuer trait + StsCredentialIssuer実装
  - `register_worker_handler.rs` - 登録時にクレデンシャル発行
  - `refresh_credentials` エンドポイント - 期限切れ前の再発行
- [x] Public ECRリポジトリ定義 (`cluster/n1-aws/byo_worker.tf`)
- [x] `docker run`起動手順ドキュメント (`docs/src/tachyon-apps/agents/byo-worker-setup.md`)
- [x] Worker設定ガイド（API Key設定等）(`docs/src/tachyon-apps/agents/byo-worker-setup.md`)
- [ ] Public ECRへDockerイメージpush（terraform apply後に実施）

**開発用（ローカル + ローカル）:**
- [x] Redis Streamsでのキュー設定（`packages/queue/` で実装済み）
- [x] docker-compose.ymlにworker service追加（`compose.yml` の `tool-job-worker` サービス）
- [x] ローカル用環境変数設定（.env.local）
- [x] 開発用セットアップドキュメント (`docs/src/tachyon-apps/agents/byo-worker-setup.md`)

**共通基盤（実装済み）:**
- [x] キュー抽象化（SQS/Redis Streams切り替え）
  - `packages/queue/`のJobQueue traitがSQS/Redis両対応
  - `QUEUE_TYPE`環境変数でキューバックエンド切り替え
- [x] Worker起動エントリーポイント
  - `packages/llms/bin/tool_job_worker.rs`がmainとして動作
  - Dockerfileのworker-prodステージでエントリーポイント設定済み

### フェーズ1: Worktree Manager基盤 ✅

- [x] `WorktreeManager` 構造体実装 (`packages/agents/src/worktree/`)
- [x] `create()` - worktree作成
- [x] `list()` - worktree一覧
- [x] `remove()` - worktree削除
- [x] ユニットテスト
- [x] `push_and_create_pr()` - PR作成機能（追加実装）
- [x] `get_diff()` - diff取得機能（追加実装）

### フェーズ2: Tool Job Worker統合 ✅

- [x] `tool_job_worker.rs` にWorktree対応を追加
  - Tool Job開始時にworktree作成
  - worktree内でCoding Agent実行
  - 完了後にworktreeクリーンアップ
- [x] `use_worktree` パラメータ対応
  - metadataから`use_worktree: bool`を読み取り
  - `true`の場合、Workerがworktreeを自動作成
- [x] 作業ディレクトリの切り替え
  - WORKING_DIRECTORY環境変数でworktreeパスを渡す
- [x] PR作成機能
  - 変更があればdiff取得、コミット、PR作成
  - callback bodyにpr_url, worktree_usedを追加

### フェーズ3: 結果処理とPR作成 ⚠️

- [x] 変更のコミット処理
  - `git add -A && git commit`
  - コミットメッセージの自動生成
- [x] PR作成
  - `git push -u origin <branch>`
  - `gh pr create` でPR作成
  - PR URLをコールバックに含める
- [x] 直接マージオプション
  - `auto_merge: true` フラグ対応（現在はPR作成をスキップ）
- [x] コンフリクト検出と通知
  - [x] merge時のコンフリクト検出（`check_for_conflicts()`メソッド実装済み）
  - [x] コンフリクト発生時のエラーハンドリング
  - [x] 通知（コールバック/Webhook経由）- callbackに`has_conflicts`と`conflicts`フィールド追加
- [ ] **Docker環境でのWorktree制限**（2026-01-08検出）
  - ホストのgit worktreeディレクトリをマウントすると、`.git`ファイルのパス参照がコンテナ内で解決できない
  - 現状はgraceful fallbackでworktreeなしで継続
  - 本番ECS環境ではリポジトリをクローンするため問題なし

### フェーズ4: DB永続化 ✅

- [x] `agent_worktrees` テーブル作成
  - worktree_id, path, branch_name, tool_job_id, status, created_at
  - マイグレーション: `packages/llms/migrations/20251231180000_create_agent_worktrees.up.sql`
- [x] Worktree情報のDB保存
  - エンティティ: `packages/agents/src/worktree/entity.rs`
  - リポジトリトレイト: `packages/agents/src/worktree/repository.rs`
  - SQLx実装: `packages/agents/src/adapter/gateway/sqlx_worktree_repository.rs`
  - ステータス更新（Creating → Ready → Working → Completed）
- [x] Usecaseのリポジトリ対応
  - `list_worktrees.rs`: WorktreeRepository経由でDB取得
  - `get_worktree.rs`: WorktreeRepository経由でDB取得
  - `WorktreeUsecases::new()`: リポジトリを受け取る形に変更
- [x] tachyon-apiでのDI統合
  - `apps/tachyon-api/src/di.rs`: SqlxWorktreeRepository作成
  - `apps/tachyon-api/src/router.rs`: create_agent_routerにリポジトリ渡し
- [x] 古いworktreeの自動クリーンアップ
  - TTL: 24h後に自動削除（`CleanupExpiredWorktreesInteractor`実装済み）
  - `WorktreeEntity::new()`でデフォルト24h TTL設定
  - `find_expired()`/`delete_expired()`リポジトリメソッド実装

### フェーズ5: API統合・エンドポイント公開 ✅

**tachyon-apiへのルーター統合:**
- [x] Worktree API統合
  - [x] `apps/tachyon-api/src/router.rs`に`.merge()`パターンで統合
  - [x] `packages/agents/src/adapter/axum/mod.rs`内で`create_agent_router()`関数に統合
  - [x] エンドポイント: `GET /v1/agent/worktrees`, `GET /v1/agent/worktrees/{task_id}`
- [x] Worker API統合
  - [x] 同じく`create_agent_router()`関数に統合（catalog/payment/llmsと同じパターン）
  - [x] エンドポイント: `POST /v1/agent/workers/register`, `POST /v1/agent/workers/{id}/heartbeat`, `POST /v1/agent/workers/{id}/refresh-credentials`

**Tool Job APIのworktree対応:**
- [x] `ToolJobCreateRequest`に`use_worktree: bool`フィールド追加
- [x] `create_tool_job` APIで`use_worktree`パラメータを受け付け
- [x] tool_job_worker.rsでmetadataから`use_worktree`を読み取り処理

**実装済みハンドラー/Usecase:**
- [x] Worktree一覧API（REST）
  - Usecase層: `packages/agents/src/usecase/list_worktrees.rs`, `get_worktree.rs`
  - Handler層: `packages/agents/src/adapter/axum/list_worktrees_handler.rs`
- [x] Worker登録API
  - Handler層: `packages/agents/src/adapter/axum/register_worker_handler.rs`

### フェーズ6: UI・監視 ✅

- [x] AI Studio > Worktrees画面
  - アクティブなworktree一覧
  - 各worktreeのステータス
  - 関連するTool Jobへのリンク
- [x] 長時間worktreeのアラート
  - `alert_long_running_worktrees.rs` - 12時間以上経過したworktreeを検出
  - `WorktreeEntity::is_long_running()` / `age_hours()` メソッド
  - `WorktreeRepository::find_long_running()` リポジトリメソッド

## テスト計画

### ユニットテスト

```rust
#[tokio::test]
async fn test_worktree_create_and_cleanup() {
    let temp_dir = tempdir().unwrap();
    // テスト用gitリポジトリ初期化
    init_test_repo(&temp_dir).await;

    let manager = WorktreeManager::new(temp_dir.path().to_path_buf());

    // worktree作成
    let info = manager.create("test-task-001").await.unwrap();
    assert!(info.path.exists());
    assert_eq!(info.branch_name, "agent/task-test-task-001");

    // worktree一覧確認
    let list = manager.list().await.unwrap();
    assert_eq!(list.len(), 1);

    // クリーンアップ
    manager.remove(&info.path).await.unwrap();
    assert!(!info.path.exists());
}

#[tokio::test]
async fn test_worktree_merge() {
    // worktreeで変更を加えてマージ
    // コンフリクトなしの場合
    // コンフリクトありの場合
}
```

### 統合テスト

- Tool Job実行時のworktree自動作成
- worktree内での編集→CI→マージの一連フロー
- 複数worktreeの並行処理

### シナリオテスト

```yaml
# apps/tachyon-api/tests/scenarios/worktree_tool_job.yaml
scenario:
  name: "Worktree Tool Job Flow"
  steps:
    - id: create_job_with_worktree
      request:
        method: POST
        path: /v1/agent/tool-jobs
        body:
          prompt: "Fix the typo in README.md"
          use_worktree: true
          auto_merge: false
      expect:
        status: 202
        body:
          worktree_path: "{{regex:.*worktree-.*}}"

    - id: check_worktree_created
      request:
        method: GET
        path: /v1/agent/worktrees
      expect:
        status: 200
        body:
          worktrees:
            - status: "working"
```

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| worktree作成失敗（ディスク容量不足） | 中 | 事前にディスク容量チェック、古いworktree自動削除 |
| マージコンフリクト | 高 | コンフリクト検出時は人間にエスカレーション、PR方式推奨 |
| worktree放置によるリソース消費 | 中 | TTL (24h) 後の自動クリーンアップ |
| 同時編集による競合 | 中 | ファイルレベルのロック機構、または1worktree=1タスク制約 |
| CIが長時間かかりタイムアウト | 中 | CI結果のポーリングではなくコールバック方式 |

## 参考資料

- [Git Worktree Documentation](https://git-scm.com/docs/git-worktree)
- [tachyon-agent-autonomous-coding-loop](../v0.26.0/tachyon-agent-autonomous-coding-loop/task.md) - 親タスク（v0.26.0完了）
- [Tool Job Worker Architecture](../../../../architecture/tool-job-worker.md) - ワーカーアーキテクチャ
- [agents-llms-separation](../../../../architecture/agents-llms-separation.md) - agents/llmsクレート分離

## 完了条件

### フェーズ0（Worker配布基盤）

**共通:**
- [x] Worker登録APIが動作する（`POST /v1/agent/workers/register`）
- [x] Worker用Policy（`ToolJobWorkerPolicy`）が定義されている

**フルマネージド:**
- [x] Lambda用tachyon-apiがデプロイされている（`lambda.tf`）
- [x] ECS Task Definitionが作成されている（`tool_job_worker.tf`）
- [x] SQS Queue + DLQが設定されている（`sqs.tf`）
- [x] IAMロールが適切に設定されている（`byo_worker.tf`）

**BYO Worker:**
- [x] SQS一時クレデンシャルが発行される（STS AssumeRole）
  - `packages/agents/src/sts/mod.rs` - StsCredentialIssuer実装
  - `POST /v1/agent/workers/register` で登録時に発行
  - `POST /v1/agent/workers/{id}/refresh-credentials` で再発行
- [x] Public ECRリポジトリが作成されている（`byo_worker.tf`）
- [ ] `docker run ... --env TACHYON_API_KEY=pk_xxx` でWorkerが起動し、SQSに接続できる（terraform apply後に検証）

**開発用:**
- [x] Redis Streamsでローカルキューが動作する（`packages/queue/` 実装済み）
- [x] docker-composeでworker serviceが起動する（`compose.yml` の `tool-job-worker` サービス）

### フェーズ1（Worktree Manager）✅

- [x] `WorktreeManager` が実装され、create/list/removeが動作する
- [x] ユニットテストが全てパス
- [x] `mise run docker-check` が成功

### フェーズ2（Tool Job Worker統合）✅

- [x] `tool_job_worker.rs` にWorktree対応が追加されている
- [x] `use_worktree=true` でTool Jobを作成するとworktree内で編集が行われる
- [x] 編集後にworktreeがクリーンアップされる

### フェーズ3（結果処理とPR作成）✅

- [x] 変更が自動的にコミットされる
- [x] PR作成が動作する（`gh pr create`）
- [x] PR URLがコールバックに含まれる
- [x] コンフリクト検出と通知が動作する
  - `check_for_conflicts()` でmainブランチとのコンフリクトを検出
  - callbackに`has_conflicts`と`conflicts`フィールドを追加

### フェーズ4（DB永続化）✅

- [x] `agent_worktrees` テーブルが作成されている
- [x] Worktree情報がDBに保存される
- [x] 古いworktreeが自動クリーンアップされる（TTL: 24h）
  - `CleanupExpiredWorktreesInteractor` usecase実装
  - `find_expired()` / `delete_expired()` リポジトリメソッド

### フェーズ5（API統合・エンドポイント公開）✅

- [x] Worktree APIがtachyon-apiで動作する（`/v1/agent/worktrees`）
- [x] Worker APIがtachyon-apiで動作する（`/v1/agent/workers/*`）
- [x] Tool Job作成APIで`use_worktree`パラメータが使える
  - metadataから`use_worktree: bool`を読み取り処理

### フェーズ6（UI・監視）✅

- [x] AI Studio > Worktrees画面が実装されている
- [x] 長時間worktreeのアラートが動作する
  - `AlertLongRunningWorktreesInteractor` usecase実装
  - デフォルト閾値: 12時間

### 全体完了（3パターン動作確認）

**実装・インフラ定義完了:**
- [x] フルマネージド: Terraform定義完了（`cluster/n1-aws/`）
- [x] BYO Worker: Terraform + ドキュメント完了
- [x] 開発用: docker-compose対応済み
- [x] ドキュメント更新済み

**インフラデプロイ:**
- [x] `terraform apply` 完了 ✅ 2026-01-07

**E2E動作確認:**
- [ ] フルマネージド: Lambda→SQS→ECS Workerの動作確認
- [ ] BYO Worker: Lambda→SQS→ローカルWorkerの動作確認
- [x] 開発用: ローカル→Redis→ローカルWorkerの動作確認 ✅ 2026-01-07
- [ ] hot reload問題が解消されていることを確認

### 開発用E2E動作確認結果（2026-01-07）

**環境構成:**
- DB: Docker (`compose.sqlx.yml` で port 15000 を expose)
- Redis: Docker (port 6379)
- tachyon-api: ホスト上で直接実行（`SQLX_OFFLINE=true`）
- tachyon-code worker: ホスト上で直接実行（`--repo-path` 指定）

**検証手順:**
1. `docker compose -f compose.yml -f compose.sqlx.yml up -d db redis` で DB/Redis 起動
2. tachyon-api をホストで起動（ダミー API キーで OK）
3. `tachyon-code worker --repo-path <path>` でワーカー起動
4. `POST /v1/agent/tool-jobs` で `use_worktree=true` を指定してジョブ作成

**確認結果:**
- ✅ Tool Job が正常に作成された
- ✅ Worker がジョブをピックアップした
- ✅ Worktree が作成された: `worktree_path="/path/to/repo.worktree/worktree-<job_id>"`
- ✅ Agent ブランチが作成された: `agent/task-<job_id>`
- ✅ ジョブ完了後に Worktree がクリーンアップされた
- ✅ Callback が API に送信された
- ✅ Worktree API (`GET /v1/agent/worktrees`) が空リストを返した（クリーンアップ後のため正常）

**Worker ログ抜粋:**
```
INFO Processing job job_id=01KECDPSGF39RHHA1XNCRJXD90 use_worktree=true
INFO Created worktree for job worktree_path="/.../worktree-01KECDPSGF39RHHA1XNCRJXD90" branch=agent/task-01KECDPSGF39RHHA1XNCRJXD90
INFO Cleaned up worktree job_id=01KECDPSGF39RHHA1XNCRJXD90
INFO Job completed successfully job_id=01KECDPSGF39RHHA1XNCRJXD90
INFO Callback sent successfully job_id=01KECDPSGF39RHHA1XNCRJXD90
```

**注意事項:**
- `--repo-path` なしで Worker を起動すると `use_worktree=true but no worktree manager available` 警告が出る
- Worktree はジョブ完了後に自動削除されるため、一時的にしか存在しない
- Codex CLI がインストールされていない環境では実際のコード編集は行われないが、Worktree ライフサイクルは正常に動作する

## 備考

### Lambda + ECS アーキテクチャの詳細

```
┌─────────────────────────────────────────────────────────────────┐
│  AWS Lambda (Main Agent)                                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  tachyon-api Lambda                                      │   │
│  │  - リクエストごとに独立プロセス                          │   │
│  │  - ユーザーとの対話 (REST/GraphQL)                       │   │
│  │  - Tool Job発行 → SQSへenqueue                           │   │
│  │  - 状態をDBに保存して即終了                              │   │
│  │  - コールバック受信 → resume                             │   │
│  └─────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────┘
                        │ SQS enqueue / HTTPS callback
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  AWS (Shared Infrastructure)                                    │
│  ┌──────────────────┐  ┌──────────────────────────────────┐   │
│  │  SQS             │  │  RDS Aurora (MySQL)               │   │
│  │  tool_job_queue  │  │  - agent_execution_states         │   │
│  │  - DLQ対応       │  │  - agent_tool_jobs                │   │
│  └────────┬─────────┘  │  - agent_worktrees (新規)         │   │
│           │            └──────────────────────────────────┘   │
└───────────│───────────────────────────────────────────────────────┘
            │ dequeue
            ▼
┌─────────────────────────────────────────────────────────────────┐
│  AWS ECS Fargate Spot (Tool Job Worker)                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  tool_job_worker (packages/llms/bin/tool_job_worker.rs) │   │
│  │                                                          │   │
│  │  1. Worktree作成                                         │   │
│  │     git worktree add worktree-<job_id> -b agent/task-*   │   │
│  │                                                          │   │
│  │  2. Coding Agent実行                                     │   │
│  │     Claude Code / Codex CLI でコード編集                 │   │
│  │                                                          │   │
│  │  3. CI/テスト実行                                        │   │
│  │     mise run ci (Docker-in-Docker)                       │   │
│  │                                                          │   │
│  │  4. 結果処理                                             │   │
│  │     - git diff / commit / push                           │   │
│  │     - gh pr create                                       │   │
│  │                                                          │   │
│  │  5. Callback送信                                         │   │
│  │     POST /v1/llms/agent/tool-job-callback                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Worktree Storage (EFS or Local)                         │   │
│  │  /worktrees/                                             │   │
│  │    ├── worktree-<job_id_1>/                              │   │
│  │    ├── worktree-<job_id_2>/                              │   │
│  │    └── ...                                               │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 設計ポイント

1. **Main Agent = Lambda**
   - プロセス分離によりhot reload問題が根本的に解消
   - ステートレス（状態はDBに永続化）
   - リクエストごとに独立したプロセスで実行

2. **Tool実行 = ECS Worker（既存基盤）**
   - v0.26.0で実装済みの`tool_job_worker`をそのまま活用
   - Worktree管理機能を追加
   - CI/テスト実行、PR作成まで一貫して処理

3. **Worktree分離**
   - Worker内でworktreeを作成
   - 編集はworktree内で隔離
   - 完了後にpush/PR作成

4. **進捗保存**
   - 共有DB (RDS Aurora) に状態を永続化
   - `agent_worktrees`テーブルでworktree情報を管理

5. **devcontainer対応**（オプション）
   - `.devcontainer/tool-job-worker/`で開発・デバッグ可能
   - VS Code Remote接続でreview/編集

### Worktree操作の流れ

```bash
# ECS Worker内での処理

# 1. Worktree作成
git worktree add /worktrees/worktree-<job_id> -b agent/task-<job_id>

# 2. Worktree内でCoding Agent実行
cd /worktrees/worktree-<job_id>
claude --prompt "..." --output-format stream-json
# or
codex exec --json "..."

# 3. 変更のコミット
git add -A
git commit -m "feat: <summary>"

# 4. PR作成
git push -u origin agent/task-<job_id>
gh pr create --title "..." --body "..."

# 5. Worktreeクリーンアップ
git worktree remove /worktrees/worktree-<job_id>
```

### 関連実装

**既存（v0.26.0で実装済み）**
- `apps/tachyon-api/`: tachyon-api (Main Agent のエントリーポイント)
- `packages/llms/bin/tool_job_worker.rs`: Tool Jobワーカー（Redis/SQSからジョブ取得・実行）
- `packages/llms/src/usecase/command_stack/tool_executor.rs`: coding_agent_job ツール
- `packages/llms/src/usecase/create_tool_job.rs`: Tool Job作成Usecase
- `packages/llms/src/usecase/handle_tool_job_callback.rs`: コールバック処理
- `packages/llms/src/adapter/gateway/tool/sqlx_tool_job_repository.rs`: Tool Job永続化
- `packages/queue/`: Redis Streams / SQS / SQLxベースのジョブキュー
- `packages/agents/src/runner.rs`: ToolRunner trait（ステートレス実行）
- `packages/agents/src/codex_runner.rs`: Codex CLI実行
- `packages/agents/src/claude_runner.rs`: Claude Code CLI実行
- `.devcontainer/tool-job-worker/`: ワーカー開発用devcontainer

**本タスクで新規実装**
- `packages/agents/src/worktree/`: WorktreeManager（worktree作成・管理）
- `packages/llms/bin/tool_job_worker.rs`: Worktree対応の追加
- `packages/llms/migrations/`: agent_worktrees テーブル
- `apps/tachyon/src/app/v1beta/[tenant_id]/ai/worktrees/`: Worktree一覧UI

### ローカル開発構成（Lambda + Local Worker）

開発時も本番と同様のアーキテクチャを使用する。Main AgentはLambda上で動作し、WorkerはローカルマシンのDockerで実行する。

```
┌─────────────────────────────────────────────────────────────────┐
│  AWS Cloud                                                       │
│  ┌─────────────────────┐    ┌─────────────────────┐            │
│  │  Lambda             │───▶│  SQS                │            │
│  │  Main Agent         │    │  tool_job_queue     │            │
│  │  (常にクラウド)     │    │                     │            │
│  └─────────────────────┘    └──────────┬──────────┘            │
│            ▲                           │                        │
│            │ HTTPS callback            │ HTTPS (dequeue)        │
└────────────│───────────────────────────│────────────────────────┘
             │                           │
             │                           ▼
┌────────────│───────────────────────────────────────────────────┐
│  ローカルマシン (開発者PC)                                      │
│            │                                                    │
│  ┌─────────┴───────────────────────────────────────────────┐  │
│  │  tool_job_worker (Docker)                                │  │
│  │                                                          │  │
│  │  認証: Tachyon API Key (pk_xxxxx)                        │  │
│  │  - POST /v1/agent/workers/register で登録                │  │
│  │  - SQS一時クレデンシャルを取得                           │  │
│  │  - SQS からジョブをポーリング                            │  │
│  │                                                          │  │
│  │  ユーザー提供の環境変数:                                 │  │
│  │  - CLAUDE_CODE_API_KEY: Claude Code CLI用                │  │
│  │  - CODEX_API_KEY: Codex CLI用                            │  │
│  │  - GITHUB_TOKEN: PR作成用                                │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ローカルファイルシステム:                                      │
│  /path/to/repo.worktree/                                        │
│    ├── worktree-job-001/                                        │
│    └── worktree-job-002/                                        │
└──────────────────────────────────────────────────────────────────┘
```

**メリット:**
- スマホ等からでもLambda経由で操作可能
- 実際のコード編集はローカルマシンで実行
- GitHub push もローカルの認証情報を使用
- 本番とほぼ同一のアーキテクチャで開発・テスト可能

### Worker配布とセットアップ

#### Public ECR でイメージ配布

```bash
# Public ECR リポジトリからpull（認証不要）
docker pull public.ecr.aws/tachyon/tool-job-worker:latest
```

Worker イメージには秘密情報を含まない。ユーザーは自分の認証情報を環境変数で渡す。

#### Worker起動コマンド

```bash
docker run -d \
  --name tool-job-worker \
  -e TACHYON_API_KEY=pk_xxxxx \
  -e CLAUDE_CODE_API_KEY=sk-ant-xxxxx \
  -e CODEX_API_KEY=sk-xxxxx \
  -e GITHUB_TOKEN=ghp_xxxxx \
  -v /path/to/repos:/repos \
  -v ~/.gitconfig:/root/.gitconfig:ro \
  -v ~/.ssh:/root/.ssh:ro \
  public.ecr.aws/tachyon/tool-job-worker:latest
```

**環境変数:**

| 変数名 | 必須 | 説明 |
|--------|------|------|
| `TACHYON_API_KEY` | ✅ | Tachyon Public API Key（Worker登録・SQS認証用） |
| `CLAUDE_CODE_API_KEY` | △ | Claude Code CLI用（Claude使用時） |
| `CODEX_API_KEY` | △ | Codex CLI用（Codex使用時） |
| `GITHUB_TOKEN` | △ | PR作成用（PR作成機能使用時） |

**注意:** `ANTHROPIC_API_KEY` ではなく `CLAUDE_CODE_API_KEY` を使用。LLM直接呼び出しと区別するため。

### Worker登録フロー

```yaml
# 1. Worker起動時に登録リクエスト
POST /v1/agent/workers/register
Authorization: Bearer pk_xxxxx (TACHYON_API_KEY)

# 2. APIがVerifySecretKeyで認証
# → service_account_id 取得
# → tenant_id 取得
# → Worker用ポリシーを確認

# 3. レスポンス
{
  "worker_id": "wkr_01xxx",
  "sqs_queue_url": "https://sqs.ap-northeast-1.amazonaws.com/xxx/tool-job-queue",
  "sqs_credentials": {
    "access_key_id": "ASIA...",
    "secret_access_key": "...",
    "session_token": "...",
    "expiration": "2025-01-01T12:00:00Z"
  },
  "callback_url": "https://api.tachyon.example.com",
  "heartbeat_interval_seconds": 60
}

# 4. Workerがジョブ処理開始
# - SQS一時クレデンシャルでポーリング
# - 期限切れ前に再取得（/v1/agent/workers/refresh-credentials）
```

### Worker用ポリシー

新規Action定義（`scripts/seeds/n1-seed/008-auth-policies.yaml`に追加）:

```yaml
# Action定義
- context: agents
  name: RegisterWorker
  description: Register a tool job worker instance
  resource_pattern: trn:agents:worker:*
  id: act_01wkr_register

- context: agents
  name: RefreshWorkerCredentials
  description: Refresh SQS credentials for a worker
  resource_pattern: trn:agents:worker:*
  id: act_01wkr_refresh

- context: agents
  name: ReportWorkerHeartbeat
  description: Report worker heartbeat status
  resource_pattern: trn:agents:worker:*
  id: act_01wkr_heartbeat

# Policy定義
- id: pol_01tooljobworkerpolicy
  name: ToolJobWorkerPolicy
  description: Policy for tool job worker instances
  policy_actions:
    - action_id: act_01wkr_register
      effect: allow
    - action_id: act_01wkr_refresh
      effect: allow
    - action_id: act_01wkr_heartbeat
      effect: allow
    - action_id: act_01hjryxysgey07h5jz5w00080  # llms:ToolJobCallback
      effect: allow
```

**セットアップ手順:**

1. Tachyon UI で Service Account 作成
2. Service Account に `ToolJobWorkerPolicy` を割り当て
3. Public API Key を発行
4. Worker起動時に `TACHYON_API_KEY` として使用

## 実装サマリー（2025-01-03 完了）

### 新規実装ファイル一覧

```
packages/agents/
├── src/
│   ├── sts/
│   │   └── mod.rs                              # STS一時クレデンシャル発行
│   │       - TemporaryCredentials 構造体
│   │       - CredentialIssuer trait
│   │       - StsCredentialIssuer (AWS STS AssumeRole)
│   │       - NoopCredentialIssuer (開発用)
│   │       - MockCredentialIssuer (テスト用)
│   │       - CredentialIssuerBuilder
│   ├── worktree/
│   │   ├── mod.rs                              # Worktree管理モジュール
│   │   ├── manager.rs                          # WorktreeManager
│   │   │   - create() - worktree作成
│   │   │   - list() - worktree一覧
│   │   │   - remove() - worktree削除
│   │   │   - get_diff() - diff取得
│   │   │   - push_and_create_pr() - PR作成
│   │   │   - check_for_conflicts() - コンフリクト検出
│   │   ├── entity.rs                           # WorktreeEntity
│   │   │   - is_expired() - TTL判定
│   │   │   - is_long_running() - 長時間判定
│   │   │   - age_hours() - 経過時間取得
│   │   └── repository.rs                       # WorktreeRepository trait
│   │       - save() / find_by_* / delete()
│   │       - find_expired() - 期限切れ取得
│   │       - find_long_running() - 長時間経過取得
│   │       - delete_expired() - 期限切れ削除
│   ├── usecase/
│   │   ├── list_worktrees.rs                   # Worktree一覧Usecase
│   │   ├── get_worktree.rs                     # Worktree取得Usecase
│   │   ├── cleanup_expired_worktrees.rs        # 期限切れクリーンアップUsecase
│   │   ├── alert_long_running_worktrees.rs     # 長時間アラートUsecase
│   │   ├── create_worktree.rs                  # Worktree作成Usecase
│   │   └── update_worktree_status.rs           # ステータス更新Usecase
│   └── adapter/
│       ├── axum/
│       │   ├── list_worktrees_handler.rs       # GET /v1/agent/worktrees
│       │   └── register_worker_handler.rs      # Worker登録API
│       │       - POST /v1/agent/workers/register
│       │       - POST /v1/agent/workers/{id}/heartbeat
│       │       - POST /v1/agent/workers/{id}/refresh-credentials
│       └── gateway/
│           └── sqlx_worktree_repository.rs     # SQLx実装

packages/llms/
├── migrations/
│   ├── 20251231180000_create_agent_worktrees.up.sql    # テーブル作成
│   └── 20251231180000_create_agent_worktrees.down.sql  # ロールバック
└── bin/
    └── tool_job_worker.rs                      # Worktree対応追加
        - use_worktree=true でworktree自動作成
        - コンフリクト検出とcallback通知
        - PR作成・クリーンアップ
```

### 追加した依存関係

```toml
# packages/agents/Cargo.toml
[dependencies]
aws-config = { version = "1", optional = true }
aws-sdk-sts = { version = "1", optional = true }

[features]
sts = ["dep:aws-config", "dep:aws-sdk-sts"]
```

### 追加したAPI エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/v1/agent/worktrees` | Worktree一覧取得 |
| GET | `/v1/agent/worktrees/{task_id}` | Worktree詳細取得 |
| POST | `/v1/agent/workers/register` | Worker登録 |
| POST | `/v1/agent/workers/{id}/heartbeat` | Heartbeat報告 |
| POST | `/v1/agent/workers/{id}/refresh-credentials` | クレデンシャル更新 |

### コールバックレスポンス拡張

```json
{
  "tool_job_id": "tj_xxx",
  "status": "SUCCEEDED",
  "pr_url": "https://github.com/.../pull/123",
  "worktree_used": true,
  "has_conflicts": false,
  "conflicts": [],
  "diff_stats": {
    "files_changed": 5,
    "insertions": 100,
    "deletions": 20
  }
}
```

### 残タスク（インフラ設定）✅ 2025-01-05 完了

**フルマネージド（Lambda + ECS）:**
- [x] Lambda用tachyon-apiデプロイ設定（`lambda.tf`で既に実装済み）
- [x] ECS Task Definition作成（`tool_job_worker.tf` + `modules/ecs`）
- [x] SQS Queue + DLQ設定（`sqs.tf`）
- [x] IAMロール設定（`byo_worker.tf`に追加）

**BYO Worker（ユーザー環境）:**
- [x] Public ECRリポジトリ作成（`byo_worker.tf`）
- [x] STS AssumeRole用IAMロール（`byo_worker.tf`）
- [x] Worktree環境変数追加（`tool_job_worker.tf`, `variables.tf`）
- [ ] Dockerイメージ配布（terraform apply後に実施）

**ドキュメント:**
- [x] 開発者向けセットアップガイド（`docs/src/tachyon-apps/agents/byo-worker-setup.md`）
- [x] 運用者向けインフラ構築ガイド（`docs/src/tachyon-apps/agents/infrastructure-setup.md`）
- [x] Worktree管理ガイド（`docs/src/tachyon-apps/agents/worktree-management.md`）

### 追加したTerraformファイル（2025-01-05）

```
cluster/n1-aws/
├── byo_worker.tf          # BYO Worker用インフラ（新規作成）
│   - Public ECR Repository
│   - IAM Role for STS AssumeRole
│   - IAM Policy for SQS access
│   - Lambda role attachment for AssumeRole
├── main.tf                # us_east_1 provider追加 + Bedrock IAMポリシー追加
├── variables.tf           # Worktree/BYO Worker変数追加
├── tool_job_worker.tf     # Worktree環境変数追加
└── output.tf              # BYO Worker outputs追加
```

### Dockerイメージビルド対応（2025-01-06）

**Dockerfile変更:**
- `worker-prod` ステージ追加（Tool Job Worker用）
- `cargo-chef` イメージを Rust 1.85 に更新（edition 2024対応）

```dockerfile
# worker-prod ステージ（新規追加）
FROM chef AS worker-builder
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json
COPY . .
RUN cargo build --release -p llms --bin tool_job_worker

FROM debian:12-slim AS worker-prod
RUN apt-get update && apt-get install -y openssl ca-certificates git && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=worker-builder /app/target/release/tool_job_worker /app/bin/tool_job_worker
COPY --from=worker-builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
ENTRYPOINT ["/app/bin/tool_job_worker"]
```

**修正したファイル:**
- `Dockerfile`: `worker-prod` ステージ追加、cargo-chef を 1.81 → 1.85 に更新
- `apps/library-api/Cargo.toml`: 重複 `[[test]]` 宣言を削除（cargo-chef エラー対策）

**ビルドコマンド:**
```bash
docker build --target worker-prod -t tachyon-code-worker:latest .
```

**完了ステップ:**
- [x] Dockerイメージビルド完了確認（2025-01-06）
  - `SQLX_OFFLINE=true` 環境変数追加でオフラインビルド対応

**次のステップ:**
- [x] Public ECRへpush（2025-01-06完了）
  - `public.ecr.aws/p9x8e6w3/tool-job-worker:latest`
- [ ] E2E動作確認

### Worker エントリーポイント変更計画（2025-01-06）

**方針**: `packages/llms/bin/tool_job_worker.rs` を廃止し、`apps/tachyon-code` に統合する。

**変更前:**
```bash
# 別々のバイナリ
cargo run -p llms --bin tool_job_worker  # Worker
cargo run -p tachyon-code                 # CLI/TUI
```

**変更後:**
```bash
# 統一CLI（サブコマンド方式）
tachyon-code                    # CLI モード（デフォルト）
tachyon-code --ui tui           # TUI モード
tachyon-code "Fix the bug"      # ワンショット実行
tachyon-code worker             # Tool Job Worker として起動
tachyon-code worker --queue sqs # SQS から取得
tachyon-code worker --queue redis # Redis Streams から取得
```

**メリット:**
1. **統一CLI** - 開発者は `tachyon-code` 1つを覚えればOK
2. **Dockerイメージ共通化** - エントリーポイントを `tachyon-code worker` に
3. **デバッグしやすい** - 同じコードベースで CLI でも Worker でも動く
4. **設定共通化** - `.tachyon-code.toml` で全モード設定可能

**実装タスク:**
- [x] `apps/tachyon-code/src/main.rs`: `Args` に `Subcommand` enum 追加（`chat` / `worker`）
- [x] `apps/tachyon-code/src/worker.rs`: Worker モジュール新規作成（feature flag `worker` で条件コンパイル）
- [x] `apps/tachyon-code/Cargo.toml`: Worker 依存関係を追加（queue, codex-provider, claude-code）
- [x] Dockerfile の `worker-prod` を `tachyon-code worker` に変更
- [x] `packages/llms/bin/tool_job_worker.rs` を非推奨化（deprecation notice 追加）

**実装完了（2025-01-06）:**

`tachyon-code` CLI に `worker` サブコマンドを追加し、Tool Job Worker 機能を統合した。

```bash
# CLI モード（デフォルト）
tachyon-code

# Worker モード
tachyon-code worker
tachyon-code worker --queue-type sqs
tachyon-code worker --queue-type redis --redis-url redis://localhost:6379
```

**変更ファイル:**
- `apps/tachyon-code/src/main.rs`: Subcommand enum 追加、`Command::Worker` で Worker モード起動
- `apps/tachyon-code/src/worker.rs`: 新規作成（`packages/llms/bin/tool_job_worker.rs` から移植）
- `apps/tachyon-code/Cargo.toml`: `worker` feature で依存関係を条件付きコンパイル
- `Dockerfile`: `worker-prod` ステージを `tachyon-code worker` に変更

**Docker イメージ:**
```bash
docker build --target worker-prod -t tachyon-code-worker:test .
docker run --rm tachyon-code-worker:test worker --help
```

### Feature Flag による DB 依存分離（2026-01-08）

**目的**: `tachyon-code worker` モードでは DB アクセスが不要なため、sqlx を完全に除去してビルドサイズを削減し、DB なしでの動作を可能にする。

**実装内容:**

1. **tachyon-code の feature 分離:**
   - `worker` feature: Worker モード専用（queue, codex-provider, claude-code）
   - `chat` feature: CLI/TUI 対話モード（DB 依存パッケージすべて）
   - デフォルトは両方有効 (`default = ["worker", "chat"]`)

2. **sqlx 依存のオプショナル化:**
   - `packages/errors/Cargo.toml`: `sqlx` feature でオプショナル
   - `packages/util/Cargo.toml`: `sqlx` feature でオプショナル
   - `packages/value_object/Cargo.toml`: `sqlx` feature でオプショナル
   - `packages/agents/Cargo.toml`: `api` feature で usecase module を条件コンパイル

3. **default-features = false の適用:**
   - `apps/tachyon-code/Cargo.toml`: errors, value_object, agents
   - `packages/agents/Cargo.toml`: errors, value_object, tachyon_apps
   - `packages/agents/domain/Cargo.toml`: errors, value_object
   - `packages/queue/Cargo.toml`: errors, value_object
   - `packages/providers/codex/Cargo.toml`: errors, util
   - `packages/providers/claude-code/Cargo.toml`: errors, util
   - `packages/providers/llms_provider/Cargo.toml`: errors, util

4. **条件コンパイル:**
   - `apps/tachyon-code/src/main.rs`: `#[cfg(feature = "chat")]` で DB 依存コード分離
   - `packages/agents/src/lib.rs`: `#[cfg(feature = "api")]` で usecase module 分離
   - `packages/util/src/lib.rs`: `#[cfg(feature = "sqlx")]` で mysql module 分離

**ビルド確認:**
```bash
# Worker のみビルド（sqlx なし）
cargo build -p tachyon-code --release --no-default-features --features worker
# → sqlx がコンパイルされないことを確認

# 依存関係確認
cargo tree -p tachyon-code --no-default-features --features worker | grep sqlx
# → sqlx not found
```

**結果:**
- ✅ Worker モードのビルドから sqlx を完全除去
- ✅ ビルド時間短縮（sqlx コンパイル不要）
- ✅ DB なしでも Worker が起動可能
- ✅ デフォルトビルドは従来通り動作

### Worker DB永続化 & Heartbeat/Graceful Shutdown（2026-01-08）

**目的**: Worker登録情報をDBに永続化し、Tachyonフロントエンドからワーカー状態を監視可能にする。また、heartbeat機構とgraceful shutdownを実装して、workerのライフサイクルを正しく管理する。

**実装内容:**

1. **DBマイグレーション:**
   - `packages/llms/migrations/20260108031822_add_worker_config_columns.up.sql`
   - `agent_workers`テーブルに設定用カラムを追加
     - `queue_type`, `queue_url`, `callback_url`, `heartbeat_interval_seconds`
     - `max_concurrent_jobs`, `version`, `repo_path`

2. **WorkerEntity & WorkerRepositoryトレイト:**
   - `packages/agents/domain/src/worker.rs`: WorkerEntity, WorkerId, WorkerStatus定義
   - `packages/agents/domain/src/worker_repository.rs`: WorkerRepository trait定義
     - `save()`, `find_by_id()`, `find_by_operator()`, `update_status()`, `update_heartbeat()`

3. **SqlxWorkerRepository実装:**
   - `packages/agents/src/adapter/gateway/sqlx_worker_repository.rs`
   - agent_workersテーブルとのCRUD操作実装

4. **Usecase修正・実装:**
   - `RegisterWorkerInteractor`: DB保存対応、既存ワーカーの更新（ActiveステータスはUpsert）
   - `WorkerHeartbeatInteractor`: DB更新対応（active_jobs、last_heartbeat_at）
   - `DeregisterWorkerInteractor`: 新規実装、ステータスをTerminatedに更新
   - `ListWorkersInteractor`: 新規実装、オペレーター別ワーカー一覧取得
   - `GetWorkerInteractor`: 新規実装、ワーカー詳細取得（オペレーター権限チェック付き）

5. **REST APIエンドポイント:**
   - `GET /v1/agent/workers`: ワーカー一覧
   - `GET /v1/agent/workers/:worker_id`: ワーカー詳細
   - `POST /v1/agent/workers/:worker_id/deregister`: ワーカー登録解除

6. **Worker側機能（apps/tachyon-code/src/worker.rs）:**
   - **Heartbeatループ**: バックグラウンドでAPIに定期的にハートビートを送信
   - **Graceful Shutdown**: Ctrl+C受信時にシャットダウンフラグを設定し、
     - 実行中ジョブの完了を待機（最大30秒）
     - APIにderegister呼び出し
     - ハートビートループを停止
   - **Active Jobs追跡**: AtomicU32でアクティブジョブ数をカウント

7. **Auth Actionsシード追加:**
   - `scripts/seeds/n1-seed/008-auth-policies.yaml`に以下を追加:
     - `agents:DeregisterWorker` (act_01wkrderegister00001)
     - `agents:ListWorkers` (act_01wkrlistworkers0001)
     - `agents:GetWorker` (act_01wkrgetworker000001)
   - AdminPolicyとToolJobWorkerPolicyにアクション割り当て

**ファイル変更一覧:**
```
packages/agents/
├── domain/
│   ├── src/
│   │   ├── lib.rs                     # worker, worker_repository export追加
│   │   ├── worker.rs                  # WorkerEntity, WorkerId, WorkerStatus定義
│   │   └── worker_repository.rs       # WorkerRepository trait定義（新規）
│   └── Cargo.toml                     # chrono依存追加
├── src/
│   ├── lib.rs                         # WorkerRepository export追加
│   ├── adapter/
│   │   ├── axum/
│   │   │   ├── mod.rs                 # 新APIルート追加、worker_repository引数追加
│   │   │   └── register_worker_handler.rs  # list/get/deregisterハンドラ追加
│   │   └── gateway/
│   │       ├── mod.rs                 # sqlx_worker_repository export追加
│   │       └── sqlx_worker_repository.rs  # SqlxWorkerRepository実装（新規）
│   └── usecase/
│       ├── mod.rs                     # 新usecase export追加
│       ├── register_worker.rs         # DB保存対応
│       ├── worker_heartbeat.rs        # DB更新対応
│       ├── deregister_worker.rs       # 新規実装
│       ├── list_workers.rs            # 新規実装
│       └── get_worker.rs              # 新規実装
└── Cargo.toml                         # 依存関係更新

apps/tachyon-code/
└── src/
    └── worker.rs                      # heartbeat/graceful shutdown追加

apps/tachyon-api/
├── src/router.rs                      # worker_repository引数追加
└── bin/lambda.rs                      # worker_repository引数追加

packages/llms/
└── migrations/
    ├── 20260108031822_add_worker_config_columns.up.sql   # 新規
    └── 20260108031822_add_worker_config_columns.down.sql # 新規

scripts/seeds/n1-seed/
└── 008-auth-policies.yaml             # Worker Actions追加
```

**動作確認:**
- ✅ `mise run docker-check` 成功
- ✅ `mise run docker-seed` 成功（Auth Actionsが正しくDBに投入）
- ✅ `mise run docker-sqlx-migrate` 成功（マイグレーション適用完了）
- ✅ E2E動作確認完了（2026-01-08）:
  - `POST /v1/agent/workers/register` → 201 Created、DBに保存確認済み
  - `POST /v1/agent/workers/:id/heartbeat` → 200 OK、active_jobs/last_heartbeat_at更新確認済み
  - `GET /v1/agent/workers` → 200 OK、オペレーター別ワーカー一覧取得確認済み
  - `GET /v1/agent/workers/:id` → 200 OK、ワーカー詳細取得確認済み
  - `POST /v1/agent/workers/:id/deregister` → 200 OK、ステータスがterminatedに更新確認済み

### フロントエンド Worker一覧画面（2026-01-08）

**実装内容:**

1. **APIクライアント:**
   - `apps/tachyon/src/lib/agent-workers.ts`: Worker REST API呼び出し
     - `listWorkers()`, `getWorker()` 関数
     - `WorkerStatus`, `Worker`, `WorkerListResponse` 型定義

2. **ページコンポーネント:**
   - `apps/tachyon/src/app/v1beta/[tenant_id]/ai/workers/page.tsx`: Server Component
     - `authWithCheck()` で認証・認可
     - `V1BetaSidebarHeader` でレイアウト
   - `apps/tachyon/src/app/v1beta/[tenant_id]/ai/workers/workers-client.tsx`: Client Component
     - SWRでデータフェッチ（30秒ごとに自動更新）
     - ステータスバッジ表示（Active/Idle/Unhealthy/Terminated等）
     - テーブル形式でワーカー一覧表示
       - カラム: Name, Status, Capabilities, Active Jobs, Last Heartbeat, Version
     - 相対時間表示（例: "12m ago"）

3. **サイドバー設定:**
   - `apps/tachyon/src/app/v1beta/[tenant_id]/sidebar-config.ts`:
     - Workersメニュー追加（Serverアイコン使用）
     - アクション: `agents:ListWorkers`

4. **i18n翻訳:**
   - `apps/tachyon/src/lib/i18n/v1beta-translations.ts`:
     - 英語・日本語の翻訳追加
       - ページタイトル・説明
       - テーブルカラム名
       - ステータス表示（Registered, Active, Idle, Unhealthy, Terminated）
       - サイドバーメニュー

**動作確認結果:**
- ✅ TypeScriptチェック成功 (`yarn ts --filter=tachyon`)
- ✅ ブラウザ動作確認完了
  - サイドバーにWorkersメニュー表示
  - Worker一覧ページでテーブル表示
  - ステータスバッジが適切な色で表示
  - Refreshボタンで手動更新可能
- ✅ スクリーンショット保存: `screenshots/workers-list-page.png`

### フロントエンド Worker詳細ページ（2026-01-08）

**実装内容:**

1. **ページコンポーネント:**
   - `apps/tachyon/src/app/v1beta/[tenant_id]/ai/workers/[worker_id]/page.tsx`: Server Component
     - パンくずナビゲーション（Workers > Worker Details）
   - `apps/tachyon/src/app/v1beta/[tenant_id]/ai/workers/worker-detail-client.tsx`: Client Component
     - SWRでデータフェッチ（30秒ごとに自動更新）
     - Worker情報カード（名前、ID、ステータス、Capabilities、Active Jobs、Last Heartbeat、Version）
     - 設定カード（Queue Type、Queue URL、Callback URL、Repo Path、Heartbeat Interval、Max Concurrent Jobs）
     - タイムスタンプカード（Created At、Updated At、Last Heartbeat - 相対時間+ISO形式）
     - 「Back to list」ボタン、Refreshボタン

2. **Worker一覧からのリンク追加:**
   - `workers-client.tsx`: 各行クリックで詳細ページへ遷移可能に

3. **i18n翻訳:**
   - 詳細ページ用翻訳追加（英語・日本語）

**動作確認結果:**
- ✅ TypeScriptチェック成功
- ✅ ブラウザ動作確認完了
  - 一覧から詳細ページへ遷移
  - Worker情報・設定・タイムスタンプが正しく表示
  - 「Back to list」で一覧に戻る
- ✅ スクリーンショット保存: `screenshots/worker-detail-page.png`

## 完了サマリー

本タスクで実装した機能:

1. **バックエンド（Rust）**:
   - Worker Domain Entity（`packages/agents/domain/src/worker.rs`）
   - Worker Repository（DB永続化）
   - REST API（Register、Heartbeat、List、Get、Deregister）
   - Auth Actions/Policies（`agents:RegisterWorker`等）
   - DBマイグレーション（`agent_workers`テーブル）

2. **フロントエンド（Next.js）**:
   - Worker一覧ページ（テーブル表示、30秒自動更新、ステータスバッジ）
   - Worker詳細ページ（設定・タイムスタンプ表示）
   - サイドバーメニュー追加
   - i18n翻訳（英語・日本語）

すべてのE2Eテストおよびブラウザ動作確認が完了。

### CI修正（2026-01-08）

**修正内容:**

1. **Rust未使用インポートの修正:**
   - `apps/tachyon-code/src/main.rs`:
     - 167行目: `use anyhow::Context;` を削除（`run_chat`関数内で未使用）
     - 200-202行目: `use anyhow::Context;` と `use ratatui::{backend::CrosstermBackend, Terminal};` を削除（`run_tui`関数内で未使用）

2. **Docker CI設定の修正:**
   - `mise.toml`: `docker-ci-node`タスクから`agent-app`フィルターを削除
     - 理由: Docker内に`agent-app`がコピーされていないため、turboがパッケージを見つけられなかった

3. **TypeScriptフォーマット修正:**
   - `yarn format:write --filter=tachyon`で3ファイルの自動修正:
     - `workers-client.tsx`
     - `worker-detail-client.tsx`
     - `v1beta-translations.ts`

**CI結果:**
```
=== All Rust CI checks passed! ===
=== All Node.js CI checks passed! ===
=========================================
  All CI checks passed!
=========================================
```

すべてのCIチェックがパスし、タスクが完了可能な状態となった。

### Docker Worker OAuth認証対応（2026-01-08）

**課題:**
Docker内のClaude Code CLIが「Invalid API key · Please run /login」エラーで認証できなかった。

**原因:**
- Claude Code CLIは`~/.claude/`にセッション情報を保存
- Dockerコンテナ内で非rootユーザー（`worker`）を使用
- ボリュームマウントが`/root/`を指定していたため、`worker`ユーザーからアクセスできなかった

**修正内容:**

1. **compose.ymlのボリュームマウント更新:**
   ```yaml
   volumes:
     - ~/.codex:/home/worker/.codex:cached  # /root/ → /home/worker/
     - ~/.claude:/home/worker/.claude:cached
     - ~/.gitconfig:/home/worker/.gitconfig:ro
   ```

2. **OAuth認証トークンの環境変数追加:**
   ```yaml
   environment:
     - CLAUDE_CODE_OAUTH_TOKEN=${CLAUDE_CODE_OAUTH_TOKEN}
   ```

3. **`.env`ファイルにトークン追加:**
   ```
   CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...
   ```
   - `claude setup-token`コマンドで生成（1年間有効）

**E2E動作確認:**
- ✅ Worker登録成功
- ✅ Redis Streamsからジョブ取得成功
- ✅ Claude Code CLI実行成功（"Say hello in one word" → "Hello!"）
- ✅ ファイル作成成功（`/app/repo/test-worker-output.txt`）
- ✅ Job完了コールバック送信成功

**Worker起動ログ:**
```
INFO Starting worker with config: WorkerConfig { ... }
INFO Registering worker...
INFO Worker registered successfully worker_id=wkr_01kef7wwtjxmn0g1n5s1nk3v3x
INFO Processing job job_id=01KEF97JMWJC4W1X36SQC2KD0H
INFO Job completed successfully job_id=01KEF97JMWJC4W1X36SQC2KD0H status=Completed
```

### E2E検証結果と残課題（2026-01-08）

**検証項目と結果:**

| 項目 | 結果 | 備考 |
|------|------|------|
| Worktree付きTool Job (`use_worktree=true`) | ⚠️ 部分成功 | Worktree作成は失敗、graceful fallbackで継続 |
| Workers管理API | ✅ 成功 | List/Detail/Heartbeatすべて動作確認 |
| Hot reload問題 | ❌ 未解決 | Worktree機能が必要だが現状動作せず |

#### Worktree作成失敗の詳細

**発生したエラー:**
```
WARN Failed to create worktree, continuing without it job_id=01KEDZ4MEVYMRP750NDWKMWMJK
error=InternalServerError: git worktree add failed: fatal: not a git repository: /Users/takanorifukuyama/.../worktree2
```

**原因:**
- ホスト側がgit worktreeディレクトリ（`worktree2`）
- Dockerコンテナにマウントすると、`.git`ファイルの内容がホストパスを参照
- コンテナ内からそのパスにアクセスできないため、gitがリポジトリとして認識できない

**compose.ymlの現在の設定:**
```yaml
tool-job-worker:
  volumes:
    - .:/app/repo:cached  # ホストのworktree2ディレクトリをマウント
```

**`.git`ファイルの内容（ホスト側）:**
```
gitdir: /Users/takanorifukuyama/.../tachyon-apps/.git/worktrees/worktree2
```
→ コンテナ内にこのパスは存在しない

#### Hot Reload問題の現状

**問題:**
- `tachyon-api`と`tool-job-worker`が同じソースディレクトリをマウント
- Worktreeが機能しないため、ファイル変更は`/app/repo`直下に書き込まれる
- これはホストの`apps/`や`packages/`と同じ場所
- Claude Codeがソースを編集すると、baconがホットリロードをトリガーしてしまう

**tachyon-apiのマウント:**
```yaml
volumes:
  - ./packages:/app/packages:cached
  - ./apps:/app/apps:cached
```

**tool-job-workerのマウント:**
```yaml
volumes:
  - .:/app/repo:cached  # ./apps と ./packages を含む
```

#### 解決策の提案

**案1: メインリポジトリをマウント（推奨）**
- ホストのworktreeではなく、メインリポジトリをマウント
- `.git`がディレクトリになっているため、git操作が正常に動作する
- デメリット: 開発ディレクトリと本番が同じになる

**案2: コンテナ内でリポジトリをクローン**
- `tool-job-worker`起動時にリポジトリを新規クローン
- Worktree作成が正常に機能する
- デメリット: 起動時間が長くなる、ディスク使用量増加

**案3: Worktreeの代わりにブランチ分離**
- Worktree作成の代わりに、新規ブランチを作成
- 変更はブランチにコミット、マージはPR経由
- デメリット: リアルタイム反映が難しい

**案4: 読み取り専用マウント + 別ディレクトリで作業**
- ソースは読み取り専用でマウント
- 作業用ディレクトリを別途作成してコピー
- 変更はコピー先に適用、同期は手動または別プロセス

**決定した方針: 2モード対応（2026-01-08）**

環境に応じて2つの動作モードをサポートする:

| モード | 環境 | リポジトリ | Worktree | 用途 |
|--------|------|-----------|----------|------|
| **Host Mount** | ローカル開発 | ホストとマウント共有 | ✅ 必要 | 開発時のhot reload回避 |
| **Container Clone** | 本番ECS | コンテナ専用クローン | ❌ 不要 | 本番での完全分離 |

**実装方針:**
- WorktreeManagerは引き続き必要（Host Mountモード用）
- Container Cloneモードでは、worktree作成をスキップして直接ブランチで作業
- 判断基準: `.git`がディレクトリ（通常リポジトリ）かファイル（worktree）かで自動検出
- または環境変数`WORKER_MODE=clone|mount`で明示的に指定

**現状:**
- 基本的なTool Jobは動作する（Worktreeなしでもgraceful fallback）
- Docker開発環境ではHost Mountモードだが、worktree作成が失敗する既知の制限あり
- 本番ECS環境ではContainer Cloneモードで問題なし

## 未完了項目の移管

以下はフォローアップタスクとして [Worktree分離の運用検証と残課題対応](../../../todo/agent-worktree-ops-validation/task.md) に移管。

- worktree作業の進捗可視化（UI）
- Public ECRへのDockerイメージpush / 配布確認
- `docker run ... --env TACHYON_API_KEY=pk_xxx` でWorkerが起動しSQS接続できることの検証
- フルマネージド/BYO WorkerのE2E検証
- Docker環境でのWorktree制限の解消とhot reload問題の解消確認
