# Taskflow UI実装

## 概要
Taskflowの結果一覧を表示するUIをTachyonに追加する。

## ステータス: ✅ 完了

## 現状分析
- **ドメインモデル**: `AsyncTask`, `AsyncStatus` 実装済み（packages/taskflow）
- **REST API**: `/v1/taskflow/tasks` 実装済み
- **GraphQL API**: ✅ 実装済み
- **UI**: ✅ 実装済み

## 実装方針
1. GraphQL APIを追加（既存パターンに合わせる）
2. UIは `/v1beta/[tenant_id]/system/taskflow` に配置

## 実装タスク

### Phase 1: GraphQL API実装
- [x] GraphQL型定義（AsyncTask, AsyncStatus）
- [x] Query resolver実装（asyncTasks, asyncTask）
- [x] Mutation実装（cancelAsyncTask, deleteAsyncTask）
- [x] tachyon-apiへの統合

### Phase 2: フロントエンド実装
- [x] GraphQLクエリ/ミューテーション定義
- [x] codegen実行
- [x] タスク一覧ページ実装
- [x] タスク詳細表示（メタデータダイアログ）
- [x] フィルタ機能（ステータス別）
- [x] 自動リフレッシュ（10秒間隔）
- [x] サイドバーへのリンク追加

### Phase 3: 動作確認
- [ ] Storybook作成（スキップ）
- [x] コンパイル確認
- [x] Playwright動作確認 ✅

## 技術仕様

### GraphQL Schema（予定）
```graphql
enum AsyncTaskStatus {
  CREATED
  IN_PROGRESS
  COMPLETED
  FAILED
  CANCELLED
}

type AsyncTask {
  id: ID!
  name: String!
  status: AsyncTaskStatus!
  createdAt: DateTime!
  updatedAt: DateTime!
  completedAt: DateTime
  errorMessage: String
  metadata: JSON
}

type Query {
  asyncTasks(
    limit: Int
    offset: Int
    status: AsyncTaskStatus
  ): [AsyncTask!]!

  asyncTask(id: ID!): AsyncTask
}

type Mutation {
  cancelAsyncTask(id: ID!): AsyncTask!
  deleteAsyncTask(id: ID!): Boolean!
}
```

### UI配置
```
apps/tachyon/src/app/v1beta/[tenant_id]/system/taskflow/
├── page.tsx          # タスク一覧ページ
├── components/
│   ├── task-list.tsx
│   ├── task-status-badge.tsx
│   └── task-filter.tsx
└── queries.graphql
```

## 進捗ログ
- 2025-01-21: taskdoc作成、調査完了
- 2025-01-21: GraphQL API実装完了（types, query, mutation）
- 2025-01-21: フロントエンド実装完了（一覧ページ、フィルター、キャンセル/削除アクション）
- 2025-01-21: codegen完了、コンパイル確認済み
- 2025-01-21: Playwright動作確認完了（スクリーンショット: screenshots/）

## 作成ファイル一覧

### バックエンド（Rust）
- `packages/taskflow/src/graphql/mod.rs` - モジュールエクスポート
- `packages/taskflow/src/graphql/types.rs` - GraphQL型定義
- `packages/taskflow/src/graphql/query.rs` - Query resolver
- `packages/taskflow/src/graphql/mutation.rs` - Mutation resolver
- `apps/tachyon-api/src/graphql/resolver.rs` - 統合（変更）

### フロントエンド（Next.js）
- `apps/tachyon/src/app/v1beta/[tenant_id]/system/taskflow/page.tsx`
- `apps/tachyon/src/app/v1beta/[tenant_id]/system/taskflow/taskflow-client.tsx`
- `apps/tachyon/src/app/v1beta/[tenant_id]/system/taskflow/queries.graphql`
- `apps/tachyon/src/app/v1beta/[tenant_id]/sidebar-config.ts` - サイドバー設定（変更）
