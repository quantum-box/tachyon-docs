---
title: "CMSアプリケーションアーキテクチャ"
topics: ["cms", "UI", "architecture", "content management"]
type: "tech"
published: false
targetFiles: ["apps/cms/src/components"]
---

# CMSアプリケーションアーキテクチャ

このドキュメントでは、tachyon-appsリポジトリにおけるCMSアプリケーションのアーキテクチャと実装について説明します。

## 📄 CMSアーキテクチャドキュメントについて

CMSに関連するアーキテクチャドキュメントは2種類あります：

1. **「cms_architecture.md」(このドキュメント)**:
   - **フォーカス**: UIコンポーネントとフロントエンド設計が中心
   - **内容**: コンポーネント設計原則、データフローパターン、ルーティング設計
   - **特徴**: React/Next.jsの実装例を含み、主にフロントエンド視点で解説

2. **「cms_seamless_architecture.md」**:
   - **フォーカス**: 3層アーキテクチャとCloudflareデプロイに焦点
   - **内容**: Next.js UI、API Routes中間層、Library API連携の詳細実装計画
   - **特徴**: OpenNextによるCloudflareデプロイ、GraphQLクライアント実装、NextAuth.js認証など具体的な技術的詳細が多い

これらは補完的な関係にあり、「cms_architecture.md」は基本設計、「cms_seamless_architecture.md」はより包括的な実装計画を提供します。

## 🚀 実装状況

| フェーズ | 内容 | 状態 |
|--------|------|------|
| 準備 | 要件定義と設計 | ✅ 完了 |
| 1 | 基本的なUI実装 | ✅ 完了 |
| 2 | GraphQL連携機能 | ✅ 完了 |
| 3 | コンテンツ管理機能 | 🔄 進行中 |
| 4 | 認証・権限管理 | 🔄 進行中 |
| 5 | 高度な機能の実装 | 📝 計画中 |
| テスト | 統合テストとバグ修正 | 📝 計画中 |
| 文書化 | 開発者ドキュメント作成 | 🔄 進行中 |

## 🎯 CMSの目的と概要

CMSアプリケーションには、以下の目的があります：

1. **コンテンツの一元管理**: 様々なプロジェクトのコンテンツを一元的に管理する仕組みの提供
2. **簡素化されたインターフェース**: 非技術者でも操作可能な直感的なUI/UX
3. **GraphQL連携**: バックエンドとのシームレスな連携のためのGraphQL実装
4. **コンテンツバージョン管理**: 変更履歴の追跡と復元機能
5. **多言語対応**: 複数言語でのコンテンツ管理
6. **権限管理**: 役割ベースのアクセス制御

## 📋 現状分析

### 技術スタック

- **フレームワーク**:
  - Next.js 14: Appルーターを活用したルーティングとレンダリング
  - React 18: コンポーネントベースのUI構築
  - TypeScript: 静的型付けによる堅牢な開発

- **UI/UXライブラリ**:
  - Tailwind CSS: ユーティリティファーストのスタイリング
  - Radix UI: アクセシビリティを考慮したUIプリミティブ
  - Lucide React: モダンなアイコンセット

- **データ取得**:
  - GraphQL: APIとの通信プロトコル
  - SWR: データフェッチングとキャッシング
  - GraphQL Codegen: 型安全なGraphQLクエリ生成

- **開発ツール**:
  - Storybook: UIコンポーネントの開発と文書化
  - Biome: リンティングとフォーマッティング
  - Chromatic: ビジュアルレグレッションテスト

### コードベースの関連ファイル構造

```
apps/cms/
├── src/
│   ├── app/
│   │   ├── page.tsx                # ランディングページ
│   │   ├── layout.tsx              # ルートレイアウト
│   │   ├── layout-with-header.tsx  # ヘッダー付きレイアウト
│   │   ├── dashboard/             # ダッシュボード関連ページ
│   │   │   └── page.tsx           # ダッシュボード
│   │   └── repositories/          # リポジトリ関連ページ
│   │       └── page.tsx           # リポジトリ一覧
│   ├── components/
│   │   ├── ui/                    # 汎用UIコンポーネント
│   │   │   ├── button.tsx
│   │   │   └── ...
│   │   └── layout/                # レイアウト関連コンポーネント
│   │       ├── header.tsx
│   │       └── sidebar.tsx
│   ├── graphql/
│   │   ├── queries/               # GraphQLクエリ
│   │   │   ├── get-repositories.ts
│   │   │   └── ...
│   │   └── mutations/             # GraphQLミューテーション
│   │       ├── create-repository.ts
│   │       └── ...
│   └── lib/
│       ├── api.ts                 # API関連ユーティリティ
│       └── utils.ts               # 汎用ユーティリティ
```

## 🔄 アーキテクチャ詳細

CMSアプリケーションは以下のアーキテクチャに基づいて構築されています：

### コンポーネント設計原則

1. **コンポーネントの階層化**:
   - `ui/`: 最小単位のUIコンポーネント（ボタン、入力フィールドなど）
   - `layout/`: ページレイアウトを構成するコンポーネント
   - `feature/`: 特定の機能に関連するコンポーネント
   - `page/`: ページ全体を構成するコンポーネント

2. **コンポーネントの責務**:
   - プレゼンテーションとロジックの分離
   - 再利用可能なコンポーネントの作成
   - アクセシビリティを考慮した設計

### データフローパターン

1. **GraphQLによるデータフェッチング**:
   - コード生成によるType-safe操作
   - SWRによるキャッシュとリアルタイム更新
   - エラーハンドリングの統一的な実装

2. **状態管理**:
   - ローカル状態: Reactの`useState`/`useReducer`
   - グローバル状態: コンテキストAPIによる必要最小限の状態共有
   - サーバー状態: SWRによるキャッシュとリアルタイム更新

### ルーティング設計

Next.jsのAppルーターを活用した階層的なルーティング構造:

- `/`: ランディングページ
- `/dashboard`: ダッシュボード
- `/repositories`: リポジトリ一覧
- `/repositories/[id]`: 個別リポジトリ詳細
- `/repositories/[id]/content`: コンテンツ管理

## 📦 コア機能の実装

### リポジトリ管理機能

リポジトリはCMS内のコンテンツを論理的にグループ化する単位です。

- **リポジトリ作成**:
  - リポジトリ名、説明などの基本情報設定
  - 初期コンテンツ構造の定義
  - アクセス権限の設定

- **リポジトリ一覧**:
  - 所有・アクセス可能なリポジトリの表示
  - フィルタリングと検索機能
  - メタデータの表示（更新日時、所有者など）

#### サンプル実装：リポジトリリスト

```tsx
// components/repositories/repository-list.tsx
export function RepositoryList({ repositories }: { repositories: Repository[] }) {
  return (
    <div className="space-y-4">
      {repositories.length === 0 ? (
        <EmptyState 
          title="リポジトリがありません"
          description="新しいリポジトリを作成して始めましょう"
          action={{
            label: "リポジトリを作成",
            href: "/repositories/new"
          }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {repositories.map((repo) => (
            <RepositoryCard key={repo.id} repository={repo} />
          ))}
        </div>
      )}
    </div>
  )
}
```

### コンテンツ管理機能

リポジトリ内のコンテンツを作成・編集・管理するための機能です。

- **コンテンツエディタ**:
  - マークダウン/リッチテキストエディタ
  - メディアの埋め込み
  - バージョン履歴

- **コンテンツ構造管理**:
  - コンテンツモデルの定義
  - カスタムフィールドの追加
  - バリデーションルールの設定

#### サンプル実装：コンテンツエディタ

```tsx
// components/content/content-editor.tsx
export function ContentEditor({ 
  initialContent,
  onSave,
  isLoading 
}: ContentEditorProps) {
  const [content, setContent] = useState(initialContent)
  
  const handleSave = async () => {
    await onSave(content)
  }
  
  return (
    <div className="space-y-4">
      <div className="border rounded-md p-4">
        <Tabs defaultValue="edit">
          <TabsList>
            <TabsTrigger value="edit">編集</TabsTrigger>
            <TabsTrigger value="preview">プレビュー</TabsTrigger>
          </TabsList>
          <TabsContent value="edit">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[300px]"
              placeholder="コンテンツを入力..."
            />
          </TabsContent>
          <TabsContent value="preview">
            <div className="prose dark:prose-dark max-w-none">
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          </TabsContent>
        </Tabs>
      </div>
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isLoading}>
          {isLoading ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  )
}
```

### GraphQL統合

バックエンドとの通信はGraphQLを通じて行われます。

- **自動生成された型安全なクエリ**:
  - GraphQL Codegenによる型定義とフック生成
  - エラーハンドリングの統一
  - パフォーマンス最適化（キャッシング、ページネーションなど）

#### サンプル実装：GraphQLクエリ

```tsx
// graphql/queries/get-repositories.ts
import { gql } from 'graphql-request'

export const GET_REPOSITORIES = gql`
  query GetRepositories($first: Int, $after: String) {
    repositories(first: $first, after: $after) {
      edges {
        node {
          id
          name
          description
          updatedAt
          owner {
            id
            name
          }
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
    }
  }
`
```

## 📊 将来の拡張計画

現在計画されている拡張機能：

1. **ワークフロー管理**:
   - コンテンツの承認フロー
   - スケジュール公開
   - レビュー・フィードバックシステム

2. **API統合**:
   - 外部サービスとの連携
   - Webhookサポート
   - カスタムスクリプト実行

3. **高度な分析**:
   - コンテンツパフォーマンス指標
   - ユーザーアクティビティ追跡
   - レポート生成

4. **コラボレーション機能**:
   - リアルタイム共同編集
   - コメント・フィードバック
   - 通知システム

## 🗓️ ロードマップ

| フェーズ | 作業内容 | 予定期間 | 優先度 | 状態 |
|--------|---------|---------|-------|------|
| 1 | 基本的なUI実装 | 2週間 | 高 | ✅ 完了 |
| 2 | GraphQL連携機能 | 2週間 | 高 | ✅ 完了 |
| 3 | コンテンツ管理機能 | 3週間 | 高 | 🔄 進行中 |
| 4 | 認証・権限管理 | 2週間 | 高 | 🔄 進行中 |
| 5 | ワークフロー管理 | 3週間 | 中 | 📝 計画中 |
| 6 | メディア管理機能 | 2週間 | 中 | 📝 計画中 |
| 7 | 多言語対応 | 2週間 | 中 | 📝 計画中 |
| 8 | API統合機能 | 3週間 | 低 | 📝 計画中 |
| 9 | 分析・レポート機能 | 2週間 | 低 | 📝 計画中 |

## 🛠️ 開発ガイドライン

### コーディング規約

- **コンポーネント命名**: PascalCaseを使用し、機能を明確に表す名前をつける
- **ファイル構造**: 関連するファイルはディレクトリでグループ化
- **スタイリング**: Tailwind CSSのユーティリティクラスを優先し、必要に応じてcva/cnsxで拡張
- **状態管理**: 複雑な状態はuseReducerで管理、グローバル状態は最小限に
- **エラーハンドリング**: try-catchとエラーバウンダリを活用

### テスト戦略

- **コンポーネントテスト**: Storybookを使用してインタラクションテスト
- **E2Eテスト**: Playwrightを使用した重要フローのテスト
- **ビジュアルリグレッションテスト**: Chromaticを活用

### パフォーマンス最適化

- **画像最適化**: Next.jsのImageコンポーネントの活用
- **コード分割**: ダイナミックインポートによる必要なコードの遅延ロード
- **レンダリング戦略**: 適切な箇所でのサーバーコンポーネントの活用
- **キャッシング**: SWRによるデータのキャッシュと再検証

## 📝 参考資料

- [Next.js ドキュメント](https://nextjs.org/docs)
- [GraphQL ドキュメント](https://graphql.org/learn/)
- [SWR ドキュメント](https://swr.vercel.app/)
- [Radix UI コンポーネント](https://www.radix-ui.com/primitives)
- [Tailwind CSS ドキュメント](https://tailwindcss.com/docs)
- [Storybook ガイド](https://storybook.js.org/docs/react/get-started/introduction) 