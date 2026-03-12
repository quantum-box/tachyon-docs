# Cloudflare Pages デプロイ対応 — 要件仕様 (spec.md)

## 概要

tachyon cloud compute に Cloudflare Pages デプロイ対応を追加する。
現在 GCP Cloud Build + Cloud Run のみ対応しているデプロイパイプラインを拡張し、
Next.js アプリを Cloudflare Pages にデプロイできるようにする。

## 背景・動機

- Cloud Run は従量課金でコールドスタートもあり、静的サイト寄りの Next.js アプリには過剰
- Cloudflare Pages は無料枠が大きく、Edge でのレスポンスが高速
- `@cloudflare/next-on-pages` により Next.js の SSR/ISR も Pages 上で動作可能
- 既に Cloudflare DNS / KV は compute で使用中 — Pages 追加は自然な拡張

## アーキテクチャ上の位置づけ

### 現行 (Cloud Run)

```
GitHub → GCP Cloud Build (Docker build) → Artifact Registry → Cloud Run
                                                                ↓
txcloud-proxy (CF Worker) ← KV (route) ← CreateDeployment
```

### 新規 (Cloudflare Pages)

```
GitHub → AWS CodeBuild (ARM Graviton) → @cloudflare/next-on-pages → ビルド成果物
                                                                        ↓
                                                    Cloudflare Pages Direct Upload API
                                                                        ↓
                                                                Pages Project (Edge)
                                                                        ↓
                                                    txcloud-proxy (CF Worker) ← KV (route)
                                                                        ↓
                                                              *.txcloud.app ドメイン
```

**ポイント**: ビルドに AWS CodeBuild (ARM Graviton) を使用し、デプロイは Cloudflare Pages Direct Upload API。
ARM Graviton インスタンスが最もコスト効率が高い。ビルドパイプライン全体が tachyon cloud の管理下に置かれる。

**ドメイン方針**: 初期は `*.txcloud.app` ドメインで txcloud-proxy 経由でアクセスする。
Cloud Run も Cloudflare Pages も同じ txcloud-proxy を通す統一アーキテクチャ。
Cloudflare Pages の内蔵カスタムドメイン機能は使わず、proxy 側の RouteStore (KV) に
Pages の URL を登録する形でルーティングする。
カスタムドメイン機能は後日 Cloudflare for Platforms を使って実装予定。

### フローの比較

| 工程 | Cloud Run (既存) | Cloudflare Pages (新規) |
|------|-----------|------------------|
| ビルドサービス | GCP Cloud Build | AWS CodeBuild (ARM Graviton) |
| ビルド処理 | Docker build → イメージ push | @cloudflare/next-on-pages → 成果物生成 |
| ビルド成果物 | Docker イメージ (Artifact Registry) | 静的アセット + Worker (.vercel/output/static 等) |
| 成果物保管 | Artifact Registry | S3 |
| デプロイ | Cloud Run Admin API (イメージ指定) | Pages Direct Upload API (成果物アップロード) |
| ルーティング | txcloud-proxy (CF Worker) + KV | txcloud-proxy (CF Worker) + KV (Pages URL登録) |
| スケーリング | Cloud Run scaling 設定 | 自動 (設定不要) |
| カスタムドメイン | DNS provider 経由 | 初期: *.txcloud.app のみ。後日 Cloudflare for Platforms で実装 |

## 設計方針

### 1. DeploymentTarget の導入

`Framework` enum は「何のフレームワークか」を表す。新たに「どこにデプロイするか」を表す概念が必要。

```
DeploymentTarget:
  - CloudRun       (既存: Docker イメージ → Cloud Run)
  - CloudflarePages (新規: ビルド成果物 → Pages Direct Upload)
```

ComputeApp に `deployment_target` フィールドを追加。
アプリ作成時に指定し、以後のビルド・デプロイは target に応じたプロバイダーを使用する。

### 2. ビルド方式: AWS CodeBuild (ARM Graviton) + @cloudflare/next-on-pages

Cloudflare Pages の GitHub 連携 (Cloudflare App) は **使わない**。理由:
- Cloudflare App 設定が必要で tachyon cloud の管理外になる
- ビルドログを tachyon UI から見れるようにしたい

GCP Cloud Build ではなく **AWS CodeBuild** を使用する。理由:
- ARM Graviton インスタンスが最もコスト効率が高い（x86 比で約 20% 安価）
- `arm64/v8` の Node.js ビルドが高速
- AWS IAM 認証で既存の AWS インフラと統合しやすい

ビルドフロー:
1. CodeBuild プロジェクトを ARM Graviton (`BUILD_GENERAL1_SMALL` + `ARM_CONTAINER`) で作成
2. buildspec.yml で `npm install` → `next build` → `npx @cloudflare/next-on-pages` を実行
3. ビルド成果物 (`.vercel/output/static` ディレクトリ等) を S3 にアップロード
4. ビルドログは CodeBuild CloudWatch Logs 経由で tachyon UI に表示

**既存の Cloud Run フローとの関係**: Cloud Run 向けビルドは引き続き GCP Cloud Build を使用。
Cloudflare Pages 向けのみ AWS CodeBuild を使う。`BuildProvider` トレイトに
CodeBuild 用の実装 (`CodeBuildProvider`) を追加する。

### 3. PagesProvider トレイト (新規)

ContainerRuntime とは別に Pages 専用トレイトを定義する。
ビルドは既存 BuildProvider を使うため、PagesProvider はデプロイ・管理のみ。

```
PagesProvider:
  - create_project(name) → project
  - delete_project(project_name)
  - upload_deployment(project_name, assets) → deployment  (Direct Upload)
  - get_deployment(project_name, deployment_id) → deployment
  - rollback_deployment(project_name, deployment_id) → deployment
  - set_env_vars(project_name, env_vars)
```

**注意**: カスタムドメイン関連メソッドは初期スコープに含めない。
初期は `*.txcloud.app` ドメインで txcloud-proxy 経由のルーティングのみ。
Pages デプロイ後、RouteStore (KV) に Pages URL を登録してプロキシ経由でアクセスする。

### 4. ユースケースの分岐

既存ユースケースを `deployment_target` で分岐:

| ユースケース | CloudRun | CloudflarePages |
|---|---|---|
| CreateApp | 既存のまま | + PagesProvider::create_project |
| TriggerBuild | GCP Cloud Build (Docker build) | AWS CodeBuild (@cloudflare/next-on-pages) |
| CreateDeployment | ContainerRuntime::deploy_service + RouteStore::put | PagesProvider::upload_deployment + RouteStore::put (Pages URL) |
| RollbackDeployment | 再デプロイ (Docker イメージ) | PagesProvider::rollback_deployment |
| UpdateScaling | Cloud Run scaling | LogicError (Pages は自動スケール) |
| AddCustomDomain | DnsProvider 経由 | 初期スコープ外 (後日 Cloudflare for Platforms) |
| DeleteApp | Cloud Run + KV + DNS 全クリーンアップ | PagesProvider::delete_project + RouteStore::delete |

### 5. デプロイフロー詳細

```
TriggerBuild (deployment_target = CloudflarePages):
  1. CodeBuildProvider::submit_build(buildspec.yml for next-on-pages)
  2. CodeBuild (ARM Graviton) が実行:
     - npm install
     - next build
     - npx @cloudflare/next-on-pages
     - aws s3 sync .vercel/output/static s3://bucket/builds/{build_id}/
  3. ビルド完了 → Build status = Succeeded

CreateDeployment (deployment_target = CloudflarePages):
  1. Build の成果物パスから S3 のファイルを取得
  2. PagesProvider::upload_deployment でファイルを Pages Direct Upload
  3. Pages deployment URL を Deployment に保存
  4. RouteStore::put で *.txcloud.app → Pages URL のルーティングを KV に登録
  5. app.production_deployment_id を更新
```

### 6. Cloudflare Pages API (v4)

Base: `https://api.cloudflare.com/client/v4`

| 操作 | メソッド | パス |
|---|---|---|
| プロジェクト作成 | POST | `/accounts/{account_id}/pages/projects` |
| プロジェクト取得 | GET | `/accounts/{account_id}/pages/projects/{name}` |
| プロジェクト削除 | DELETE | `/accounts/{account_id}/pages/projects/{name}` |
| Direct Upload | POST | `/accounts/{account_id}/pages/projects/{name}/deployments` (multipart/form-data) |
| デプロイ取得 | GET | `/accounts/{account_id}/pages/projects/{name}/deployments/{id}` |
| デプロイ rollback | POST | `/accounts/{account_id}/pages/projects/{name}/deployments/{id}/rollback` |
| ~~カスタムドメイン追加~~ | ~~POST~~ | ~~`/accounts/{account_id}/pages/projects/{name}/domains`~~ ※初期スコープ外 |
| ~~カスタムドメイン削除~~ | ~~DELETE~~ | ~~`/accounts/{account_id}/pages/projects/{name}/domains/{domain}`~~ ※初期スコープ外 |

認証: `Authorization: Bearer {api_token}` (Cloudflare API Token)

#### Direct Upload の仕組み

Pages Direct Upload は multipart/form-data でファイルを送信する:
- 各ファイルを `/<path>` キーでアップロード
- Content-Type は自動推論
- 一度のリクエストで全ファイルをアップロード（最大20,000ファイル、25MB/ファイル）

## ドメイン・ルーティング方針

### 初期: *.txcloud.app + txcloud-proxy

Cloud Run と同じく、Cloudflare Pages も txcloud-proxy (CF Worker) 経由でアクセスする。

```
ユーザー → {app-name}.txcloud.app → txcloud-proxy (CF Worker)
                                        ↓ KV lookup
                                        ↓ route = pages:{pages-deployment-url}
                                        ↓
                                     Cloudflare Pages (fetch)
```

- `CreateDeployment` 時に RouteStore (KV) へ Pages の URL を登録
- Cloud Run の場合: KV value = `cloudrun:{service-url}`
- Cloudflare Pages の場合: KV value = `pages:{pages-project}.pages.dev`
- txcloud-proxy は KV の値に応じて Cloud Run or Pages へプロキシ

### 将来: カスタムドメイン (Cloudflare for Platforms)

- ユーザーが独自ドメインを設定できるようにする
- Cloudflare for Platforms (旧 SSL for SaaS) を使い、CNAME 先を txcloud-proxy にする
- Pages の内蔵カスタムドメイン機能は使わない（proxy 経由の統一アーキテクチャを維持）

## DB スキーマ変更

### compute_apps テーブル

```sql
ALTER TABLE compute_apps ADD COLUMN deployment_target VARCHAR(32) NOT NULL DEFAULT 'cloud_run';
```

値: `cloud_run`, `cloudflare_pages`

### builds テーブル

ビルド成果物の保管先パスを保存:

```sql
ALTER TABLE builds ADD COLUMN artifact_path VARCHAR(512) DEFAULT NULL;
```

Cloud Run の場合: `{location}-docker.pkg.dev/{project}/compute-apps/{name}:{tag}` (Docker イメージ)
Cloudflare Pages の場合: `s3://bucket/builds/{build_id}/` (S3 パス)

### deployments テーブル

既存の `cloud_run_service_name`, `cloud_run_revision` は Cloud Run 固有。
Pages 用にカラム追加:

```sql
ALTER TABLE deployments ADD COLUMN pages_project_name VARCHAR(128) DEFAULT NULL;
ALTER TABLE deployments ADD COLUMN pages_deployment_id VARCHAR(128) DEFAULT NULL;
```

## IaC マニフェスト設定

system-config の providers に追加:

```yaml
# Cloudflare Pages デプロイ用
- name: cloudflare_pages
  provider_type: compute
  config:
    account_id: "xxxx"
    api_token: "$secret_ref:global/cloudflare_pages"

# AWS CodeBuild ビルド用
- name: aws_codebuild
  provider_type: compute
  config:
    region: "ap-northeast-1"
    s3_bucket: "tachyon-compute-builds"
    # IAM 認証はインスタンスロール or 環境変数
```

## 環境変数

フォールバック:
- Cloudflare Pages: `CLOUDFLARE_PAGES_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- AWS CodeBuild: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION` (or IAM role)

## 成功基準

1. `deployment_target: cloudflare_pages` でアプリを作成できる
2. AWS CodeBuild (ARM Graviton) で @cloudflare/next-on-pages ビルドが実行される
3. ビルド成果物が S3 経由で Pages Direct Upload でデプロイされる
4. デプロイ状態が API で確認できる
5. `*.txcloud.app` ドメインで txcloud-proxy 経由のアクセスが動作する
6. 環境変数が設定・更新できる
7. 既存の Cloud Run フローに影響がない
8. シナリオテストが通る

## スコープ外

- Cloudflare Pages GitHub 連携 (Cloudflare App) — 意図的に除外
- カスタムドメイン機能 — 後日 Cloudflare for Platforms を使って実装予定
- Pages 内蔵のカスタムドメイン設定 — 使わない (proxy 経由で統一)
- D1 バインディング設定 (将来拡張)
- Pages Functions の個別設定
- Preview デプロイメント (将来拡張)
