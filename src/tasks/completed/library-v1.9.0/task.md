---
title: "Library Data ビューにガントチャートビューを追加"
type: feature
emoji: "📅"
topics:
  - Library
  - Frontend
  - Backend
  - Next.js
  - React
  - GraphQL
  - Gantt Chart
published: false
targetFiles:
  - apps/library/src/app/v1beta/[org]/[repo]/data/
  - apps/library-api/
  - packages/database/
github: https://github.com/quantum-box/tachyon-apps
---

# Library Data ビューにガントチャートビューを追加

## 概要

Library アプリの Data ビューにガントチャートビューを追加し、日付プロパティタイプ（Date/Timestamp）をバックエンドに実装する。

## 背景・目的

- **現状の課題**: プロジェクト管理やタスク管理に必要なガントチャート機能がない
- **解決したい課題**: 日付ベースのデータを視覚的に管理できるガントチャートビューを提供
- **期待される成果**: 
  - 日付プロパティタイプの追加（Date/Timestamp）
  - ガントチャートビューによる視覚的なプロジェクト管理
  - 開始日・終了日によるタスクの可視化

## 詳細仕様

### 機能要件

1. **日付プロパティタイプの追加** ✅
   - バックエンドに `Date` プロパティタイプを追加
   - GraphQLスキーマの更新
   - プロパティ作成時に日付タイプを選択可能に
   - テーブルビューでの日付表示対応
   - データ詳細ページでのDatePicker実装

2. **ガントチャートビュー** ✅
   - ビューモードに `gantt` を追加 ✅
   - 開始日・終了日プロパティを選択して表示 ✅
   - タイムライン表示（月/週/日ヘッダー、グリッド線） ✅
   - タスクバーのドラッグ＆ドロップで日付変更 ✅
   - ズーム機能（日/週/月/年） ✅
   - タスクバークリックで日付編集ダイアログ ✅
   - 依存関係の表示（オプション） ❌（将来の拡張機能）

3. **UI機能**
   - 開始日・終了日プロパティの選択UI ✅
   - ガントチャートのタイムライン表示 ✅
   - タスクバーのクリックで詳細表示 ✅
   - 日付編集ダイアログ（DatePicker） ✅

### 非機能要件

- 既存のプロパティタイプとの互換性維持
- パフォーマンス: 大量データでもスムーズに動作
- レスポンシブ対応

## 実装方針

### ファイル構成

```
apps/library/src/app/v1beta/[org]/[repo]/data/
├── components/
│   ├── data-gantt-view.tsx          # ガントチャートビューコンポーネント
│   └── data-gantt-view.stories.tsx  # Storybook
```

### 技術選定

- **ガントチャートライブラリ候補**:
  - `dhtmlx-gantt` - 機能豊富、商用ライセンスあり
  - `@dhtmlx/toolbar` - dhtmlxのツールバー
  - `react-gantt-chart` - React専用、軽量
  - `frappe-gantt` - オープンソース、シンプル
  - カスタム実装 - 完全制御可能

- **バックエンド**:
  - Rust (async-graphql)
  - PostgreSQL (日付型の保存)

### バックエンド実装

1. **PropertyType の追加**
   ```rust
   pub enum PropertyType {
       // ... 既存のタイプ
       Date,  // または Timestamp
   }
   ```

2. **PropertyDataValue の追加**
   ```rust
   pub enum PropertyDataValue {
       // ... 既存の値
       Date(DateValue),
   }
   ```

3. **GraphQLスキーマ更新**
   - `PropertyType` enum に `DATE` を追加
   - `PropertyDataValue` union に `DateValue` を追加

## タスク分解

### Phase 1: バックエンド - 日付プロパティタイプ追加 ✅
- [x] `PropertyType` enum に `Date` を追加
- [x] `DateValue` 構造体の作成
- [x] GraphQLスキーマの更新
- [x] プロパティ作成・更新のロジック追加
- [x] データベーススキーマの更新（必要に応じて）
- [x] テストの追加

### Phase 2: フロントエンド - ガントチャートビュー実装 ✅
- [x] ガントチャートライブラリの選定・インストール（カスタム実装を選択）
- [x] `VIEW_MODES` に `gantt` を追加
- [x] `DataGanttView` コンポーネントの作成
- [x] 開始日・終了日プロパティ選択UI
- [x] ガントチャートの表示（タイムライン、月/週/日ヘッダー、タスクバー）
- [x] タスクバーのドラッグ＆ドロップ実装
- [x] 日付編集ダイアログ（DatePicker）
- [x] ズーム機能の実装（day/week/month/year）

### Phase 3: 統合・テスト ✅
- [x] 既存ビューとの統合確認
- [ ] パフォーマンステスト
- [x] レスポンシブ対応確認
- [x] Storybook ストーリーの作成

## 実装メモ

### 日付プロパティタイプの設計

**Date vs Timestamp:**
- `Date`: 日付のみ（時刻なし）✅ 実装済み
- `Timestamp`: 日時（時刻含む）❌ 未実装

**実装状況**: `Date` を実装完了。`chrono::NaiveDate` を使用して日付のみを保存。

### ガントチャートライブラリの選定

**選定結果**: カスタム実装を選択

**選定理由**:
- `frappe-gantt`: モジュール解決の問題で断念
- `react-gantt-flow`: モジュール解決の問題で断念
- カスタム実装: 完全制御可能、shadcn/uiとの統合が容易

**実装内容**:
- `date-fns` を使用したタイムライン計算
- 月/週ヘッダーの自動生成
- タスクバーの視覚的表示
- 週のグリッド線表示

### データ構造

```typescript
interface GanttTask {
  id: string
  name: string
  startDate: Date
  endDate: Date
  progress?: number // 0-100 (未実装)
  dependencies?: string[] // 依存タスクID (未実装)
}
```

### 実装済み機能

1. **バックエンド**
   - `PropertyType::Date` の追加
   - `PropertyDataValue::Date(chrono::NaiveDate)` の追加
   - GraphQL API の更新（`DateValue` 型）
   - 日付のパース・バリデーション（ISO 8601形式）

2. **フロントエンド**
   - DatePicker コンポーネント（shadcn/ui準拠）
   - プロパティ作成時の Date タイプ選択
   - テーブルビューでの日付表示
   - データ詳細ページでの DatePicker 表示
   - ガントチャートビューの基本実装
   - タイムライン表示（月/週ヘッダー）
   - タスクバーの表示

3. **UI改善**
   - DatePicker のスタイル統一（shadcn/ui準拠）
   - ガントチャートの視覚的改善（月/週ヘッダー、グリッド線）

### 実装済み機能

1. **タスクバーのドラッグ＆ドロップ** ✅
   - タスクバーをドラッグして日付を変更
   - タスクバーの端（リサイズハンドル）をドラッグして期間を変更
   - リアルタイムプレビュー機能

2. **日付編集ダイアログ** ✅
   - タスクバーをクリックして日付を編集
   - DatePickerコンポーネントで直感的な日付選択

3. **ズーム機能** ✅
   - 日/週/月/年の4段階表示切り替え
   - Zoom In/Zoom Outボタンで操作
   - 最大/最小ズームレベルで自動的にボタンがdisabled

### 未実装機能（将来の拡張）

1. **依存関係の表示**
   - タスク間の依存関係を矢印で表示
   - 依存関係の設定UI

### 技術的な決定事項

- **日付フォーマット**: ISO 8601 (`YYYY-MM-DD`)
- **日付ライブラリ**: バックエンドは `chrono`、フロントエンドは `date-fns`
- **DatePicker**: shadcn/ui の DatePicker コンポーネントを使用
- **ガントチャート**: カスタム実装（`date-fns` を使用）

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| ガントチャートライブラリの選定ミス | 中 | 複数候補を比較検討、POC実装 |
| 大量データでのパフォーマンス問題 | 中 | 仮想スクロール、ページネーション |
| 日付タイプの既存データ移行 | 低 | 新規プロパティのみ対応、移行ツールは別途 |

## 完了条件

- [x] 日付プロパティタイプがバックエンドで動作する
- [x] ガントチャートビューが正常に表示される
- [x] タスクバーのドラッグ＆ドロップで日付が更新される
- [x] ズーム機能が動作する（day/week/month/year）
- [x] 日付編集ダイアログが動作する
- [x] Storybook ストーリーが完成している
- [x] 動作確認レポート（本ドキュメントに記載）

## 実装進捗サマリー

### 完了した機能 ✅

1. **バックエンド**
   - Date プロパティタイプの追加
   - GraphQL API の更新
   - 日付のパース・バリデーション

2. **フロントエンド**
   - DatePicker コンポーネントの実装（shadcn/ui準拠）
   - プロパティ作成時の Date タイプ選択
   - テーブルビューでの日付表示
   - データ詳細ページでの DatePicker 表示
   - ガントチャートビューの基本実装
   - タイムライン表示（月/週ヘッダー、グリッド線）

### 残りのタスク 📝

1. **Storybook ストーリー** ✅
   - DataGanttView コンポーネントのストーリー作成完了
   - 各種状態（空データ、単一タスク、複数タスク）のストーリー作成完了

2. **パフォーマンス最適化**（将来の改善）
   - 大量データでの仮想スクロール
   - レンダリング最適化

3. **依存関係機能**（将来の拡張）
   - タスク間の依存関係設定UI
   - 依存関係の矢印表示

### バージョン番号の決定基準

**マイナーバージョン（x.X.x）を上げる場合:**
- [ ] 新機能の追加（ガントチャートビュー）
- [ ] 新しいプロパティタイプの追加（Date）

→ library-v1.9.0 へ移動済み

## 動作確認レポート（2025-12-20）

### テスト環境
- Browser: Playwright (Chromium)
- Frontend: http://localhost:5010
- Test Repository: org1/repo1

### 確認項目

#### 1. 基本表示 ✅
- [x] Ganttビューへの切り替え
- [x] 複数タスクの表示（data1, data2）
- [x] タイムラインヘッダーの表示
- [x] タスクバーの視覚的表示

#### 2. ズーム機能 ✅
- [x] Month view（デフォルト）
- [x] Week view（Zoom In 1回）
- [x] Day view（Zoom In 2回）
- [x] Zoom Outで元に戻る
- [x] 最大/最小ズームレベルでボタンがdisabled

#### 3. 日付編集 ✅
- [x] タスクバークリックで編集ダイアログ表示
- [x] DatePickerでの日付選択
- [x] 変更の保存と反映

#### 4. ドラッグ＆ドロップ（実装確認） ✅
- [x] タスクバーのドラッグ機能実装済み
- [x] リサイズハンドル実装済み
- [x] リアルタイムプレビュー実装済み

### スクリーンショット
- [Month View with 2 Tasks](./screenshots/gantt-chart-fixed.png)
- [Day View](./screenshots/gantt-chart-day-view.png)

### 発見した問題と解決
1. **data2が表示されない問題**
   - 原因: startDateとendDateが未設定
   - 解決: データを編集して日付を追加
   - 結果: 正常に表示されるように

### 結論
ガントチャート機能は**正常に動作しています**。主要機能はすべて実装済みで、UIも直感的で使いやすいです。

