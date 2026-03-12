---
title: "DataView を DuckDB 専用にする可否検討"
type: "tech"
emoji: "🧪"
topics:
  - DuckDB
  - WASM
  - Library
  - DataView
  - Architecture
published: true
targetFiles:
  - apps/library/src/hooks/use-duckdb.ts
  - apps/library/src/app/v1beta/[org]/[repo]/data/components/data-view.tsx
  - apps/library/src/app/v1beta/[org]/[repo]/data/page.tsx
  - apps/library/src/app/v1beta/[org]/[repo]/repo.graphql
  - apps/library-api/src/handler/data.rs
github: "https://github.com/quantum-box/tachyon-apps"
---

# DataView を DuckDB 専用にする可否検討

## 概要

Library の DataView を DuckDB 主導で完結させる構成（フォールバックなし）を検討する。
**本タスクは実装を行わず、現実的かどうかの評価・方針決定を目的とする。**

## 背景・目的

- 現状は GraphQL の `dataList.items` と DuckDB の二重経路で複雑化している
- 「DuckDB が動かないなら DataView を出さない」という割り切りで設計を単純化したい
- Parquet + DuckDB で全ビューモードを統一できるかを見極める
- データ増加時のパフォーマンスとUXを安定させたい

## 詳細仕様

### 機能要件

1. DuckDB が唯一のデータソースとなる構成の可否を評価
2. DuckDB 初期化失敗時の UX 方針を決定（空表示 / エラー表示 / リトライ導線）
3. Parquet 常時利用の妥当性（小規模データ含む）を検証

### 非機能要件

- 既存より複雑度を下げること
- 初期ロードとクエリ性能が現実的に許容されること
- ブラウザ互換性リスクを把握すること

### 仕様のYAML定義

```yaml
decision_criteria:
  data_source:
    options:
      - name: "duckdb-only"
        description: "DataViewはDuckDB結果のみで描画"
      - name: "duckdb-first"
        description: "DuckDB優先、失敗時は従来フォールバック"
  failure_behavior:
    options:
      - name: "empty"
        description: "DuckDB失敗時は空表示"
      - name: "error-panel"
        description: "エラーパネル + 再試行導線"
      - name: "redirect"
        description: "DataView自体を非表示/別画面に遷移"
  parquet_strategy:
    options:
      - name: "always"
        description: "件数に関係なくParquet使用"
      - name: "large-only"
        description: "一定件数以上でParquet使用"
recommended:
  data_source: "duckdb-only"
  failure_behavior: "error-panel"
  parquet_strategy: "always"
```

## 推奨方針（暫定）

- **DuckDB専用（duckdb-only）** を前提に設計する
- **Parquetは常時利用**（件数に関係なく）
- **失敗時はエラーパネル + リトライ導線**（空表示のみは採用しない）

> 目的は「データ増加時に強い構成」を作ること。UXの最低限を維持しつつ、実装の複雑度を下げる。

## 実装方針（検討対象）

### アーキテクチャ設計

- DataViewはDuckDBで得た結果セットを唯一の描画元にする
- GraphQLの`dataList.items`は取得しない（必要ならメタ/プロパティ情報のみ取得）
- マップ/カンバン/ガントの各ビューもDuckDB結果から派生

### 技術選定

- `@duckdb/duckdb-wasm` のまま継続
- Parquet取得エンドポイントを共通利用（API変更は未決定）

## タスク分解

### 主要タスク
- [ ] 現状の依存関係整理（dataList.itemsが使われる箇所の洗い出し）
- [ ] DuckDB専用時の必要データ要件の整理（全ビュー/全カラム）
- [ ] UX方針（失敗時の表示/リトライ）決定
- [ ] Parquet常時利用のパフォーマンス見積もり
- [ ] Parquet前提の初期ロード体験とキャッシュ戦略の検証
- [ ] 実装可否の結論をまとめる

## Playwright MCPによる動作確認

※本タスクは調査のみのため実施しない。実装着手後にチェックリストを作成する。

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| DuckDB初期化失敗時にDataViewが見られない | 中 | 失敗時のUX方針を事前に決定 |
| Parquet取得失敗でデータが取得不能 | 中 | 再試行・エラーパネル・タイムアウト設計 |
| Safari/環境差によるWASM/OPFS制限 | 中 | 対象ブラウザ範囲の合意 |

## スケジュール

- 要件整理: 未定
- 技術調査: 未定
- 結論整理: 未定

## 完了条件

- DuckDB専用化の可否について結論が出ている
- 失敗時UX方針が合意されている
- 実装に進む場合の次タスクが明確になっている
