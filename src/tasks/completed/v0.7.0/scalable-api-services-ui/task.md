---
title: "膨大なAPIサービスに対応したUI設計"
type: "improvement"
emoji: "🔍"
topics: ["ui-design", "scalability", "api-services", "data-table"]
published: true
targetFiles: [
  "apps/tachyon/src/app/v1beta/[tenant_id]/pricing/services/",
  "packages/ui/src/components/data-table/"
]
---

# 膨大なAPIサービスに対応したUI設計

## 背景・課題

### 現在の状況
- 現在のAPIサービス管理画面は2〜3個のサンプルサービス前提のカードグリッド表示
- Tachyon Cloud APIでは数百〜数千のAPIサービスが提供予定
- 現在のUIでは管理が不可能

### 解決すべき問題
1. **スケーラビリティ**: 大量データの効率的表示
2. **検索性**: 目的のサービスを素早く見つける
3. **管理効率**: 複数サービスの一括操作
4. **データ視覚化**: 価格設定状況の俯瞰
5. **パフォーマンス**: 大量データでもスムーズな操作

## UI設計方針

### 1. データテーブルベースの設計
カードグリッドから、スケーラブルなデータテーブルへ移行

```yaml
display_modes:
  primary: "table"  # メイン表示
  secondary: "card"  # 詳細比較用（最大20件程度）
  compact: "list"   # モバイル向け

table_features:
  pagination: true
  sorting: true
  filtering: true
  search: true
  bulk_actions: true
  column_customization: true
```

### 2. 多層フィルタリングシステム

```yaml
filter_hierarchy:
  level1_category:
    - "LLM Services"      # ChatGPT, Claude, Gemini等
    - "Vision Services"   # 画像認識、OCR等
    - "Audio Services"    # 音声認識、TTS等
    - "Search Services"   # Web検索、データ検索等
    - "Tool Services"     # MCP、カスタムツール等
    - "Infrastructure"    # 認証、ログ、監視等
    
  level2_provider:
    - "OpenAI"
    - "Anthropic"
    - "Google"
    - "Microsoft"
    - "Tachyon Native"
    
  level3_status:
    - "Active"
    - "Beta"
    - "Deprecated"
    - "Coming Soon"
    
  level4_pricing:
    - "Free Tier"
    - "Pay-per-use"
    - "Subscription"
    - "Enterprise"
```

### 3. 検索・ソート機能

```yaml
search_capabilities:
  global_search:
    - service_name
    - description
    - sku_code
    - tags
    
  advanced_search:
    - price_range
    - usage_volume
    - last_updated
    - popularity
    
sorting_options:
  - name_asc
  - name_desc
  - price_asc
  - price_desc
  - usage_desc
  - last_updated
  - alphabetical
```

### 4. 情報密度の最適化

```yaml
table_columns:
  essential:
    - service_name
    - category
    - provider
    - status
    - base_price
    - actions
    
  detailed:
    - sku_code
    - billing_cycle
    - usage_pricing
    - last_updated
    - popularity_score
    
  performance:
    - revenue_ytd
    - margin_percentage
    - usage_trend
```

## 実装計画

### Phase 1: データテーブル基盤構築
```typescript
// 共通データテーブルコンポーネント
interface DataTableProps<T> {
  data: T[]
  columns: ColumnDef<T>[]
  pagination?: PaginationConfig
  filtering?: FilterConfig
  sorting?: SortConfig
  selection?: SelectionConfig
}

// APIサービス専用設定
interface ApiServiceTableConfig {
  defaultSort: 'name' | 'category' | 'usage'
  defaultFilters: Record<string, unknown>
  columnVisibility: Record<string, boolean>
  pageSize: 25 | 50 | 100
}
```

### Phase 2: 高度なフィルタリング
```typescript
interface FilterState {
  categories: string[]
  providers: string[]
  status: string[]
  priceRange: [number, number]
  hasUsagePricing: boolean
  lastUpdated: DateRange
}

interface SearchState {
  query: string
  scope: 'all' | 'name' | 'description' | 'sku'
  operators: 'and' | 'or'
}
```

### Phase 3: バルク操作・分析機能
```typescript
interface BulkActions {
  updatePricing: (services: string[], pricing: PricingUpdate) => Promise<void>
  updateStatus: (services: string[], status: ServiceStatus) => Promise<void>
  exportData: (services: string[], format: 'csv' | 'xlsx') => Promise<void>
  duplicateServices: (services: string[]) => Promise<void>
}

interface AnalyticsFeatures {
  priceComparison: boolean
  revenueAnalysis: boolean
  usageTrends: boolean
  competitorPricing: boolean
}
```

## デザインシステム

### 1. レイアウト構造
```
┌─ Header: 検索バー + アクションボタン ─┐
├─ Toolbar: フィルター + ソート + 表示設定 ─┤
├─ Data Table: ページネーション対応 ─────┤
├─ Status Bar: 選択状況 + 統計情報 ─────┤
└─ Footer: ページネーション + 表示件数 ─┘
```

### 2. 情報アーキテクチャ
```yaml
primary_navigation:
  - "All Services"      # 全サービス
  - "My Services"       # 担当サービス
  - "Recently Updated"  # 最近更新
  - "Needs Attention"   # 要対応
  
secondary_navigation:
  - category_filters
  - provider_filters
  - status_filters
  
tertiary_actions:
  - bulk_operations
  - export_options
  - view_settings
```

### 3. レスポンシブ対応
```yaml
breakpoints:
  desktop: "table_view"    # フル機能
  tablet: "compact_table"  # 重要列のみ
  mobile: "list_view"      # カード型リスト
  
mobile_adaptations:
  - swipe_actions
  - bottom_sheet_filters
  - infinite_scroll
  - priority_based_column_hiding
```

## パフォーマンス最適化

### 1. データ取得戦略
```yaml
loading_strategy:
  initial_load: 25_items
  prefetch: next_25_items
  lazy_load: on_scroll_or_page_change
  
caching_strategy:
  query_cache: 5_minutes
  filter_cache: session_based
  sort_cache: user_preference
  
optimization:
  virtual_scrolling: true
  debounced_search: 300ms
  memo_heavy_columns: true
```

### 2. GraphQL最適化
```graphql
query GetApiServicesWithPagination(
  $first: Int = 25
  $after: String
  $filter: ApiServiceFilter
  $sort: ApiServiceSort
) {
  apiServices(
    first: $first
    after: $after
    where: $filter
    orderBy: $sort
  ) {
    edges {
      node {
        id
        name
        category
        provider
        status
        basePrice
        # 詳細データは個別画面で取得
      }
    }
    pageInfo {
      hasNextPage
      endCursor
      totalCount
    }
  }
}
```

## 段階的実装アプローチ

### Step 1: 基本データテーブル (1-2日)
- カードグリッドからテーブル表示への移行
- 基本的なソート・ページネーション
- シンプルな検索機能

### Step 2: フィルタリング強化 (2-3日)
- カテゴリ・プロバイダー・ステータスフィルター
- 価格範囲フィルター
- フィルター状態の永続化

### Step 3: 高度な機能 (3-4日)
- バルク操作（選択・一括更新）
- 列カスタマイズ機能
- エクスポート機能

### Step 4: UX改善 (2-3日)
- 保存済み検索・フィルター
- ダッシュボード統合
- パフォーマンス最適化

## 期待される効果

1. **管理効率**: 数千のサービスでも素早くアクセス可能
2. **運用性**: 一括操作による作業時間短縮
3. **可視性**: サービス全体の状況把握が容易
4. **拡張性**: 新しいサービス種別への対応が簡単
5. **ユーザビリティ**: 直感的で学習コストの低いUI

## 実装優先度

```yaml
priority_high:
  - データテーブル基盤
  - 基本フィルタリング
  - ページネーション
  - 検索機能

priority_medium:
  - バルク操作
  - 高度なフィルター
  - ソート機能
  - 列カスタマイズ

priority_low:
  - 分析機能
  - エクスポート機能
  - 保存済みビュー
  - モバイル最適化
```

## 実装結果 (2025-01-17)

### 実装完了項目 ✅

#### Phase 1: データテーブル基盤構築
- ✅ カードグリッドからデータテーブルへの移行完了
- ✅ 基本的なソート機能（サービス名、ステータス、定価）
- ✅ ページネーション（25/50/100件表示切り替え）
- ✅ 検索機能（サービス名、説明、SKUで全文検索）

#### Phase 2: フィルタリング機能
- ✅ ステータスフィルター（有効/無効）
- ✅ プロバイダーフィルター（OpenAI/Anthropic/Google/その他）
- ✅ 価格帯フィルター（無料/低価格/中価格/高価格）
- ✅ フィルターリセット機能

#### 統計ダッシュボード
- ✅ 総サービス数カード
- ✅ 有効サービス数カード（稼働率表示）
- ✅ 主要プロバイダーカード（最多プロバイダー表示）
- ✅ 従量課金対応サービス数カード

### 技術的改善点

1. **React State管理の最適化**
   - useCallbackフックを使用してイベントハンドラーをメモ化
   - 不要な再レンダリングを防止

2. **Radix UI Select エラー対応**
   - value=""（空文字列）を"all"に変更
   - SelectItemのvalue propエラーを解決

3. **レスポンシブデザイン**
   - グリッドレイアウトでモバイル〜デスクトップ対応
   - 統計カードは md:grid-cols-2 lg:grid-cols-4

### 実装ファイル

- `apps/tachyon/src/app/v1beta/[tenant_id]/pricing/services/components/api-services-data-table.tsx`
- `apps/tachyon/src/app/v1beta/[tenant_id]/pricing/services/components/api-services-stats.tsx`
- `apps/tachyon/src/app/v1beta/[tenant_id]/pricing/services/page.tsx`

### 動作確認結果

- 3つのAPIサービス（ChatGPT、Claude、Gemini）での表示確認 ✅
- 検索機能の動作確認（"Claude"での絞り込み）✅
- フィルターリセット機能の動作確認 ✅
- ページネーション表示の確認 ✅

### 今後の拡張予定

#### 中優先度機能
- バルク操作（複数選択・一括更新）
- 高度なフィルター（カテゴリ、日付範囲等）
- 列カスタマイズ機能

#### 低優先度機能
- データエクスポート（CSV/Excel）
- 保存済みビュー
- 詳細な分析機能
- モバイル専用UI最適化