# サービスアカウント単体取得フロー

## 概要

サービスアカウント詳細ページは従来、`serviceAccounts` 一覧クエリの結果をクライアント側でフィルタしていました。この方式では存在しない ID に対して `notFound()` が発火せず、全件取得によるパフォーマンス低下も生じていました。本仕様では ID 指定の GraphQL クエリ `serviceAccount` を導入し、ユースケース層で単体取得と認可判定を行うことで、詳細ページのデータ取得とエラーハンドリングを最適化します。

## GraphQL 仕様

```graphql
query ServiceAccount($operatorId: ID!, $serviceAccountId: ID!) {
  serviceAccount(operatorId: $operatorId, id: $serviceAccountId) {
    id
    tenantId
    name
    description
    createdAt
    updatedAt
    apiKeys {
      id
      name
      tokenType
      createdAt
    }
    policies {
      id
      name
      description
      isSystem
      createdAt
      updatedAt
    }
  }
}
```

- `operatorId`: `tn_` 形式のテナント ID。
- `id`: `sa_` 形式のサービスアカウント ID。
- 返り値が `null` の場合、Next.js 側で `notFound()` を呼び出す運用を推奨。

## 認可

- Usecase `FindServiceAccount` は `CheckPolicy` を介して `auth:FindAllServiceAccounts` アクションの権限を検証します。
- 実行者 (`executor`) と `MultiTenancyAction` から取得したコンテキストを基に、`ServiceAccountRepository::get_by_id` を実行します。
- レコードが見つからない場合は `errors::not_found` を返し、GraphQL 層で `null` に変換します。

## 実装ポイント

### バックエンド

- `packages/auth/src/usecase/find_service_account.rs`
  - 単体取得用ユースケースを追加。
  - 認可チェック → リポジトリ検索 → NotFound ハンドリングを一貫化。
- `packages/auth/src/interface_adapter/controller/resolver.rs`
  - `serviceAccount` フィールドを追加し、ユースケースを呼び出す。
- `packages/auth/src/interface_adapter/gateway/sqlx_service_account_repository.rs`
  - `get_by_id` 実装を強化し、ポリシー情報を含むレコードを返却。

### フロントエンド

- `apps/tachyon/src/app/v1beta/[tenant_id]/iam/service_account/[service_account_id]/page.tsx`
  - 新クエリ `ServiceAccount` を利用し、`null` 時は `notFound()` を呼び出す。
- `apps/tachyon/src/gen/graphql.ts`
  - `mise run codegen` 実行後の型を利用。
- `apps/tachyon/src/app/v1beta/[tenant_id]/iam/service_account/service-account.graphql`
  - クエリ定義を追加。

## テスト

- `apps/tachyon/src/components/agent/ChatInput.test.tsx` 等の周辺テストに影響がないことを確認。
- `apps/tachyon/src/app/v1beta/[tenant_id]/iam/service_account/[service_account_id]/__tests__/`
  - 404 ハンドリングと正常ケースを検証。
- `mise run ci-node`
  - TypeScript/GraphQL コード生成後のビルドを通過。

## 運用ガイド

- 詳細ページは常に `serviceAccount` クエリを使用し、一覧データからのフィルタを行わない。
- API キー作成・削除後は該当クエリをリフェッチして一貫した表示を保つ。
- GraphQL レスポンスが `null` の場合はユーザーに 404 ページを返すか、適切なメッセージを表示する。

## 関連タスク

- [service-account-detail-fetch タスク](../../tasks/completed/v0.19.1/service-account-detail-fetch/task.md)
- [検証レポート](../../tasks/completed/v0.19.1/service-account-detail-fetch/verification-report.md)

> Release: v0.19.1
