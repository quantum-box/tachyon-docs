---
title: "OpenNextを使用したCloudflareデプロイへのマイグレーション"
topics: ["cms", "cloudflare", "deployment", "opennext"]
type: "tech"
published: false
targetFiles: ["apps/cms"]
---

# OpenNextを使用したCloudflareデプロイへのマイグレーション

このドキュメントでは、CMSアプリケーションをOpenNextを使用してCloudflareにデプロイするためのマイグレーション手順を説明します。

## 🚀 マイグレーション手順の概要

Cloudflareへのデプロイに必要な手順は以下の通りです：

1. **@opennextjs/cloudflare パッケージのインストール**
2. **Wranglerのインストール**
3. **Cloudflare設定ファイルの作成**
4. **OpenNext設定ファイルの追加**
5. **環境変数設定ファイルの作成**
6. **package.jsonの更新**
7. **静的アセットキャッシングの設定**
8. **R2によるキャッシングの追加**
9. **edgeランタイム指定の削除**
10. **.gitignoreの更新**
11. **既存のCloudflare設定の削除（必要な場合）**
12. **ローカル開発環境の設定**
13. **Cloudflareへのデプロイ**

## 📋 詳細な手順

### 1. @opennextjs/cloudflare パッケージのインストール

まず、OpenNextのCloudflareアダプターをインストールします：

```bash
npm install @opennextjs/cloudflare@latest
```

### 2. Wranglerのインストール

Cloudflareの開発ツールであるWranglerをdevDependencyとしてインストールします：

```bash
npm install --save-dev wrangler@latest
```

> **注意**: Wranglerは3.99.0以降のバージョンが必要です。

### 3. Cloudflare設定ファイルの作成

プロジェクトのルートディレクトリに`wrangler.jsonc`ファイルを作成します：

```json
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "main": ".open-next/worker.js",
  "name": "cms-app",
  "compatibility_date": "2024-12-30",
  "compatibility_flags": [
    "nodejs_compat",
    "global_fetch_strictly_public"
  ],
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS"
  },
  "services": [
    {
      "binding": "WORKER_SELF_REFERENCE",
      "service": "cms-app"
    }
  ],
  "r2_buckets": [
    {
      "binding": "NEXT_INC_CACHE_R2_BUCKET",
      "bucket_name": "cms-app-cache"
    }
  ]
}
```

> **注意**: `name`フィールドは実際のアプリケーション名に合わせて変更してください。また、`r2_buckets`の`bucket_name`も適切な名前に変更してください。

### 4. OpenNext設定ファイルの追加

プロジェクトのルートに`open-next.config.ts`ファイルを作成します：

```typescript
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache
});
```

### 5. 環境変数設定ファイルの作成

プロジェクトのルートに`.dev.vars`ファイルを作成します：

```
NEXTJS_ENV=development
```

これは開発環境で`.env`ファイルを適切に読み込むために必要です。

### 6. package.jsonの更新

`package.json`の`scripts`セクションに以下のコマンドを追加します：

```json
"scripts": {
  "preview": "opennextjs-cloudflare build && opennextjs-cloudflare preview",
  "deploy": "opennextjs-cloudflare build && opennextjs-cloudflare deploy",
  "upload": "opennextjs-cloudflare build && opennextjs-cloudflare upload",
  "cf-typegen": "wrangler types --env-interface CloudflareEnv cloudflare-env.d.ts"
}
```

各コマンドの役割は以下の通りです：
- `preview`: アプリをビルドし、ローカルでWorkersランタイムでプレビューします
- `deploy`: アプリをビルドしてCloudflareにデプロイします
- `upload`: アプリをビルドして新しいバージョンをCloudflareにアップロードします
- `cf-typegen`: Cloudflare環境変数の型定義ファイルを生成します

### 7. 静的アセットキャッシングの設定

`public/_headers`ファイルを作成して、静的アセットのキャッシング設定を追加します：

```
/_next/static/*
  Cache-Control: public,max-age=31536000,immutable
```

### 8. R2によるキャッシングの追加

上記の`wrangler.jsonc`で設定したR2バケットを使用して、Next.jsのキャッシングを有効にします。この設定は既に`open-next.config.ts`に含まれています。

Cloudflareダッシュボードで以下の手順を実行してR2バケットを作成します：

1. Cloudflareダッシュボードにログイン
2. R2セクションに移動
3. 「バケットを作成」ボタンをクリック
4. バケット名を入力（例: `cms-app-cache`）
5. 「作成」ボタンをクリック

### 9. edgeランタイム指定の削除

ソースコード内に`export const runtime = "edge";`の記述がある場合は削除してください。現在のOpenNextのCloudflareサポートではedgeランタイムはサポートされていません。

該当するファイルを見つけるには、以下のコマンドを実行します：

```bash
grep -r "export const runtime = \"edge\"" ./apps/cms/src
```

### 10. .gitignoreの更新

`.gitignore`ファイルに以下を追加して、ビルド出力がリポジトリにコミットされないようにします：

```
.open-next
```

### 11. 既存のCloudflare設定の削除（必要な場合）

既に`@cloudflare/next-on-pages`を使用している場合は、以下の手順で削除します：

1. パッケージのアンインストール：
   ```bash
   npm uninstall @cloudflare/next-on-pages eslint-plugin-next-on-pages
   ```

2. 次の関連コードを削除：
   - Next.js設定ファイルから`setupDevPlatform()`の呼び出し
   - ソースファイルから`@cloudflare/next-on-pages`からのインポート
   - ESLint設定からnext-on-pagesルール

### 12. ローカル開発環境の設定

Next.jsの設定ファイル（`next.config.js`または`next.config.mjs`）を更新して、OpenNextのCloudflareアダプターを開発環境で統合します：

```typescript
// next.config.js
const nextConfig = {
  // 既存の設定...
};

export default nextConfig;

import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
```

これにより、`next dev`を実行してローカル開発を行う際も、Cloudflareバインディングにアクセスできるようになります。

### 13. Cloudflareへのデプロイ

コマンドラインからデプロイするには：

```bash
npm run deploy
```

または、GitHubやGitLabリポジトリを接続して、プルリクエストがマージされたときに自動的にビルドとデプロイを行うこともできます。

## 🚨 注意点とベストプラクティス

1. **互換性フラグ**: `wrangler.jsonc`では、`nodejs_compat`と`global_fetch_strictly_public`フラグを必ず有効にしてください。

2. **R2バケット**: R2バケットを使用する場合は、事前にCloudflareダッシュボードでバケットを作成しておく必要があります。

3. **エッジランタイム**: 現在のOpenNextでは、Next.jsのエッジランタイムはサポートされていないため、`export const runtime = "edge";`は削除する必要があります。

4. **環境変数**: 本番環境の環境変数はCloudflareダッシュボードまたはWranglerコマンドで設定します：
   ```bash
   wrangler secret put MY_SECRET_KEY
   ```

5. **静的アセットのキャッシング**: キャッシング戦略は、アプリケーションの要件に応じて`public/_headers`ファイルでカスタマイズできます。

## 📈 マイグレーション後のメリット

- **パフォーマンスの向上**: CloudflareのグローバルCDNネットワークによる高速なコンテンツ配信
- **セキュリティの強化**: Cloudflareのセキュリティサービスによる保護
- **スケーラビリティ**: サーバーレスアーキテクチャによる自動スケーリング
- **コスト効率**: リクエストベースの料金体系による最適なコスト管理

## 🔄 マイグレーション後の確認事項

マイグレーション完了後、以下の点を確認してください：

1. **基本機能の検証**: すべての主要機能が期待通りに動作するか
2. **API接続の確認**: GraphQL APIが正しく動作するか
3. **認証フローのテスト**: ログインや認証が正常に機能するか
4. **パフォーマンスの確認**: 読み込み速度やレスポンス時間が改善されているか
5. **エラー処理**: エラー発生時の挙動が適切か

## 📚 参考資料

- [OpenNext Cloudflare Getting Started Guide](https://opennext.js.org/cloudflare/get-started)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Documentation](https://developers.cloudflare.com/workers/wrangler/)
- [R2 Storage Documentation](https://developers.cloudflare.com/r2/)

## 🔧 トラブルシューティング

マイグレーション中に問題が発生した場合、以下の対処法を試してください：

### ビルドエラー

- **モジュール解決エラー**: `tsconfig.json`の`paths`設定が正しいことを確認
- **依存関係の問題**: パッケージのバージョンの互換性を確認し、必要に応じて更新

### デプロイエラー

- **権限エラー**: Cloudflareアカウントの権限設定を確認
- **サイズ制限**: Workersのサイズ制限（1MB）を超えていないか確認

### ランタイムエラー

- **Node.js API互換性**: 使用しているNode.js APIがCloudflare Workersでサポートされているか確認
- **キャッシュ問題**: R2バケットの設定と権限を確認

問題が解決しない場合は、[OpenNextのGitHubリポジトリ](https://github.com/serverless-stack/open-next)で問題を報告するか、[Discord](https://discord.gg/sst)で質問してください。 