---
title: "Billing取引履歴ページを実装する"
type: feature
emoji: "💳"
topics:
  - Billing
  - Next.js
  - GraphQL
published: false
targetFiles:
  - apps/tachyon/src/app/v1beta/[tenant_id]/billing/transactions/
  - apps/tachyon/src/app/v1beta/[tenant_id]/billing/components/
  - apps/tachyon/src/app/v1beta/[tenant_id]/sidebar-config.ts
  - apps/tachyon/src/lib/i18n/v1beta-translations.ts
github: https://github.com/quantum-box/tachyon-apps
---

# Billing取引履歴ページを実装する

## 概要

Billingダッシュボードとは別に取引履歴専用ページを用意し、クレジット取引をページネーション付きで閲覧できるようにする。初回表示はSSRで取得した取引リストを用いて高速化し、以降はクライアント側でページ送りに対応する。

## 背景・目的

- 現状の`/billing`ページでは多数のコンポーネントが同一画面に詰め込まれており、取引履歴一覧を深く掘り下げると視認性が低下する。
- 管理担当者から、過去のチャージ・消費明細を独立した画面で確認したいという要望がある。
- 専用ページを設けることでテーブル幅を広く取り、ページネーションを活用しながら履歴を継続的に確認できるようにしたい。

## 詳細仕様

### 機能要件

1. `/v1beta/[tenant_id]/billing/transactions`にサーバーコンポーネントのページを追加し、`V1BetaSidebarHeader`で既存レイアウトに合わせる。
2. 初期データとしてGraphQL `creditTransactions`クエリを`limit=20, offset=0`で取得し、`TransactionHistory`へ`initialTransactions`として受け渡す。
3. `TransactionHistory`コンポーネントでは既存のページネーションUIを維持しつつ、ページヘッダー・説明文・空状態表示を翻訳辞書から読み込む。
4. サイドバーのBilling配下サブメニューを更新し、「Transaction History」選択時は新ページへ遷移する。
5. Billingトップから専用ページへ遷移できる導線（例: 「すべての取引を見る」ボタン）を追加する。
6. 権限チェックは既存Billingページ同等で、`authWithCheck`とGraphQL SDKを利用する。
7. 取引0件の場合は空状態、GraphQLエラー時は既存のフォールバック表示を流用する。

受け入れ条件:

- サイドバーから「Transaction History」を選択すると新しいトランザクションページが表示される。
- ページ初回表示時に最新20件の履歴が表示され、次へ/前へボタンでページネーションできる。
- 空状態テナントでもエラー無く空表示が出る。
- Billingトップの導線からも同じページに遷移できる。
- 翻訳キーは英日両方に追加され、辞書欠落による未翻訳が発生しない。

### 非機能要件

- 初回ロードはSSRでデータを渡し、クライアント側の不要な初回フェッチを避ける。
- GraphQLリクエストはページ切り替え時のみ発生させ、limit/offsetの組み合わせで連続アクセスしても冪等となる。
- 既存の`TransactionHistory`スタイルを再利用し、新規CSSやTailwindクラス追加は最小限に留める。
- 日英両対応の翻訳キーを追加する。

### コンテキスト別の責務

```yaml
contexts:
  apps/tachyon:
    description: "Next.jsフロントでの表示と遷移導線の提供"
    responsibilities:
      - 取引履歴ページの追加
      - GraphQL SDKを用いた初期データ取得
      - Sidebar/翻訳辞書の更新
  payment-api:
    description: "既存の取引取得APIを提供"
    responsibilities:
      - 追加対応なし（既存クエリ`creditTransactions`を利用）
```

### 仕様のYAML定義

```yaml
transaction_history_page:
  route: "/v1beta/{tenant_id}/billing/transactions"
  initial_fetch:
    query: creditTransactions
    variables:
      limit: 20
      offset: 0
  pagination:
    size: 20
    control:
      previous_button: enabled_when(hasPreviousPage)
      next_button: enabled_when(hasNextPage)
  navigation:
    sidebar_key: billing.history
    cta_from_billing_overview: true
  i18n_namespaces:
    - v1beta.billing.transactionHistoryPage
```

## 実装方針

### アーキテクチャ設計

- Next.js App Routerのサーバーコンポーネントで初期データを取得し、`TransactionHistory`（クライアントコンポーネント）へ渡す構成を採用する。
- 既存のGraphQL SDK (`getGraphqlSdk`) と`authWithCheck`を再利用し、アクセストークンとテナントIDを維持する。
- サイドバー設定は`SIDEBAR_GROUP_CONFIG`を更新し、履歴タブのURLを新ページに差し替える。
- BillingトップカードにCTAボタンを追加し、再利用可能なUIコンポーネント（`Button`など）を活用する。

### 技術選定

- フロントエンド: Next.js App Router, React 18, shadcn/uiコンポーネント。
- データ取得: GraphQL SDK (graphql-requestベース)。
- 翻訳: 既存の`useTranslation`と辞書ファイルを拡張する。

### TDD（テスト駆動開発）戦略

- 既存E2E/ユニットテストに影響しない範囲の変更であるため、新規テストはUI確認のPlaywright中心とする。
- UIレベルの退行確認はPlaywright MCPで行い、ページ遷移・ページネーションのハッピーパスを記録する。
- `mise run check` と `yarn ts --filter=tachyon` を実装完了後に実行し、型エラーとlintエラーを検出する。

## タスク分解

### 主要タスク
- [x] 要件定義の明確化
- [x] 技術調査・検証
- [x] 実装
- [ ] テスト・品質確認
- [ ] ドキュメント更新

## Playwright MCPによる動作確認

### 実施タイミング
- [ ] 実装完了後の初回動作確認
- [ ] PRレビュー前の最終確認
- [ ] バグ修正後の再確認

### 動作確認チェックリスト
- [ ] `/v1beta/{tenant_id}/billing/transactions` が表示され、初回ロードで履歴テーブルが描画される
- [ ] 次へ/前へボタンでデータが切り替わる（APIレスポンスに応じて有効/無効が変化する）
- [ ] 取引0件のテナントで空状態カードが表示される
- [ ] Billingトップの「取引履歴を見る」導線から遷移できる
- [ ] サイドバーの「Transaction History」リンクが新ページへ遷移する

## 進捗ログ

- 2025-10-14 09:30 JST: タスクドキュメント初版を作成し、現状コードベースの構成と既存コンポーネントを調査した。
- 2025-10-14 11:20 JST: `/billing/transactions` ページと `TransactionHistory` のリファクタリング、翻訳・サイドバー更新を実装。`mise run check` は成功、`yarn ts --filter=tachyon` は既存のChatコンポーネント型エラーで失敗（詳細はverification-report参照）。
