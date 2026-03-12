# Library Location Type

Library アプリケーションにおける Location 型（位置情報）プロパティの仕様です。

## 概要

Location 型は、緯度・経度を保存するプロパティタイプです。店舗一覧、イベント会場、観光スポットなど、位置情報を扱うデータベースで使用できます。

## 機能

### プロパティ作成

プロパティ管理画面でタイプとして `LOCATION` を選択することで、Location 型プロパティを作成できます。

### データ入力・編集

- **地図クリック**: Google Maps 上をクリックして座標を設定
- **場所検索**: 検索フィールドに場所名を入力して候補から選択（Google Places Autocomplete）
- **手動入力**: 緯度・経度を直接入力

### データ表示

- **詳細画面**: 場所名（POI名）をホバーすると地図プレビューを表示
- **データテーブル**: 場所名のコンパクト表示

### 場所名の解決

座標から場所名を取得する際、以下の優先順位で解決されます：

1. **駅検索** (transit_station): 半径100m以内の駅を優先検索
2. **一般POI**: 半径50m以内のPOIを検索
3. **Reverse Geocoding**: 住所から地域名を抽出

### 多言語対応

Library の言語設定に連動して、場所名の表示言語が切り替わります：
- 日本語設定: 「高田馬場駅」
- 英語設定: 「Takadanobaba Station」

## 技術仕様

### GraphQL スキーマ

```graphql
# 入力型
input Location {
  latitude: Float!
  longitude: Float!
}

# 出力型
type LocationValue {
  latitude: Float!
  longitude: Float!
}

# PropertyType enum
enum PropertyType {
  STRING
  INTEGER
  MARKDOWN
  RELATION
  SELECT
  MULTI_SELECT
  ID
  LOCATION
}
```

### 環境変数

```env
# Google Maps API キー（必須）
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_api_key
```

### 必要な Google API

- Maps JavaScript API
- Places API
- Geocoding API

### コンポーネント構成

| コンポーネント | 用途 |
|---------------|------|
| `LocationMap` | 編集・表示用の地図（場所検索機能付き） |
| `LocationMapCompact` | テーブル用のコンパクト表示（ホバーで地図プレビュー） |
| `DataLocationsMap` | リポジトリのマップビュー（複数マーカー表示） |

### ファイル構成

```
apps/library/src/app/v1beta/_components/location-map/
├── index.tsx              # LocationMap, LocationMapCompact
└── data-locations-map.tsx # DataLocationsMap
```

## 使用例

### プロパティ定義

```typescript
{
  id: 'prop_location',
  name: '所在地',
  typ: PropertyType.Location,
  meta: null
}
```

### データ

```typescript
{
  propertyId: 'prop_location',
  value: {
    __typename: 'LocationValue',
    latitude: 35.7125654,
    longitude: 139.7038615
  }
}
```

## 関連ドキュメント

- [Library Overview](./overview.md)
- [タスクドキュメント](../../tasks/completed/v1.8.0/library-location-type-support/task.md)

