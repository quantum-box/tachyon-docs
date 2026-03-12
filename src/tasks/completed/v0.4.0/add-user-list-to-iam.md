---
title: "IAMにユーザー一覧機能を追加"
type: "feature"
emoji: "👥"
topics:
  - IAM
  - User Management
  - Next.js
  - TypeScript
published: true
targetFiles:
  - apps/tachyon/src/app/v1beta/[tenant_id]/iam/
  - apps/tachyon/src/app/v1beta/[tenant_id]/iam/user/
  - apps/tachyon-api/src/graphql/
github: https://github.com/quantum-box/tachyon-apps
---

# IAMにユーザー一覧機能を追加

## 概要

Tachyon IAMモジュールに、テナント内のユーザー一覧を表示・管理する機能を追加します。現在はOperatorとService Accountの管理機能のみ実装されているため、通常のユーザー管理機能を実装します。

## 背景・目的

- 現在のIAMモジュールにはOperatorとService Accountの管理機能のみ存在
- テナント管理者が通常のユーザーを管理する手段がない
- ユーザーの招待、権限管理、無効化などの基本的な管理機能が必要

## 詳細仕様

### 機能要件

1. **ユーザー一覧表示**
   - テナント内の全ユーザーを一覧表示
   - ユーザー名、メールアドレス、ロール、ステータス、最終ログイン日時を表示
   - ページネーション対応（20件/ページ）
   - 検索・フィルタリング機能

2. **ユーザー詳細表示**
   - ユーザーの詳細情報を表示
   - 割り当てられているロールとアクセス権限
   - アクティビティ履歴

3. **ユーザー管理機能**
   - ユーザーの招待（メールによる招待）
   - ロールの割り当て・変更
   - ユーザーの有効化・無効化
   - ユーザーの削除（論理削除）

### 非機能要件

- レスポンシブデザイン対応
- 権限チェック（テナント管理者のみアクセス可能）
- 監査ログの記録
- パフォーマンス：一覧表示は1秒以内

### データモデル

```yaml
# ユーザー情報
user:
  id: string          # ユーザーID（ULID）
  tenant_id: string   # テナントID
  email: string       # メールアドレス
  name: string        # 表示名
  status: enum        # active, inactive, invited
  roles: array        # ロールのリスト
  created_at: datetime
  updated_at: datetime
  last_login_at: datetime
  
# ユーザーロール
user_role:
  user_id: string
  role_id: string
  assigned_at: datetime
  assigned_by: string
```

## 実装方針

### アーキテクチャ設計

- 既存のIAM構造に従い、Operator管理と同様のパターンで実装
- Next.js App Routerを使用
- Server Componentsで権限チェックとデータ取得
- Client Componentsでインタラクティブな操作

### 技術選定

- **Frontend**: Next.js, TypeScript, shadcn/ui
- **API**: GraphQL (tachyon-api)
- **State Management**: Server Actions
- **UI Components**: 既存のOperatorページのコンポーネントを参考に実装
- **テーブル**: TanStack Table (React Table)
- **認証**: Cognito + authWithCheck

### 既存実装の活用

- `packages/auth`に既に`find_all_users` usecaseが存在するため、GraphQL APIとして公開するだけで良い
- Operatorページの実装パターン（テーブル、ダイアログ、アクション）を踏襲
- サイドバーメニューにユーザー管理を追加（Service AccountとOperatorと同列）

### ファイル構成

```
apps/tachyon/src/app/v1beta/[tenant_id]/iam/
├── user/
│   ├── page.tsx              # ユーザー一覧ページ
│   ├── [user_id]/
│   │   └── page.tsx          # ユーザー詳細ページ
│   ├── table.tsx             # ユーザー一覧テーブル
│   ├── invite-user-form.tsx  # ユーザー招待フォーム
│   ├── edit-user-dialog.tsx  # ユーザー編集ダイアログ
│   ├── delete-user-dialog.tsx # ユーザー削除確認ダイアログ
│   └── action.ts             # Server Actions
└── page.tsx                  # IAMトップページ（更新）
```

## タスク分解

### フェーズ1: 基本的なユーザー一覧機能 ✅ (2025-01-13 完了)
- [x] GraphQLスキーマの定義（AuthQueryに`users`を追加）
- [x] 既存の`find_all_users` usecaseをGraphQL APIとして公開
- [x] ユーザー一覧ページの作成（`/iam/user/page.tsx`）
- [x] ユーザーテーブルコンポーネントの実装（Operatorテーブルを参考に）
- [x] サイドバーメニューにユーザー管理を追加
- [x] GraphQLクエリファイル作成（`UserListPage.graphql`）

実装メモ: 
- 既存の`find_all_users` usecaseを活用し、GraphQL resolverに`users`メソッドを追加するだけで実装完了
- `cargo r --bin tachyon_codegen`でGraphQLスキーマを生成
- UIはOperatorページのパターンを踏襲し、統一感のあるデザインを実現

### フェーズ2: ユーザー管理機能 🔄 (一部完了)
- [x] ユーザー招待機能の実装
- [ ] ロール管理機能の実装 (バックエンドAPI未実装)
- [ ] ユーザー編集・削除機能の実装 (バックエンドAPI未実装)
- [x] Server Actionsの実装

実装メモ:
- 既存の`invite_user_to_operator` APIを活用してユーザー招待機能を実装
- メール通知オプション付きの招待フォームを作成
- ユーザー編集・削除はバックエンドAPIが未実装のため保留

### フェーズ3: 詳細機能とUI改善 ✅ (2025-01-13 完了)
- [x] 検索・フィルタリング機能の追加（グローバル検索、ロールフィルター）
- [x] ページネーションの実装（ページサイズ選択、詳細表示）
- [x] レスポンシブデザインの確認
- [ ] ユーザー詳細ページの実装

実装メモ:
- TanStack Tableのグローバルフィルター機能を活用
- ページサイズ選択（10/20/30/40/50件）とページナビゲーション
- ロールによるフィルタリング機能
- 改善されたページネーション（最初/最後ページへのジャンプ）

### フェーズ4: 動作確認とドキュメント 📝
- [ ] Playwright MCPを使った動作確認（ユーザー一覧、招待、編集、削除）
- [ ] Storybookストーリーの作成
- [ ] ドキュメントの更新

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 既存の認証システムとの統合 | 高 | Cognitoとの連携を慎重に設計、既存のauth実装を参考に |
| 権限管理の複雑性 | 中 | 既存のOperator管理の権限チェックパターンを踏襲 |
| パフォーマンス（大量ユーザー） | 中 | ページネーションとインデックスの適切な設定 |

## 参考資料

- 既存のOperator管理実装: `/apps/tachyon/src/app/v1beta/[tenant_id]/iam/operator/`
- Service Account管理実装: `/apps/tachyon/src/app/v1beta/[tenant_id]/iam/service_account/`
- 認証実装: `/apps/tachyon/src/app/auth.ts`

## 完了条件

- [ ] テナント管理者がユーザー一覧を確認できる
- [ ] ユーザーの招待・編集・削除が正常に動作する
- [ ] 権限チェックが適切に機能している
- [ ] Playwright MCPでの動作確認が完了
- [ ] コードレビューが完了
- [ ] ドキュメントが更新されている

## 備考

- 初期実装では基本的な機能に絞り、段階的に機能を追加していく
- Cognitoとの連携部分は既存の実装パターンに従う
- UIデザインは既存のOperator管理画面と統一性を保つ