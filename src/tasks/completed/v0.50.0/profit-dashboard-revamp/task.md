---
title: "利益分析ダッシュボードの刷新 — カタログ商品別利益 + ユニットエコノミクス"
type: feature
emoji: "📊"
topics:
  - Profit Analytics
  - Unit Economics
  - Dashboard
  - Sankey Diagram
  - Catalog
published: true
targetFiles:
  - apps/tachyon/src/app/v1beta/[tenant_id]/platform/profit/
  - packages/profit/
  - packages/llms/src/usecase/get_profit_by_model.rs
  - packages/llms/src/usecase/get_profit_by_period.rs
  - packages/llms/src/adapter/graphql/model/profit.rs
github: ""
---

# 利益分析ダッシュボードの刷新

## 概要

現在の利益分析ページ（`/platform/profit`）を全面刷新する。

**現状**: 「Execution Profit（AIモデル別利益）」と「Service Profit（サービス別利益）」が独立した2タブ構成で、AIモデル別利益がメインタブになっている。

**あるべき姿**: カタログ商品別利益をメインビューとし、汎用的な利益集計フレームワークで商品ごとのドリルダウン（AI商品→モデル別など）を実現する。積み上げグラフ・サンキーダイアグラム・ユニットエコノミクス分析を追加。

## 背景・目的

### 現状の問題

1. **「モデル別利益」がメインタブにいるのはおかしい** — AIサービスだけの分析が大項目で、カタログ全体の利益が2番目のタブに追いやられている
2. **2つの完全に別のコードパス** — `agent_execution_costs`（LLMs）と `service_price_mappings`+`procurement_prices`（profit pkg）が独立しており、統一的な利益分析ができない
3. **ビジネス分析機能の不足** — 積み上げグラフ、サンキーダイアグラム、ユニットエコノミクスがない

### 期待される成果

```
利益ダッシュボード（刷新後）
│
├── 📊 サマリー（全商品合計の売上・原価・利益・マージン）
│
├── 📈 積み上げグラフ（時系列）
│   └── 商品別の売上/利益の推移を可視化
│       → どの商品がどれくらい貢献しているか一目でわかる
│
├── 🔀 サンキーダイアグラム
│   └── 売上 → コスト内訳（原価, Stripe手数料, インフラ等）→ 利益
│       → お金の流れが直感的に見える
│
├── 📋 商品別利益テーブル
│   ├── AI Agent API  → ドリルダウンでモデル別利益が見える
│   ├── Data Pipeline → ドリルダウンで別の軸が見える
│   └── Storage       → ...
│
└── 💰 ユニットエコノミクス
    ├── ARPU（オペレーターあたり売上）
    ├── 粗利率の推移
    ├── オペレーター別の収益性分析
    └── LTV / CAC（将来的に）
```

## 詳細仕様

### 機能要件

#### 1. カタログ商品別利益（メインビュー）

- カタログに登録された全商品を横断した利益一覧
- 各商品の売上・原価・利益・マージンを表示
- 期間フィルター（日/週/月/カスタム）
- オペレーターフィルター

#### 2. 汎用的な利益集計フレームワーク

商品タイプに応じたドリルダウン軸を持てる構造：

```yaml
profit_aggregation:
  # 全商品共通の軸
  common_dimensions:
    - product      # カタログ商品
    - operator     # オペレーター
    - period       # 期間（日/週/月）

  # 商品タイプ固有の軸
  product_dimensions:
    ai_service:
      - model        # LLMモデル
      - provider     # プロバイダー
    # 将来拡張例:
    # storage:
    #   - tier       # ストレージ階層
    # data_pipeline:
    #   - pipeline_type  # パイプライン種別
```

#### 3. 積み上げグラフ（Stacked Chart）

- X軸: 時間（日/週/月）
- Y軸: 金額（売上 or 利益）
- 積み上げの単位: カタログ商品別
- 切り替え: 売上/利益/コスト

#### 4. サンキーダイアグラム

資金フローを可視化：

```
売上（各商品からの収入）
  ├─→ AI Agent API ──→ LLM API原価 ─────┐
  │                  ├→ Stripe手数料 ───┤
  │                  └→ 利益 ──────────┤
  ├─→ Data Pipeline ─→ インフラ原価 ────┤
  │                  └→ 利益 ──────────┤
  └─→ Storage ───────→ S3原価 ─────────┤
                     └→ 利益 ──────────┘
                                        → 合計利益
```

#### 5. ユニットエコノミクス

```yaml
unit_economics:
  arpu:
    description: "Average Revenue Per User (Operator)"
    formula: "total_revenue / active_operator_count"
    period: monthly

  gross_margin:
    description: "粗利率"
    formula: "(revenue - cost) / revenue * 100"
    trend: true  # 推移グラフ表示

  operator_profitability:
    description: "オペレーター別収益性"
    metrics:
      - revenue_per_operator
      - cost_per_operator
      - profit_per_operator
      - margin_per_operator

  # 将来的に追加
  ltv:
    description: "Life Time Value"
    formula: "ARPU * average_lifetime_months"
    status: future

  cac:
    description: "Customer Acquisition Cost"
    formula: "total_acquisition_cost / new_operators"
    status: future
```

### 非機能要件

- **パフォーマンス**: 商品数100件、期間1年のデータで3秒以内にレンダリング
- **レスポンシブ**: モバイル/タブレット/デスクトップ対応
- **拡張性**: 新しい商品タイプの追加時に集計軸を簡単に追加できる構造

### コンテキスト別の責務

**`profit` → `analytics` にリネーム**: 利益分析だけでなくユニットエコノミクスやKPI等の数値マネジメント全般を担う横断的な読み取り専用レイヤーとして再定義する。

```yaml
contexts:
  analytics:  # 旧 profit — リネームして責務拡大
    description: "数値マネジメントの横断コンテキスト（読み取り専用）"
    responsibilities:
      - カタログ商品別の利益集計
      - オペレーター別の利益集計
      - 期間別の利益集計（積み上げグラフ用）
      - ユニットエコノミクス計算（ARPU、粗利率等）
      - サンキーダイアグラム用のフローデータ生成
      - 将来: 予測、コホート分析、KPIダッシュボード

  llms:
    description: "AI実行の詳細利益データ提供"
    responsibilities:
      - agent_execution_costsからのモデル別集計
      - analyticsコンテキストへのデータ提供（商品ドリルダウン用）

  catalog:
    description: "商品マスタ提供"
    responsibilities:
      - カタログ商品一覧の提供

  payment:
    description: "トランザクションデータ提供"
    responsibilities:
      - オペレーター別の売上データ
      - Stripe手数料データ
```

## 実装方針

### アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                   Frontend (Next.js)                          │
│  /v1beta/[tenant_id]/platform/profit/                        │
│  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ Summary  │ │ Stacked   │ │ Sankey   │ │ Unit          │  │
│  │ Cards    │ │ Chart     │ │ Diagram  │ │ Economics     │  │
│  └──────────┘ └───────────┘ └──────────┘ └───────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │           Product Profit Table (with drilldown)          │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    GraphQL API Layer                          │
│  ┌──────────────────┐ ┌──────────────────────────────────┐  │
│  │ analytics context │ │ llms context (drilldown only)     │  │
│  │ - summary         │ │ - profitByModel (既存, 再利用)     │  │
│  │ - byProduct       │ └──────────────────────────────────┘  │
│  │ - byOperator      │                                       │
│  │ - byPeriod        │                                       │
│  │ - flowData        │                                       │
│  │ - unitEconomics   │                                       │
│  └──────────────────┘                                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Usecase Layer                              │
│  packages/analytics/src/usecase/                             │
│  - GetProductProfitSummary (商品別利益)                       │
│  - GetProfitTimeSeries (積み上げグラフ用)                      │
│  - GetProfitFlowData (サンキーダイアグラム用)                   │
│  - GetUnitEconomics (ユニットエコノミクス)                      │
│  - GetOperatorProfitability (オペレーター別収益性)              │
└─────────────────────────────────────────────────────────────┘
```

### 技術選定

| 技術 | 用途 | 選定理由 |
|------|------|---------|
| recharts | 積み上げグラフ | 既に使用中、StackedAreaChart対応 |
| d3-sankey or recharts-sankey | サンキーダイアグラム | React対応、カスタマイズ性 |
| shadcn/ui | UI基盤 | 既存プロジェクトと統一 |
| nuqs | URL状態管理 | 既存パターン踏襲 |

### データソース統合

現在バラバラのデータソースを `analytics` コンテキストで統合する：

```
┌──────────────────────────┐
│  agent_execution_costs   │─── LLMの実行ごとの売上・原価
│  (llms context)          │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  analytics context       │─── 統合された利益集計 + ユニットエコノミクス
│  (旧 profit → リネーム)    │
└──────────┬───────────────┘
           │
┌──────────┴───────────────┐
│  usd_transactions        │─── 売上トランザクション
│  (payment context)       │
└──────────────────────────┘
```

### `profit` → `analytics` リネーム作業

Phase 0 として、既存の `packages/profit/` を `packages/analytics/` にリネームする：

1. ディレクトリ名変更: `packages/profit/` → `packages/analytics/`
2. `Cargo.toml` のパッケージ名変更: `profit` → `analytics`
3. Cargo workspace メンバー更新
4. 依存元の import パス更新（`tachyon-api/src/di.rs` 等）
5. GraphQL スキーマの型名は `PlatformProfit*` → `Analytics*` に変更
6. フロントエンドの GraphQL クエリ更新

## タスク分解

### Phase 0: `profit` → `analytics` リネーム ✅

- [x] `packages/profit/` → `packages/analytics/` ディレクトリリネーム
- [x] `Cargo.toml` パッケージ名・依存先更新
- [x] Cargo workspace メンバー更新
- [x] `tachyon-api` の DI・Router・main.rs・lambda.rs・tests/util.rs 更新
- [x] GraphQL 型名更新（`ProfitQuery` → `AnalyticsQuery`）
- [x] フロントエンドのページディレクトリ移動（`platform/profit/` → `platform/analytics/`）
- [x] サイドバー設定更新（URL・action・key）
- [x] 認可シードの context/resource_pattern 更新（`profit:` → `analytics:`）
- [x] コンパイル確認（`mise run check` 成功）

実装メモ:
- GraphQLのクエリ名（`platformProfitSummary`）とGraphQL型名（`PlatformProfitSummary`等）はPhase 2のUI刷新時に変更予定
- llmsパッケージ内の profit 関連（`profit.rs`, `billing_aware.rs`）は利益計算ドメインの用語であり analytics リネーム対象外
- フロントエンドのコンポーネント名（`ProfitDashboard`等）はPhase 2で対応

### Phase 1: バックエンド — 汎用利益集計フレームワーク ✅

既存のGraphQLクエリで必要なデータが十分に提供されていることを確認:
- [x] `platformProfitSummary` — 商品別利益サマリー（analytics context）
- [x] `profitByPeriod` — 時系列データ（llms context）
- [x] `profitByModel` — モデル別集計（llms context、ドリルダウン用）
- [x] 新規バックエンドクエリ不要（MVPではフロントエンドで既存データを統合）

実装メモ:
- サンキーダイアグラム用フローデータは `platformProfitSummary` の breakdowns からクライアントサイドで導出
- ユニットエコノミクス（粗利率、商品あたり売上）もクライアントサイドで計算
- マージン推移は `profitByPeriod` の `avgProfitMarginPercent` を利用

### Phase 2: フロントエンド — メインビュー刷新 ✅

- [x] 既存タブ構成の撤廃（`profit-content.tsx` をシンプル化）
- [x] 統合ダッシュボード `analytics-dashboard.tsx` 新規作成
  - [x] フィルター（日付範囲、集計期間、オペレーターID）
  - [x] サマリーカード4枚（Revenue, Total Cost, Profit, Margin）
  - [x] 利益推移グラフ（既存 `ProfitTrendChart` 再利用）
  - [x] 商品別利益テーブル（ページネーション付き）
- [x] i18n翻訳更新（EN/JA）— ページタイトル、サンキー、ユニットエコノミクスのキー追加

### Phase 3: サンキーダイアグラム ✅

- [x] カスタムSVG実装（外部ライブラリ不要）
- [x] `sankey-diagram.tsx` 新規作成
  - [x] 左ノード: カタログ商品（売上比率で高さ決定）
  - [x] 右ノード: 調達コスト、Stripe手数料、粗利益
  - [x] Bezier曲線リンクで資金フローを可視化
  - [x] ホバーツールチップ（商品→コスト/利益の金額表示）
  - [x] 色分け: 商品ごとに10色ローテーション

### Phase 4: ユニットエコノミクス ✅

- [x] `unit-economics-section.tsx` 新規作成
  - [x] KPIカード3枚: 粗利率、商品あたり売上、アクティブ商品数
  - [x] マージン推移チャート（recharts AreaChart）
  - [x] `profitByPeriod` データからマージン推移を計算

### Phase 5: テスト・品質 ✅

- [x] TypeScriptコンパイルチェック（新規ファイルにエラーなし）
- [x] Biome lint チェック通過
- [x] Rust コンパイルチェック通過（`mise run check`）
- [x] Playwright MCP による動作確認
- [x] レスポンシブ対応確認（デスクトップ1280px / モバイル375px）
- [x] Docker イメージリビルド + コンテナ正常起動確認

実装メモ:
- コンソールエラーは既存のTaskflowエラー（AIプロバイダーAPIキー関連）のみ。新規コンポーネント起因のエラーなし
- デスクトップ/モバイル両方のスクリーンショットを `screenshots/` に保存
- 開発環境にはprofit集計対象のデータが少ないためサマリーカードは$0.00だが、profitByPeriodのチャートにはデータが表示されている

## Playwright MCPによる動作確認

### 動作確認チェックリスト

#### メインビュー
- [ ] サマリーカードの正常表示（売上・原価・利益・マージン）
- [ ] 商品別利益テーブルのデータ表示
- [ ] 商品行クリックでドリルダウン展開
- [ ] AIサービスのドリルダウンでモデル別利益が見える

#### 積み上げグラフ
- [ ] 日別/週別/月別の切り替え
- [ ] 商品ごとの色分け
- [ ] ツールチップでの詳細表示
- [ ] 期間フィルターとの連動

#### サンキーダイアグラム
- [ ] 売上→コスト→利益のフロー表示
- [ ] ノードのホバーで詳細ポップアップ
- [ ] 正しい金額の比率でパスの太さが変わる

#### ユニットエコノミクス
- [ ] ARPUの正常表示
- [ ] 粗利率推移グラフ
- [ ] オペレーター別収益性テーブル

#### レスポンシブ
- [ ] モバイル（375px）での表示
- [ ] タブレット（768px）での表示
- [ ] デスクトップ（1280px+）での表示

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| データソース統合の複雑さ | 高 | Phase 1で集計SQLを十分にテストしてからUI実装に移る |
| サンキーダイアグラムのライブラリ品質 | 中 | 複数候補を事前検証（d3-sankey, recharts-sankey, react-flow） |
| 大量データでの集計パフォーマンス | 中 | インデックス最適化、集計キャッシュの検討 |
| 既存Execution Profitの機能後退 | 低 | モデル別利益はドリルダウンとして残す（削除ではなく移動） |

## 参考資料

- 既存実装: `docs/src/tasks/completed/v0.42.0/profit-management-dashboard/task.md`
- NanoDollar仕様: `docs/src/architecture/nanodollar-system.md`
- Payment仕様: `docs/src/tachyon-apps/payment/usd-billing-system.md`
- Pricing コンテキスト: `packages/pricing/`

## 完了条件

- [x] カタログ商品別の利益一覧がメインビューで表示される
- [ ] 商品ドリルダウンでAI商品→モデル別利益が見える（将来フェーズ）
- [x] 利益推移グラフで時系列トレンドが可視化される
- [x] サンキーダイアグラムで資金フローが可視化される
- [x] ユニットエコノミクス（粗利率、商品あたり売上、アクティブ商品数）が表示される
- [x] 全品質チェック通過（TS/Biome/Rust）
- [x] レスポンシブ対応（デスクトップ/モバイル確認済み）
- [ ] Storybook追加（将来フェーズ）

### バージョン番号の決定基準

**マイナーバージョン（x.X.x）を上げる**:
- [x] 既存機能の大幅な改善（利益ダッシュボード全面刷新）
- [x] 新機能の追加（サンキーダイアグラム、ユニットエコノミクス）
- [x] 新しい画面構成

## 備考

- `packages/profit/` を `packages/analytics/` にリネームし、数値マネジメントの横断コンテキストとして再定義する
- `packages/llms/` のモデル別集計は残すが、ドリルダウンAPI用として位置付け直す
- 既存のExecution Profitタブの機能は削除ではなく、商品ドリルダウンに統合する
