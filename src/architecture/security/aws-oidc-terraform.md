# AWS OIDC Terraform認証基盤

## 概要

Terraform が AWS 資源を管理する際に、長期利用のアクセスキーではなく GitHub Actions の OIDC トークンで `sts:AssumeRoleWithWebIdentity` を利用する構成へ移行した。`cluster/n1-aws` では OIDC プロバイダーと Terraform 実行専用 IAM ロールを Terraform 管理下に置き、CI とローカルの双方で同じロールを利用できるようにしている。

## 背景

従来は Terraform 実行用に静的なアクセスキーを GitHub Secrets に保存していたが、漏えいリスクとローテーション負荷が大きかった。本構成では WebIdentity を用いて短命トークンを払い出し、GitHub Actions からのロール引き受けをブランチ単位で制御することでセキュリティと運用性を両立する。

## 構成要素

### AWS IAM OIDCプロバイダー

- リソース: `aws_iam_openid_connect_provider.github_actions`
- 発行元: `https://token.actions.githubusercontent.com`
- Audience: `sts.amazonaws.com`
- Thumbprint: `6938fd4d98bab03faadb97b34396831e3780aea1`（GitHub OIDC 既定）
- 目的: GitHub Actions の OpenID Connect トークンを受け入れ、Terraform 実行ロールのトラストポリシーから参照する。

### Terraform実行IAMロール

- リソース: `aws_iam_role.terraform_github_actions`
- ロール名: `TerraformGithubActionsRole`
- AssumeRole 条件:
  - `aud` が `sts.amazonaws.com`
  - `sub` が `github_oidc_allowed_subjects` ローカル値（初期値: `repo:quantum-box/tachyon-apps:ref:refs/heads/main`）にマッチ
- `max_session_duration` は 3600 秒。GitHub Actions 側は `aws-actions/configure-aws-credentials@v5` で引き受ける。
- 許可ブランチは `github_oidc_allowed_subjects` 変数（`variables.tf`）で JSON 配列として管理し、`TF_VAR_GITHUB_OIDC_ALLOWED_SUBJECTS` シークレット経由でワークフローから上書きできる。

### アタッチされるIAMポリシー

- リソース: `aws_iam_policy.terraform_lambda_deploy`
- 許可アクション:
  - Lambda 関連 (`CreateFunction` / `UpdateFunctionCode` 等)
  - Function URL と Permission の操作
  - `iam:PassRole`（対象は `aws_iam_role.lambda_role` に限定）
- 対象リソース:
  - `arn:aws:lambda:*:<account_id>:function:lambda-*`（ローカルで動的生成）
- IAM ロールとポリシーは `aws_iam_role_policy_attachment.terraform_github_actions_lambda` で結合する。

### Terraformプロバイダー & バックエンド

- `provider "aws"` はリージョンのみを設定し、認証情報は環境変数 (`AWS_ROLE_ARN`, `AWS_WEB_IDENTITY_TOKEN_FILE`) または `aws-actions/configure-aws-credentials` に委譲する。
- `backend "s3"` は `tachyon-tf-state` バケットを利用。OIDC ロールにこのバケットへのアクセス権が含まれている前提で `terraform init` が実行される。

### GitHub Actions連携

- ワークフロー: `.github/workflows/terraform-lambda-deploy.yml`
  - `permissions` で `id-token: write` を有効化し、OIDC トークンの発行を許可。
  - `aws-actions/configure-aws-credentials@v5` で `role-to-assume` に `N1_AWS_TERRAFORM_ROLE_ARN` シークレットを指定。
  - Lambda ビルドと `cargo lambda deploy` を同一ジョブで実行。
- シークレット管理:
  - `github_actions.tf` で `github_actions_secret` を作成し、Terraform から GitHub リポジトリに対してロール ARN・API キー類を同期。
  - 許可ブランチの制御値は `TF_VAR_GITHUB_OIDC_ALLOWED_SUBJECTS` として JSON 文字列を保存。

## 運用フロー

### CIでの適用

1. GitHub Actions は `id-token: write` 権限でジョブを開始。
2. `aws-actions/configure-aws-credentials@v5` が OIDC トークンを STS へ渡し、`TerraformGithubActionsRole` を引き受ける。
3. Terraform 実行時にはロールが持つ最小権限で Lambda 関連リソースのみを操作する。
4. シークレットの最新値は `terraform apply` により GitHub 側へ同期される。

### ローカルでの利用

1. AWS CLI の SSO または `aws sts assume-role-with-web-identity` でロールを引き受け、環境変数 `AWS_ROLE_ARN` `AWS_WEB_IDENTITY_TOKEN_FILE` を設定する。
2. `terraform init/plan/apply` を実行。アクセスキーの発行や保管は不要。

## セキュリティと監査

- トラストポリシーで `sub`（リポジトリ + ブランチ）を明示的に制限し、許可対象外ブランチからの AssumeRole を拒否。
- `iam:PassRole` は Lambda 実行ロールにのみ付与し、他サービスへの権限委譲を防止。
- 最小権限を維持するため、Lambda 以外のサービス操作はポリシーに含めない。追加が必要な場合は別ポリシーで検討する。
- ロールを利用したセッションは CloudTrail で追跡可能。セッション名には GitHub ワークフロー名が付与され、呼び出し元を判別できる。

## 関連ドキュメント

- タスク記録: `docs/src/tasks/completed/v0.22.0/aws-oidc-terraform/task.md`
- 運用手順: `cluster/n1-aws/README.md`
- ワークフロー: `.github/workflows/terraform-lambda-deploy.yml`
