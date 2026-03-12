# Library GitHub Sync

ライブラリデータをFrontmatter付きMarkdownとしてGitHubリポジトリへ同期する機能。

## 概要

- ライブラリデータをFrontmatter付きMarkdownへエクスポート
- データ単位で出力先GitHubリポジトリ・パスを指定可能
- GitHub上でバージョン管理・レビュー・配布が可能に

## 機能

### GitHub OAuth 連携

1. **Settings > GitHub Integration** で「Connect with GitHub」をクリック
2. GitHub OAuth 認証後、トークンが保存される
3. GitHub App インストールでリポジトリアクセスを許可

### GitHub Sync 有効化

1. **Settings > Integrations** タブを開く
2. 「Enable GitHub Synchronization」トグルをONにする
3. `ext_github` プロパティが自動作成される

### リポジトリ設定

1. **Properties** ページで `ext_github` の「Configure」ボタンをクリック
2. GitHubリポジトリを検索・選択
3. デフォルトパス（`docs/{{name}}.md` 形式）を設定
4. 保存時に一括同期オプションを選択可能

### データ同期

- **自動同期**: データ更新時に `ext_github` 設定があれば自動でGitHubへ同期
- **手動同期**: Data画面で個別にリポジトリ・パスを指定して同期

## アーキテクチャ

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Library UI     │     │  library-api     │     │  GitHub API     │
│  (Next.js)      │     │  (Rust/axum)     │     │  (Contents API) │
└────────┬────────┘     └────────┬─────────┘     └────────┬────────┘
         │                       │                        │
         │ 1. OAuth Flow         │                        │
         ├──────────────────────▶│                        │
         │                       │ 2. Token Exchange      │
         │                       ├───────────────────────▶│
         │                       │                        │
         │ 3. Sync Request       │                        │
         ├──────────────────────▶│                        │
         │                       │ 4. Compose Markdown    │
         │                       │ 5. Push via Contents   │
         │                       ├───────────────────────▶│
         │                       │                        │
         │ 6. Sync Result        │                        │
         │◀──────────────────────┤                        │
```

## ext_github プロパティ

`ext_` プレフィックスは拡張予約語として保護されており、ユーザーは直接作成できない。

### Property 構造

```yaml
# Property定義 (JSON型)
name: ext_github
type: JSON
```

### Data値

```json
{
  "repo": "owner/repository",
  "path": "docs/articles/my-article.md"
}
```

### Frontmatter 出力

```yaml
---
id: data_xxx
title: My Article
ext_github:
  repo: owner/repository
  path: docs/articles/my-article.md
---

Article content here...
```

## API

### GraphQL Mutations

```graphql
# GitHub OAuth
mutation { githubAuthUrl(scopes: ["repo"]) { url } }
mutation { githubExchangeToken(code: "...", state: "...") { success } }
mutation { githubDisconnect { success } }

# GitHub Sync
mutation { enableGithubSync(input: {...}) { success, propertyId } }
mutation { disableGithubSync(input: {...}) { success, deleted } }
mutation { syncDataToGithub(input: {...}) { status, url, diff } }
mutation { bulkSyncExtGithub(input: {...}) { updatedCount, skippedCount, totalCount } }
```

### GraphQL Queries

```graphql
query { githubConnection { connected, username } }
query { githubListRepositories(search: "...") { fullName, private } }
```

## 関連ファイル

### バックエンド (Rust)

- `packages/database_sync/` - 同期コアロジック
- `packages/providers/github/` - GitHub OAuth & SyncProvider
- `apps/library-api/src/usecase/bulk_sync_ext_github.rs` - 一括同期
- `apps/library-api/src/usecase/markdown_composer.rs` - Markdown生成
- `apps/library-api/src/handler/graphql/mutation.rs` - GraphQL mutations

### フロントエンド (Next.js)

- `apps/library/src/app/v1beta/[org]/_components/github-settings.tsx` - OAuth UI
- `apps/library/src/app/v1beta/[org]/[repo]/settings/form.tsx` - GitHub Sync トグル
- `apps/library/src/app/v1beta/_components/properties-ui/github-repos-editor.tsx` - リポジトリ設定ダイアログ
- `apps/library/src/app/v1beta/_components/data-detail-ui/ext-github-editor.tsx` - Data画面での編集

## 制限事項

- `ext_` プレフィックスはシステム予約語であり、ユーザー定義プロパティでは使用不可
- GitHub連携にはGitHub OAuth App/GitHub Appの設定が必要
- 同期先リポジトリへの書き込み権限が必要

## 参考

- [タスクドキュメント](../../tasks/completed/library-v1.4.0/library-data-github-sync/task.md) — 実装詳細・進捗メモ

