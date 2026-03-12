# Library DuckDB DataView

## 概要

Library の DataView を DuckDB WASM で高速化し、クライアントサイドで
フィルタ/ソート/検索/SQL実行を行えるようにした。
大量データ時は Parquet を利用し、ブラウザ上の DuckDB から直接クエリする。

## 目的

- 大量データのフィルタ・ソートを高速化
- サーバー負荷を削減し、UIの応答性を改善
- SQL入力による柔軟な検索・分析を可能にする

## アーキテクチャ

```
DataView UI
  └─ useDuckDBFilteredData
      ├─ DuckDB WASM (Web Worker)
      ├─ in-memory table (data_view)
      └─ Parquet view (data_view)
```

### DuckDB 初期化

- `@duckdb/duckdb-wasm` を JSDelivr バンドルで取得
- Web Worker 上で DuckDB を起動し、UIスレッドをブロックしない

## データソース

### 1. インメモリテーブル

- GraphQL `dataList.items` からテーブルを構築
- テーブル名: `data_view`

### 2. Parquet

- エンドポイント: `GET /v1beta/repos/{org}/{repo}/data/parquet`
- 署名付き URL で Parquet を取得し、DuckDB の view にマウント
- OPFS 対応ブラウザではローカルにキャッシュ

## カラム定義

### ベースカラム

- `id` (VARCHAR)
- `name` (VARCHAR)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

### プロパティカラム

- `prop_<propertyId>` 形式で作成
- 型マッピング:
  - Integer → `DOUBLE`
  - Date → `TIMESTAMP`
  - その他 → `VARCHAR`

### 値の表現

- Select/MultiSelect/Relation: 文字列またはカンマ区切り
- Location: `"latitude,longitude"` 形式
- Markdown: 現状は空扱い

## クエリ機能

### フィルタ/ソート/検索

- 既存 UI の条件を DuckDB SQL に変換して実行
- 検索は `ILIKE` 相当（LOWER + LIKE）で全列を対象

### SQL モード

- **完全な SELECT** または **WHERE/ORDER BY 句のみ**を受け付ける
- WHERE/ORDER BY の場合は `SELECT id FROM data_view` を自動で付与
- カラム名は `Columns:` に表示される一覧に従う

例:

```sql
WHERE name ILIKE '%foo%' ORDER BY updated_at DESC
```

```sql
SELECT id, name, updated_at FROM data_view WHERE name ILIKE '%foo%'
```

## フォールバック挙動

- Parquet 取得に失敗した場合は **インメモリテーブルへフォールバック**
- SQLエラーは `useDuckDBFilteredData` でエラー保持（UI側の表示は今後検討）

## 制約・注意点

- プロパティは `prop_<id>` 名で参照する必要がある
- Parquet はネットワーク/署名URL失効に依存する
- ブラウザ差による OPFS 制約がある

## 関連ドキュメント

- [Library 概要](./overview.md)
- [ガントチャートビュー](./gantt-chart-view.md)

## 実装タスク

- DuckDB WASM 実装: `docs/src/tasks/completed/library-v1.11.0/duckdb-wasm-library-view/task.md`
- S3権限・Terraform整備: `docs/src/tasks/completed/library-v1.11.0/library-parquet-s3-permissions/task.md`
