# プラットフォームダッシュボードのメトリクス

## 概要

Tachyon マルチテナントダッシュボード (`/v1beta/:tenant_id`) のファーストビューに表示される 3 枚の統計カードについて、モック値ではなく GraphQL 由来の実データを表示する仕様を定義する。対象メトリクスは AI 実行数、課金残高、価格ポリシーの稼働状況であり、すべて単一のクエリで取得する。

## データ取得

### GraphQL クエリ

```graphql
# apps/tachyon/src/app/v1beta/[tenant_id]/queries/dashboard-metrics.graphql
query TenantDashboardMetrics($tenantId: String!, $operatorId: ID!) {
  creditBalance {
    balance
    reserved
    available
    currency
    lastUpdated
  }
  pricingPolicies(tenantId: $tenantId) {
    id
    status
  }
  promptLogs(operatorId: $operatorId) {
    id
    createdAt
  }
}
```

- リクエストヘッダーに `x-operator-id` を設定し、`tenantId` / `operatorId` には URL パラメーター (`params.tenant_id`) を渡す。
- `promptLogs` は `createdAt` を用いた時間窓集計、`creditBalance` は NanoDollar 値の表示変換、`pricingPolicies` は状態別件数集計に利用する。
- 追加の GraphQL ラウンドトリップを避けるため、ダッシュボード初期表示ではこのクエリ 1 本のみを発行する。

## メトリクス定義

### AI 実行数カード (`aiUsage`)

- 集計対象: `promptLogs` の `createdAt`
- 現在窓: 「現在時刻 - 24 時間」以降の件数
- 比較窓: 「現在時刻 - 48 時間」から「現在時刻 - 24 時間」までの件数
- 表示内容
  - `value`: 現在窓の件数（ロケールに応じて `Intl.NumberFormat` で整形）
  - `hint`: 前日比（`((current - previous) / previous) * 100`）を小数 1 桁で整形し、`signDisplay: 'always'` で +/− を付与
  - 前日比が算出できない場合（比較窓が 0 件）
    - 現在窓も 0 件: `"0%"`
    - 現在窓が 1 件以上: 辞書キー `dashboard.metrics.cards.aiUsage.noPriorDataLabel` を使用（既定は "No prior data"）
- 集計ロジック: `calculateAiUsageWindows`（`apps/tachyon/src/app/v1beta/[tenant_id]/page.tsx`）

### 課金残高カード (`billingBalance`)

- 基本値: `creditBalance.available`
- 変換: `NANODOLLARS_PER_USD = 1_000_000_000` を用いて USD へ換算し、`Intl.NumberFormat` (currency) で整形
- 補足テキスト: `creditBalance.lastUpdated` を `Intl.RelativeTimeFormat` で「◯分前 / ◯時間前 / ◯日前」に変換
  - `lastUpdated` が `null` の場合は `dashboard.metrics.cards.billingBalance.noRelativeDataLabel`
- `creditBalance` が取得できない場合は `—`（`DEFAULT_METRIC_VALUE`）を表示し、ヒントも同様にフォールバック

### 価格ポリシーカード (`activePolicies`)

- 集計対象: `pricingPolicies` 配列
- 表示内容
  - `value`: `status === "ACTIVE"` の件数
  - `hint` パラメーター `count`: `status === "DRAFT"` の件数をロケール整形した値
  - 翻訳テキスト側で `{count}` プレースホルダーを利用し、「下書き {count} 件」と出力
- `pricingPolicies` が取得できない場合は `0` を表示し、`count` も `0` を渡す

## UI レンダリングフロー

1. `authWithCheck` でセッションとアクセストークンを取得
2. アクセストークン保有時のみ `getGraphqlSdk` を生成し、`TenantDashboardMetrics` を呼び出す
3. 失敗時は例外を握りつぶし、`console.error` ログを残しつつ空配列／`null` でフォールバック
4. `buildMetricCards` が 3 枚の `MetricConfig` を生成し、辞書 (`dashboardDict.metrics.cards`) のテンプレートへ挿入
5. UI は `Card` コンポーネントで表示し、カード群はモバイル 1 列 / MD 以上 3 列のレスポンシブレイアウト

## エラーハンドリングとフォールバック

- GraphQL エラーまたはトークン欠如時: カードは表示しつつ値を `—`、ヒントを辞書の `fallback` 文言に置き換える
- 日付パース失敗 (`promptLogs.createdAt` が不正): ログ単位でスキップし、集計に影響させない
- `formatRelativeTimeLabel` は 1 時間未満を分、24 時間未満を時間、それ以降を日に丸めて表示

## i18n

- 辞書キーは `apps/tachyon/src/lib/i18n/v1beta-translations.ts` にて `dashboard.metrics.cards` 以下へ定義
- `{change}` / `{relative}` / `{count}` の各テンプレート変数を `formatTemplate` で差し込む
- 日英それぞれで「No prior data」「更新: ◯時間前」「下書き ◯ 件」などの語尾差異に対応

## テストと検証

- `mise run check` と `yarn --cwd apps/tachyon lint` をタスク完了条件に含める
- TypeScript チェック (`yarn --cwd apps/tachyon ts`) は CRM 翻訳未定義による既知の失敗が残るため、本機能では回避策なし（別タスクで追跡）
- ブラウザ挙動確認は Playwright MCP シナリオ（ダッシュボード初期表示）を追加予定

## 関連タスク

- [docs/src/tasks/completed/v0.15.0/replace-platform-dashboard-mock-stats/task.md](../../tasks/completed/v0.15.0/replace-platform-dashboard-mock-stats/task.md)
