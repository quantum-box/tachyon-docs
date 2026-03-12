# Tool Job Worker インフラ構築ガイド

このガイドでは、Tool Job Workerのインフラをデプロイする手順を説明します。

## アーキテクチャ概要

```
┌─────────────────────────────────────────────────────────────────┐
│  AWS Cloud                                                       │
│                                                                  │
│  ┌─────────────────────┐    ┌─────────────────────┐            │
│  │  Lambda             │───▶│  SQS Queue          │            │
│  │  (tachyon-api)      │    │  + DLQ              │            │
│  │                     │    │                     │            │
│  │  - REST/GraphQL API │    │  - 14日間保持       │            │
│  │  - Tool Job発行     │    │  - 3回リトライ      │            │
│  │  - Callback受信     │    │  - Long polling     │            │
│  └─────────────────────┘    └──────────┬──────────┘            │
│            │                           │                        │
│            │                           ▼                        │
│            │              ┌─────────────────────┐              │
│            │              │  ECS Fargate Spot   │              │
│            │              │  (Tool Job Worker)  │              │
│            │              │                     │              │
│            │              │  - 1 vCPU / 2GB RAM │              │
│            │              │  - Auto scaling     │              │
│            │◀─────────────│  - ECS Exec対応     │              │
│            │  callback    └─────────────────────┘              │
│                                                                  │
│  ┌─────────────────────┐    ┌─────────────────────┐            │
│  │  Private ECR        │    │  Public ECR         │            │
│  │  (ECS用)            │    │  (BYO Worker用)     │            │
│  └─────────────────────┘    └─────────────────────┘            │
│                                                                  │
│  ┌─────────────────────┐    ┌─────────────────────┐            │
│  │  Secrets Manager    │    │  IAM Roles          │            │
│  │  - CODEX_API_KEY    │    │  - Lambda Role      │            │
│  │  - CLAUDE_API_KEY   │    │  - ECS Task Role    │            │
│  └─────────────────────┘    │  - BYO Worker Role  │            │
│                             └─────────────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

## 前提条件

- Terraform >= 1.0
- AWS CLI が設定済み
- 適切なIAM権限（ECR, ECS, SQS, IAM, Lambda, Secrets Manager）

## Terraform変数

`remote.tfvars` に以下の変数を設定：

```hcl
# Tool Job Worker 基本設定
tool_job_worker_cpu           = 1024   # 1 vCPU
tool_job_worker_memory        = 2048   # 2 GB
tool_job_worker_desired_count = 2      # 2 tasks

# Queue設定
tool_job_queue_type           = "sqs"  # "sqs" or "redis"
tool_job_max_concurrent_jobs  = 3
tool_job_poll_interval_ms     = 2000
tool_job_max_retry_attempts   = 10

# API Keys (Secrets Manager経由)
tool_job_codex_api_key        = "sk-xxxxx"  # Codex API Key
tool_job_claude_api_key       = "sk-ant-xxxxx"  # Claude API Key

# Worktree設定
tool_job_worktree_base_path   = "/repos"
tool_job_worktree_ttl_hours   = 24
tool_job_enable_auto_worktree = true
tool_job_git_user_name        = "Tachyon Bot"
tool_job_git_user_email       = "bot@tachyon.example.com"

# BYO Worker設定
byo_worker_credential_duration_seconds = 3600  # 1時間
```

## デプロイ手順

### 1. Terraformの初期化

```bash
cd cluster/n1-aws
terraform init
```

### 2. 変更の確認

```bash
terraform plan -var-file=remote.tfvars
```

### 3. デプロイ

```bash
terraform apply -var-file=remote.tfvars
```

### 4. 出力の確認

```bash
terraform output

# 主要な出力:
# - tool_job_queue_url: SQSキューのURL
# - tool_job_worker_ecr_repository_url: Private ECR URL
# - byo_worker_public_ecr_uri: Public ECR URL
# - byo_worker_role_arn: BYO Worker用IAMロール
```

## コンポーネント詳細

### SQS Queue (`sqs.tf`)

- **Main Queue**: `tachyon-tool-job-queue`
  - Long polling (20秒)
  - Visibility timeout: 30分
  - メッセージ保持: 14日

- **Dead Letter Queue**: `tachyon-tool-job-dlq`
  - 3回リトライ後にDLQへ移動
  - CloudWatchアラーム設定済み

### ECS Task Definition (`tool_job_worker.tf`)

```hcl
module "tool_job_worker" {
  source = "./modules/ecs"

  service_name     = "tachyon-production-tool-job-worker"
  container_image  = "${aws_ecr_repository.tool_job_worker.repository_url}:latest"
  container_cpu    = 1024
  container_memory = 2048

  # Fargate Spot使用（コスト最適化）
  capacity_provider_strategy = {
    capacity_provider = "FARGATE_SPOT"
    weight            = 100
  }
}
```

### ECR Repositories (`ecr.tf`, `byo_worker.tf`)

- **Private ECR**: `tool-job-worker` - ECS用
- **Public ECR**: `public.ecr.aws/tachyon/tool-job-worker` - BYO Worker用

### IAM Roles (`byo_worker.tf`)

- **Lambda Role**: Tool Job発行、STS AssumeRole
- **ECS Task Role**: SQS操作、Secrets Manager読み取り
- **BYO Worker Role**: SQS Receive/Delete

## Dockerイメージのビルドとプッシュ

### Private ECR (ECS用)

```bash
# ログイン
aws ecr get-login-password --region ap-northeast-1 | \
  docker login --username AWS --password-stdin <account>.dkr.ecr.ap-northeast-1.amazonaws.com

# ビルド
docker build -t tool-job-worker:latest --target worker-prod .

# タグ付け
docker tag tool-job-worker:latest \
  <account>.dkr.ecr.ap-northeast-1.amazonaws.com/tool-job-worker:latest

# プッシュ
docker push <account>.dkr.ecr.ap-northeast-1.amazonaws.com/tool-job-worker:latest
```

### Public ECR (BYO Worker用)

```bash
# ログイン (us-east-1必須)
aws ecr-public get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin public.ecr.aws

# ビルド (マルチアーキテクチャ)
docker buildx build --platform linux/amd64,linux/arm64 \
  -t public.ecr.aws/tachyon/tool-job-worker:latest \
  --target worker-prod \
  --push .
```

## 監視とアラート

### CloudWatch Alarms

1. **DLQメッセージアラート**: DLQにメッセージが入った時
2. **キュー滞留アラート**: キュー内のメッセージが1時間以上滞留

### CloudWatch Logs

```bash
# ECS Workerのログを確認
aws logs tail /ecs/tachyon-production-tool-job-worker --follow
```

### ECS Exec (デバッグ)

```bash
# Workerコンテナにシェルアクセス
aws ecs execute-command \
  --cluster tachyon-production-tool-job-worker \
  --task <task-id> \
  --container tool-job-worker \
  --interactive \
  --command "/bin/bash"
```

## スケーリング

### 手動スケーリング

```bash
# Desired count変更
aws ecs update-service \
  --cluster tachyon-production-tool-job-worker \
  --service tachyon-production-tool-job-worker \
  --desired-count 5
```

### 自動スケーリング（将来実装）

- キュー深度に基づくスケーリング
- スケジュールベースのスケーリング

## コスト最適化

### Fargate Spot

- 通常料金の最大70%オフ
- 中断時は新しいタスクが自動起動

### 推奨設定

| 環境 | vCPU | Memory | Tasks | 月額推定 |
|------|------|--------|-------|----------|
| 開発 | 0.5 | 1GB | 1 | ~$15 |
| 本番 | 1 | 2GB | 2-5 | ~$50-150 |

## トラブルシューティング

### ECSタスクが起動しない

```bash
# タスクの停止理由を確認
aws ecs describe-tasks \
  --cluster tachyon-production-tool-job-worker \
  --tasks <task-arn>
```

よくある原因:
- ECRイメージが存在しない
- Secrets Managerへのアクセス権限がない
- VPCネットワーク設定の問題

### SQSメッセージが処理されない

```bash
# キューの状態を確認
aws sqs get-queue-attributes \
  --queue-url <queue-url> \
  --attribute-names All
```

よくある原因:
- IAMポリシーの不足
- Visibility timeoutが短すぎる
- Workerがクラッシュしている

## セキュリティベストプラクティス

1. **最小権限の原則**: 各ロールに必要最小限の権限のみ付与
2. **シークレット管理**: API KeyはSecrets Manager経由で注入
3. **ネットワーク分離**: Private subnet内でWorker実行
4. **監査ログ**: CloudTrailでAPI操作を記録

## 関連ドキュメント

- [BYO Worker Setup](./byo-worker-setup.md)
- [Worktree Management](./worktree-management.md)
- [Terraform Module Reference](../../../cluster/n1-aws/README.md)
