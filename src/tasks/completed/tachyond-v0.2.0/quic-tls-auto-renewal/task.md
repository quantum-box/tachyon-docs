# QUIC TLS 証明書自動更新

## 概要
Let's Encrypt 証明書（quic.n1.tachy.one）の自動更新を実装する。
証明書は90日で期限切れ（現在: 2026-05-14 まで有効）。

## 方針
GitHub Actions のスケジュールワークフローで毎週チェック＋更新。

## 実装ステップ

### 1. Terraform: IAM 権限追加
- [x] TerraformGithubActionsRole に Route53 + Secrets Manager 書き込み権限を追加
- Route53: ChangeResourceRecordSets, GetChange, ListHostedZones
- Secrets Manager: GetSecretValue, PutSecretValue (tachyon/quic-tls)
- ECS: UpdateService (既存)
- [x] `terraform apply` で IAM ポリシーをデプロイ

### 2. GitHub Actions ワークフロー
- [x] `.github/workflows/renew-quic-tls.yml` 作成
- スケジュール: 毎週月曜 03:00 UTC + 手動トリガー
- ステップ:
  1. AWS OIDC 認証
  2. Secrets Manager から現在の証明書を取得
  3. 有効期限チェック（30日以内なら更新）
  4. certbot で DNS-01 チャレンジ実行
  5. Secrets Manager 更新
  6. ECS サービス再デプロイ
- [x] PR #1090 でマージ

### 3. テスト
- [x] 手動トリガーで動作確認（2026-02-13）
- [x] ドライラン（更新不要時にスキップ確認）
  - 結果: `Certificate expires: May 14 12:15:01 2026 GMT (89 days remaining)` → 正常にスキップ

## 技術詳細
- certbot は GitHub Actions 上で `apt-get install certbot python3-certbot-dns-route53`
- DNS-01 チャレンジは certbot-dns-route53 プラグイン
- 証明書は JSON 形式で Secrets Manager に格納: `{ "cert_pem": "...", "key_pem": "..." }`
- Route53 ゾーン ID: `Z07576179GQQYG0O5B9Q` (main.tf にハードコード)
- IAMポリシー: `QuicTLSRenewalPolicy` (main.tf L1079-L1124)
- ワークフロー実行ログ: https://github.com/quantum-box/tachyon-apps/actions/runs/21990630720

## 完了: 2026-02-13
