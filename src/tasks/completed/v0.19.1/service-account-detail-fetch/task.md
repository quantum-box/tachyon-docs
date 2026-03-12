---
title: "サービスアカウント詳細の単体取得対応"
type: "bugfix"
emoji: "🛠️"
topics:
  - tachyon
  - auth
  - graphql
published: false
targetFiles:
  - apps/tachyon/src/app/v1beta/[tenant_id]/iam/service_account/[service_account_id]/page.tsx
  - apps/tachyon/src/app/v1beta/[tenant_id]/iam/service_account/service-account.graphql
  - packages/auth/src/interface_adapter/controller/resolver.rs
  - packages/auth/src/usecase/find_service_account.rs
  - packages/auth/src/interface_adapter/gateway/sqlx_service_account_repository.rs
  - apps/tachyon/src/gen/graphql.ts
  - apps/tachyon/src/app/v1beta/[tenant_id]/iam/service_account/[service_account_id]/__tests__/*
github: ""
---

## 概要

サービスアカウント詳細ページが一覧取得結果からローカルフィルタしているため、対象IDのデータが存在しない場合に404が返らず、不要なデータ転送が発生している。GraphQLレイヤーにID指定の単体取得クエリを追加し、フロントエンドが直接該当サービスアカウントを取得するよう修正する。

## 背景・目的

- 詳細ページがリストクエリを流用しており、ID一致しないケースで`notFound()`が走らないバグがある。
- 全件取得はパフォーマンスを悪化させ、サービスアカウント数が増えるとユーザー体験とバックエンド負荷が悪化する。
- バックエンドには`get_by_id`が存在するため、GraphQL経由の単体取得を早期に提供するのが目的。

## 詳細仕様

### 機能要件

1. GraphQL Query `serviceAccount`（仮称）を追加し、`operatorId`と`serviceAccountId`を引数に単一のサービスアカウントを返却する。
2. 返却ペイロードには既存`ServiceAccountWithPolicies`フラグメントと同等のフィールド（ポリシー含む）を含める。
3. フロントエンド詳細ページは新クエリを利用してデータを取得し、存在しない場合は`notFound()`を返す。

### 非機能要件

- GraphQL認可ポリシーは既存一覧取得と同等（`auth:FindAllServiceAccounts`）を再利用する。
- クエリ実行時間は既存の`get_by_id` SQLと同等であり、インデックス利用によりO(1)取得を想定。
- APIレスポンスは1件のみであるため、余分なデータ転送を避ける。

### コンテキスト別の責務

- `auth` コンテキスト: 単体取得ユースケース（新規）とGraphQL Resolverの追加。
- `apps/tachyon` フロント: 新クエリ利用とページエラーハンドリング更新。

### 仕様のYAML定義

```yaml
query:
  name: serviceAccount
  inputs:
    operatorId: TenantId   # tn_... 形式
    serviceAccountId: ServiceAccountId # sa_... 形式
  output:
    serviceAccount:
      id: ServiceAccountId
      tenantId: TenantId
      name: string
      createdAt: ISO8601
      policies:
        - id: PolicyId
          name: string
          description: string | null
          isSystem: bool
          createdAt: ISO8601
          updatedAt: ISO8601
  errors:
    notFound: when service account does not exist for operator
    forbidden: when executor lacks auth:FindAllServiceAccounts
```

## 実装方針

### アーキテクチャ設計

- `packages/auth` に単体取得用ユースケース `FindServiceAccount` を追加し、リポジトリの `get_by_id` を呼び出す。
- GraphQL Resolver に `serviceAccount` フィールドを追加し、ユースケースを呼び出して結果をラップする。
- SDKコード生成(`mise run codegen`)により新クエリをTypeScript側に反映。
- Next.jsページでは新クエリを使い、`ServiceAccountDetail`コンポーネントへ結果を渡す。

### 技術選定

- 既存スタックに準拠（async-graphql, sqlx, GraphQL Codegen）。
- 認証・認可ロジックは既存`FindAllServiceAccount`と同一の`CheckPolicy`を利用。

### TDD戦略

- ユースケースの単体テストを追加し、存在する／存在しないケースの挙動を検証。
- GraphQL Resolverの統合テストは既存枠があれば追加、なければスキップ。
- フロントはユニットテスト（モックレスポンス）で`notFound()`ハンドリング確認を検討。

## タスク分解

### 主要タスク
- [x] GraphQLスキーマ拡張・ユースケース実装
- [x] SDK再生成 (`mise run codegen`)
- [x] Next.jsページのクエリ差し替え
- [ ] テスト作成・更新
- [ ] 動作確認・ドキュメント更新

## Playwright MCPによる動作確認

### 実施タイミング
- [ ] 実装完了後の初回動作確認
- [ ] PRレビュー前の最終確認

### 動作確認チェックリスト
- [ ] 既存サービスアカウントの詳細ページが正常表示される
- [ ] 存在しないIDへの遷移で404が表示される
