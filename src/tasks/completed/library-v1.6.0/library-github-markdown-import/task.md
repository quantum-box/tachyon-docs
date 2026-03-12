---
title: "Library GitHub Markdown Import"
type: feature
emoji: "📥"
topics:
  - Library
  - GitHub
  - Markdown
  - Import
published: true
targetFiles:
  - apps/library-api/src/
  - apps/library/src/app/v1beta/
github: https://github.com/quantum-box/tachyon-apps
---

# Library GitHub Markdown Import

## 概要

GitHubリポジトリから特定のディレクトリ内のMarkdownファイルをリストアップし、LibraryのDataとしてインポートする機能を実装する。Markdownのfrontmatterがある場合は、それをプロパティとして取り込む。

## 背景・目的

- **既存機能**: Library → GitHub へのエクスポート/sync機能（`syncDataToGithub`、`bulkSyncExtGithub`）
- **新機能**: GitHub → Library へのインポート機能
- **ユースケース**:
  - 既存のGitHubで管理しているドキュメント/ナレッジベースをLibraryに取り込みたい
  - ブログ記事やドキュメントのMarkdownファイルをLibraryで一元管理したい
  - CI/CDパイプラインからMarkdownファイルを自動インポートしたい

## 詳細仕様

### 機能要件

1. **GitHubリポジトリのディレクトリ内容リストアップ**
   - 指定したリポジトリ・パスのファイル一覧を取得
   - Markdownファイル（`.md`, `.mdx`）のみフィルタリング
   - サブディレクトリの再帰的な探索（オプション）

2. **Markdownファイルのプレビュー**
   - ファイル内容を取得
   - frontmatterをパースしてプロパティを抽出
   - プレビュー表示（frontmatter + 本文の先頭）

3. **インポートプレビューUI**
   - インポート対象ファイルの一覧表示
   - 各ファイルのfrontmatterをプレビュー
   - プロパティマッピングの設定（frontmatterキー → Libraryプロパティ）
   - 選択的インポート（チェックボックス）

4. **一括インポート機能**
   - 選択したファイルをLibraryのDataとして登録
   - frontmatterをプロパティデータに変換
   - 本文（frontmatter以降）をMarkdownプロパティに保存
   - インポート結果のサマリー表示

### 非機能要件

- **パフォーマンス**: 大量ファイル（100+）のリストアップにも対応
- **セキュリティ**: 既存のGitHub OAuth認証を利用
- **エラーハンドリング**: 個別ファイルのエラーが全体を止めない設計

### データフロー

```yaml
import_flow:
  1_list_directory:
    input:
      - github_repo: "owner/repo"
      - directory_path: "docs/articles"
      - recursive: true
    output:
      - files: [{ path, name, sha, size }]

  2_preview_files:
    input:
      - selected_files: [path1, path2, ...]
    output:
      - previews:
        - path: "docs/articles/intro.md"
          frontmatter:
            title: "Introduction"
            tags: ["guide", "beginner"]
            date: "2024-01-01"
          body_preview: "# Introduction\n\nThis guide..."

  3_import_data:
    input:
      - files: [path1, path2, ...]
      - property_mapping:
          title: "name"        # frontmatter.title → data.name
          tags: "tags"         # frontmatter.tags → property "tags"
          date: "published_at" # frontmatter.date → property "published_at"
      - content_property: "content" # 本文の格納先プロパティ
    output:
      - imported: 45
      - skipped: 3
      - errors: [{ path, error }]
```

### Frontmatter マッピング仕様

```yaml
frontmatter_mapping:
  # Data名の決定ロジック（優先順位）
  data_name_resolution:
    1: "frontmatter.title"    # frontmatterのtitleを最優先
    2: "markdown_h1"          # Markdownの最初のH1見出し
    3: "filename"             # ファイル名（拡張子除く）
    
  # プロパティ自動作成
  auto_create_properties: true
  
  # 型の自動推論
  type_inference:
    # 値のバリエーションが5以下ならSelect型
    select_threshold: 5
    # 配列値はMultiSelect型
    array_to_multi_select: true
    # 数値っぽい値はInteger型
    numeric_detection: true
    # 日付っぽい値はString型（日付型がないため）
    date_as_string: true
    
  # ext_github プロパティ
  ext_github:
    auto_create: true
    fields:
      repo: "owner/repo"
      path: "docs/articles/intro.md"
      sha: "abc123..."  # 更新検出用
```

### 重複・更新ロジック

```yaml
duplicate_handling:
  # ext_github.path で同一ファイルを識別
  identify_by: "ext_github.path"
  
  # 既存Dataがある場合は更新（upsert）
  strategy: "upsert"
  
  # SHA比較で変更がなければスキップ
  skip_unchanged: true
```

## 実装方針

### アーキテクチャ設計

#### Backend (Rust - library-api)

**新しいGraphQL Query/Mutation:**

```graphql
# ディレクトリ内容をリストアップ
type Query {
  githubListDirectoryContents(
    repo: String!
    path: String!
    recursive: Boolean
  ): GitHubDirectoryContents!
  
  # Markdownファイルのプレビュー取得
  githubGetMarkdownPreviews(
    repo: String!
    paths: [String!]!
  ): [MarkdownImportPreview!]!
}

type Mutation {
  # Markdownファイルをインポート
  importMarkdownFromGithub(input: ImportMarkdownInput!): ImportMarkdownResult!
}

type GitHubDirectoryContents {
  files: [GitHubFileInfo!]!
  truncated: Boolean!
}

type GitHubFileInfo {
  name: String!
  path: String!
  sha: String!
  size: Int!
  type: String!  # "file" | "dir"
}

type MarkdownImportPreview {
  path: String!
  frontmatter: JSONObject
  frontmatterKeys: [String!]!
  bodyPreview: String!
  parseError: String
}

input ImportMarkdownInput {
  orgUsername: String!
  repoUsername: String!
  githubRepo: String!
  paths: [String!]!
  propertyMapping: [PropertyMappingInput!]!
  contentPropertyName: String!
  skipExisting: Boolean
}

input PropertyMappingInput {
  frontmatterKey: String!
  propertyName: String!
  propertyType: PropertyType!
}

type ImportMarkdownResult {
  importedCount: Int!
  skippedCount: Int!
  errors: [ImportError!]!
  importedData: [Data!]!
}

type ImportError {
  path: String!
  message: String!
}
```

**新しいUsecase:**

```
apps/library-api/src/usecase/
├── list_github_directory.rs      # GitHubディレクトリ内容取得
├── get_markdown_previews.rs      # Markdownプレビュー取得
└── import_markdown_from_github.rs # インポート実行
```

#### Frontend (Next.js - library)

**新しいUI:**

```
# Orgページからインポート（repo作成前でも可能）
apps/library/src/app/v1beta/[org]/import/
├── page.tsx                # インポートページ
├── actions.ts              # Server Actions
├── import.graphql          # GraphQL queries/mutations
└── _components/
    ├── github-repo-selector.tsx   # GitHubリポジトリ選択
    ├── directory-browser.tsx      # ディレクトリブラウザ
    ├── file-list.tsx              # ファイル一覧（チェックボックス付き）
    ├── preview-panel.tsx          # プレビューパネル
    ├── property-mapper.tsx        # プロパティマッピング・型設定
    └── import-wizard.tsx          # ウィザード形式のUI

# Orgページに「Import from GitHub」ボタンを追加
apps/library/src/app/v1beta/[org]/page.tsx
```

**インポートフロー:**
1. Orgページの「Import from GitHub」ボタンをクリック
2. GitHubリポジトリ・パスを選択
3. Markdownファイル一覧を表示、選択
4. プロパティマッピング・型設定をプレビュー
5. 新規Repoを作成 or 既存Repoを選択
6. インポート実行

### 技術選定

#### Frontmatter パース

**Rust側:**
- `gray_matter` クレートまたは手動実装
- YAML frontmatterの解析: `serde_yaml`

**フロントエンド側（プレビュー用）:**
- `gray-matter` (npm package)

#### GitHub API

既存の `packages/providers/github` を活用:
- `GET /repos/{owner}/{repo}/contents/{path}` - ディレクトリ内容取得
- `GET /repos/{owner}/{repo}/git/blobs/{file_sha}` - ファイル内容取得（Base64）

## タスク分解

### 主要タスク

- [x] 要件定義の明確化（本ドキュメント）
- [x] Backend: GitHub ディレクトリ内容リストアップAPI実装
  - `github_provider`に`list_directory_contents`、`get_file_content`、`get_raw_file_content`を追加
- [x] Backend: Markdown frontmatter パース機能実装
  - GraphQL resolver内で`serde_yaml`を使用してYAMLフロントマターをパース
  - H1タグまたはフロントマターのtitleからデータ名を抽出
- [x] Backend: インポートMutation実装
  - `importMarkdownFromGithub` mutationを追加
  - プロパティ自動作成、重複チェック（更新）、ext_github設定を実装
- [x] Frontend: インポートUI実装
  - `GitHubImportDialog`コンポーネントを作成
  - リポジトリ選択 → ファイル選択 → 設定 → インポートの4ステップUI
  - フロントマター分析による型自動推定（5種類以下の値はSelect型を提案）
- [x] テスト・品質確認
  - Storybookストーリー追加（`github-import-dialog.stories.tsx`）
  - ブラウザ動作確認完了
- [x] ドキュメント更新

### フェーズ1: Backend API ✅

1. **GraphQL スキーマ追加**
   - [x] 新しいQuery/Mutation/Type定義
   - [x] `mise run codegen` でスキーマ更新

2. **Usecase実装**
   - [x] `ListGithubDirectory` - ディレクトリ内容取得
   - [x] `GetMarkdownPreviews` - Markdownプレビュー取得
   - [x] `AnalyzeFrontmatter` - フロントマター分析
   - [x] `ImportMarkdownFromGithub` - インポート実行

3. **GitHub API連携**
   - [x] 既存の GitHub OAuth トークンを利用
   - [x] Contents API呼び出し実装
   - [x] Raw file content取得実装

### フェーズ2: Frontend UI ✅

1. **インポートダイアログ作成**
   - [x] Orgページに「Import from GitHub」ボタン追加
   - [x] ダイアログ形式のインポートUI

2. **コンポーネント実装**
   - [x] リポジトリ選択UI
   - [x] ディレクトリ/ファイル一覧（チェックボックス付き）
   - [x] Markdownプレビューパネル
   - [x] プロパティマッピング・型設定

3. **インポート実行フロー**
   - [x] 4ステップウィザード（リポジトリ選択 → ファイル選択 → 設定 → 完了）
   - [x] 同名リポジトリ警告表示
   - [x] 結果サマリー表示

## Playwright MCPによる動作確認

### 動作確認チェックリスト

#### インポートダイアログ
- [x] Orgページから「Import from GitHub」ボタンでダイアログ表示
- [x] GitHub接続状態の表示
- [x] リポジトリ選択ドロップダウン
- [x] ディレクトリパスのブラウジング

#### ディレクトリブラウザ
- [x] ディレクトリ内容のリストアップ
- [x] Markdownファイルのみ表示
- [x] ファイル/ディレクトリ選択（チェックボックス）
- [x] ディレクトリ選択時の再帰的インポート

#### プレビュー
- [x] 選択ファイルのfrontmatter表示
- [x] 本文プレビュー表示
- [x] プロパティ型の自動推定

#### プロパティマッピング
- [x] 検出されたfrontmatterキー一覧
- [x] プロパティへのマッピング設定
- [x] 型選択（String, Integer, Select等）
- [x] 本文格納先プロパティ選択
- [x] ext_github frontmatter同期オプション

#### インポート実行
- [x] 同名リポジトリ警告表示
- [x] インポート中のローディング表示
- [x] 成功時の結果サマリー
- [x] sync_to_github: true/falseの動作確認

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 大量ファイルのリストアップ | 中 | ページネーション実装、`truncated`フラグ |
| frontmatterパースエラー | 低 | 個別エラーとして処理、全体を止めない |
| GitHub API レート制限 | 中 | キャッシュ活用、バッチリクエスト |
| 大きなファイルの取得 | 低 | Blob APIでBase64取得、サイズ制限 |
| 既存Dataとの重複 | 中 | `skipExisting`オプション、ユニークID検出 |

## 参考資料

- [GitHub Contents API](https://docs.github.com/en/rest/repos/contents)
- [GitHub Blobs API](https://docs.github.com/en/rest/git/blobs)
- [gray-matter (npm)](https://github.com/jonschlinkert/gray-matter)
- 既存実装: `apps/library-api/src/usecase/bulk_sync_ext_github.rs`

## 完了条件

- [x] すべての機能要件を満たしている
- [ ] コードレビューが完了
- [x] 動作確認レポートが完成している
- [x] 正式な仕様ドキュメントを作成済み
- [ ] タスクディレクトリを completed/[新バージョン]/ に移動済み

### バージョン番号の決定基準

**マイナーバージョン（x.X.x）を上げる場合:**
- [x] 新機能の追加（GitHub Markdownインポート）
- [x] 新しいAPIエンドポイントの追加
- [x] 新しい画面の追加

→ **Library v1.6.0** としてリリース予定

## 実装完了記録

### 追加されたファイル

**Backend (library-api):**
- `apps/library-api/src/usecase/list_github_directory.rs`
- `apps/library-api/src/usecase/get_markdown_previews.rs`
- `apps/library-api/src/usecase/analyze_frontmatter.rs`
- `apps/library-api/src/usecase/import_markdown_from_github.rs`

**Frontend (library):**
- `apps/library/src/app/v1beta/[org]/_components/github-import-dialog.tsx`
- `apps/library/src/app/v1beta/[org]/_components/github-import-actions.ts`
- `apps/library/src/app/v1beta/[org]/_components/github-import.graphql`
- `apps/library/src/app/v1beta/[org]/_components/github-import-dialog.stories.tsx`

**Provider:**
- `packages/providers/github/src/oauth.rs` に `list_directory_contents`, `get_file_content`, `get_raw_file_content` 追加

### 追加された依存関係

- `async-recursion = "0.4"` (library-api)
- `base64 = "0.22"` (github provider)

### PR

- https://github.com/quantum-box/tachyon-apps/pull/925

## 備考

- 既存のGitHub OAuth認証機構を最大限活用
- 将来的には、GitHub Actions からの自動インポートWebhookも検討可能
- MDX対応は初期バージョンではスコープ外（`.mdx`ファイルは`.md`として扱う）

