---
title: "カタログ商品テーブル抽象化"
type: refactor
emoji: "🧩"
topics:
  - Next.js
  - UI
  - Catalog
published: false
targetFiles:
  - apps/tachyon/src/app/v1beta/[tenant_id]/orders/components/product-catalog.tsx
  - apps/tachyon/src/components/catalog/
  - packages/ui/
github: https://github.com/quantum-box/tachyon-apps
---

# カタログ商品テーブル抽象化

## 概要

カタログ商品の一覧テーブルを再利用可能な抽象コンポーネントとして再設計し、カタログ領域以外の一覧画面でも同一のUXと実装パターンを共有できるようにする。

## 背景・目的

- 現状の `ProductCatalog` はテーブル構造・アクション定義・翻訳処理がコンポーネント内に密集し、他画面への転用が困難。
- バリアント表示、公開ステータス、削除確認など共通ニーズが複数画面で顕在化しつつあり、重複実装が技術的負債になりつつある。
- テーブル構造を抽象化することで UI 一貫性の向上、保守コスト削減、アクセシビリティ改善を狙う。

## 詳細仕様

### 機能要件

1. カタログ商品一覧に必要なカラム構造・インタラクションを設定可能なテーブルコンポーネントを提供する。
2. 行に対するドロップダウンメニュー/コンテキストメニュー、バッジ表示、リンク遷移、削除確認ダイアログを外部から注入できる仕組みを実装する。
3. ページネーション情報・ローディング・エラー・空データ表示を含む周辺UIも抽象化し、国際化文言をコンポーネント外から与えられるようにする。

### 非機能要件

- 既存の `ProductCatalog` と同等の表示/操作体験を維持すること。
- 国際化 (ja/en) の切替時に再レンダリングを最小限に保つこと。
- Storybook で主要バリアント (通常/ローディング/エラー/空) を可視化し、将来のリグレッション検知を容易にする。

### コンテキスト別の責務

```yaml
contexts:
  tachyon-frontend:
    description: "Next.js/React アプリでの UI 再利用を促進"
    responsibilities:
      - テーブルUIの抽象化
      - 文言/書式の外部注入
      - イベントハンドラの委譲
  catalog-app:
    description: "カタログ商品管理画面"
    responsibilities:
      - GraphQL データ取得
      - テーブル抽象コンポーネントへのデータマッピング
      - 削除/詳細表示等のドメイン操作トリガ
```

### 仕様のYAML定義

```yaml
catalog_product_table:
  columns:
    - key: "product"
      width: "28%"
      cell: ProductCellProps
      sortable: false
    - key: "variants"
      width: "20%"
      cell: VariantListCellProps
    - key: "status"
      width: "12%"
      badge: StatusBadgeProps
    - key: "publication"
      width: "12%"
      badge: PublicationBadgeProps
    - key: "billingCycle"
      width: "12%"
      formatter: BillingCycleFormatter
    - key: "price"
      width: "8%"
      formatter: CurrencyFormatter
    - key: "updatedAt"
      width: "8%"
      formatter: DateTimeFormatter
    - key: "actions"
      width: "8%"
      menu: ActionMenuProps
  pagination:
    pageSize: 20
    controls: true
  states:
    loading: SkeletonListProps
    error: AlertProps
    empty: AlertProps
```

## 実装方針

### アーキテクチャ設計

- `apps/tachyon/src/components/catalog/` にテーブル抽象化層 (`CatalogProductTable`, `CatalogProductTableLayout`) を新設し、UI構造と振る舞いを分離する。
- 表示用ロジック (バッジ解決、バリアント整形) をユーティリティ関数として切り出し、 `ProductCatalog` から参照する。
- ダイアログやトースト等の副作用は呼び出し元 (`ProductCatalog`) から props で制御する。

### 技術選定

- 既存の shadcn/ui テーブルコンポーネント (`@/components/ui/table`) を継続利用しつつ、高階コンポーネントとしてラップ。
- Storybook での可視化に向け `@storybook/nextjs` 既存設定を再利用。
- 単体テストは `Vitest + React Testing Library` を想定し、DOMスナップショットを最小限に抑える。

### TDD（テスト駆動開発）戦略

#### 既存動作の保証

- `ProductCatalog` のレンダリング検証テストを追加し、主要セル描画・バッジ翻訳・削除フローが維持されることを確認。
- ページングラベルの境界値ケース (総件数0/1/端数) をテスト化。

#### テストファーストアプローチ

- 新抽象コンポーネントに対し、受け取った props に応じたレンダリングを先にテストで定義し、最小実装で Red→Green を回す。
- Storybook の interaction test でアクションメニューの開閉をカバー。

#### 継続的検証

- `yarn ts --filter=apps/tachyon` と `yarn test-storybook --filter=apps/tachyon -- --includeTags=catalog` をローカルで実行できるよう準備。
- CI で `mise run ci-node` がグリーンであることを完了条件に含める。

## タスク分解

### 主要タスク

- [x] 現行 `ProductCatalog` の構造分析とテストカバレッジの現状把握 ✅
- [x] 抽象コンポーネントの API 設計 (props/injection 戦略) ✅
- [x] コンポーネント実装と Storybook 導入 ✅
- [x] 既存 `ProductCatalog` のリファクタリングとテスト更新 ✅
- [x] ドキュメント/タスク更新とレビュー準備 ✅

## 完了日

2025-11-05: v0.23.0 として完了。`ProductCatalog` コンポーネントのリファクタリングとページネーション対応、コンテキストメニュー追加を完了。

## Playwright MCPによる動作確認

### 実施タイミング

- [ ] 実装完了後の初回動作確認
- [ ] PRレビュー前の最終確認
- [ ] バグ修正後の再確認

### 動作確認チェックリスト

- [ ] カタログ商品一覧が20件ページングで表示されること
- [ ] 行のアクションメニューから詳細画面遷移が成功すること
- [ ] コンテキストメニューから削除操作を実行すると確認ダイアログが表示されること
- [ ] 削除成功時のトースト表示とリスト再取得が行われること
- [ ] ja/en 切替時にテーブルの文言が即時更新されること

## リスクと対策

- **ロジック切り出し時のリグレッション**: 既存テスト追加と Storybook interaction で回避。
- **抽象化の過度な汎用化**: 最初はカタログ用途に最適化し、他画面適用時に拡張ポイントを追加する方針とする。
- **Apollo キャッシュとの競合**: `refetch` 使用箇所の動作確認を重点的に実施。

## スケジュール

- 調査・設計: 2025-11-05
- 実装: 2025-11-06 〜 2025-11-07
- テスト/ドキュメント整備: 2025-11-08
- レビュー・調整: 2025-11-10

## 完了条件

- 新抽象コンポーネント導入後も `ProductCatalog` の E2E 動作が従来通りであることを Playwright MCP で確認済み。
- Storybook に主要ステートのノンリグレッションケースが追加されていること。
- `mise run ci-node` と `yarn ts --filter=apps/tachyon` がグリーン。
- タスクドキュメントと実装コードが同期し、レビューコメントに対応済みであること。
