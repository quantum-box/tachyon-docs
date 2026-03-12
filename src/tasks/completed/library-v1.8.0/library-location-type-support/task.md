---
title: Library フロントエンド Location 型対応
type: feature
emoji: "📍"
topics:
  - Library
  - GraphQL
  - React
  - Location
  - Google Maps
published: true
targetFiles:
  - apps/library/src/app/v1beta/_components/property-editor/property-data.graphql
  - apps/library/src/app/v1beta/_components/property-editor/viewer.tsx
  - apps/library/src/app/v1beta/_components/properties-ui/property-dialog.tsx
  - apps/library/src/app/v1beta/_components/data-detail-ui/property-value/index.tsx
  - apps/library/src/app/v1beta/[org]/[repo]/data/new/page.tsx
  - apps/library/src/app/v1beta/_components/location-map/index.tsx
github: ""
---

# Library フロントエンド Location 型対応

## 概要

Library のバックエンド（library-api）では既に `LOCATION` プロパティ型（緯度・経度）がサポートされている。本タスクでは、フロントエンド（apps/library）もこの型に対応させ、位置情報データの入力・表示・編集を可能にする。

## 背景・目的

- バックエンドの GraphQL スキーマには `LocationValue` 型と `Location` 入力型が既に定義されている
- フロントエンドでは `LocationValue` を取得する GraphQL フラグメントが欠けている
- UI コンポーネントでも `PropertyType.Location` のケースハンドリングが未実装
- 位置情報を扱うデータベース（店舗一覧、イベント会場など）のユースケースで必要

## 詳細仕様

### 機能要件

1. **GraphQL フラグメント対応**
   - `property-data.graphql` に `LocationValueForEditor` フラグメントを追加
   - `PropertyDataForEditor` に `LocationValueForEditor` を含める

2. **プロパティ作成ダイアログ**
   - プロパティ種別のセレクトボックスに `LOCATION` を追加
   - Location 型選択時は特別なメタ情報は不要（緯度経度のみ）

3. **データ編集画面**
   - 編集モード: 緯度・経度を入力するフォーム
   - 表示モード: 緯度経度を読みやすい形式で表示

4. **新規データ作成**
   - `createEmptyPropertyData` に Location 型のデフォルト値を追加

### 非機能要件

- 緯度は -90.0 〜 90.0 の範囲
- 経度は -180.0 〜 180.0 の範囲
- 入力バリデーションは任意（バックエンドでも検証される）

### バックエンド仕様（参考）

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
  LOCATION  # ← これ
}
```

## 実装方針

### 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `property-data.graphql` | `LocationValueForEditor` フラグメント追加 |
| `repo.graphql` | `DataFieldOnRepoPage` に `LocationValue` 追加 |
| `viewer.tsx` | Location 型の表示ロジック追加（Google Map表示） |
| `property-dialog.tsx` | SelectContent に LOCATION オプション追加 |
| `property-value/index.tsx` | Location 型の編集・表示ロジック追加（Google Map対応） |
| `data/new/page.tsx` | `createEmptyPropertyData` に Location ケース追加 |
| `row.tsx` | データテーブルに Location 型の表示追加（コンパクトMap） |
| `location-map/index.tsx` | **新規** Google Maps表示コンポーネント |
| `*.stories.tsx` | Storybook にサンプルデータ追加 |

### 依存パッケージ

- `@react-google-maps/api` - Google Maps React バインディング

### UI 設計

#### 編集モード（Google Maps対応）

```
┌─────────────────────────────────────┐
│ ┌─────────────────────────────────┐ │
│ │                                 │ │
│ │    [Google Map - クリック可]     │ │
│ │           📍                    │ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
│ Lat [35.6895    ] Lng [139.6917  ] │
└─────────────────────────────────────┘
```

- 地図をクリックすると、その位置にマーカーが移動
- 手動入力フィールドでも座標を直接編集可能

#### 表示モード

```
┌─────────────────────────────────────┐
│ ┌─────────────────────────────────┐ │
│ │                                 │ │
│ │    [Google Map - 閲覧専用]       │ │
│ │           📍                    │ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
│ 📍 35.689500, 139.691700           │
└─────────────────────────────────────┘
```

#### データテーブル（コンパクト表示）

```
[地図] 35.6895, 139.6917
```

- 小さな地図プレビュー + 座標テキスト

## タスク分解

### 主要タスク ✅

- [x] GraphQL フラグメント追加（`property-data.graphql`）
- [x] GraphQL フラグメント追加（`repo.graphql` - DataFieldOnRepoPage）
- [x] コードジェネレーション実行（`mise run codegen`）
- [x] PropertyDialog に LOCATION オプション追加
- [x] PropertyViewer に Location 型の表示ロジック追加
- [x] PropertyValue コンポーネントに Location 型の編集・表示ロジック追加
- [x] createEmptyPropertyData に Location ケース追加
- [x] row.tsx に Location 型の表示ロジック追加
- [x] Storybook にサンプルデータ追加
- [ ] 動作確認（プロパティ作成 → データ作成 → 編集 → 表示）

## Playwright MCP による動作確認

### 動作確認チェックリスト

#### プロパティ作成
- [ ] プロパティ管理画面を開く
- [ ] 「Add Property」をクリック
- [ ] プロパティ名を入力
- [ ] タイプのセレクトボックスに「LOCATION」が表示される
- [ ] LOCATION を選択してプロパティを作成できる

#### データ作成・編集
- [ ] 新規データ作成画面で Location プロパティが表示される
- [ ] 緯度フィールドに値を入力できる
- [ ] 経度フィールドに値を入力できる
- [ ] 保存後、正しく値が保存される

#### データ表示
- [ ] データ詳細画面で Location プロパティが表示される
- [ ] 緯度・経度が読みやすい形式で表示される

### 実施手順

1. ローカル開発サーバーの確認（library: http://localhost:3010）
2. テストリポジトリで Location プロパティを作成
3. Location プロパティを持つデータを作成
4. 編集・表示が正しく動作することを確認

## 完了条件

- [x] すべての機能要件を満たしている
- [x] `mise run codegen` が成功する
- [x] `yarn lint --filter=library && yarn ts --filter=library` が成功する
- [ ] 動作確認が完了している（バックエンドサーバー起動時に確認予定）

### 実装確認結果（2024-12-13）

コードの実装は完了しており、以下のファイルで `PropertyType.Location` が正しく実装されていることを確認：

- `property-dialog.tsx`: LOCATIONオプションをセレクトボックスに追加
- `viewer.tsx`: Location型の表示ロジック追加
- `property-value/index.tsx`: Location型の編集・表示ロジック追加
- `data/new/page.tsx`: createEmptyPropertyDataにLocationケース追加
- `row.tsx`: データテーブルにLocation型表示追加
- `repo.graphql`: DataFieldOnRepoPageにLocationValue追加
- Storybookサンプルデータ追加

### バージョン番号の決定基準

**マイナーバージョン（x.X.x）を上げる場合:**
- [x] 新機能の追加（Location 型サポート）

## 備考

### Google Maps 対応（2024-12-13 追加実装）

- `@react-google-maps/api` を使用した地図表示を実装
- 編集モード: 地図クリックで座標を設定可能 + 手動入力フィールド
- 表示モード: 地図でマーカー位置を表示
- データテーブル: コンパクトな地図プレビューと座標テキスト
- 環境変数 `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` が必要

