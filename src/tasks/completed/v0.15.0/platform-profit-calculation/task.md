---
title: "Platform向け利益計算機能を実装する"
type: feature
emoji: "📈"
topics:
  - Platform
  - Pricing
  - Procurement
  - Analytics
published: false
targetFiles:
  - apps/tachyon/src/app/v1beta/[tenant_id]/platform/profit/
  - apps/tachyon/src/app/v1beta/[tenant_id]/platform/profit/page.tsx
  - apps/tachyon/src/app/v1beta/[tenant_id]/platform/profit/components/
  - apps/tachyon-api/src/graphql/
  - apps/tachyon-api/src/router.rs
  - packages/shared-kernel/
  - packages/profit/
  - packages/pricing/
  - packages/procurement/
github: https://github.com/quantum-box/tachyon-apps
---

# Platform向け利益計算機能を実装する

## 概要

Platform が Operator に提供するサービスについて、調達コストと販売価格の差分を基に粗利益・利益率を算出し、API と UI で可視化できるようにする。

本タスクは経営管理レイヤ（SoM: System of Management）整備の第一歩として、現場オペレーション（SoA: System of Activities）である Pricing / Procurement が保持する帳簿の履歴を横断集計し、意思決定を支える指標を提供することを狙う。Shared Kernel でマスター・期間・金額ルールを共通化し、SoA が担う残管理を汚さずに SoM 側で多次元・バージョン管理を扱える土台を築く。

## 背景・目的

- 現状のダッシュボードでは Operator 向け提供サービスの採算状況が把握できず、価格戦略や調達契約の見直しが後手に回っている。
- Pricing コンテキストには販売価格、Procurement コンテキストには調達コストが保持されており、両者を突き合わせれば粗利益を算出できるが、横断的な集計手段が存在しない。
- Stripe 決済手数料を加味した実効利益を把握できると、Platform の営業・経営判断が迅速化し、Operator へのサービス提供戦略を最適化できる。

## 詳細仕様

### 機能要件

1. GraphQL Query `platformProfitSummary` を追加し、以下の入力を受け付ける。
   - `tenantId` (Platform ID, 必須)
   - `operatorId` (フィルタ任意, 未指定時は全 Operator 集計)
   - `serviceIds` (サービス ID の配列, 任意)
   - `range` (期間指定, `from`/`to` ISO8601 日付, 未指定時は当月)
2. `platformProfitSummary` は以下のフィールドを返す。
   - `currency` (常に USD)
   - `totalRevenue`, `totalProcurementCost`, `totalStripeFees`, `grossProfit`, `grossMarginPercent`
   - `breakdowns[]` (サービス×Operator 粒度)
     - `serviceId`, `serviceName`
     - `operatorId`, `operatorName`
     - `revenue`, `procurementCost`, `stripeFees`, `profit`, `marginPercent`
3. Stripe 手数料は Provider 単位の設定値（例: `stripe_fee_rate_bps`）を用いて、売上金額×料率 + 固定手数料を算出する。
4. 集計ロジックは Pricing コンテキストの販売実績（または確定価格表）と Procurement コンテキストの調達コストを ULID で紐づけ、同一サービス・Operator ごとに差分を計算する。
5. apps/tachyon の UI に「利益計算」ページを追加し、以下を表示する。
   - 期間・Operator・サービスのフィルタフォーム
   - 集計結果のサマリーカード（売上／調達コスト／手数料／粗利益／利益率）
   - ブレークダウン表（サービス×Operator 行）
   - Stripe 手数料を除外した場合との比較トグル（表示のみ, API は同レスポンスで対応）
6. フィルタ変更時はクエリパラメータに状態を保持し、ページリロード後も条件を復元する。
7. 集計対象が無い場合は空状態カードと既知の原因（例: 「期間内に提供実績がありません」）を表示する。
8. GraphQL レスポンスが 5xx を返した場合、再試行ボタン付きのエラーパネルを表示する。

受け入れ条件:
- Stripe 手数料率を変更して再実行すると、利益額が再計算されて UI に反映されること。
- Operator を指定して検索した場合、Breakdown が該当 Operator のみを返すこと。
- 期間外データは集計に含まれないこと。
- Playwright MCP でフィルタ操作と集計結果表示が確認できること。

### 非機能要件

- 集計処理は 1 リクエストあたり 2 秒以内を目標とし、必要に応じて Pricing/Procurement でキャッシュを利用する。
- Stripe 手数料設定は Procurement コンテキストの FeeSchedule リポジトリから取得し、Shared Kernel の値オブジェクトで集計する。
- GraphQL レイヤは `async-graphql` の DataLoader を用いて N+1 を防止する。
- UI は 768px 未満でカード表示に切り替え、テーブルは水平スクロールを許容する。
- i18n キーは `platform.profit` 名前空間に配置する。

### コンテキスト別の責務

```yaml
contexts:
  value_object:
    description: "共通値オブジェクトと期間ユーティリティの集中管理"
    responsibilities:
      - NanoDollar / DateRange など横断的な値の定義とフォーマッターを提供
      - 将来的なマスター整合・イベント定義のための土台を担保
  procurement:
    description: "調達コスト（仕入れ価格）と関連コストの提供"
    responsibilities:
      - サービス/Operator/日次単位の調達コスト実績を提供
      - Stripe 手数料などプロバイダー別追加コストの設定値を提供
      - サービス ULID と Operator ULID の正規化を保証
      - 通貨は NanoDollar 固定
  pricing:
    description: "販売価格・実績売上の提供"
    responsibilities:
      - サービス提供価格と販売実績を返す
      - 割引は現時点で未対応（0 減額として扱う）
      - 返却金額は NanoDollar で提供
  profit:
    description: "経営管理指標（利益）の集計と提供"
    responsibilities:
      - Pricing/Procurement の帳簿を読み取りモデルとして横断集計
      - Shared Kernel のマスター・期間ヘルパーを用いて多次元/期間別集計を行う
      - Stripe 手数料控除後の利益/利益率を算出（手数料設定は Procurement から参照）
      - 将来的な計画値・予実比較・シナリオ分析（SoM 拡張）を見据えたデータモデルを整備
      - GraphQL Query と UI 向け DTO を提供（apps/tachyon-api は既存 GraphQL モジュールから呼び出すだけ）
```

### 仕様のYAML定義

```yaml
stripe_fee_table:
  provider_stripe_standard:
    fee_rate_bps: 290        # 2.9%
    fixed_fee_nanodollar: 30000000  # $0.30
  provider_stripe_discount:
    fee_rate_bps: 250
    fixed_fee_nanodollar: 20000000

platform_profit_summary:
  inputs:
    tenantId: string
    operatorId: string|null
    serviceIds: string[]|null
    range:
      from: date|null
      to: date|null
  outputs:
    currency: "USD"
    totals:
      revenue: nanodollar
      procurementCost: nanodollar
      stripeFees: nanodollar
      grossProfit: nanodollar
      grossMarginPercent: decimal(5,2)
    breakdowns:
      - serviceId: string
        operatorId: string
        revenue: nanodollar
        procurementCost: nanodollar
        stripeFees: nanodollar
        profit: nanodollar
        marginPercent: decimal(5,2)
```

## 実装方針

### アーキテクチャ設計

- `packages/shared-kernel`（新規）で以下を提供する：サービス/Operator/Provider マスター参照、会計期間ヘルパー、`ServiceProvisioned` 等の共通イベントスキーマ、税区分・手数料率値オブジェクト。
- `packages/profit`（新規）に `ProfitService` を実装し、Shared Kernel を通じてマスター情報を取得しつつ `pricing::repository::RevenueRepository` と `procurement::repository::{CostRepository, FeeScheduleRepository}` を注入して集計する。Profit コンテキストではシナリオ（実績/計画）やバージョン管理を扱えるように Read Model / Projection を拡張可能な構造にする。
- Stripe 手数料設定は Procurement コンテキストで提供する `FeeScheduleRepository` から取得し、Shared Kernel の値オブジェクトで演算する。
- GraphQL 層は既存の `apps/tachyon-api/src/graphql` 階層に Resolver を追加し、`router.rs` から `ProfitApp::profit_service()`（仮称）を呼び出すだけで完結させる（新規の platform ディレクトリは追加しない）。
- DataLoader で Operator/Service 名称をまとめて取得し、UI 表示用に変換する。
- フロントエンドは App Router サーバーコンポーネントで GraphQL をフェッチし、`use client` コンポーネントでフィルタフォームとテーブルを描画する。
- クエリ文字列の同期は nuqs を利用し、`useQueryState` で `operator`, `service`, `from`, `to` を管理する。

### 技術選定

- Rust: async-graphql, sqlx, rust_decimal, chrono
- TypeScript: Next.js App Router, React 18, nuqs, TanStack Table, shadcn/ui
- グラフ描画が必要になった場合は recharts を検討（初期範囲ではテーブルと KPI カードのみ）

### TDD戦略

- `ProfitService` のユニットテストで Stripe 手数料控除後の利益計算と丸め処理を検証する（Procurement の `FeeScheduleRepository` をモック化）。
- GraphQL リゾルバの統合テストを追加し、モックリポジトリで複数 Operator/サービスの集計値を検証する。
- フロントエンドは Vitest でフィルタフォームの状態同期とサマリーカードのレンダリングをテストする。
- Playwright MCP シナリオでフィルタ操作 → 集計結果表示 → 手数料トグル切り替えを確認する。

## タスク分解

### フェーズ1: Shared Kernel / バックエンド集計基盤 ✅
- [x] Shared Kernel（マスター・期間・イベント・金額ユーティリティ）の最小実装
- [x] Procurement/Pricing 参照用のクエリインターフェイス整備
- [x] `ProfitService` ドメインロジック実装
- [x] Stripe 手数料設定リポジトリ実装（Procurement設定から取得）
- [x] ユニットテスト追加

### フェーズ2: GraphQL 公開 ✅
- [x] 既存 `apps/tachyon-api/src/graphql` に Resolver を追加
- [x] GraphQL Query と型定義追加
- [ ] DataLoader 実装（現状はリポジトリ参照で代替）
- [x] `apps/tachyon-api/src/router.rs` からの呼び出し配線（新規ディレクトリ追加なし）
- [ ] GraphQL 統合テスト

### フェーズ3: フロントエンド UI ✅
- [x] ページ骨組みとフィルタフォーム実装
- [x] サマリー/テーブル表示 + 手数料トグル
- [x] 翻訳キー追加 (`platform.profit`)
- [x] Vitest によるレンダリングテスト

### フェーズ4: 動作確認とドキュメント 📝
- [ ] `mise run check` / `mise run ci-node` の実行
- [ ] Playwright MCP での手動確認
- [ ] `verification-report.md` 更新
- [ ] 仕様ドキュメントへのリンク追記

## テスト計画

- Rust: `cargo nextest -p profit`（新規クレート追加時）
- GraphQL: `mise run check` に含まれる統合テストを利用
- TypeScript: `yarn ts --filter=tachyon`, `yarn lint --filter=tachyon`
- Playwright MCP: フィルタ操作と利益表示のハッピーパス、期間外データの空状態確認

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 調達・価格データの整合が取れない | 高 | ULID ベースの共通キーと不足時のフォールバックロジックを実装し、検知時に警告ログを出す |
| Stripe 手数料設定が最新でない | 中 | Procurement コンテキストのマスターを単一情報源にし、設定変更は PR ベースで管理。将来的に管理 UI を検討 |
| 集計期間が長期になるとパフォーマンス低下 | 中 | SQL 集計で期間フィルタを必須とし、必要に応じてマテリアライズドビューを検討 |
| 税金計算が未実装で誤解を招く | 低 | UI/ドキュメントで「税額は含まれていません」と明示し、フォローアップタスクを backlog に登録 |
| Shared Kernel の責務が膨張する | 中 | 最初はマスター/イベント/金額ユーティリティに限定し、拡張時は RFC ベースで段階的に追加 |

## スケジュール

- タスク開始想定: 2025-10-12
- バックエンド～GraphQL 実装: 1.5 日
- フロントエンド UI & テスト: 1 日
- 動作確認・ドキュメント更新: 0.5 日

## 完了条件

- [ ] `platformProfitSummary` Query が実装され、指定条件で利益集計が取得できる
- [ ] apps/tachyon の UI で利益サマリーとブレークダウンが表示される
- [ ] Stripe 手数料が控除された利益額が表示される
- [ ] Playwright MCP での動作確認レポートが `verification-report.md` に記録されている
- [ ] `docs/src/tachyon-apps/analytics/platform-profit.md`（新規）に仕様が反映されている

## 参考資料

- `packages/pricing/` 価格データ仕様
- `packages/procurement/` 調達コスト仕様
- `docs/src/architecture/nanodollar-system.md`
- Stripe 手数料: https://stripe.com/pricing

## 進捗状況（2025-10-13 時点）

- ✅ タスクドキュメント作成
- 🔄 実装対応（バックエンド/GraphQL/UI は完了、Rust/Vitest テスト追加済み。DataLoader/統合テストは後続）
- 🔄 動作確認（コマンド最終実行とPlaywright シナリオは未着手）
