# Library Date プロパティタイプ

## 概要

Library アプリに日付のみ（時刻なし）を保存する `Date` プロパティタイプを追加しました。

## 仕様

### データ型

- **型名**: `Date`
- **保存形式**: ISO 8601 (`YYYY-MM-DD`)
- **バックエンド型**: `chrono::NaiveDate`
- **フロントエンド型**: `Date` (JavaScript)

### バリデーション

- **フォーマット**: `YYYY-MM-DD` 形式のみ受け付け
- **年**: 1-9999 の範囲
- **月**: 1-12 の範囲
- **日**: 1-31 の範囲（実際の日付として有効かどうかも検証）

### GraphQL API

```graphql
enum PropertyType {
  # ... 既存のタイプ
  DATE
}

union PropertyDataValue {
  # ... 既存の値
  DateValue
}

type DateValue {
  value: String! # ISO 8601形式 (YYYY-MM-DD)
}
```

## 使い方

### プロパティ作成

プロパティ作成時に `Date` タイプを選択します。

### データ入力

データ詳細ページで DatePicker コンポーネントを使用して日付を選択します。

### テーブルビュー表示

テーブルビューでは `YYYY-MM-DD` 形式で日付が表示されます。

### ガントチャートビュー

Date プロパティを開始日・終了日として使用してガントチャートを表示できます。

## 技術実装

### バックエンド

```rust
pub enum PropertyType {
    // ... 既存のタイプ
    Date,
}

pub enum PropertyDataValue {
    // ... 既存の値
    Date(String), // ISO 8601形式 (YYYY-MM-DD)
}
```

### フロントエンド

- **DatePicker**: shadcn/ui の DatePicker コンポーネントを使用
- **日付ライブラリ**: `date-fns` を使用した日付操作

## 制限事項

- **時刻情報なし**: 日付のみを保存し、時刻情報は含まれません
- **タイムゾーン**: タイムゾーン情報は保存されません

## 将来の拡張

- **Timestamp プロパティタイプ**: 日時（時刻含む）を保存するタイプの追加を検討

## 関連ドキュメント

- [ガントチャートビュー](./gantt-chart-view.md)
- [Library 概要](./overview.md)

## 実装タスク

- タスク: `docs/src/tasks/completed/library-v1.9.0/library-gantt-chart-view/task.md`

