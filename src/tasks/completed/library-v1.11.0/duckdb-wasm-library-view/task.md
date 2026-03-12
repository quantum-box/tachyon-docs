---
title: DuckDB WASM によるLibraryデータビューの軽量化
type: feature
emoji: "🦆"
topics:
  - DuckDB
  - WASM
  - Library
  - Performance
  - Client-side SQL
published: true
targetFiles:
  - apps/library/src/app/v1beta/[org]/[repo]/data/
  - apps/library/src/hooks/use-duckdb.ts
  - apps/library/package.json
github: https://github.com/quantum-box/tachyon-apps
---

# DuckDB WASM によるLibraryデータビューの軽量化

## 概要

DuckDB WASM を導入し、Library アプリのデータビュー（テーブル、カード、カンバン等）でクライアントサイドSQL処理を可能にする。大量データのフィルタリング・ソート・集計を高速化し、サーバー負荷を軽減する。

## 背景・目的

### 現状の課題
- データ取得は GraphQL でサーバーから取得
- フィルタリング・ソート・検索は `useMemo` でクライアント処理
- 大量データ（数千〜数万件）では JavaScript での配列操作がボトルネック
- 複雑なフィルタ条件や集計処理が困難

### 期待される成果
- クライアントサイドでの SQL クエリ実行による高速フィルタリング・ソート
- 集計・グルーピング機能の追加が容易に
- サーバー API 呼び出し回数の削減
- オフライン対応の基盤構築

### 現状 (2026-01-12 コードベース確認)
- `apps/library/package.json` に `@duckdb/duckdb-wasm` を導入（Comlinkは未導入）
- `apps/library/src/hooks/use-duckdb.ts` で DuckDB 初期化とフィルタ・ソート・検索を実装
- `data-view.tsx` は DuckDB 結果を優先しつつ `useMemo` をフォールバックとして維持
- `data-kanban-view.tsx` のグルーピングは引き続きメモリ上の配列処理
- Web Worker は JSDelivr バンドルで起動し、Next.js 設定の追加は未検証

## 詳細仕様

- DataView のツールバーに SQL 入力欄を追加し、DuckDB に直接クエリを渡せるようにする
  - `SELECT id FROM data_view ...` もしくは `WHERE/ORDER BY` 句のみ指定できる
  - SQL モード中は既存の検索/フィルタ/ソート UI を無効化して混乱を防ぐ

### 機能要件

1. **DuckDB WASM の初期化**
   - Web Worker で DuckDB インスタンスを起動
   - データロード時にテーブルを作成

2. **データ変換とテーブル作成**
   - GraphQL レスポンス（DataField, PropertyField）を DuckDB テーブルに変換
   - プロパティ型に応じた適切なカラム型マッピング
   - 動的スキーマ生成

3. **クエリ機能**
   - フィルタリング（WHERE句）
   - ソート（ORDER BY）
   - 検索（LIKE/ILIKE）
   - ページネーション（LIMIT/OFFSET）
   - 集計（GROUP BY, COUNT, SUM等）

4. **ビューモード別対応**
   - テーブルビュー: 全機能対応
   - カードビュー: フィルタ・ソート対応
   - カンバンビュー: グルーピングにSQL活用
   - ガントビュー: 日付範囲フィルタ

### 非機能要件

- **パフォーマンス**: 10,000件のデータで100ms以内のクエリ応答
- **メモリ効率**: Web Worker でメインスレッドをブロックしない
- **互換性**: フォールバックとして既存のuseMemo処理を維持
- **型安全性**: TypeScript で完全な型定義

### プロパティ型マッピング

```yaml
property_type_mapping:
  StringValue:
    duckdb_type: VARCHAR
    sql_example: "WHERE name ILIKE '%keyword%'"

  IntegerValue:
    duckdb_type: BIGINT
    sql_example: "WHERE count > 100"

  DateValue:
    duckdb_type: TIMESTAMP
    sql_example: "WHERE created_at >= '2024-01-01'"

  SelectValue:
    duckdb_type: VARCHAR
    sql_example: "WHERE status = 'active'"

  MultiSelectValue:
    duckdb_type: "VARCHAR[]"
    sql_example: "WHERE list_contains(tags, 'important')"

  LocationValue:
    duckdb_type: "STRUCT(latitude DOUBLE, longitude DOUBLE)"
    sql_example: "WHERE location.latitude > 35.0"

  HtmlValue:
    duckdb_type: VARCHAR
    sql_example: "Full-text search support"

  MarkdownValue:
    duckdb_type: VARCHAR
    sql_example: "Full-text search support"
```

## 実装方針

### アーキテクチャ設計

```
┌─────────────────────────────────────────────────────────────┐
│                    DataViewComponent                        │
│  - viewMode, filters, sortConfig, searchQuery              │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    useDuckDB Hook                           │
│  - initializeDatabase()                                     │
│  - loadData(items, properties)                             │
│  - executeQuery(sql) -> Promise<Result>                    │
│  - getFilteredData(filters, sort, search)                  │
└────────────────────────────┬────────────────────────────────┘
                             │ Web Worker
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              DuckDB WASM (Web Worker)                       │
│  - AsyncDuckDB instance                                     │
│  - In-memory database                                       │
│  - SQL query execution                                      │
└─────────────────────────────────────────────────────────────┘
```

### 技術選定

| 技術 | 用途 | 理由 |
|------|------|------|
| @duckdb/duckdb-wasm | コアエンジン | 高速SQL処理、WASM対応 |
| Web Worker | 非同期実行 | UIスレッドブロック防止 |
| Comlink | Worker通信 | 型安全なProxy API |

### ファイル構成

```
apps/library/src/
├── hooks/
│   └── use-duckdb.ts              # DuckDB hook
├── types/
│   └── duckdb-wasm.d.ts           # 型スタブ
└── app/v1beta/[org]/[repo]/data/
    └── components/
        └── data-view.tsx          # DataView 統合
```

## タスク分解

### フェーズ1: 基盤構築

- [x] @duckdb/duckdb-wasm パッケージのインストール
- [ ] Next.js 設定の調整（WASM対応）
- [x] Web Worker の基本実装（JSDelivr CDN経由）
- [x] useDuckDB hook の基本実装

### フェーズ2: データ変換

- [x] GraphQL レスポンスからDuckDBスキーマ生成
- [x] プロパティ型のカラム型マッピング
- [x] データロード機能の実装

### フェーズ3: クエリ機能

- [x] SQLクエリビルダーの実装
- [x] フィルタリング機能
- [x] ソート機能
- [x] 検索機能（ILIKE）
- [x] ページネーション

### フェーズ4: 統合

- [x] DataViewComponent への統合
- [x] 既存useMemo処理との切り替え（フォールバック対応）
- [x] パフォーマンスインジケーター追加
- [x] DataKanbanView のグルーピング最適化

### フェーズ5: 拡張機能 📝

- [ ] 集計機能（COUNT, SUM等）
- [ ] エクスポート機能の最適化
- [ ] キャッシュ戦略

### フェーズ6: S3 + Parquet アーキテクチャ 📝

大量データの場合、GraphQL API経由でJSONを取得するのは非効率。バックエンドでParquetを生成し、S3から直接読み込む方式に移行する。

> 参考: [DuckDB/DuckDB-Wasm を利用した低コストでの可視化](https://zenn.dev/shiguredo/articles/duckdb-wasm-s3-parquet-opfs)

#### アーキテクチャ概要

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Backend (Rust)                                 │
│  1. HTTP リクエスト受信                                                  │
│  2. DB からデータ取得                                                    │
│  3. Parquet ファイル生成                                                 │
│  4. S3 にアップロード                                                    │
│  5. 署名付き URL (Presigned URL) を発行してレスポンス                     │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Frontend (Browser)                             │
│  1. 署名付き URL を受け取る                                              │
│  2. Fetch API で Parquet ファイルをダウンロード                          │
│  3. OPFS に保存（ブラウザ更新しても再ダウンロード不要）                    │
│  4. DuckDB-Wasm で SQL 解析（オフライン可能）                            │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 現状 vs 提案

```
現在のフロー（非効率）:
  DB → GraphQL API → JSON → クライアント → DuckDB変換

提案するフロー:
  DB → Parquet生成 → S3 → Presigned URL → Fetch → OPFS → DuckDB WASM
```

#### メリット

| 項目 | JSON経由 | Parquet経由 |
|------|----------|-------------|
| データサイズ | 100% | 10-30% (列圧縮) |
| パース時間 | 遅い | ほぼ不要 |
| 型情報 | 失われる | 保持される |
| 部分読み込み | 不可 | 列単位で可能 |
| オフライン | 不可 | OPFS保存で可能 |
| コスト | API負荷 | S3ストレージ+転送量のみ |

#### バックエンド実装

- [x] Parquet生成エンドポイント: `GET /v1beta/repos/:org/:repo/data/parquet`
- [x] DBからデータ取得 → Parquet生成 → S3アップロード
- [x] 署名付きS3 URL（Presigned URL、有効期限付き）をレスポンス
- [x] キャッシュ無効化: データ更新時にParquet再生成
- [x] 既存Parquetがあれば再利用（ETag / Last-Modified でチェック）

補足: データID/updatedAt/プロパティ情報から指紋を算出し、同一指紋は再アップロードを省略する。URLのファイル名に指紋を含め、OPFSキャッシュを更新する。

#### フロントエンド実装

- [x] 署名付き URL を取得するAPI呼び出し
- [x] Fetch API で Parquet ファイルをダウンロード
- [x] OPFS に Parquet ファイルを保存
- [x] DuckDB-Wasm で OPFS 上の Parquet を直接クエリ
- [x] ブラウザ更新時は OPFS から読み込み（再ダウンロード不要）

#### OPFS キャッシュ戦略

```typescript
// 1. OPFS にファイルが存在するかチェック
const root = await navigator.storage.getDirectory()
const fileHandle = await root.getFileHandle('data.parquet', { create: false })
  .catch(() => null)

// 2. 存在しなければダウンロードして保存
if (!fileHandle) {
  const response = await fetch(presignedUrl)
  const blob = await response.blob()
  const newHandle = await root.getFileHandle('data.parquet', { create: true })
  const writable = await newHandle.createWritable()
  await writable.write(blob)
  await writable.close()
}

// 3. DuckDB で OPFS 上のファイルをクエリ
await db.registerFileHandle('data.parquet', fileHandle, ...)
const result = await conn.query("SELECT * FROM 'data.parquet'")
```

#### 注意点・ハマりポイント

1. **複数タブ問題**: OPFSは同じファイルへの複数のAccess Handleを許可しない
   - エラー: `Access Handles cannot be created if there is another open Access Handle or Writable stream associated with the same file`
   - 対策: タブ間でロック管理、またはSharedWorkerを使用

2. **Presigned URLの有効期限**: 期限切れ時の再発行フロー必要

3. **OPFS容量制限**: ブラウザごとに上限あり、古いキャッシュの削除戦略が必要

#### 技術選定

```yaml
backend:
  rust_crate: arrow-rs / parquet  # Parquet生成
  storage: S3 / R2 / MinIO        # オブジェクトストレージ
  presigned_url: aws-sdk-s3       # 署名付きURL生成

frontend:
  download: Fetch API             # Parquetダウンロード
  cache: OPFS                     # ローカルキャッシュ
  query: DuckDB-Wasm              # SQL解析
```

## Playwright MCP による動作確認

### 動作確認チェックリスト

- [x] データビューページの初期表示
- [x] テーブルビューでのソート動作
- [x] DuckDB バッジ表示とフォールバック確認
- [x] フィルター適用時の即座のレスポンス
- [x] 検索入力時のリアルタイム絞り込み
- [x] SQL入力でのクエリ実行
- [x] 大量データ（1000件以上）での動作確認
- [x] ビューモード切り替え時の動作
- [x] エクスポート機能の動作


### パフォーマンス計測

- [ ] 初期ロード時間
- [ ] フィルター適用レスポンス時間
- [ ] ソート実行時間
- [ ] メモリ使用量

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| WASM ロード遅延 | 中 | 遅延ロード、ローディング表示 |
| ブラウザ非対応 | 低 | フォールバック処理（既存useMemo） |
| メモリ枯渇 | 中 | データ件数制限、ページネーション強制 |
| Worker通信オーバーヘッド | 低 | バッチ処理、結果キャッシュ |

## 参考資料

### 公式ドキュメント
- [DuckDB WASM公式ドキュメント](https://duckdb.org/docs/api/wasm/overview)
- [DuckDB WASM Examples](https://github.com/duckdb/duckdb-wasm/tree/main/packages/duckdb-wasm/examples)
- [Comlink - Web Worker RPC](https://github.com/GoogleChromeLabs/comlink)

### 時雨堂の実装事例（必読）
- [DuckDB/DuckDB-Wasm を利用した低コストでの可視化](https://zenn.dev/shiguredo/articles/duckdb-wasm-s3-parquet-opfs) - S3 + Parquet + OPFS の実装パターン
- [DuckDB-Wasm を利用したブラウザでのログ解析機能](https://zenn.dev/shiguredo/articles/duckdb-wasm-dashboard) - ダッシュボード実装の詳細
- [なぜ DuckDB を採用したのか](https://zenn.dev/shiguredo/articles/why-use-duckdb) - 採用理由と運用知見
- [DuckDB-Wasm (OPFS) メモ](https://zenn.dev/voluntas/scraps/08e6065facbefd) - OPFS対応の詳細と複数タブ問題

## 完了条件

- [ ] すべてのビューモードでDuckDBクエリが動作
- [ ] パフォーマンスが既存実装より改善
- [ ] フォールバック機能が正常動作
- [ ] 動作確認レポートが完成

### バージョン番号の決定基準

- [x] 新機能の追加 → **マイナーバージョン（x.X.x）を上げる**

## 実装メモ

### 2026-01-13: Parquetフォールバックと表示改善

- Parquet取得失敗時の再試行ループを停止し、メモリフォールバックを維持
- ヘッダーにDuckDB状態・Parquet利用・クエリ時間のバッジを表示

※以下は過去の計画メモで、現行コードには未反映。

### 2026-01-04: OPFS永続化対応

#### 追加機能

- **OPFS (Origin Private File System) 対応**: ブラウザのプライベートファイルシステムにデータベースを永続化
- **キャッシュ無効化**: データのハッシュ値（ID + updatedAt）でキャッシュの有効性を判定
- **UIインジケーター**: ヘッダーに「OPFS」バッジを追加

#### 動作フロー

1. 初回アクセス時: データをDuckDBテーブルに変換し、OPFSに保存
2. 2回目以降: OPFSからデータベースを読み込み、ハッシュで有効性を確認
3. データ変更時: ハッシュ不一致で自動的に再ロードして永続化

#### ブラウザ対応

- Chrome/Edge: 完全対応
- Firefox: 対応（一部制限あり）
- Safari: 対応（iOS 15.4+）

### 2026-01-01: 初期実装完了

#### 作成したファイル

```
apps/library/src/
├── hooks/
│   └── use-duckdb.ts              # メインhook（useDuckDB, useDuckDBFilteredData）
└── lib/
    └── duckdb/
        ├── index.ts               # エクスポート
        ├── types.ts               # 型定義
        ├── schema-generator.ts    # スキーマ生成
        ├── query-builder.ts       # SQLクエリビルダー
        └── data-loader.ts         # データ変換
```

#### 変更したファイル

- `apps/library/package.json`: @duckdb/duckdb-wasm, comlink を追加
- `apps/library/next.config.js`: WASM対応のwebpack設定追加
- `apps/library/src/app/v1beta/[org]/[repo]/data/components/data-view.tsx`: DuckDB統合

#### 実装のポイント

1. **遅延ロード**: DuckDB WASMはdynamic importで遅延ロード
2. **Web Worker**: JSDelivr CDN経由でワーカーを初期化し、メインスレッドをブロックしない
3. **フォールバック**: DuckDB初期化中は既存のuseMemo処理を使用
4. **パフォーマンス表示**: ヘッダーにSQL実行時間を表示

#### 技術的な決定事項

- Comlinkは依存関係に追加したが、現在の実装では直接使用せず、将来のWorker通信最適化用に予約
- プロパティ値は`prop_`プレフィックス付きの正規化カラムと、`raw_`プレフィックス付きのJSON保存カラムの両方を持つ
