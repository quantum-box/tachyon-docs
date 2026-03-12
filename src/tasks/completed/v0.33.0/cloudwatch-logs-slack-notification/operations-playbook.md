# CloudWatch アラート運用プレイブック

## 概要

本プレイブックは、CloudWatch Alarm から Slack に通知されたアラートへの対応手順を定義します。

---

## アラート重要度と対応時間

| 重要度 | アラーム名パターン | 対応開始目標 | エスカレーション |
|--------|-------------------|--------------|------------------|
| Critical | `*-critical` | 5分以内 | 即時オンコール |
| High | `*-error` | 30分以内 | 1時間経過で上長 |
| Medium | `*-warn` | 4時間以内 | 翌営業日 |

---

## Critical アラート対応

### PANIC / FATAL / SIGSEGV

**症状**: アプリケーションがクラッシュ、プロセスが異常終了

**初動対応**:
1. CloudWatch Logs で該当ログを確認
   ```
   # Log Insights クエリ
   fields @timestamp, @message
   | filter @message like /PANIC|FATAL|SIGSEGV/
   | sort @timestamp desc
   | limit 50
   ```

2. 影響範囲の確認
   - 該当サービスの API レスポンス確認
   - 関連サービスへの影響確認

3. 緊急対応
   - **Lambda**: 前バージョンにロールバック
     ```bash
     aws lambda update-function-code \
       --function-name lambda-tachyon-api \
       --s3-bucket <bucket> \
       --s3-key <previous-version-key>
     ```
   - **ECS**: タスク再起動
     ```bash
     aws ecs update-service \
       --cluster tachyon-n1-prod-tool-job-worker \
       --service tachyon-n1-prod-tool-job-worker \
       --force-new-deployment
     ```

4. 根本原因調査
   - スタックトレースの確認
   - 直近のデプロイ変更確認
   - 外部依存（DB, 外部 API）の状態確認

---

## High アラート対応

### Application Error (ERROR level)

**症状**: アプリケーションレベルのエラーが閾値を超えて発生

**初動対応**:
1. エラーログの確認
   ```
   # Log Insights クエリ
   fields @timestamp, @message
   | filter @message like /ERROR|"level":"error"/
   | sort @timestamp desc
   | limit 100
   ```

2. エラーパターンの分析
   - 特定のエンドポイントに集中しているか
   - 特定のユーザー/テナントに集中しているか
   - 時間帯による傾向

3. 一時対応
   - 問題のあるエンドポイントの一時無効化
   - フィーチャーフラグによる機能無効化
   - レート制限の調整

4. 恒久対応
   - バグ修正 PR の作成
   - 修正デプロイ
   - アラーム解除の確認

---

## サービス別トラブルシューティング

### Tachyon API

**よくある問題**:
- DB 接続タイムアウト
- 外部 LLM API エラー（OpenAI, Anthropic）
- 認証エラー（Cognito）

**確認ポイント**:
```bash
# Lambda 設定確認
aws lambda get-function-configuration \
  --function-name lambda-tachyon-api

# 環境変数の確認（センシティブ情報は除外）
aws lambda get-function-configuration \
  --function-name lambda-tachyon-api \
  --query 'Environment.Variables.{DATABASE_URL: DATABASE_URL, RUST_LOG: RUST_LOG}'
```

### Library API

**よくある問題**:
- Parquet ファイル読み込みエラー
- S3 アクセス権限エラー
- 大量データ処理によるタイムアウト

**確認ポイント**:
```bash
# S3 バケットアクセス確認
aws s3 ls s3://tachyon-library-parquet-production/

# Lambda タイムアウト設定確認
aws lambda get-function-configuration \
  --function-name lambda-library-api \
  --query 'Timeout'
```

### Tool Job Worker

**よくある問題**:
- SQS メッセージ処理失敗
- 外部 CLI ツール実行エラー
- Git 操作エラー

**確認ポイント**:
```bash
# ECS タスク状態確認
aws ecs describe-tasks \
  --cluster tachyon-n1-prod-tool-job-worker \
  --tasks $(aws ecs list-tasks --cluster tachyon-n1-prod-tool-job-worker --query 'taskArns[0]' --output text)

# SQS Dead Letter Queue 確認
aws sqs get-queue-attributes \
  --queue-url <dlq-url> \
  --attribute-names ApproximateNumberOfMessages
```

---

## エスカレーションフロー

```
┌─────────────┐     5分超過     ┌─────────────┐
│  Slack 通知  │────────────────▶│ オンコール   │
└─────────────┘                 └──────┬──────┘
                                       │
                                  30分超過
                                       ▼
                                ┌─────────────┐
                                │ チームリード │
                                └──────┬──────┘
                                       │
                                  1時間超過
                                       ▼
                                ┌─────────────┐
                                │ 技術責任者   │
                                └─────────────┘
```

---

## アラーム抑制・調整

### 一時的な抑制

計画メンテナンス時など:
```bash
# アラームを無効化
aws cloudwatch disable-alarm-actions \
  --alarm-names "alert-tachyon-api-critical" "alert-tachyon-api-error"

# メンテナンス後に有効化
aws cloudwatch enable-alarm-actions \
  --alarm-names "alert-tachyon-api-critical" "alert-tachyon-api-error"
```

### 閾値の調整

Terraform で閾値を変更:
```hcl
module "tachyon_api_alerts" {
  source = "./modules/cloudwatch_alert"
  # ...
  error_threshold = 5  # 3 から 5 に変更
}
```

---

## 週次レビューチェックリスト

- [ ] 過去7日間のアラーム発火回数を確認
- [ ] 誤検知（False Positive）の有無を確認
- [ ] 閾値の調整が必要か検討
- [ ] 新しいログパターンの追加が必要か確認
- [ ] 対応ログを Notion/Issue に記録

---

## 連絡先

| 役割 | 連絡先 |
|------|--------|
| 一次対応 | Slack: #tachyon-ops |
| オンコール | PagerDuty（設定時） |
| 技術責任者 | @tech-lead |
