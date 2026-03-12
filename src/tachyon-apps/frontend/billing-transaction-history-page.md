# Billing取引履歴ページ

## 概要

Tachyon のオペレーター向け課金セクションに取引履歴専用ページ `/v1beta/{tenant_id}/billing/transactions` を追加し、クレジットの増減と残高推移を時系列で確認できるようにする。初回表示はサーバーコンポーネントで GraphQL の `creditTransactions` クエリを呼び出し、ページネーション以降はクライアント側で追加フェッチを行う。

## ページ構成

- ルート: `apps/tachyon/src/app/v1beta/[tenant_id]/billing/transactions/page.tsx`
  - `authWithCheck(tenantId)` でセッションとアクセストークンを取得。
  - `getGraphqlSdk(accessToken, tenantId)` を生成し `CreditTransactions(limit: 20, offset: 0)` を SSR で呼び出す。
  - `V1BetaSidebarHeader` にパンくず (`Home → Billing → Transaction History`) と本文コンテナ（最大幅 6xl, 余白 8）を提供。
  - 初回フェッチに失敗した場合は `console.error` を記録しつつ `initialTransactions = null` で `TransactionHistory` に委譲。

- コンポーネント: `apps/tachyon/src/app/v1beta/[tenant_id]/billing/components/transaction-history.tsx`
  - `TRANSACTION_PAGE_SIZE = 20` を共有し、サーバー・クライアント双方で同じページ単位を利用。
  - `useTranslation().v1beta.billing.transactionHistory` の辞書から表題、説明文、テーブル見出し、空状態文言、ページネーション文言を取得。
  - 取引タイプ別にアイコン (`ArrowDownIcon` など) と `Badge` の色をマッピングし、英語ラベルが未定義の場合は GraphQL 値をフォールバック。
  - `viewAllHref` を指定した場合（Billingトップの埋め込み利用時）には「View all transactions」ボタンを描画。

## データ取得フロー

```graphql
# apps/tachyon/src/app/v1beta/[tenant_id]/billing/billing.graphql
query CreditTransactions($limit: Int = 20, $offset: Int = 0) {
  creditTransactions(limit: $limit, offset: $offset) {
    nodes {
      id
      type
      amount
      balanceAfter
      description
      createdAt
      stripePaymentIntentId
    }
    totalCount
    pageInfo {
      hasNextPage
      hasPreviousPage
      offset
      limit
    }
  }
}
```

- 初期ロードは SSR で `limit=20 / offset=0` を取得し `initialTransactions` として渡す。
- クライアントページ送り時は `useEffect` で `offset` を監視し、`getGraphqlSdk` を再生成して同クエリを再利用。
- エラー発生時は空データ (`nodes: []`, `totalCount: 0`) をセットし、空状態カードを表示。ローディング中は Skeleton を表示。

## UI 振る舞い

- テーブル列: 日付 (`Intl.DateTimeFormat`)、説明文 + Stripe PaymentIntent 補足、取引タイプバッジ、増減額（NanoDollar→USD 変換）、取引後残高。
- 金額表示: 消費 (`consumption` / `usage`) は赤色で `-`、加算は緑色で `+` を付与。`formatCurrency` で USD にフォーマット。
- ページネーション: `pageInfo.hasPreviousPage/hasNextPage` をボタン活性条件に利用し、`offset` を±`TRANSACTION_PAGE_SIZE` 分更新。`dict.pagination.showing` テンプレートで「1-20 / 135」などの範囲テキストを生成。
- 空状態: 取引が 0 件の場合は `CreditCard` アイコンと `dict.emptyTitle` を中央表示。
- ブレッドクラムと見出しは `transactionHistoryPage` 名前空間からタイトル・説明・パンくずラベルを取得。

## 他ページとの連携

- Billing トップ (`apps/tachyon/src/app/v1beta/[tenant_id]/billing/page.tsx`) では `TransactionHistory` をカードとして埋め込み、`viewAllHref` に新ルートを渡して CTA ボタンで遷移できるようにした。
- サイドバー設定 (`apps/tachyon/src/app/v1beta/[tenant_id]/sidebar-config.ts`) で Billing 配下に「Transaction History」リンクを追加し、選択時に当該ページへ遷移。

## i18n キー

- `apps/tachyon/src/lib/i18n/v1beta-translations.ts` に以下を追加。
  - `transactionHistoryPage`: `breadcrumb`, `title`, `description`。
  - `transactionHistory`: `title`, `description`, `viewAllButton`, `emptyTitle`, `table.*`, `types.*`, `pagination.{previous,next,showing}`。
- 辞書欠落時に未翻訳キーが残らないようキーを日英両方に定義。

## 検証と運用

- 実装後に `mise run check` を完走済み（別途、`yarn ts --filter=tachyon` は既存の Chat UI 型エラーで失敗する既知事象）。
- Playwright MCP シナリオは `/v1beta/{tenant_id}/billing/transactions` 表示・ページネーションを対象に追加予定。既存 UI 回帰テストチェックリストにも本ページを追記。

## 関連タスク

- [docs/src/tasks/completed/v0.15.0/billing-transaction-history-page/task.md](../../tasks/completed/v0.15.0/billing-transaction-history-page/task.md)
