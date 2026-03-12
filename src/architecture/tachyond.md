# Tachyond Architecture

## 概要

Tachyond（旧 Tool Job Worker）は、ローカルデーモンおよびクラウドワーカーとして動作し、Tool Jobsの処理、リソース管理、コンテナオーケストレーションを担います。バックグラウンドでAIコーディングツール（OpenCode、Codex CLI、Claude Code CLI）を実行し、非同期でタスクを処理します。AWS ECS Fargate Spotで動作し、コスト効率と可用性を両立しています。

## アーキテクチャ

```
┌─────────────────┐
│  Tachyon API    │
│  (REST/GraphQL) │
└────────┬────────┘
         │ enqueue
         ▼
┌─────────────────────────┐
│  Job Queue              │
│  - Redis (dev)          │
│  - AWS SQS (production) │
└────────┬────────────────┘
         │ dequeue
         ▼
┌─────────────────────────┐
│  Tool Job Worker (ECS)  │
│  - Fargate Spot         │
│  - ARM64 (Graviton)     │
│  - 2台構成              │
└────────┬────────────────┘
         │ callback
         ▼
┌─────────────────┐
│  Tachyon API    │
│  (Callback)     │
└─────────────────┘
```

## コンポーネント

### 1. Job Queue

#### 開発環境: Redis
- **プロバイダー**: Local Redis (Docker Compose)
- **URL**: `redis://localhost:6379`
- **特徴**: シンプル、ローカル開発に最適

#### 本番環境: AWS SQS
- **プロバイダー**: AWS SQS Standard Queue
- **Queue URL**: `https://sqs.ap-northeast-1.amazonaws.com/.../tool-job-queue`
- **DLQ**: リトライ失敗時の Dead Letter Queue
- **コスト**: $0/月（無料枠内で運用可能）
- **特徴**:
  - 完全マネージド
  - IAM認証
  - 高可用性

### 2. Worker Service

#### プラットフォーム
- **サービス**: AWS ECS Fargate Spot
- **アーキテクチャ**: ARM64 (Graviton2)
- **リージョン**: ap-northeast-1 (東京)
- **コスト**: 約 $6.65/月（2台構成）
  - Fargate Spot: 67%のコスト削減
  - CPU: 1 vCPU @ $0.00373/hour
  - Memory: 2 GB @ $0.00082/hour

#### コンテナ仕様
- **イメージ**: `418272779906.dkr.ecr.ap-northeast-1.amazonaws.com/tool-job-worker:latest`
- **ベースイメージ**: Debian 12 slim
- **サイズ**: 198MB（未圧縮）/ 45.5MB（圧縮）
- **ビルド**: Multi-stage Docker build（`worker-prod`ターゲット）
- **バイナリ**: `/app/bin/tool_job_worker`

#### スケーリング
- **希望台数**: 2台
- **最小**: 1台
- **最大**: 5台
- **同時実行**: 3 jobs/worker × 2台 = 6 jobs

### 3. 環境変数

```yaml
# キュー選択
QUEUE_TYPE: "sqs"  # "redis" or "sqs"

# Redis設定（開発環境）
REDIS_URL: "redis://localhost:6379"

# SQS設定（本番環境）
AWS_SQS_QUEUE_URL: "https://sqs.ap-northeast-1.amazonaws.com/.../tool-job-queue"

# 共通設定
CALLBACK_URL: "https://api.tachyon.example.com"
TOOL_JOB_OPERATOR_ID: "tn_01hjjn348rn3t49zz6hvmfq67p"
MAX_CONCURRENT_JOBS: 3
POLL_INTERVAL_MS: 2000
RUST_LOG: "info"
```

## デプロイメント

### ビルド

```bash
# Dockerイメージのビルド
docker build \
  --file apps/tachyon-api/Dockerfile \
  --target worker-prod \
  --tag tool-job-worker:latest \
  --build-arg SQLX_OFFLINE=true \
  .
```

### ECRへのプッシュ

```bash
# ECRログイン
aws ecr get-login-password --region ap-northeast-1 | \
  docker login --username AWS --password-stdin \
  418272779906.dkr.ecr.ap-northeast-1.amazonaws.com

# タグ付け
docker tag tool-job-worker:latest \
  418272779906.dkr.ecr.ap-northeast-1.amazonaws.com/tool-job-worker:latest

# プッシュ
docker push \
  418272779906.dkr.ecr.ap-northeast-1.amazonaws.com/tool-job-worker:latest
```

### Terraformデプロイ

```bash
cd cluster/n1-aws

# 初期化
terraform init

# プラン確認
terraform plan

# 適用
terraform apply
```

### GitHub Actions

ワークフロー: `.github/workflows/tool-job-worker-docker-release.yml`

1. Dockerイメージのビルド（`worker-prod`ターゲット）
2. ECRへのプッシュ
3. ECSサービスの強制デプロイメント

## 運用

### ログ確認

```bash
# CloudWatch Logs
aws logs tail /ecs/tool-job-worker --follow --region ap-northeast-1

# 特定のタスクのログ
aws ecs list-tasks --cluster <cluster-name> --service-name tool-job-worker
aws logs get-log-events --log-group-name /ecs/tool-job-worker --log-stream-name <stream>
```

### サービス状態確認

```bash
# ECSサービスの状態
aws ecs describe-services \
  --cluster <cluster-name> \
  --services tool-job-worker \
  --region ap-northeast-1

# タスク一覧
aws ecs list-tasks \
  --cluster <cluster-name> \
  --service-name tool-job-worker \
  --region ap-northeast-1
```

### スケーリング

```bash
# 手動スケーリング
aws ecs update-service \
  --cluster <cluster-name> \
  --service tool-job-worker \
  --desired-count 3 \
  --region ap-northeast-1
```

### デプロイ更新

```bash
# 新しいイメージで強制デプロイ
aws ecs update-service \
  --cluster <cluster-name> \
  --service tool-job-worker \
  --force-new-deployment \
  --region ap-northeast-1
```

## 監視

### CloudWatch Metrics

- **CPUUtilization**: CPU使用率
- **MemoryUtilization**: メモリ使用率
- **RunningTaskCount**: 実行中タスク数

### CloudWatch Alarms

1. **DLQ監視**: Dead Letter Queueにメッセージが蓄積されたら通知
2. **キュー滞留監視**: メッセージが一定時間以上滞留したら通知
3. **Worker健全性**: 実行中タスク数が0になったら通知

## セキュリティ

### ネットワーク
- **配置**: Private subnet
- **外部通信**: NAT Gateway経由
- **セキュリティグループ**: Egress のみ許可（すべてのアウトバウンド）

### 認証情報
- **管理**: AWS Secrets Manager
- **IAM**: Task Role で最小権限
- **環境変数**: Secrets Managerから注入

### 通信
- **API Callback**: HTTPS（TLS 1.2+）
- **SQS**: IAM認証

## パフォーマンス

### レスポンス時間
- **ジョブ処理時間**: 5-30分/ジョブ（CLI実行時間に依存）
- **キュー待ち時間**: 平均 < 1分
- **Callback レスポンス**: < 1秒

### スループット
- **同時実行数**: 6 jobs（3 jobs/worker × 2台）
- **1日あたり処理量**: 約 288 jobs（平均10分/job想定）

## トラブルシューティング

### Worker が起動しない

1. CloudWatch Logs でエラー確認
2. タスク定義の環境変数を確認
3. IAM Role の権限を確認

### ジョブが処理されない

1. SQS Queue にメッセージが溜まっているか確認
2. Worker のログで dequeue エラーを確認
3. DLQ にメッセージが移動していないか確認

### Spot 中断

- Fargate Spot の中断は自動的に再起動されます
- 処理中のジョブは SQS の visibility timeout により自動的に再キューイングされます

## 関連ドキュメント

- [タスクドキュメント](../tasks/completed/v0.26.0/deploy-tool-job-worker-ecs/task.md)
- [デプロイメントガイド](../tasks/completed/v0.26.0/deploy-tool-job-worker-ecs/deployment.md)
- [Tool Job API仕様](../tachyon-apps/llms/tool-jobs.md)
- [Feature Flag仕様](../tachyon-apps/feature-flags.md)

## バージョン履歴

### v0.26.0 (2025-12-30)
- 初回リリース
- ECS Fargate Spot デプロイ
- SQS実装
- ARM64 (Graviton) 対応
- Multi-stage Docker build
