# CF Pages: wrangler pages deploy への切り替え

## 概要

現在の Cloudflare Pages デプロイは Direct Upload API（5ステップ）を使用しているが、以下の問題がある:
- Content-Type を自前で設定する必要があり、バグりやすい（PR #1460で修正済み）
- D1/KV/R2 などの Worker バインディングが設定できない
- `wrangler.toml` の `compatibility_flags` が自動反映されない
- 5ステップの複雑なAPI呼び出し（token取得→check-missing→upload→upsert→deploy）

**解決策**: CodeBuild の post_build で `wrangler pages deploy` を実行する方式に切り替える。

## 方針

- `wrangler.toml` はユーザーのリポジトリで管理するのが基本
- リポジトリに `wrangler.toml` がない場合は、buildspec 内でデフォルトの `wrangler.toml` を生成する
- D1 等のバインディング設定は `wrangler.toml` に書いてもらう想定
- CF 認証情報は CodeBuild 環境変数で渡す

## 現在のフロー

```
CodeBuild:
  1. npm install
  2. npx next build
  3. npx @cloudflare/next-on-pages
  4. tar.gz → S3 upload

tachyon-api (auto-deploy):
  5. S3 からダウンロード
  6. tar.gz を展開
  7. Direct Upload API (5ステップ) でデプロイ
```

## 新フロー

```
CodeBuild:
  1. npm install
  2. npx next build
  3. npx @cloudflare/next-on-pages
  4. wrangler pages deploy .vercel/output/static --project-name=$PROJECT_NAME
     → デプロイ完了、deployment URL が stdout に出る

tachyon-api (auto-deploy):
  5. CF Pages API で最新デプロイメント情報を取得
  6. Deployment レコードを作成・Active にする
```

## 変更対象ファイル

### 1. CodeBuild buildspec 変更
**ファイル**: `packages/compute/src/adapter/gateway/codebuild_provider.rs`

- `generate_buildspec()` の `post_build` を変更:
  - S3 upload (tar.gz) を削除
  - `npx wrangler pages deploy .vercel/output/static --project-name=$PROJECT_NAME` を追加
- 環境変数に `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を追加
- wrangler.toml がない場合のフォールバック生成を追加
- `PROJECT_NAME` 環境変数を追加（CF Pages プロジェクト名 = app.name()）

### 2. SubmitBuildInput 拡張
**ファイル**: `packages/compute/domain/src/provider/build_provider.rs`

- `SubmitBuildInput` に `cloudflare_account_id: Option<String>` と `cloudflare_api_token: Option<String>` を追加
- `pages_project_name: Option<String>` を追加

### 3. TriggerBuild 変更
**ファイル**: `packages/compute/src/usecase/trigger_build.rs`

- CF Pages ビルド時に `SubmitBuildInput` に CF 認証情報を渡す
- auto-deploy のフロー変更:
  - Direct Upload 不要 → CF Pages API で最新デプロイメント取得
  - Deployment レコードの作成のみ

### 4. CreateDeployment 簡略化
**ファイル**: `packages/compute/src/usecase/create_deployment.rs`

- `deploy_to_pages()` メソッドを簡略化:
  - S3 ダウンロード・tar.gz 展開・Direct Upload → 削除
  - CF Pages API で最新デプロイメントを取得するだけに変更
- `download_and_extract_artifact()`, `download_from_s3()`, `download_from_http()`, `extract_tar_gz()` を削除

### 5. PagesProvider トレイト変更
**ファイル**: `packages/compute/domain/src/provider/pages_provider.rs`

- `upload_deployment()` を削除（Direct Upload 不要）
- `list_deployments()` を追加（最新デプロイメント取得用）
- `UploadPagesDeploymentInput`, `PagesAsset` を削除

### 6. CloudflarePagesProvider 実装変更
**ファイル**: `packages/compute/src/adapter/gateway/cloudflare_pages_provider.rs`

- `upload_deployment()` 実装を削除（Direct Upload の全ロジック）
- `list_deployments()` を追加
- blake3, base64 関連の import 削除

### 7. 不要な依存の削除
**ファイル**: `packages/compute/Cargo.toml`

- `blake3` 削除（Direct Upload のハッシュ計算用だった）
- `flate2`, `tar` 削除（tar.gz 展開用だった）
- `mime_guess` 削除（Content-Type 推定用だった）
- `aws-sdk-s3` 削除（S3 からの artifact ダウンロード用だった）

## 実装詳細

### buildspec 変更後のイメージ

```yaml
version: 0.2
phases:
  install:
    runtime-versions:
      nodejs: 20
    commands:
      - npm install
  pre_build:
    commands:
      - {build_arg_exports}
  build:
    commands:
      - npx next build
      - npx @cloudflare/next-on-pages
  post_build:
    commands:
      # wrangler.toml がなければデフォルトを生成
      - |
        if [ ! -f wrangler.toml ] && [ ! -f wrangler.json ] && [ ! -f wrangler.jsonc ]; then
          echo 'name = "'$PROJECT_NAME'"' > wrangler.toml
          echo 'compatibility_date = "2024-09-23"' >> wrangler.toml
          echo 'compatibility_flags = ["nodejs_compat"]' >> wrangler.toml
          echo 'pages_build_output_dir = ".vercel/output/static"' >> wrangler.toml
        fi
      - npx wrangler pages deploy .vercel/output/static --project-name=$PROJECT_NAME
```

### CF 認証情報の渡し方

wrangler CLI は以下の環境変数を認識する:
- `CLOUDFLARE_API_TOKEN` — API トークン
- `CLOUDFLARE_ACCOUNT_ID` — アカウント ID

CodeBuild の環境変数に追加する（`SubmitBuildInput` 経由）。

### auto-deploy の新フロー

```
ビルド成功
  → try_auto_deploy()
    → pages_provider.list_deployments(project_name) で最新取得
    → Deployment レコード作成（pages_project_name, pages_deployment_id, url）
    → route_store に登録
    → mark_active
```

## テスト計画

1. [ ] Rust コンパイル通過
2. [ ] questionnaire-v2 で実際にビルド→デプロイ確認
3. [ ] `https://questionnaire-v2.txcloud.app/admin` でページ表示（D1バインディング有効）
4. [ ] wrangler.toml がないリポジトリでもデフォルト生成でデプロイ可能

## 進捗

- [ ] buildspec 変更 (codebuild_provider.rs)
- [ ] SubmitBuildInput 拡張 (build_provider.rs)
- [ ] TriggerBuild 修正 (trigger_build.rs)
- [ ] CreateDeployment 簡略化 (create_deployment.rs)
- [ ] PagesProvider トレイト更新 (pages_provider.rs)
- [ ] CloudflarePagesProvider 実装更新
- [ ] 不要依存削除 (Cargo.toml)
- [ ] コンパイル確認
- [ ] E2E テスト
