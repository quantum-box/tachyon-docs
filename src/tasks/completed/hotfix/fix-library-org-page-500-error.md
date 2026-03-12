# Hotfix: Library Org Page 500 Error

## Status: Completed

## Issue
Library の org ページ (`https://library.n1.tachy.one/v1beta/quantum-box`) にアクセスすると 500 エラーが発生する。

## Root Cause
`apps/library/src/lib/graphql.ts` の `executeGraphQL` 関数が、環境に関係なく常に `Authorization: 'Bearer dummy-token'` を送信していた。本番環境では `dummy-token` は無効なため、`connections` GraphQL クエリ実行時に認証エラーが発生し、500 エラーとなっていた。

## Solution
1. `executeGraphQL` に `accessToken` をオプションパラメータとして追加
2. 開発環境では `dummy-token` にフォールバック、本番環境では渡された `accessToken` を使用
3. 各ページからセッションの `accessToken` を渡すように修正
4. `operatorId` パラメータも併せて追加

### 技術的な詳細
当初は `graphql.ts` 内で直接 `auth()` を呼び出す実装を試みたが、`graphql.ts` を使用するクライアントコンポーネント（`linear-extension-settings.tsx`）が存在するため、`node:crypto` モジュールの webpack バンドルエラーが発生した。

最終的な解決策として、`auth` のインポートを削除し、`accessToken` をパラメータとして受け取る方式に変更。サーバーコンポーネント側でセッションから `accessToken` を取得して渡すことで、クライアントコンポーネントとの互換性を維持しつつ本番環境での認証を実現した。

## Changed Files
- `apps/library/src/lib/graphql.ts`
- `apps/library/src/app/v1beta/[org]/page.tsx`
- `apps/library/src/app/v1beta/[org]/[repo]/settings/page.tsx`
- `apps/library/src/app/v1beta/[org]/[repo]/settings/extensions/page.tsx`

## PR
https://github.com/quantum-box/tachyon-apps/pull/974

## Date
2026-01-16
