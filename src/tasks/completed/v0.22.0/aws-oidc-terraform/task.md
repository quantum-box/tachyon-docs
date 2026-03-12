title: "TerraformでAWS OIDC認証を整備する"
type: tech
emoji: "🔐"
topics:
  - Terraform
  - AWS
  - OIDC
published: true
targetFiles:
  - cluster/n1-aws/main.tf
  - cluster/n1-aws/variables.tf
  - cluster/n1-aws/README.md
  - docs/src/architecture/security/aws-oidc-terraform.md
  - docs/src/tasks/completed/v0.22.0/aws-oidc-terraform/task.md
github: https://github.com/quantum-box/tachyon-apps/tree/main/cluster/n1-aws
---

# TerraformでAWS OIDC認証を整備する

## 概要

Terraform から AWS へデプロイする際に静的アクセスキーではなく OIDC ベースの認証を利用できるよう、プロバイダー設定と IAM リソースを整備する。

## 背景・目的

- セキュリティ観点で長期利用のアクセスキーを廃止し、短命トークンを用いる OIDC 認証へ移行したい。
- GitHub Actions など CI 実行環境から Terraform を実行する際、Secrets に AWS キーを保管せず安全に AssumeRole できるようにする。
- 運用チームがローカルから実行する場合も aws-vault などを介さず WebIdentity トークン経由で実行できるようにする。
- 上記を Terraform で管理し、ドキュメント化して再現性を高める。

## 詳細仕様

### 機能要件

1. `token.actions.githubusercontent.com` を対象とした `aws_iam_openid_connect_provider` を作成する。
2. Terraform 実行専用 IAM ロール（仮称 `TerraformDeploymentRole`）を作成し、OIDC プロバイダーからの AssumeRoleWithWebIdentity を許可する。
3. ロールの信頼ポリシーでは `repo:quantum-box/tachyon-apps:ref:refs/heads/main` をデフォルトで許可し、`github_oidc_allowed_subjects` 変数を通じて許可ブランチを構成ファイルから変更できるようにする。
4. ロールには Lambda 関連のデプロイに必要な IAM ポリシー（`lambda` 系アクションと `iam:PassRole` のみ）を付与し、その他のサービス操作は許可しない。
5. `provider "aws"` および `backend "s3"` がロール ARN と WebIdentity を利用できるよう設定オプションとドキュメントを追加する。
6. GitHub Actions の Terraform ワークフローを追加し、Lambda デプロイに必要なシークレット名を README に明記する。GitHub Provider を用いてシークレット値の同期を Terraform 管理下に置く。
7. 従来のアクセスキー依存手順は削除または非推奨として明記する。

### 非機能要件

- **セキュリティ:** トラストポリシーにリポジトリ・ブランチ条件を設定し、最小権限原則でポリシーを構成する。
- **保守性:** 役割 ARN やトークンファイルパスは変数化し、実行環境に依存しない構造にする。
- **可観測性:** AssumeRole されたセッション名から呼び出し元を識別できるよう、`sub` クレームとワークフロー名を組み合わせる。

### コンテキスト別の責務

```yaml
contexts:
  terraform:
    description: "IaC 管理基盤"
    responsibilities:
      - AWS OIDC プロバイダーと IAM ロールの定義
      - プロバイダー設定の変数化
      - 実行手順のドキュメント化
  platform-security:
    description: "クラウド統制"
    responsibilities:
      - ロールに付与するポリシーの最小権限レビュー
      - GitHub ワークフローとの信頼関係条件監査
```

### 仕様のYAML定義

```yaml
oidc_trust_relationship:
  provider_url: "https://token.actions.githubusercontent.com"
  audience: "sts.amazonaws.com"
  allowed_subjects:
    - repo:quantum-box/tachyon-apps:ref:refs/heads/main
  conditions:
    token.actions.githubusercontent.com:sub:
      StringLike:
        - "repo:quantum-box/tachyon-apps:*"
    token.actions.githubusercontent.com:aud:
      StringEquals: "sts.amazonaws.com"
```

## 実装方針

### アーキテクチャ設計

- Terraform state・プロバイダーの認証経路を統一し、OIDC トークンで AssumeRole する構成に移行する。
- IAM OIDC プロバイダー、IAM ロール、IAM ポリシーを `cluster/n1-aws` のルート構成に追加し、既存リソースへの依存関係を明文化する。
- CI から利用する際は環境変数 `AWS_ROLE_ARN` と `AWS_WEB_IDENTITY_TOKEN_FILE` による自動認証を想定する。

### 技術選定

- AWS Provider `~> 5.67`（既存を継続）
- IAM ロールポリシーは Terraform `aws_iam_role` + `aws_iam_role_policy`/`aws_iam_role_policy_attachment` で管理
- 条件付きトラストポリシーは `jsonencode` で記述し GitHub クレームに合わせる

### TDD（テスト駆動開発）戦略

- `terraform plan` をローカルと GitHub Actions 両方で実行し差分がないことを確認する。
- IAM ポリシーへの変更は `terraform validate` と `terraform fmt` を適用し、権限不足が疑われる場合は段階的に plan を確認する。

## タスク分解

### 主要タスク
- [x] 要件定義の明確化（既存権限の洗い出し、CI で必要なアクション確認）(2025-11-01)
- [x] 技術調査・検証（GitHub OIDC クレーム条件、Terraform backend 認証動作の確認）(2025-11-01)
- [x] 実装（IAM プロバイダー/ロール追加、プロバイダー設定更新）(2025-11-01)
- [x] テスト・品質確認（`terraform validate` による構文検証、OIDC 前提の plan 確認メモ）(2025-11-01)
- [x] ドキュメント更新（README・ワークフローの手順反映）(2025-11-01)

実装メモ: `aws_iam_openid_connect_provider.github_actions` と `aws_iam_role.terraform_github_actions` を追加し、Lambda のみ操作できるカスタムポリシー（`TerraformLambdaDeployPolicy`）を付与。`iam:PassRole` は既存の Lambda 実行ロールに限定した。GitHub Actions ワークフローで `terraform plan/apply` を実行する設定を追加し、必要なシークレット一覧を README に追記。GitHub Provider (`github_actions_secret`) でワークフロー依存のシークレットを一括同期するよう構成した。

## Playwright MCPによる動作確認

インフラ構成の変更のみでフロントエンドには影響しないため、Playwright による動作確認は不要。

### 実施タイミング
- [ ] 対象外

### 動作確認チェックリスト
- [ ] 対象外

### 実施手順
1. 対象外

### 確認時の注意事項
- [ ] 対象外

### ユーザビリティ・UI品質チェック
- [ ] 対象外

## スケジュール

- 実装・検証を含めて 0.5 〜 1 日を想定。

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| トラストポリシーの条件不足により誰でも AssumeRole できてしまう | 高 | クレーム条件を具体的に指定し、Plan レビュー時に IAM Diff を確認する |
| 既存 Terraform 実行と権限が不一致になる | 中 | 既存 IAM ポリシー内容を洗い出し、必要最小限で再構成する |
| CI 環境で WebIdentity トークンファイルが得られない | 中 | GitHub Actions の `id-token: write` 設定を手順に明記し、ワークフロー更新を同時に行う |

## 参考資料

- [AWS: Configure GitHub Actions OIDC - AWS Docs](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html)
- [Terraform Registry: aws_iam_openid_connect_provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_openid_connect_provider)
- [Terraform AWS Provider Assume Role with Web Identity](https://registry.terraform.io/providers/hashicorp/aws/latest/docs#assume-role)

## 完了条件

- [ ] Terraform で OIDC 認証を用いた `terraform init/plan/apply` が成功するドキュメントと設定が揃っている
- [ ] IAM ロール・ポリシー・OIDC プロバイダーが Terraform 管理下にある
- [ ] README に CI/ローカルでの設定手順が記載されている
- [ ] セキュリティレビューで許容された権限セットに収まっている

### バージョン番号の決定基準

- インフラ構成の改善でありアプリ機能追加ではないため、完了後はインフラバージョンを記録するがアプリバージョンの変更は不要。

## 備考

- GitHub Actions ワークフロー側の更新が必要になった場合、本タスクで併せて対応する。
- 既存の `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` 利用者には移行期間を README に記載する。
