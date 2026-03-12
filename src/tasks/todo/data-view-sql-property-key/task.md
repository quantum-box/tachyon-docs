---
title: "DataView SQLでプロパティkey参照を可能にする"
type: "feature"
emoji: "🧩"
topics:
  - library
  - duckdb
  - sql
published: true
targetFiles:
  - apps/library/src/hooks/use-duckdb.ts
  - apps/library/src/app/v1beta/[org]/[repo]/data/components/data-toolbar.tsx
  - apps/library/src/app/v1beta/[org]/[repo]/data/components/data-view.tsx
github: "https://github.com/quantum-box/tachyon-apps"
---

# DataView SQLでプロパティkey参照を可能にする

## 概要

DataView の SQL 入力で、`prop_<propertyId>` ではなくプロパティの key/name を使って参照できるようにする。

## 背景・目的

- SQL モード利用時に propertyId を意識する負担が大きい
- UIで表示されるプロパティ名と SQL 参照が一致していない
- SQL 利用時の可読性と学習コストを改善したい

## 詳細仕様

### 機能要件

1. SQL 入力で `status` などのプロパティ名を参照できる
2. 名前が重複する場合は衝突を回避できる
3. 既存の `prop_<id>` 参照は引き続き利用可能

### 非機能要件

- DuckDB のロード/クエリ性能に影響を与えないこと
- SQL エラー時にフォールバック/エラー表示が崩れないこと

### コンテキスト別の責務

- library(frontend): DuckDB テーブル/ビューの生成と SQL エイリアス付与

## 実装方針

### アーキテクチャ設計

- DuckDB 側で別名付きのビューを生成し、SQL ではそのビューを参照
- `prop_<id>` 列は残したまま `AS "status"` でエイリアス付与
- 予約語・重複名はサフィックスを付けて回避（例: `status__dup1`）

### 技術選定

- 既存の `useDuckDBFilteredData` 内で `CREATE VIEW` を追加
- 追加 UI 変更は不要（SQL 入力は既存 UI を維持）

## タスク分解

### 主要タスク
- [ ] 要件定義の明確化
- [ ] SQL エイリアス生成ロジック設計
- [ ] DuckDB ビュー生成の実装
- [ ] SQL 入力時の動作確認
- [ ] ドキュメント更新

## Playwright MCPによる動作確認

### 実施タイミング
- [ ] 実装完了後の初回動作確認
- [ ] PRレビュー前の最終確認

### 動作確認チェックリスト
- [ ] SQL 入力で `status` などの key を参照して絞り込みできる
- [ ] 重複プロパティ名でも SQL 実行が失敗しない
- [ ] `prop_<id>` 参照が引き続き動作する

## リスクと対策

- 重複するプロパティ名による衝突 → 別名生成ルールを定義
- 予約語の衝突 → バッククォート/引用符でエスケープ

## スケジュール

- 要件確定: 未定
- 実装: 未定
- 動作確認: 未定

## 完了条件

- SQL 入力でプロパティ key/name を参照できる
- 既存機能の回帰がない
