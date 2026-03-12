---
title: "Transaction History: クライアントサイドGraphQL URL修正 + 内訳表示"
type: "bug"
emoji: "🐛"
topics: ["billing", "payment", "graphql", "transaction-history", "frontend"]
published: true
targetFiles:
  - apps/tachyon/src/app/v1beta/[tenant_id]/billing/components/transaction-history.tsx
  - apps/tachyon/src/app/v1beta/[tenant_id]/billing/transactions/page.tsx
  - apps/tachyon/src/lib/tachyon-api.ts
  - apps/tachyon/src/lib/api/backend-endpoint.ts
github: ""
---

# Transaction History: クライアントサイドGraphQL URL修正 + 内訳表示

## 概要

Transaction History ページが本番環境で空表示になるバグの修正と、トランザクション内訳（metadata）の表示機能追加。

## 背景・目的

### 発見した問題

1. **クリティカルバグ: クライアントサイドでGraphQL URLが無効**
   - `transaction-history.tsx` は `'use client'` コンポーネント
   - `getGraphqlSdk()` を使っているが、これはブラウザ側で `http://localhost:50054/v1/graphql` にフォールバック
   - 本番のブラウザからは到達できず `TypeError: Failed to construct 'URL': Invalid URL` が発生
   - SSR側も `page.tsx` でエラーを `console.error` で握り潰し → `initialTransactions = null`
   - 結果: "No transactions yet" と表示される（本当にデータがないのか、エラーなのか区別不能）

2. **内訳表示機能の欠如**
   - `metadata` フィールドはGraphQLで取得しているがUIに未表示
   - ユーザーが「何にいくらかかったか」を確認できない

### 影響範囲

同じ問題は billing 系の他の `'use client'` コンポーネントにもある:
- `transaction-history-with-currency.tsx`
- `purchase-credits-dialog.tsx`
- `purchase-credits-dialog-with-currency.tsx`
- `add-payment-method-dialog.tsx`
- `payment-methods.tsx`
- `use-graphql.ts`

**このタスクでは `transaction-history.tsx` と共通基盤 (`tachyon-api.ts`) を修正する。**

## 詳細仕様

### 機能要件

1. **Transaction History ページが正しくデータを表示すること**
   - SSRで初期データを取得
   - クライアントサイドのページネーションが動作
   - エラー時はエラーメッセージを表示（空表示ではなく）

2. **トランザクション内訳の表示**
   - 各トランザクション行をクリック/展開で metadata 詳細を表示
   - 表示項目:
     - execution_id, chatroom_id, request_num（Agent API使用時）
     - tokens: prompt/completion/total
     - selling_price, cost_usd
     - Stripe payment_intent_id（購入時）

### 非機能要件

- 既存UIのレイアウト・デザインを壊さない
- レスポンシブ対応維持

## 実装方針

### Phase 1: クライアントサイドGraphQL SDK修正

**方針**: `getClientGraphqlSdk` を新規作成し、`/api/proxy/v1/graphql` を利用する。

既にインフラは整っている:
- `getClientGraphqlEndpointUrl()` → `/api/proxy/v1/graphql`
- `/api/proxy/[...path]/route.ts` → Next.jsサーバー経由でバックエンドへ転送

```typescript
// apps/tachyon/src/lib/tachyon-api.ts に追加
export const getClientGraphqlSdk = (accessToken: string, tenantId?: string) => {
  return getSdk(
    new GraphQLClient(getClientGraphqlEndpointUrl(), {
      headers: {
        'x-operator-id': tenantId || rootTenantId,
        'x-platform-id': tenantId ?? '',
        Authorization: `Bearer ${resolveAccessToken(accessToken)}`,
      },
    })
  )
}
```

### Phase 2: Transaction History コンポーネント修正

- `getGraphqlSdk` → `getClientGraphqlSdk` に変更（クライアントサイドfetch箇所のみ）
- SSR側の `page.tsx` は `getGraphqlSdk` のまま（サーバーサイドなので問題ない）
- エラー時にユーザーへエラーメッセージを表示するよう改善

### Phase 3: 内訳（metadata）表示UI追加

- 各トランザクション行に展開ボタンを追加
- 展開時に metadata の詳細を collapsible で表示
- Agent API使用の場合: tokens, model, chatroom_id 等
- Stripe購入の場合: payment_intent_id, amount_cents 等

## タスク分解

### 主要タスク

- [x] `getClientGraphqlSdk` を `tachyon-api.ts` に追加
- [x] `transaction-history.tsx` のクライアントサイドfetchを `getClientGraphqlSdk` に変更
- [x] billing系の他の `'use client'` コンポーネントもすべて `getClientGraphqlSdk` に変更
- [x] metadata 内訳の展開表示UI追加（TransactionDetailRow コンポーネント）
- [x] React key warning修正（Fragment → named Fragment with key）
- [x] 動作確認（ローカルdev + Cloudflare Quick Tunnel + Playwright MCP）

## Playwright MCPによる動作確認

### 動作確認チェックリスト

- [x] Transaction History ページがデータを正しく表示する
- [ ] ページネーション（次/前ページ）が動作する（データ20件未満で未検証）
- [x] トランザクション内訳が展開/折りたたみできる
- [x] metadata 詳細（tokens, chatroom_id等）が表示される
- [x] データが0件の場合の表示が適切
- [ ] エラー時にエラーメッセージが表示される（SSRフォールバックはそのまま）
- [x] コンソールにbilling関連のエラーがないこと

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 他のclientコンポーネントも同様のバグ | 中 | 共通の `getClientGraphqlSdk` で一括修正可能。このタスクで基盤を作り、他は後続で修正 |
| proxyルートのパフォーマンス | 低 | Next.jsサーバー経由の1ホップ増だが、内部ネットワークなので無視できる |

## 参考資料

- `apps/tachyon/src/lib/api/backend-endpoint.ts` - `getClientGraphqlEndpointUrl()` の定義
- `apps/tachyon/src/app/api/proxy/[...path]/route.ts` - proxy ルート実装
- `packages/payment/src/adapter/graphql/query.rs` - GraphQL resolver
- `packages/payment/src/domain/credit.rs` - トランザクションドメインモデル

## 完了条件

- [x] 原因調査完了
- [x] `getClientGraphqlSdk` が実装され、クライアントコンポーネントから利用可能
- [x] Transaction History ページがローカル環境で正しくデータ表示
- [x] トランザクション内訳（metadata）がUI上で確認可能
- [x] billing系コンポーネントのコンソールエラーなし
- [x] 動作確認完了（Playwright MCP + Cloudflare Quick Tunnel）
- [x] TypeScript / Lint チェック通過

## 実装メモ

### 修正したファイル一覧

| ファイル | 変更内容 |
|----------|----------|
| `apps/tachyon/src/lib/tachyon-api.ts` | `getClientGraphqlSdk` 新規追加 |
| `apps/tachyon/src/app/v1beta/[tenant_id]/billing/components/transaction-history.tsx` | SDK切り替え + TransactionDetailRow追加 + Fragment key修正 |
| `apps/tachyon/src/app/v1beta/[tenant_id]/billing/components/transaction-history-with-currency.tsx` | SDK切り替え |
| `apps/tachyon/src/app/v1beta/[tenant_id]/billing/components/purchase-credits-dialog.tsx` | SDK切り替え |
| `apps/tachyon/src/app/v1beta/[tenant_id]/billing/components/purchase-credits-dialog-with-currency.tsx` | SDK切り替え |
| `apps/tachyon/src/app/v1beta/[tenant_id]/billing/components/payment-methods.tsx` | SDK切り替え |
| `apps/tachyon/src/app/v1beta/[tenant_id]/billing/components/add-payment-method-dialog.tsx` | SDK切り替え |
| `apps/tachyon/src/app/v1beta/[tenant_id]/billing/components/use-graphql.ts` | SDK切り替え |

### 根本原因
`'use client'` コンポーネントが `getGraphqlSdk()` を使用すると、ブラウザ側で `getBackendBaseUrl()` が `NEXT_PUBLIC_BACKEND_API_URL`（未設定）→ `localhost:50054` にフォールバックし、到達不能なURLでGraphQL fetchが失敗する。

### 解決策
プロキシルート `/api/proxy/v1/graphql` を経由する `getClientGraphqlSdk()` を作成。ブラウザからはNext.jsサーバーのプロキシ経由でバックエンドAPIにアクセスするため、サーバー内部のホスト名解決の問題が回避される。

### バージョン: パッチバージョン (x.x.X)
- [x] バグ修正（クライアントサイドURL問題）
- [x] 小さな改善（metadata表示追加）
