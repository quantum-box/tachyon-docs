---
title: 与実管理・経営管理機能の実装
type: feature
emoji: 💰
topics:
  - Budget Management
  - Financial Management
  - Clean Architecture
  - GraphQL
  - Next.js
published: true
targetFiles:
  - packages/budget/
  - apps/tachyon/src/app/v1beta/[tenant_id]/finance/
  - scripts/seeds/n1-seed/008-auth-policies.yaml
github: https://github.com/quantum-box/tachyon-apps/
---

# 与実管理・経営管理機能の実装

## 概要

経営者・役員が売上・コスト・プロジェクト別収支・キャッシュフローを管理できる、新規Budgetコンテキストを実装します。既存のOrder/Quoteとは独立した設計で、純粋な予実管理機能を提供します。

## 背景・目的

### 課題
- 現在、tachyonには予算と実績を管理する機能がない
- プロジェクト別の収益性分析ができない
- 経営判断に必要な財務情報の可視化が不足している

### 目的
- 経営者が手軽に予算を設定し、実績との差異を把握できるようにする
- プロジェクト単位での収益性を可視化する
- キャッシュフロー予測により資金繰りをサポートする

### 期待される成果
- 予実管理の効率化
- データに基づく経営判断の促進
- プロジェクトごとの採算性の明確化

## 詳細仕様

### 機能要件

1. **プロジェクト管理**
   - プロジェクトコード、名称、ステータス（Active/Completed/Archived）管理
   - 部門・カテゴリによる分類
   - 開始日・終了日の設定

2. **予算管理**
   - 会計年度・四半期単位での予算設定
   - 売上予算・コスト予算・利益予算の3種類
   - プロジェクト別の予算設定

3. **実績記録**
   - 実績売上の記録（日付、金額、カテゴリ）
   - 実績コストの記録（日付、金額、カテゴリ）
   - LLM実行コストとの連携（オプション）

4. **予実比較・分析**
   - 予算vs実績の差異計算
   - プロジェクト別収益性分析
   - キャッシュフロー予測

5. **ダッシュボード**
   - 予実サマリーの可視化
   - プロジェクト別収益性テーブル
   - グラフによる推移表示

### 非機能要件

- **金額管理**: すべての金額をNanoDollar単位で統一管理（1 USD = 1,000,000,000 nanodollars）
- **権限管理**: Auth Policiesによるアクション単位の権限制御
- **パフォーマンス**: 適切なインデックス設計による高速な集計クエリ
- **保守性**: Clean Architectureによる責務分離
- **拡張性**: 将来的な多通貨対応、会計期間カスタマイズに対応可能な設計

### コンテキスト別の責務

```yaml
contexts:
  budget:
    description: "予算・実績管理の中核コンテキスト"
    responsibilities:
      - プロジェクト管理
      - 予算設定と更新
      - 実績売上・コストの記録
      - 予実差異計算
      - プロジェクト別収益性分析
      - キャッシュフロー予測

  auth:
    description: "権限管理"
    responsibilities:
      - Budget関連アクションの権限チェック
      - ポリシーベースのアクセス制御

  payment (連携先):
    description: "決済・残高管理"
    responsibilities:
      - 現在残高の取得（キャッシュフロー予測用）
      - NanoDollar値オブジェクトの提供
```

### データモデル（YAML定義）

#### テーブル定義

```yaml
tables:
  projects:
    description: "プロジェクト・コストセンター"
    columns:
      - name: id
        type: VARCHAR(29)
        comment: "pj_xxxxxxxxxxxxxxxxxxxx"
      - name: tenant_id
        type: VARCHAR(29)
      - name: project_code
        type: VARCHAR(50)
        comment: "一意なプロジェクトコード"
      - name: project_name
        type: VARCHAR(255)
      - name: status
        type: ENUM('ACTIVE','COMPLETED','ARCHIVED')
      - name: start_date
        type: DATE
      - name: end_date
        type: DATE
      - name: department
        type: VARCHAR(100)
      - name: category
        type: VARCHAR(100)
    indexes:
      - uk_project_code (tenant_id, project_code)
      - idx_tenant_status (tenant_id, status)

  budgets:
    description: "予算"
    columns:
      - name: id
        type: VARCHAR(29)
        comment: "bg_xxxxxxxxxxxxxxxxxxxx"
      - name: tenant_id
        type: VARCHAR(29)
      - name: project_code
        type: VARCHAR(50)
      - name: fiscal_year
        type: INT
        comment: "会計年度 (例: 2026)"
      - name: fiscal_period
        type: ENUM('Q1','Q2','Q3','Q4','ANNUAL')
      - name: budget_type
        type: ENUM('REVENUE','COST','PROFIT')
      - name: amount_nanodollars
        type: BIGINT
        comment: "予算額（NanoDollar単位）"
    indexes:
      - idx_tenant_fiscal (tenant_id, fiscal_year, fiscal_period)
      - uk_budget (tenant_id, project_code, fiscal_year, fiscal_period, budget_type)

  actual_revenues:
    description: "実績売上"
    columns:
      - name: id
        type: VARCHAR(29)
        comment: "ar_xxxxxxxxxxxxxxxxxxxx"
      - name: project_code
        type: VARCHAR(50)
      - name: amount_nanodollars
        type: BIGINT
      - name: revenue_date
        type: DATE
      - name: revenue_category
        type: ENUM('RECURRING','ONE_TIME','OTHER')
    indexes:
      - idx_tenant_project_date (tenant_id, project_code, revenue_date)

  actual_costs:
    description: "実績コスト"
    columns:
      - name: id
        type: VARCHAR(29)
        comment: "ac_xxxxxxxxxxxxxxxxxxxx"
      - name: project_code
        type: VARCHAR(50)
      - name: amount_nanodollars
        type: BIGINT
      - name: cost_date
        type: DATE
      - name: cost_category
        type: ENUM('MATERIAL','LABOR','OVERHEAD','LLMS','OTHER')
    indexes:
      - idx_tenant_project_date (tenant_id, project_code, cost_date)
```

#### 会計期間定義

```yaml
fiscal_periods:
  Q1:
    start: "01-01"  # 1月1日
    end: "03-31"    # 3月31日
  Q2:
    start: "04-01"
    end: "06-30"
  Q3:
    start: "07-01"
    end: "09-30"
  Q4:
    start: "10-01"
    end: "12-31"
  ANNUAL:
    start: "01-01"
    end: "12-31"
```

## 実装方針

### アーキテクチャ設計

**Clean Architecture（4層構造）**

```
┌─────────────────────────────────────┐
│  Presentation Layer (GraphQL/REST) │
│  - BudgetQuery, BudgetMutation     │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  Usecase Layer                      │
│  - CreateBudget                     │
│  - CalculateBudgetVariance          │
│  - GetProjectProfitability          │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  Domain Layer                       │
│  - Budget (Entity)                  │
│  - ActualRevenue (Entity)           │
│  - Project (Entity)                 │
│  - BudgetVariance (Value Object)    │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  Infrastructure Layer               │
│  - SqlxBudgetRepository             │
│  - SqlxActualRevenueRepository      │
└─────────────────────────────────────┘
```

### 技術選定

#### バックエンド（Rust）
- **フレームワーク**: async-graphql（GraphQL）, SQLx（データベース）
- **金額管理**: NanoDollar値オブジェクト
- **権限管理**: auth::App（既存）
- **日付処理**: chrono

#### フロントエンド（Next.js）
- **フレームワーク**: Next.js 14 App Router
- **UIコンポーネント**: shadcn/ui
- **グラフ**: Recharts
- **フォーム**: react-hook-form + zod
- **GraphQLクライアント**: urql / @apollo/client

#### データベース
- **RDBMS**: MySQL (TiDB)
- **マイグレーション**: SQLx migrations
- **インデックス戦略**: tenant_id + 日付・プロジェクトコードの複合インデックス

### TDD（テスト駆動開発）戦略

#### ユニットテスト
- ドメインモデルのバリデーションロジック
- 予実差異計算ロジック
- NanoDollar変換処理

#### 統合テスト（シナリオテスト）
- プロジェクト作成→予算作成→実績記録→予実比較のフロー
- GraphQL APIのエンドツーエンドテスト
- `apps/tachyon-api/tests/scenarios/budget_management.yaml`

#### E2Eテスト（Playwright）
- プロジェクト作成フォームの動作
- 予算作成フォームの動作
- ダッシュボードの表示確認

## タスク分解

### フェーズ1: データ基盤（Week 1） 📝
- [ ] マイグレーションファイル作成
  - [ ] projects テーブル
  - [ ] budgets テーブル
  - [ ] actual_revenues テーブル
  - [ ] actual_costs テーブル
- [ ] ドメインモデル実装
  - [ ] Project エンティティ
  - [ ] Budget エンティティ
  - [ ] ActualRevenue エンティティ
  - [ ] ActualCost エンティティ
  - [ ] BudgetVariance 値オブジェクト
- [ ] リポジトリトレイト定義

### フェーズ2: 基本ユースケース（Week 2） 📝
- [ ] CreateProject usecase実装
- [ ] CreateBudget usecase実装
- [ ] RecordActualRevenue usecase実装
- [ ] RecordActualCost usecase実装
- [ ] リポジトリ実装（Sqlx）
  - [ ] SqlxProjectRepository
  - [ ] SqlxBudgetRepository
  - [ ] SqlxActualRevenueRepository
  - [ ] SqlxActualCostRepository

### フェーズ3: GraphQL API（Week 3） 📝
- [ ] スキーマ定義（schema.graphql）
- [ ] Query実装
  - [ ] projects
  - [ ] budgets
  - [ ] actualRevenues
  - [ ] actualCosts
- [ ] Mutation実装
  - [ ] createProject
  - [ ] createBudget
  - [ ] recordActualRevenue
  - [ ] recordActualCost
- [ ] `mise run codegen` 実行

### フェーズ4: フロントエンド基本UI（Week 4-5） 📝
- [ ] ページ実装
  - [ ] `/finance` - ダッシュボード
  - [ ] `/finance/projects` - プロジェクト一覧
  - [ ] `/finance/projects/new` - プロジェクト作成
  - [ ] `/finance/budgets/new` - 予算作成
  - [ ] `/finance/actuals/new` - 実績入力
- [ ] コンポーネント実装
  - [ ] ProjectForm
  - [ ] BudgetForm
  - [ ] ActualRevenueForm
  - [ ] ActualCostForm
- [ ] GraphQLクエリ・ミューテーション定義（.graphql）

### フェーズ5: 分析機能（Week 6） 📝
- [ ] CalculateBudgetVariance usecase実装
- [ ] GetProjectProfitability usecase実装
- [ ] ForecastCashflow usecase実装（Phase 3）
- [ ] ダッシュボードのグラフ実装
  - [ ] BudgetVarianceChart（Recharts）
  - [ ] ProjectProfitabilityTable
  - [ ] CashflowForecastChart（Phase 3）

### 権限管理 📝
- [ ] `scripts/seeds/n1-seed/008-auth-policies.yaml` 更新
  - [ ] budget:CreateProject
  - [ ] budget:CreateBudget
  - [ ] budget:UpdateBudget
  - [ ] budget:RecordActualRevenue
  - [ ] budget:RecordActualCost
  - [ ] budget:CalculateBudgetVariance
  - [ ] budget:GetProjectProfitability
  - [ ] budget:ForecastCashflow
- [ ] ポリシー定義
  - [ ] BudgetFullAccess（経営者向け）
  - [ ] BudgetReadOnly（役員向け）
  - [ ] BudgetInputRole（経理担当者向け）

## Playwright MCPによる動作確認

### 実施タイミング
- [ ] Phase 4完了後の初回動作確認
- [ ] Phase 5完了後の最終確認

### 動作確認チェックリスト

#### プロジェクト作成フォーム
- [ ] プロジェクト一覧ページ（`/v1beta/[tenant_id]/finance/projects`）の表示
- [ ] 「新規プロジェクト」ボタンのクリック
- [ ] プロジェクト作成フォームへの遷移
- [ ] プロジェクトコード、プロジェクト名の入力
- [ ] 部門・カテゴリの選択
- [ ] 送信成功とプロジェクト一覧への戻り
- [ ] 作成したプロジェクトがリストに表示される

#### 予算作成フォーム
- [ ] 予算作成ページ（`/v1beta/[tenant_id]/finance/budgets/new`）の表示
- [ ] プロジェクト選択ドロップダウンの動作
- [ ] 会計年度の入力
- [ ] 会計期間（Q1/Q2/Q3/Q4/ANNUAL）の選択
- [ ] 予算タイプ（REVENUE/COST/PROFIT）の選択
- [ ] 金額入力（USD）
- [ ] バリデーションエラーの表示
- [ ] 送信成功と予算一覧への戻り

#### 実績入力フォーム
- [ ] 実績入力ページ（`/v1beta/[tenant_id]/finance/actuals/new`）の表示
- [ ] プロジェクト選択
- [ ] 実績タイプ（売上/コスト）の選択
- [ ] 日付選択（DatePicker）
- [ ] 金額入力
- [ ] カテゴリ選択
- [ ] 送信成功と実績一覧への戻り

#### ダッシュボード
- [ ] ダッシュボード（`/v1beta/[tenant_id]/finance`）の表示
- [ ] 予実サマリーカードの表示
- [ ] プロジェクト別収益性テーブルの表示
- [ ] 予実差異グラフの表示（Recharts）
- [ ] データが0件の場合の表示

### ユーザビリティ・UI品質チェック

#### レスポンシブデザイン
- [ ] モバイル（375x667）での表示確認
- [ ] タブレット（768x1024）での表示確認
- [ ] デスクトップ（1440x900以上）での表示確認

#### キーボード操作・アクセシビリティ
- [ ] Tabキーでの適切なフォーカス移動
- [ ] フォーム要素のrole属性（textbox, combobox, button）
- [ ] aria-label属性の適切な設定
- [ ] テーブルの適切な構造（th, td）

#### 操作性・UX
- [ ] フォーム送信時のダブルクリック防止
- [ ] ローディング状態の適切な表示
- [ ] エラー状態の分かりやすい表示（Toast）
- [ ] 確認ダイアログの適切なUX

#### デザイン統一性
- [ ] shadcn/uiコンポーネントの適切な使用
- [ ] カラー・フォント・スペーシングの一貫性
- [ ] アイコンの統一性（Lucide React）

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| NanoDollar変換ロジックの誤り | 高 | ユニットテストで徹底的に検証、既存実装パターンを踏襲 |
| 集計クエリのパフォーマンス劣化 | 中 | 適切なインデックス設計、必要に応じてマテリアライズドビュー |
| 既存Order/Quoteとの混乱 | 中 | UIで明確に分離、ドキュメントで責務を明記 |
| 会計期間の国際化対応 | 低 | Phase 1は日本の会計年度のみ、将来拡張可能な設計 |

## 参考資料

### 既存実装パターン
- `packages/value_object/src/nano_dollar.rs` - NanoDollar値オブジェクトの参考実装
- `packages/order/src/usecase/create_quote.rs` - Usecaseパターンの参考実装
- `packages/payment/domain/src/` - エンティティ設計の参考

### 技術ドキュメント
- [Clean Architecture in Rust](https://github.com/quantum-box/tachyon-apps/blob/main/docs/src/architecture/)
- [NanoDollar System Specification](https://github.com/quantum-box/tachyon-apps/blob/main/docs/src/architecture/nanodollar-system.md)
- [Auth Policies Guide](https://github.com/quantum-box/tachyon-apps/blob/main/docs/src/tachyon-apps/authentication/)

## 完了条件

- [ ] すべてのマイグレーションが適用済み
- [ ] すべてのドメインモデルが実装済み
- [ ] すべてのユースケースが実装済み
- [ ] GraphQL APIが正常に動作
- [ ] フロントエンドの基本UIが完成
- [ ] シナリオテストが通過
- [ ] Playwright MCPでの動作確認完了
- [ ] 動作確認レポートが作成済み
- [ ] 権限設定が追加済み
- [ ] `mise run ci` が通過
- [ ] コードレビューが完了
- [ ] 正式な仕様ドキュメントを作成済み

### バージョン番号の決定基準

このタスクが完了した際のバージョン番号の上げ方：

**マイナーバージョン（x.X.x）を上げる:**
- [x] 新機能の追加（与実管理機能）
- [x] 新しいコンテキスト（Budget）の追加
- [x] 新しい画面の追加（/finance配下）
- [x] 新しいGraphQL APIの追加

完了時は `v0.X.0` → `v0.X+1.0` にバージョンアップします。

## 備考

### 設計方針の決定事項
- 既存Order/Quoteとは当面独立した管理とする
- 将来的な統合に備えて、プロジェクトコードを共通キーとする設計
- NanoDollar統一による金額管理の一貫性を確保

### 今後の拡張予定（Phase 3以降）
- 既存Quote/POデータとの統合
- キャッシュフロー予測の高度化
- 多通貨対応
- 会計期間のカスタマイズ
- 部門別管理の強化
- CSVエクスポート機能
