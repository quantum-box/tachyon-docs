---
title: "TachyonフロントエンドのバックエンドURL統一"
type: bugfix
emoji: "🛠️"
topics:
  - tachyon
  - graphql
  - environment
published: true
targetFiles:
  - apps/tachyon/src/components/apollo-provider.tsx
  - apps/tachyon/src/lib/openfeature/openfeature-provider.tsx
  - apps/tachyon/src/lib/api/client-factory.ts
  - apps/tachyon/src/lib/llms-api.ts
  - apps/tachyon/src/lib/llms-api-extended.ts
  - apps/tachyon/src/lib/tachyon-api.ts
  - apps/tachyon/.env.sample
github: https://github.com/quantum-box/tachyon-apps/tree/main/docs/src/tasks/bugfix/fix-tachyon-backend-endpoint
---

# TachyonフロントエンドのバックエンドURL統一

## 概要

Tachyonフロントエンドで利用しているGraphQL/REST/OpenFeatureのエンドポイント解決を `NEXT_PUBLIC_BACKEND_API_URL` に一本化し、本番環境で `localhost` を指してしまう問題を解消する。

## 背景・目的

- Amplify本番環境では `NEXT_PUBLIC_BACKEND_API_URL` のみが設定されており、`NEXT_PUBLIC_GRAPHQL_URL` / `NEXT_PUBLIC_API_URL` は未定義のまま。
- 現状のApollo ProviderやOpenFeature Providerが未定義の環境変数に依存し、フォールバックとして `http://localhost:50054` を利用している。
- 本番利用時に GraphQL クエリ（`GetFeatureFlagActionAccess`、`GetPolicies` 等）がすべて失敗し、サイドバーやポリシー管理画面が動作しない状態になっている。

## 詳細仕様

### 機能要件

1. フロントエンドのApollo HTTPリンクは `NEXT_PUBLIC_BACKEND_API_URL + '/v1/graphql'` をデフォルトとし、環境変数未設定時のみローカル用URLへフォールバックする。
2. OpenFeature Provider、RESTクライアント（`client-factory`）、LLMSクライアントが同じユーティリティを利用してURLを解決する。
3. `NEXT_PUBLIC_GRAPHQL_URL` / `NEXT_PUBLIC_API_URL` への依存を撤廃し、不要になった参照を削除する。
4. `.env.sample` 等に `NEXT_PUBLIC_BACKEND_API_URL` を追加し、開発者が適切な値を設定できるようにする。
5. 受け入れ条件: 本番値を想定した環境変数を設定した状態でビルド・起動し、ブラウザNetworkタブに `localhost` が現れないこと。

### 非機能要件

- フォールバックが発動した場合は `console.warn` などで開発者に通知し、本番では必ず環境変数を設定する運用に寄与する。
- URL取得をユーティリティに集約し、将来的なエンドポイント変更が一箇所で済むよう保守性を高める。
- 既存のCI/CDやTerraform設定には影響を与えない（同名の環境変数を利用）。

### コンテキスト別の責務

- `apps/tachyon`: URLユーティリティを実装し、Apollo/OpenFeature/REST/LLMSクライアントをリファクタリングする。
- `cluster/` 等のインフラ側: 既に `NEXT_PUBLIC_BACKEND_API_URL` を供給しているため追加作業は不要。ドキュメントだけ確認する。

### 仕様のYAML定義

```yaml
frontend_endpoint:
  env_var: NEXT_PUBLIC_BACKEND_API_URL
  default_dev: "http://localhost:50054"
  consumers:
    apollo: "/v1/graphql"
    openfeature: "/v1/graphql"
    rest: "/v1"
  warnings:
    missing_env: "NEXT_PUBLIC_BACKEND_API_URL is not set. Falling back to http://localhost:50054"
```

#### YAML記述ガイドライン

- `NEXT_PUBLIC_` プレフィックスの命名規則を維持する。
- 変更が必要になった場合はこの定義を更新し、利用側のコードはユーティリティ経由で参照させる。

## 実装方針

### アーキテクチャ設計

- `apps/tachyon/src/lib/config/backend-endpoint.ts`（仮称）を新設し、`getBackendBaseUrl()` を提供する。
- Apollo Provider / OpenFeature Provider / REST クライアント / LLMS クライアントで上記関数を参照し、重複実装を排除する。
- `tachyon-api.ts` では `ENDPOINT` を新ユーティリティから取得し、定義の一貫性を保つ。

### 技術選定

- Next.js + TypeScript の既存構成を踏襲し、新規ライブラリは導入しない。
- ユーティリティはNode/Browser双方で評価可能なように `process.env` をラップし、SSR/CSRどちらでも動作する構造にする。

### TDD（テスト駆動開発）戦略

#### 既存動作の保証
- 新ユーティリティ用に環境変数の有無を検証する単体テストを追加する。
- `mise run ci-node` を実行し、既存のlint/テストでリグレッションがないことを確認する。

#### テストファーストアプローチ
- 先に `getBackendBaseUrl` のテストケース（設定あり／なし）を記述し、GREENになるように実装する。

#### 継続的検証
- 変更後に再度 `mise run ci-node` を実行。
- Playwright MCP でE2E確認時にGraphQLコール先URLを確認する。

## タスク分解

- [✅] ユーティリティ設計と参照箇所の棚卸し（2025-10-26着手）
- [✅] `getBackendBaseUrl` 実装および単体テスト追加
- [✅] Apollo/OpenFeature/REST/LLMS クライアントをユーティリティ利用へリファクタリング
- [✅] `.env.sample` / `.env.local` の更新
- [✅] `mise run ci-node` 実行
- [✅] Playwright MCP による動作確認
- [✅] タスクドキュメントの進捗更新

### 主要タスク
- [ ] 要件定義の明確化
- [ ] 技術調査・検証
- [ ] 実装
- [ ] テスト・品質確認
- [ ] ドキュメント更新

### 進捗メモ（2025-10-26） 🔄
- backend-endpointユーティリティを新設し、GraphQL/LLMS/REST利用箇所を置き換え済み。
- Tachyon向けのlint/format/tsタスク（`mise run ci-node`）が成功したことを確認。
- 2025-10-26にPlaywright MCPで `tachyon-dev` テナントを操作し、GraphQLとREST（`/v1/llms/chatrooms`）が `NEXT_PUBLIC_BACKEND_API_URL` で解決されていること、Feature Flag画面も同URLを参照することをNetworkログで確認。

## Playwright MCPによる動作確認

### 実施タイミング
- [x] 実装完了後の初回動作確認
- [ ] PRレビュー前の最終確認
- [ ] バグ修正後の再確認

### 動作確認チェックリスト

- [x] `tachyon-dev` プラットフォームで `/v1beta/tn_01hjryxysgey07h5jz5wagqj0m` にアクセスし、GraphQLリクエストの宛先が `NEXT_PUBLIC_BACKEND_API_URL` を指していることをNetworkタブで確認。
- [x] IAMユーザー管理画面のポリシー管理ダイアログを開き、`GetPolicies` リクエストが `localhost` になっていないことを確認。
- [x] Feature Flag Playground でOpenFeatureのフェッチ先が `NEXT_PUBLIC_BACKEND_API_URL` を基点にしていることを確認。
