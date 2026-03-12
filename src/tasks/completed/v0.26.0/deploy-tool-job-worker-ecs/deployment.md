# Tool Job Worker ECS デプロイ手順

## 前提条件

- AWS CLI がセットアップ済み（`aws configure` 実行済み）
- Docker がインストール済み
- Terraform がインストール済み
- `cluster/n1-aws/remote.tfvars` に Claude API Key が設定済み

## デプロイフロー

```
┌─────────────────┐
│ 1. Terraform    │
│    Apply        │  ECR リポジトリ作成
└────────┬────────┘  ECS クラスター作成（イメージなしで待機）
         │
         ↓
┌─────────────────┐
│ 2. Docker       │
│    Build & Push │  イメージをビルドして ECR へプッシュ
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ 3. ECS Worker   │
│    Auto Deploy  │  イメージ検知後、自動的にタスク起動
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ 4. 動作確認      │  ログ確認、ジョブ実行テスト
└─────────────────┘
```

## ステップ1: Terraform Apply

### 1-1. ECR リポジトリ & ECS インフラ作成

```bash
cd cluster/n1-aws

# プレビュー
terraform plan -var-file=remote.tfvars

# 適用
terraform apply -var-file=remote.tfvars
```

**作成されるリソース**:
- ECR リポジトリ: `tachyon-api`
- ECS クラスター: `tachyon-production-tool-job-worker`
- ECS サービス（イメージ待機状態）
- IAM ロール、Security Group、CloudWatch Log Group
- Secrets Manager（Claude API Key）

### 1-2. ECR リポジトリ URL を取得

```bash
ECR_URL=$(terraform output -raw ecr_repository_url)
echo $ECR_URL
# 出力例: 123456789012.dkr.ecr.ap-northeast-1.amazonaws.com/tachyon-api
```

## ステップ2: Docker イメージのビルド & プッシュ

### 2-1. リポジトリルートに移動

```bash
cd /Users/takanorifukuyama/git/github.com/quantum-box/tachyon-apps.worktree/worktree2
# または
cd ../../../..
```

### 2-2. Docker イメージのビルド

```bash
# Worker 用の Dockerfile を使用してビルド
docker build -t tachyon-api:latest -f apps/tachyon-api/Dockerfile.worker .
```

**ビルド時間**: 初回は 10-20 分程度（Rust のコンパイル）
**注意**: Multi-stage build を使用しているため、最終イメージは実行バイナリのみを含む軽量なイメージになります

### 2-3. ECR にログイン

```bash
aws ecr get-login-password --region ap-northeast-1 | \
  docker login --username AWS --password-stdin ${ECR_URL}
```

### 2-4. イメージにタグ付け

```bash
docker tag tachyon-api:latest ${ECR_URL}:latest
```

### 2-5. ECR にプッシュ

```bash
docker push ${ECR_URL}:latest
```

**プッシュ時間**: 5-10 分程度（イメージサイズに依存）

## ステップ3: ECS Worker の自動デプロイ

イメージがプッシュされると、ECS サービスが自動的に以下を実行：

1. 新しいイメージを検知
2. タスク定義を更新
3. Fargate Spot でタスクを起動（desired_count = 2）
4. ヘルスチェック完了後、Worker が稼働開始

**起動時間**: 2-5 分程度

## ステップ4: 動作確認

### 4-1. ECS サービスの状態確認

```bash
aws ecs describe-services \
  --cluster tachyon-production-tool-job-worker \
  --services tachyon-production-tool-job-worker \
  --query 'services[0].{Status:status,Running:runningCount,Desired:desiredCount}' \
  --output table
```

**期待される出力**:
```
-----------------------------------
|       DescribeServices          |
+---------+----------+------------+
| Desired | Running  |  Status    |
+---------+----------+------------+
|  2      |  2       |  ACTIVE    |
+---------+----------+------------+
```

### 4-2. タスクの詳細確認

```bash
aws ecs list-tasks \
  --cluster tachyon-production-tool-job-worker \
  --service-name tachyon-production-tool-job-worker
```

### 4-3. CloudWatch ログ確認

```bash
# リアルタイムログ表示
aws logs tail /ecs/tachyon-production/tool-job-worker --follow

# 直近100行を表示
aws logs tail /ecs/tachyon-production/tool-job-worker --since 10m
```

**正常起動時のログ例**:
```
[INFO] Tool Job Worker starting...
[INFO] Redis connection established: rediss://curious-killdeer-7387.upstash.io:6379
[INFO] Callback URL: https://xxxxx.lambda-url.ap-northeast-1.on.aws/
[INFO] Polling for jobs (interval: 2000ms, max concurrent: 3)
```

### 4-4. Redis 接続確認

Worker ログで以下を確認：
- ✅ `Redis connection established`
- ✅ `Polling for jobs`
- ❌ `Connection refused` → Redis URL を確認
- ❌ `Authentication failed` → Redis 認証情報を確認

## ステップ5: ジョブ実行テスト

### 5-1. Tachyon API 経由でジョブを作成

```bash
curl -X POST "https://YOUR_LAMBDA_URL/v1/agent/tool-jobs" \
  -H "Authorization: Bearer dummy-token" \
  -H "x-operator-id: tn_01hjjn348rn3t49zz6hvmfq67p" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "claude",
    "prompt": "Write a simple hello world in Python",
    "metadata": {}
  }'
```

### 5-2. ジョブ処理を確認

CloudWatch ログで以下の流れを確認：

```
[INFO] Job dequeued: job_xxxxxxxxx
[INFO] Executing Claude Code CLI...
[INFO] Claude output: [Python code...]
[INFO] Job completed successfully
[INFO] Callback sent to API
```

### 5-3. ジョブ結果を取得

```bash
curl "https://YOUR_LAMBDA_URL/v1/agent/tool-jobs/JOB_ID" \
  -H "Authorization: Bearer dummy-token" \
  -H "x-operator-id: tn_01hjjn348rn3t49zz6hvmfq67p"
```

## トラブルシューティング

### Worker が起動しない

**原因**: イメージが見つからない、IAM 権限不足

```bash
# タスクの詳細エラーを確認
TASK_ARN=$(aws ecs list-tasks --cluster tachyon-production-tool-job-worker --query 'taskArns[0]' --output text)
aws ecs describe-tasks --cluster tachyon-production-tool-job-worker --tasks $TASK_ARN
```

**よくあるエラー**:
- `CannotPullContainerError`: ECR にイメージが存在しない → ステップ2を確認
- `TaskFailedToStart`: IAM 実行ロールの権限不足 → Terraform の IAM 設定を確認

### Redis 接続エラー

**ログ**: `Connection refused` または `ECONNREFUSED`

**確認事項**:
1. Security Group の Egress ルールで 443, 6379 が許可されているか
2. `remote.tfvars` の `tool_job_redis_url` が正しいか
3. Upstash Redis が稼働しているか

```bash
# Worker の Security Group を確認
aws ec2 describe-security-groups \
  --filters "Name=tag:Name,Values=*tool-job-worker*" \
  --query 'SecurityGroups[0].{Egress:IpPermissionsEgress}'
```

### ジョブが処理されない

**原因**: Worker は起動しているが、ジョブを取得できない

**確認事項**:
1. Tachyon API が同じ Redis URL を使用しているか
2. Feature Flag `context.agents` が有効化されているか
3. キュー名が一致しているか（デフォルト: `tool-jobs`）

```bash
# Redis のキューを直接確認（redis-cli がインストール済みの場合）
redis-cli -u "rediss://default:PASSWORD@curious-killdeer-7387.upstash.io:6379" LLEN tool-jobs
```

### Callback エラー

**ログ**: `Failed to send callback: 403 Forbidden`

**原因**: Lambda の認証設定

**対処**:
- Lambda Function URL の `authorization_type` が `NONE` になっているか確認
- または、Worker が適切な認証トークンを送信しているか確認

## イメージ更新手順

新しいコードをデプロイする場合：

```bash
# 1. リポジトリルートで最新コードをビルド
docker build -t tachyon-api:latest -f apps/tachyon-api/Dockerfile.worker .

# 2. タグ付け（新しいバージョンタグも推奨）
docker tag tachyon-api:latest ${ECR_URL}:latest
docker tag tachyon-api:latest ${ECR_URL}:v1.2.3

# 3. プッシュ
docker push ${ECR_URL}:latest
docker push ${ECR_URL}:v1.2.3

# 4. ECS サービスを強制更新（latest タグの場合のみ必要）
aws ecs update-service \
  --cluster tachyon-production-tool-job-worker \
  --service tachyon-production-tool-job-worker \
  --force-new-deployment
```

## スケーリング

### Worker 数を変更

`cluster/n1-aws/remote.tfvars` または `variables.tf` で：

```hcl
# デフォルトは2台
tool_job_worker_desired_count = 4  # 4台に増やす
```

```bash
terraform apply -var-file=remote.tfvars
```

### リソースを変更

```hcl
tool_job_worker_cpu    = 2048  # 2 vCPU
tool_job_worker_memory = 4096  # 4 GB
```

## コスト管理

### 現在のコスト試算（2台構成）

- **Fargate Spot**: 1 vCPU, 2GB RAM, 2台
  - 月額: 約 $7 USD
- **CloudWatch Logs**: 数百MB程度
  - 月額: 約 $0.50 USD
- **Secrets Manager**: 1シークレット
  - 月額: $0.40 USD

**合計**: 約 $8 USD/月

### コスト削減

1. **必要時のみ起動**: `desired_count = 0` で停止
2. **ログ保持期間を短縮**: CloudWatch Logs の retention を調整
3. **Spot 中断対策**: 重要なジョブは On-Demand にフォールバック

## モニタリング

### CloudWatch メトリクス

```bash
# CPU 使用率
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ServiceName,Value=tachyon-production-tool-job-worker \
              Name=ClusterName,Value=tachyon-production-tool-job-worker \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average
```

### アラート設定（推奨）

- タスク数が 0 になった（Worker が停止）
- CPU/メモリ使用率が 80% を超えた
- エラーログが急増した

## リソースの削除

デプロイを取り消す場合：

```bash
# ECS サービスを停止
aws ecs update-service \
  --cluster tachyon-production-tool-job-worker \
  --service tachyon-production-tool-job-worker \
  --desired-count 0

# Terraform で削除
terraform destroy -var-file=remote.tfvars -target=module.tool_job_worker

# ECR イメージも削除する場合
terraform destroy -var-file=remote.tfvars -target=aws_ecr_repository.tachyon_api
```

## 参考リンク

- [AWS ECS Fargate Spot ドキュメント](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-capacity-providers.html)
- [Upstash Redis ドキュメント](https://docs.upstash.com/redis)
- [Claude Code CLI ドキュメント](https://docs.anthropic.com/claude/docs/claude-code)
