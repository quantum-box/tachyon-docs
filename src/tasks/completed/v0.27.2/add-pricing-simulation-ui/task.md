---
title: "PricingシミュレーションUIを実装する"
type: feature
emoji: "💰"
topics:
  - Pricing
  - Next.js
  - GraphQL
published: false
targetFiles:
  - apps/tachyon/src/app/v1beta/[tenant_id]/pricing/analysis/
  - apps/tachyon/src/gen/graphql/
  - packages/catalog/src/pricing/graphql/
  - packages/catalog/src/pricing/service.rs
github: https://github.com/quantum-box/tachyon-apps
---

# PricingシミュレーションUIを実装する

## 概要

`/v1beta/[tenant_id]/pricing/analysis` ページに価格シミュレーション機能を追加し、営業担当がフロントエンドからマークアップ率の調整結果を即座に確認できるようにする。

## 背景・目的

- 現在のPricing分析ページはプレースホルダーのみで実際の分析や試算が行えない。apps/tachyon/src/app/v1beta/[tenant_id]/pricing/analysis/components/PriceAnalysis.tsx:19-45
- Pricingチームは新しいマークアップ設定の影響を確認するためにバックエンドAPIを直接叩いており、作業負荷とヒューマンエラーのリスクが高い。
- UI上でポリシーを選択し、マークアップ率を調整・比較できれば、価格戦略の意思決定を迅速化できる。

## 詳細仕様

### 機能要件

1. テナント内のPricing Policy一覧を取得し、選択できるドロップダウンを提供する。
2. 選択したポリシーの現在のマークアップ率と許容範囲を確認でき、調整値をスライダー＋数値入力で指定できる。
3. 「シミュレーション実行」操作時にGraphQL経由で`simulate_price_change`を呼び出し、結果をテーブル表示する。
4. テーブルでは各リソースの現行価格/新価格/差分額/差分率をUSD表示とNanoDollarのtooltipで確認できる。
5. 収益影響のサマリー（推定合計差分、元のマークアップ、シミュレーション後マークアップ）をカードで表示する。
6. 直近実行パラメータと結果を`localStorage`に保存し、ページ再訪時に復元する。
7. シミュレーション結果が0件の場合は適切な空状態を表示する。
8. APIエラー時は再試行ボタンを含むエラーパネルを表示する。

受け入れ条件:
- UIからマークアップ率を入力し「シミュレーション実行」ボタンを押すと、GraphQLレスポンスがテーブルに反映されること。
- 現在値とシミュレーション値が同じ場合、差分列が0表示になること。
- 入力がポリシーの最小/最大マークアップ範囲外の場合はバリデーションエラーを表示しAPIを呼ばないこと。
- 直近入力したポリシーとマークアップ値がリロード後も反映されること。
- Playwright MCPでシナリオに沿った手動確認が実施され、スクリーンショットがタスクフォルダに保存されていること。

### 非機能要件

- 通信は既存のGraphQLエンドポイントを利用し、リクエスト上限は1操作につき1回に抑える。
- UIはレスポンシブに対応し、幅768px未満の場合はカードレイアウトに切り替わる。
- `loading` 状態と `disabled` 状態を備えたボタン/フォーム制御を実装し、二重送信を防止する。
- 翻訳キーは`pricing.analysis` 名前空間に配置し、日英両言語で整備する。

### コンテキスト別の責務

```yaml
contexts:
  catalog:
    description: "価格データ取得とシミュレーションロジック"
    responsibilities:
      - PricingPolicy一覧の提供
      - simulate_price_changeのGraphQL公開
      - Decimal値のUSD文字列化ユーティリティ追加
  apps/tachyon:
    description: "UIからの操作と表示"
    responsibilities:
      - ポリシー選択、マークアップ入力UIの提供
      - GraphQLクエリの実行と結果表示
      - 直近実行パラメータのローカル保持
  payment:
    description: "既存の請求チェックとの整合性"
    responsibilities:
      - 追加対応不要。NanoDollar→USD変換の整合性のみ確認
```

### 仕様のYAML定義

```yaml
simulation_form:
  inputs:
    policy:
      type: select
      source: pricingPolicies(tenantId)
    markup_rate:
      type: decimal
      unit: percent
      step: 0.1
      constraints:
        min: selectedPolicy.minMarkupRate
        max: selectedPolicy.maxMarkupRate
  action:
    query: pricingSimulation
    variables:
      tenantId: string
      policyId: string
      newMarkupRate: decimal|null

simulation_result:
  summary:
    fields:
      - key: originalMarkupRate
        format: percent
      - key: simulatedMarkupRate
        format: percent
      - key: estimatedRevenueImpact
        format: usd
  table:
    columns:
      - resourceType
      - currentPriceUsd
      - newPriceUsd
      - diffUsd
      - diffPercent
    footer:
      totalDiffUsd: sum(diffUsd)
```

## 実装方針

### アーキテクチャ設計

- GraphQL層に `pricingSimulation` Query を追加し、`CatalogApp::pricing_service()` 経由で`simulate_price_change`をラップする。
- `PriceSimulationResult` をGraphQL `SimpleObject` 化し、Decimal→Float変換時には`round_dp_with_strategy(4, MidpointAwayFromZero)`を用いる。
- フロントエンドは App Router + React Suspense 構成を維持し、`use client` コンポーネント内で GraphQL リクエストを行う。
- `fetchGraphQL` ヘルパーを利用し、型生成は`yarn codegen --filter=tachyon`で更新する。
- UIは shadcn/ui の `Card`, `Table`, `Slider`, `Input`, `Button`, `Alert` を活用。

### 技術選定

- バックエンド: async-graphql, rust_decimal
- フロント: Next.js App Router, React 18, Tailwind, shadcn/ui, zustand（パラメータ保持）
- テスト: Rust unit test, Vitest, Playwright MCP

### TDD戦略

- GraphQLリゾルバのユニットテストを追加し、シミュレーション結果のレスポンスを検証する。
- Catalogコンテキストで`PriceSimulationResult`の丸め処理を検証するテストを追加。
- フロントエンドはVitestでフォームバリデーションと結果レンダリングをスナップショットで確認。
- Playwright MCPでE2Eのハッピーパスとバリデーションエラーケースを確認。

## タスク分解

### 主要タスク
- [x] GraphQLスキーマとリゾルバの実装
- [x] Rustユニットテスト追加
- [x] フロントエンドUI実装（フォーム＋結果表示）
- [x] 翻訳・フォーマッタ整備
- [x] Playwright MCPでの動作確認とレポート更新
- [x] タスクドキュメント更新

## Playwright MCPによる動作確認

### 実施タイミング
- [x] 実装完了後の初回動作確認
- [ ] PRレビュー前の最終確認

### 動作確認チェックリスト
- [x] `/pricing/analysis` ページでポリシーとマークアップ入力UIが表示される
- [x] マークアップ値を変更してシミュレートすると、テーブルが更新される
- [x] 追加差分が0の場合に空状態カードが表示される
- [ ] エラーを発生させた際にリトライ操作が機能する
- [x] 画面幅モバイルサイズでもレイアウトが崩れない

## 進捗状況（2026-01-10）
- ✅ 価格分析ページを `authWithCheck` + `V1BetaSidebarHeader` + パンくず構成へ修正。
- ✅ マークアップ入力の範囲バリデーション、再試行ボタン、Selectの空値回避を追加。
- ✅ PriceSimulation の丸め処理を `round_dp_with_strategy(4, MidpointAwayFromZero)` に統一。
- ✅ Playwright MCP でのシナリオ確認と `verification-report.md` の更新が完了。

## 進捗状況（2025-10-12）
- ✅ `pricing_simulation` GraphQLクエリを追加し、`PriceSimulationResultType` 変換テストを実装。
- ✅ `PriceAnalysis` コンポーネントを刷新し、ポリシー選択・マークアップ調整・結果表示・ローカルストレージ復元を実装。
- ✅ 英日両言語の翻訳キーを拡充し、USD/％表記とNanoDollarツールチップ仕様を反映。
- 🔄 Playwright MCP でのシナリオ確認と `verification-report.md` の更新が未着手。
