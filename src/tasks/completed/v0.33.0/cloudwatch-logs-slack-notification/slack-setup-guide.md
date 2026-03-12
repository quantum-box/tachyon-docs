# AWS Chatbot Slack 連携設定ガイド

## 概要

CloudWatch Alarms を Slack に通知するための AWS Chatbot 設定手順です。

## 前提条件

- AWS アカウントへの管理者アクセス
- Slack ワークスペースの管理者権限
- Terraform が適用済み（SNS Topic が作成済み）

---

## Step 1: Slack ワークスペースの準備

### 1.1 通知用チャンネルの作成

1. Slack で新しいチャンネルを作成
   - チャンネル名: `#tachyon-ops` または `#aws-alerts`
   - プライベート/パブリックは運用方針に合わせて選択

2. チャンネル ID を取得
   - チャンネル名を右クリック → 「リンクをコピー」
   - URL の末尾（例: `C0XXXXXXX`）がチャンネル ID

---

## Step 2: AWS Chatbot で Slack ワークスペースを連携

### 2.1 AWS Chatbot コンソールにアクセス

1. AWS Console → AWS Chatbot に移動
2. 「Configure new client」をクリック
3. 「Slack」を選択

### 2.2 Slack ワークスペースを認証

1. 「Configure」をクリック
2. Slack のログイン画面が表示される
3. ワークスペースを選択してログイン
4. AWS Chatbot のアクセスを許可

### 2.3 ワークスペース ID を確認

- 設定完了後、AWS Chatbot コンソールに表示される
- Workspace ID（例: `T0XXXXXXX`）をメモ

---

## Step 3: Slack Channel Configuration の作成

### 3.1 AWS Console での設定

1. AWS Chatbot → 「Configure new channel」
2. 以下を入力:

| 項目 | 値 |
|------|-----|
| Configuration name | `tachyon-slack-alerts` |
| Slack workspace | 連携済みのワークスペースを選択 |
| Slack channel | `#tachyon-ops` のチャンネル ID |
| IAM role | `tachyon-chatbot-role`（Terraform で作成済み） |
| Channel guardrail policies | `CloudWatchLogsReadOnlyAccess` |
| Logging | `INFO` |

### 3.2 SNS Topic の紐付け

1. 「SNS topics」セクションで「Add SNS topic」
2. Region: `ap-northeast-1`
3. 以下の Topic を追加:
   - `tachyon-alert-critical`
   - `tachyon-alert-high`

### 3.3 設定を保存

「Configure」をクリックして保存

---

## Step 4: Terraform 変数の設定

### 4.1 terraform.tfvars を更新

```hcl
# Slack Alert Configuration
enable_slack_alerts = true
slack_workspace_id  = "T0XXXXXXX"  # Step 2.3 で取得した値
slack_channel_id    = "C0XXXXXXX"  # Step 1.1 で取得した値
```

### 4.2 Terraform を適用

```bash
cd cluster/n1-aws
terraform plan
terraform apply
```

---

## Step 5: 動作確認

### 5.1 テストアラームの発火

AWS Console で CloudWatch Alarm を手動で ALARM 状態に変更:

```bash
aws cloudwatch set-alarm-state \
  --alarm-name "alert-tachyon-api-error" \
  --state-value ALARM \
  --state-reason "Testing Slack notification"
```

### 5.2 Slack で通知を確認

- `#tachyon-ops` チャンネルに通知が届くことを確認
- 通知内容:
  - アラーム名
  - 状態（ALARM）
  - 理由
  - CloudWatch コンソールへのリンク

### 5.3 アラームを OK 状態に戻す

```bash
aws cloudwatch set-alarm-state \
  --alarm-name "alert-tachyon-api-error" \
  --state-value OK \
  --state-reason "Test completed"
```

---

## トラブルシューティング

### 通知が届かない場合

1. **SNS Topic のサブスクリプション確認**
   - AWS Console → SNS → Topics → 対象 Topic
   - Subscriptions タブで Chatbot が登録されているか確認

2. **IAM ロールの権限確認**
   - Chatbot ロールに必要な権限があるか確認
   - CloudWatch Logs の読み取り権限が必要

3. **Slack チャンネルの権限確認**
   - AWS Chatbot アプリがチャンネルに参加しているか確認
   - `/invite @AWS` でアプリを招待

### アラームが発火しない場合

1. **Metric Filter のパターン確認**
   - CloudWatch Logs → Log groups → Metric filters
   - フィルターパターンがログ形式に合っているか確認

2. **メトリクスデータの確認**
   - CloudWatch → Metrics → Tachyon/LogErrors
   - データポイントが記録されているか確認

---

## 参考リンク

- [AWS Chatbot User Guide](https://docs.aws.amazon.com/chatbot/latest/adminguide/what-is.html)
- [CloudWatch Alarms](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html)
- [Metric Filter Pattern Syntax](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/FilterAndPatternSyntax.html)
