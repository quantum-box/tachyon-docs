---
title: "CloudWatch Logs のエラー通知を Slack へ連携する仕組み検討"
type: "infrastructure"
emoji: "📣"
topics:
  - AWS
  - CloudWatch Logs
  - Slack
  - Monitoring
published: true
targetFiles:
  - cluster/n1-aws/cloudwatch_alert.tf
  - cluster/n1-aws/modules/cloudwatch_alert
github: https://github.com/quantum-box/tachyon-apps/blob/main/docs/src/tasks/infrastructure/cloudwatch-logs-slack-notification/task.md
---

# CloudWatch Logs のエラー通知を Slack へ連携する仕組み検討

## 概要

CloudWatch Logs に出力されるエラーイベントを検知し、Slack の指定チャンネルへリアルタイム通知するための監視・通知基盤を整備する。

## 背景・目的

- API やバッチの障害時に気づくまでのタイムラグが大きく、迅速な復旧対応が難しい。
- 現状は CloudWatch コンソールでの目視確認に依存しており、エラー集計やアラート条件が統一されていない。
- Slack に集約した運用通知経路を構築することで、当番外のメンバーも即座に状況を把握できるようにする。

## 詳細仕様

### 機能要件

1. CloudWatch Logs に含まれる `ERROR` / `Exception` などのパターンを検知し、閾値を超えた場合にアラームを発火する。
2. アラーム発火時に Slack の運用チャンネルへメッセージを送信し、ロググループ名・エラー件数・直近のログサンプルへのリンクを含める。
3. 対象ロググループをサービス単位で拡張可能にし、Terraform/CloudFormation などの IaC で管理する。

### 非機能要件

- 通知遅延: 2 分以内（CloudWatch メトリクス集計間隔 + SNS/Chatbot 伝播時間）。
- 冗長化: 単一リージョン障害に備えて、重要サービスは別リージョンにもメトリクス転送するオプションを検討。
- 運用性: 通知が集中する際にサプレッションや重複抑制を設定し、Slack のノイズを最小化する。

### コンテキスト別の責務

```yaml
contexts:
  observability:
    description: "CloudWatch Logs/Metric/Alarm 管理"
    responsibilities:
      - ログフィルタ・メトリクス変換の定義
      - CloudWatch アラームの閾値設計
      - 障害検知ルールのレビューサイクル
  platform:
    description: "通知経路と ChatOps 運用"
    responsibilities:
      - AWS Chatbot (Slack) 設定
      - SNS トピック・IAM 権限管理
      - Slack ワークスペース側の App 権限調整
  product-team:
    description: "サービス固有のルール整備"
    responsibilities:
      - ログ出力フォーマットの統一
      - 重要エラーの分類とサプレッション条件指定
      - 運用チャンネルでの一次対応フロー整備
```

### 仕様のYAML定義

```yaml
cloudwatch_slack_alert:
  detection_patterns:
    - name: "application-error"
      filter: "?ERROR ?Error ?Exception ?\"level\":\"error\""
      sample_logs: 20
  metric_filters:
    namespace: "Tachyon/LogErrors"
    value: "1"
    period: 60
    evaluation_periods: 1
    threshold: 1
    statistic: "Sum"
  alarm_actions:
    - sns_topic: "arn:aws:sns:ap-northeast-1:123456789012:tachyon-slack-alert"
  slack_channels:
    - name: "#tachyon-ops"
      chatbot_client: "tachyon-chatbot"
      notify_on:
        - ALARM
        - OK
  suppression_rules:
    - name: "batch-nightly"
      quiet_times:
        start: "02:00"
        end: "03:00"
      max_notifications_per_hour: 2
```

## 実装方針

- 検知: CloudWatch Logs のメトリックフィルタで `ERROR` 系ログをカウントし、CloudWatch アラームを作成する。閾値は初期値 1 件/分とし、サービスごとに調整可能にする。
- 通知経路: アラームアクションに SNS トピックを設定し、AWS Chatbot (Amazon Q Developer for Slack) を経由して Slack channel へ投稿する。
- 詳細通知: Chatbot からのメッセージには、Log Insights で該当時間帯のクエリを開く deeplink を含める。必要に応じて Lambda 関数をサブスクライブさせ、整形メッセージを添付する拡張を検討する。
- IaC: 既存の Terraform モジュール (`infra/aws/cloudwatch`, `infra/aws/chatbot`) にリソース追加。アラーム定義は JSON ではなく Terraform module 化し、ロググループ定義と紐付ける。
- 代替案: 低遅延で個別ログ全文を Slack に送る必要がある場合、CloudWatch Logs subscription filter → Lambda → Slack Incoming Webhook の構成も準備する。

## 対象ロググループ棚卸し結果（2025-01-16）

### Lambda 関数ログ
| ロググループ | サービス | 保持期間 | 優先度 |
|-------------|----------|----------|--------|
| `/aws/lambda/lambda-tachyon-api` | Tachyon API | 30日 | 高 |
| `/aws/lambda/lambda-library-api` | Library API | 30日 | 高 |
| `/aws/lambda/lambda-library-api-dev` | Library API (Dev) | 30日 | 低 |
| `/aws/lambda/lambda-bakuure-api` | Bakuure API | 30日 | 高 |

### API Gateway アクセスログ
| ロググループ | サービス | 保持期間 | 優先度 |
|-------------|----------|----------|--------|
| `/aws/apigateway/tachyon-http-api` | Tachyon HTTP API | 30日 | 中 |

### ECS サービスログ
| ロググループ | サービス | 保持期間 | 優先度 |
|-------------|----------|----------|--------|
| `/ecs/tachyon-n1-prod-tool-job-worker` | Tool Job Worker | 7日 | 高 |

### 合計: 6 ロググループ（うち高優先度: 4）

---

## エラー分類と通知優先度

### 重要度分類

| 重要度 | パターン | 例 | 通知頻度 |
|--------|----------|-----|----------|
| Critical | `PANIC`, `FATAL` | プロセスクラッシュ、DB接続断 | 即時（1件でも通知） |
| High | `ERROR`, `level":"error"` | 業務エラー、API 500エラー | 1分間で3件以上 |
| Medium | `WARN`, `level":"warn"` | 非推奨機能使用、レート制限 | 5分間で10件以上 |
| Low | `timeout`, `retry` | リトライ可能な一時エラー | 集計のみ（通知なし） |

### サービス別通知設定

| サービス | Critical | High | Medium | 備考 |
|----------|----------|------|--------|------|
| Tachyon API | ✅ | ✅ | 週次レポート | 本番メイン API |
| Library API | ✅ | ✅ | 週次レポート | 本番サービス |
| Bakuure API | ✅ | ✅ | 週次レポート | 本番サービス |
| Library API Dev | ✅ | ❌ | ❌ | 開発環境 |
| Tool Job Worker | ✅ | ✅ | ❌ | ジョブ実行基盤 |
| API Gateway | ❌ | 5xx集計 | ❌ | アクセスログ |

---

## アーキテクチャ設計（フェーズ2）

### 全体構成図

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│ CloudWatch Logs │────▶│ Metric Filter    │────▶│ CloudWatch  │
│ (各サービス)     │     │ (エラーパターン)  │     │ Metric      │
└─────────────────┘     └──────────────────┘     └──────┬──────┘
                                                        │
                                                        ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│ Slack Channel   │◀────│ AWS Chatbot      │◀────│ CloudWatch  │
│ #tachyon-ops    │     │ (Slack 連携)     │     │ Alarm       │
└─────────────────┘     └──────────────────┘     └──────┬──────┘
                                                        │
                                                        ▼
                                                 ┌─────────────┐
                                                 │ SNS Topic   │
                                                 └─────────────┘
```

### Metric Filter 設計

#### 共通フィルターパターン

```hcl
# Critical エラー（即時通知）
critical_filter_pattern = "[PANIC, FATAL, \"panic:\", \"SIGSEGV\"]"

# Application エラー（閾値通知）
error_filter_pattern = "?ERROR ?\"level\":\"error\" ?\"level\": \"error\""

# 5xx HTTP エラー（API Gateway用）
http_5xx_pattern = "{ $.status >= 500 }"
```

#### Alarm 閾値設定

| 重要度 | Period | EvaluationPeriods | Threshold | Statistic | 備考 |
|--------|--------|-------------------|-----------|-----------|------|
| Critical | 60秒 | 1 | 1 | Sum | 1件でも即時通知 |
| High | 60秒 | 1 | 3 | Sum | 1分間に3件以上 |
| Medium | 300秒 | 1 | 10 | Sum | 5分間に10件以上 |

### SNS / Chatbot 構成

#### SNS Topic 設計

| Topic名 | 用途 | Subscriber |
|---------|------|------------|
| `tachyon-alert-critical` | Critical アラート | AWS Chatbot |
| `tachyon-alert-high` | High アラート | AWS Chatbot |
| `tachyon-alert-digest` | 週次ダイジェスト | Lambda → Slack |

#### AWS Chatbot 設定

```yaml
chatbot_configuration:
  workspace_id: "${slack_workspace_id}"
  channel_id: "${slack_channel_id}"
  sns_topic_arns:
    - "arn:aws:sns:ap-northeast-1:${account_id}:tachyon-alert-critical"
    - "arn:aws:sns:ap-northeast-1:${account_id}:tachyon-alert-high"
  guardrail_policies:
    - "arn:aws:iam::aws:policy/CloudWatchLogsReadOnlyAccess"
  logging_level: "INFO"
```

### IAM ポリシー設計

#### AWS Chatbot ロール

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CloudWatchLogsRead",
      "Effect": "Allow",
      "Action": [
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams",
        "logs:GetLogEvents",
        "logs:StartQuery",
        "logs:GetQueryResults"
      ],
      "Resource": "arn:aws:logs:ap-northeast-1:*:log-group:/aws/lambda/*"
    },
    {
      "Sid": "CloudWatchAlarmsRead",
      "Effect": "Allow",
      "Action": [
        "cloudwatch:DescribeAlarms",
        "cloudwatch:GetMetricData"
      ],
      "Resource": "*"
    }
  ]
}
```

### Terraform モジュール構造

```
cluster/n1-aws/
├── cloudwatch_alert.tf           # メイン定義ファイル
├── modules/
│   └── cloudwatch_alert/
│       ├── main.tf               # Metric Filter + Alarm
│       ├── variables.tf          # 入力変数
│       ├── outputs.tf            # 出力
│       └── sns.tf                # SNS Topic + Chatbot
└── variables.tf                  # プロジェクト変数に追加
```

#### モジュール使用例

```hcl
module "lambda_tachyon_api_alerts" {
  source = "./modules/cloudwatch_alert"

  log_group_name = "/aws/lambda/lambda-tachyon-api"
  service_name   = "tachyon-api"

  enable_critical_alert = true
  enable_error_alert    = true
  error_threshold       = 3

  sns_topic_arn = aws_sns_topic.tachyon_alert_high.arn
  tags          = local.service_tags.tachyon
}
```

---

## 実装ノート（2025-01-16）

### 作成したファイル

| ファイル | 説明 |
|----------|------|
| `cluster/n1-aws/modules/cloudwatch_alert/main.tf` | メトリックフィルターとアラーム定義 |
| `cluster/n1-aws/modules/cloudwatch_alert/variables.tf` | モジュール入力変数 |
| `cluster/n1-aws/modules/cloudwatch_alert/outputs.tf` | モジュール出力 |
| `cluster/n1-aws/cloudwatch_alert.tf` | SNS Topic、Chatbot IAM、各サービスのアラート定義 |
| `cluster/n1-aws/variables.tf` | Slack関連変数を追加 |

### 適用方法

1. **Slack Workspace連携（AWS Console）**:
   - AWS Chatbot コンソールで Slack workspace を連携
   - `slack_workspace_id` を取得
   - Slack側で対象チャンネルを作成し、`slack_channel_id` を取得

2. **Terraform変数の設定**:
   ```hcl
   # terraform.tfvars に追加
   enable_slack_alerts = true
   slack_workspace_id  = "T0XXXXXXX"
   slack_channel_id    = "C0XXXXXXX"
   ```

3. **Terraformの適用**:
   ```bash
   cd cluster/n1-aws
   terraform plan
   terraform apply
   ```

4. **AWS Chatbot Slack Channel 設定（Console）**:
   - 現時点では `awscc` プロバイダによる自動設定は未実装
   - AWS Console で手動で Slack Channel Configuration を作成
   - 作成した SNS Topic を Chatbot に紐付け

### 追加ドキュメント

| ファイル | 説明 |
|----------|------|
| `slack-setup-guide.md` | AWS Chatbot Slack 連携設定の詳細手順 |
| `operations-playbook.md` | アラート発生時の運用対応手順書 |

### 今後の作業

- [ ] AWS Console で Chatbot Slack Channel Configuration を作成
- [ ] 擬似エラーログを出力してアラーム発火をテスト
- [ ] アラーム閾値の調整（本番データを見ながら）

---

## タスク分解

- ✅ フェーズ1: 調査と要件定義
  - [x] CloudWatch → Slack 連携の選択肢調査
  - [x] 対象ロググループの棚卸し
  - [x] エラー分類と通知優先度の整理
- ✅ フェーズ2: アーキテクチャ設計
  - [x] Metric Filter / Alarm 設計ガイドラインのドラフト
  - [x] SNS / Chatbot / Slack チャンネル構成設計
  - [x] IAM ポリシーとアクセス制御方針作成
- 🔄 フェーズ3: 実装 & IaC 化
  - [x] Terraform モジュール作成・既存スタックへの組み込み
  - [ ] Slack 側 App / チャンネル許可設定（手動設定が必要）
  - [ ] 初期テスト用ステージング環境での動作確認
- 🔄 フェーズ4: 運用設計
  - [x] 通知テンプレートとプレイブック作成
  - [x] サプレッション・再通知ルール策定
  - [ ] モニタリング結果の定期レビュー体制整備（本番稼働後）

## テスト計画

- ユニットテスト: Terraform の `terraform validate` / `terratest` でリソース定義を検証。
- ステージング検証: テスト用ロググループに擬似エラーログを出力し、アラーム発火状況と Slack 通知内容を確認。
- 回帰試験: 既存アラーム・通知との干渉が無いか、`mise run ci` に組み込まれている IaC lint を実行。
- エンドツーエンド: Lambda (整形オプション採用時) を含めた通知フローを統合テストし、タイムスタンプ・URL の正当性を確認。

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| アラーム乱発による Slack ノイズ | 高 | エラーログのサンプリング・抑制設定、初期は OK 通知を無効化し週次レビューで閾値調整 |
| IAM 権限不足で Chatbot 投稿失敗 | 中 | AWS Chatbot ロールに SNS Subscribe・CloudWatch Read 権限を明示付与し、権限テストを自動化 |
| ログフォーマット不統一で検知漏れ | 高 | 各サービスでエラーログに共通キー (level/error_code) を付与し、Metric Filter を JSON パターンで定義 |
| マルチアカウント環境の管理複雑化 | 中 | Org 管理アカウントに集中定義し、Cross-Account SNS + Chatbot を用いた標準化を検討 |

## スケジュール

- フェーズ1: 2025-10-27 まで (調査/要件確定)
- フェーズ2: 2025-11-05 まで (設計)
- フェーズ3: 2025-11-15 まで (実装/検証)
- フェーズ4: 2025-11-22 まで (運用フロー整備)

## 参考資料

- AWS Chatbot (Amazon Q Developer for Slack) を用いた CloudWatch アラーム通知の公式ガイド
- CloudWatch Logs Metric Filter によるエラー検知とアラーム連動のチュートリアル
- CloudWatch Logs Subscription Filter + Lambda + Slack Webhook でのカスタム通知例

## 完了条件

- [ ] 対象ロググループごとの Metric Filter / Alarm が IaC で定義されている
- [ ] Slack に対する通知経路 (SNS → Chatbot) が動作確認済み
- [ ] サプレッション・プレイブックを含む運用手順書が整備されている
- [ ] 課題管理にて本タスクの完了が記録され、必要ならバージョン更新が実行されている

## 備考

- Lambda 経由で整形通知を行う場合、リトライ・デッドレターキューを設定し長時間障害時の通知欠落を防ぐ。
- 長期的には Amazon EventBridge Pipes や Blueprints を活用し、ログベースのサーバレス通知テンプレート化も検討する。
