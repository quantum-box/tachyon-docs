# APIサービス管理UI

## 概要

APIサービス管理UIは、Tachyon Cloud APIから提供される膨大な数のAPIサービスを効率的に管理するためのインターフェースです。数千のサービスに対応できるスケーラブルな設計を採用し、検索・フィルタリング・ソート・ページネーション機能を提供します。

## UI設計

### レイアウト構造

```
┌─────────────────────────────────────────────────────┐
│  APIサービス管理                                      │
│  提供するAPIサービスの価格設定を管理します。            │
├─────────────────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ │
│  │総サービス│ │有効サービス│ │主要プロバイダー│ │従量課金│ │
│  │   数    │ │           │ │              │ │  対応  │ │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ │
├─────────────────────────────────────────────────────┤
│  フィルター・検索                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ 🔍 サービス名、説明、SKUで検索...              │   │
│  └─────────────────────────────────────────────┘   │
│  [ステータス▼] [プロバイダー▼] [価格帯▼] [リセット]  │
├─────────────────────────────────────────────────────┤
│  3件中 1-3件を表示                    表示件数: [25▼] │
├─────────────────────────────────────────────────────┤
│  サービス名↕ プロバイダー ステータス↕ SKU 定価↕ ...   │
│  ─────────────────────────────────────────────────  │
│  ChatGPT API  OpenAI     有効      ... ¥5,000  ...  │
│  Claude API   Anthropic  有効      ... ¥4,500  ...  │
│  Gemini API   Google     有効      ... ¥3,500  ...  │
└─────────────────────────────────────────────────────┘
```

### コンポーネント構成

#### 1. 統計ダッシュボード (`api-services-stats.tsx`)
- **総サービス数**: 登録されているAPIサービスの総数
- **有効サービス**: ACTIVEステータスのサービス数と割合
- **主要プロバイダー**: 最も多くのサービスを提供しているプロバイダー
- **従量課金対応**: 従量課金に対応しているサービス数と割合

#### 2. データテーブル (`api-services-data-table.tsx`)
- **検索機能**: サービス名、説明、SKUコードでの全文検索
- **フィルタリング**:
  - ステータス（すべて/有効/無効）
  - プロバイダー（すべて/OpenAI/Anthropic/Google/その他）
  - 価格帯（すべて/無料/低価格/中価格/高価格）
- **ソート機能**: サービス名、ステータス、定価でソート可能
- **ページネーション**: 25/50/100件の表示切り替え

### 技術仕様

#### GraphQLクエリ
```graphql
query GetApiServices {
  apiServices {
    id
    name
    description
    status
    skuCode
    kind
    billingCycle
    listPrice
    requiresUsagePricing
    createdAt
    updatedAt
  }
}
```

#### フィルター状態管理
```typescript
interface FilterState {
  search: string      // 検索キーワード
  category: string    // カテゴリ（将来拡張用）
  provider: string    // プロバイダー
  status: string      // ステータス
  priceRange: string  // 価格帯
}
```

#### ソート状態管理
```typescript
interface SortState {
  column: keyof ApiService | null
  direction: 'asc' | 'desc'
}
```

### パフォーマンス最適化

1. **メモ化**
   - `useMemo`でフィルタリング・ソート処理を最適化
   - `useCallback`でイベントハンドラーをメモ化

2. **レンダリング最適化**
   - 表示データのみをスライスしてレンダリング
   - 仮想スクロール対応準備（1000件以上の場合）

3. **状態管理**
   - フィルター変更時に自動的にページを1に戻す
   - URLパラメータとの同期（将来実装）

## 実装詳細

### データテーブルの主要機能

#### 検索機能
```typescript
const matchesSearch = 
  service.name.toLowerCase().includes(searchLower) ||
  service.description?.toLowerCase().includes(searchLower) ||
  service.skuCode?.toLowerCase().includes(searchLower)
```

#### プロバイダー抽出ロジック
```typescript
const extractProvider = (serviceName: string): string => {
  if (serviceName.includes('ChatGPT') || serviceName.includes('OpenAI')) return 'OpenAI'
  if (serviceName.includes('Claude') || serviceName.includes('Anthropic')) return 'Anthropic'
  if (serviceName.includes('Gemini') || serviceName.includes('Google')) return 'Google'
  return 'Other'
}
```

#### 価格帯判定
```typescript
const isInPriceRange = (price: number, range: string): boolean => {
  switch (range) {
    case 'free': return price === 0
    case 'low': return price > 0 && price <= 1000
    case 'medium': return price > 1000 && price <= 5000
    case 'high': return price > 5000
    default: return true
  }
}
```

### エラーハンドリング

#### Radix UI Select コンポーネント
- `value=""` を使用するとエラーになるため、`value="all"` を使用
- すべてのSelectItemで空文字列を避ける実装

#### GraphQLエラー
- ローディング状態とエラー状態を適切に表示
- エラーメッセージをユーザーフレンドリーに表示

## 拡張性

### 将来の機能拡張

1. **バルク操作**
   - 複数選択による一括更新
   - 一括有効/無効化
   - 一括価格更新

2. **高度なフィルタリング**
   - カテゴリ別フィルター
   - 日付範囲フィルター
   - カスタムフィルター保存

3. **データエクスポート**
   - CSV/Excelエクスポート
   - PDFレポート生成

4. **分析機能**
   - 使用量トレンドグラフ
   - 収益分析
   - 価格最適化提案

### APIサービスの拡張
- 新しいプロバイダーの追加が容易
- カスタムメタデータのサポート
- タグベースの分類

## 使用方法

### 基本的な操作フロー

1. **サービスの検索**
   - 検索ボックスにキーワードを入力
   - リアルタイムでフィルタリング

2. **フィルターの適用**
   - 各ドロップダウンから条件を選択
   - 複数条件の組み合わせが可能

3. **詳細ページへの遷移**
   - 「価格設定」ボタンをクリック
   - 個別サービスの詳細設定画面へ

### ショートカットキー（将来実装）
- `/`: 検索ボックスにフォーカス
- `r`: フィルターリセット
- `n/p`: 次/前のページ

## ベストプラクティス

1. **大量データの管理**
   - 必要に応じてページサイズを調整
   - 検索とフィルターを活用して絞り込み

2. **定期的な確認**
   - 無効化されたサービスの確認
   - 価格設定の更新状況チェック

3. **一括操作の活用**
   - 同じプロバイダーのサービスをまとめて更新
   - カテゴリ単位での管理