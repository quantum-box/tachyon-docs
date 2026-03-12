# Tachyonフロントエンドのバックエンドエンドポイント統一

## 概要

Tachyonフロントエンドでは GraphQL・REST・LLMS 関連のクライアントがそれぞれ個別の環境変数 (`NEXT_PUBLIC_GRAPHQL_URL`, `NEXT_PUBLIC_API_URL` など) に依存していました。Amplify 本番環境では `NEXT_PUBLIC_BACKEND_API_URL` のみが設定されているため、未定義の変数を参照したクライアントが `http://localhost:50054` にフォールバックし、本番アクセスが失敗する課題がありました。本仕様では、`NEXT_PUBLIC_BACKEND_API_URL` を単一のソース・オブ・トゥルースとして扱い、各クライアントが共通ユーティリティ経由でエンドポイントを解決する構造に整理します。

## 目的

- 本番環境で `localhost` へ誤送信される GraphQL / REST リクエストを解消する。
- エンドポイント解決ロジックを一元化し、将来の URL 変更を単一箇所で完結させる。
- 開発環境で環境変数が未設定の場合にのみ警告を出し、運用での設定漏れを早期に検知する。

## ユーティリティ仕様

| 関数名 | 役割 |
| --- | --- |
| `getBackendBaseUrl()` | `NEXT_PUBLIC_BACKEND_API_URL` をトリムして返却。未設定時は `http://localhost:50054` を返し、初回のみ `console.warn` (開発時) / `console.error` (本番ビルド時) を出力。|
| `getBackendUrl(path)` | `getBackendBaseUrl()` と連結し、先頭スラッシュを強制する。|
| `getGraphqlEndpointUrl()` | `getBackendUrl('/v1/graphql')` を返す。|
| `getPublicGraphqlEndpointUrl()` | `getBackendUrl('/v1/public/graphql')` を返す。|
| `getLlmsBaseUrl()` | `NEXT_PUBLIC_LLMS_API_URL` が定義されていればそのトリム値、無ければ `getBackendBaseUrl()`。|
| `getLlmsUrl(path)` | `getLlmsBaseUrl()` と連結し、LLMS REST パスを生成する。|

### 警告メッセージ

```
NEXT_PUBLIC_BACKEND_API_URL is not set. Falling back to http://localhost:50054
```

- SSR/CSR 双方で一度だけ表示する。
- `NODE_ENV=production` では `console.error` を用いてビルド時ログに強調。

## 利用コンポーネント

- **Apollo Client** (`apps/tachyon/src/components/apollo-provider.tsx`)
  - GraphQL HTTP リンクに `getGraphqlEndpointUrl()` を使用。
  - 認証ヘッダー (`Authorization`, `x-operator-id`, `x-user-id`) は従来通り。
- **OpenFeature Provider** (`apps/tachyon/src/lib/openfeature/openfeature-provider.tsx`)
  - Feature Flag フェッチの GraphQL URI を共通ユーティリティに切替。
- **REST クライアント** (`apps/tachyon/src/lib/api/client-factory.ts` / `tachyon-api.ts`)
  - `getBackendUrl()` を利用し API ルートを生成。
- **LLMS クライアント** (`apps/tachyon/src/lib/llms-api*.ts`)
  - `NEXT_PUBLIC_LLMS_API_URL` が個別に指定されていない場合はバックエンド URL を使う。

## テスト

- `apps/tachyon/src/lib/api/__tests__/backend-endpoint.test.ts`
  - 環境変数の有無・トリム・警告回数・LLMS override を検証。
- `mise run ci-node`
  - Lint/Format/TypeScript チェックがグリーンであることを確認。
- Playwright MCP による手動検証
  - `tachyon-dev` テナントで GraphQL と `/v1/llms/chatrooms` の実コール先が `NEXT_PUBLIC_BACKEND_API_URL` に一致することを Network タブで確認。

## 運用上の注意

- Amplify / Vercel などのホスティング環境では `NEXT_PUBLIC_BACKEND_API_URL` を必須環境変数として設定する。
- ローカル開発では `.env.local` で明示設定するか、未設定時は警告を確認する。
- 追加の REST / GraphQL クライアントを実装する際は `backend-endpoint` ユーティリティを必ず利用する。

## 関連タスク

- [fix-tachyon-backend-endpoint タスク](../../tasks/completed/v0.19.1/fix-tachyon-backend-endpoint/task.md)
- [検証レポート](../../tasks/completed/v0.19.1/fix-tachyon-backend-endpoint/verification-report.md)

> Release: v0.19.1
