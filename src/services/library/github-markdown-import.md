# Library GitHub Markdown Import

GitHubリポジトリからMarkdownファイルをLibraryデータとしてインポートする機能。

## 概要

- GitHubリポジトリ内のMarkdownファイルをリストアップ
- Frontmatterを解析してプロパティを自動生成
- ディレクトリ単位での一括インポートに対応
- `ext_github`プロパティによるGitHub連携メタデータ管理

## 機能

### GitHub Markdownインポートフロー

1. **Orgページ**で「Import from GitHub」ボタンをクリック
2. 接続済みGitHubリポジトリを選択
3. ディレクトリをブラウズしてMarkdownファイルを選択
4. プロパティマッピング・型を設定
5. インポート実行

### 対応機能

| 機能 | 説明 |
|------|------|
| ディレクトリブラウジング | GitHubリポジトリ内のファイル/ディレクトリを一覧表示 |
| 再帰的インポート | ディレクトリ選択時にサブディレクトリ内の全Markdownを取得 |
| Frontmatter解析 | YAMLフロントマターをパースしてプロパティに変換 |
| 型自動推定 | 値のバリエーションが5以下ならSelect型を提案 |
| タイトル抽出 | `frontmatter.title` → Markdown内のH1 → ファイル名の順で決定 |
| 重複更新 | `ext_github.path`が一致する既存データは更新 |

### ext_github プロパティ

インポート時に自動作成される`ext_github`プロパティには以下の情報が格納されます：

```json
{
  "repo": "owner/repository",
  "path": "docs/articles/my-article.md",
  "ref": "main",
  "sync_to_github": true
}
```

| フィールド | 説明 |
|-----------|------|
| `repo` | GitHubリポジトリ（owner/repo形式） |
| `path` | ファイルパス |
| `ref` | ブランチ名 |
| `sync_to_github` | GitHubへの同期時にfrontmatterに含めるか |

### sync_to_github フラグ

- `true`: Markdown同期時に`ext_github`をfrontmatterに出力
- `false`または未設定: frontmatterには含めない（デフォルト）

これにより、既存データとの後方互換性を保ちつつ、新規インポートでは明示的に制御可能。

## アーキテクチャ

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Library UI     │     │  library-api     │     │  GitHub API     │
│  (Next.js)      │     │  (Rust/axum)     │     │  (Contents API) │
└────────┬────────┘     └────────┬─────────┘     └────────┬────────┘
         │                       │                        │
         │ 1. List Repos         │                        │
         ├──────────────────────▶│ 2. GET /user/repos     │
         │                       ├───────────────────────▶│
         │                       │                        │
         │ 3. List Directory     │                        │
         ├──────────────────────▶│ 4. GET /repos/.../contents
         │                       ├───────────────────────▶│
         │                       │                        │
         │ 5. Get Previews       │                        │
         ├──────────────────────▶│ 6. GET raw file        │
         │                       ├───────────────────────▶│
         │                       │ 7. Parse frontmatter   │
         │                       │                        │
         │ 8. Import Request     │                        │
         ├──────────────────────▶│ 9. Create/Update Data  │
         │                       │                        │
         │10. Import Result      │                        │
         │◀──────────────────────┤                        │
```

## API

### GraphQL Queries

```graphql
# ディレクトリ内容を取得
query {
  githubListDirectoryContents(
    repo: "owner/repo"
    path: "docs"
    recursive: false
  ) {
    files { name, path, sha, size, fileType, htmlUrl }
    truncated
  }
}

# Markdownプレビューを取得
query {
  githubGetMarkdownPreviews(
    repo: "owner/repo"
    paths: ["docs/article1.md", "docs/article2.md"]
  ) {
    path
    frontmatter  # JSON
    frontmatterKeys
    bodyPreview
    parseError
  }
}

# フロントマター分析
query {
  githubAnalyzeFrontmatter(
    repo: "owner/repo"
    paths: ["docs/article1.md", "docs/article2.md"]
  ) {
    suggestedProperties {
      frontmatterKey
      suggestedType
      suggestedOptions
    }
  }
}
```

### GraphQL Mutations

```graphql
# Markdownをインポート
mutation {
  importMarkdownFromGithub(input: {
    orgUsername: "my-org"
    repoUsername: "my-repo"
    repoName: "My Repository"
    githubRepo: "owner/repository"
    paths: ["docs/article1.md", "docs/article2.md"]
    propertyMappings: [
      { frontmatterKey: "title", propertyName: "title", propertyType: STRING }
      { frontmatterKey: "tags", propertyName: "tags", propertyType: SELECT }
    ]
    contentPropertyName: "content"
    skipExisting: false
    enableGithubSync: true
  }) {
    importedCount
    skippedCount
    errors { path, message }
    importedData { id, name }
  }
}
```

## 関連ファイル

### バックエンド (Rust)

- `packages/providers/github/src/oauth.rs` - GitHub API呼び出し
  - `list_directory_contents()` - ディレクトリ内容取得
  - `get_raw_file_content()` - 生ファイル取得
- `apps/library-api/src/usecase/list_github_directory.rs` - ディレクトリリストUsecase
- `apps/library-api/src/usecase/get_markdown_previews.rs` - プレビュー取得Usecase
- `apps/library-api/src/usecase/analyze_frontmatter.rs` - フロントマター分析Usecase
- `apps/library-api/src/usecase/import_markdown_from_github.rs` - インポートUsecase
- `apps/library-api/src/usecase/markdown_composer.rs` - sync_to_githubフラグ処理

### フロントエンド (Next.js)

- `apps/library/src/app/v1beta/[org]/_components/github-import-dialog.tsx` - インポートダイアログUI
- `apps/library/src/app/v1beta/[org]/_components/github-import-actions.ts` - Server Actions
- `apps/library/src/app/v1beta/[org]/_components/github-import.graphql` - GraphQL定義
- `apps/library/src/app/v1beta/[org]/_components/github-import-dialog.stories.tsx` - Storybook

## UI フロー

### Step 1: リポジトリ選択
- GitHub接続済みの場合、アクセス可能なリポジトリ一覧を表示
- 未接続の場合は「Connect with GitHub」ボタンを表示

### Step 2: ファイル選択
- 選択したリポジトリのルートディレクトリからブラウズ開始
- ディレクトリをクリックで中に移動
- ファイル/ディレクトリをチェックボックスで選択
- ディレクトリ選択時は「will import all Markdown files」と表示

### Step 3: 設定
- **Repository Username**: LibraryでのURL slug（重複警告あり）
- **Repository Name**: 表示名
- **Property Mappings**: フロントマターキー → プロパティのマッピング・型設定
- **Content Property**: 本文の格納先
- **Sync ext_github to frontmatter**: GitHubへの同期時にext_githubを含めるか

### Step 4: 完了
- インポート結果のサマリー表示
- 新規リポジトリへのリンク

## 制限事項

- GitHub OAuth認証が必要
- リポジトリへの読み取り権限が必要
- 大きなファイル（100MB以上）は取得できない場合あり
- `.md`拡張子のファイルのみ対象（`.mdx`は`.md`として扱う）

## 関連機能

- [GitHub Sync](./github-sync.md) - LibraryからGitHubへの同期（エクスポート）

## 参考

- [タスクドキュメント](../../tasks/completed/library-v1.6.0/library-github-markdown-import/task.md) — 実装詳細・進捗メモ

