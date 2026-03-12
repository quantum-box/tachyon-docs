---
title: "Library リポジトリ画面に Notion風 Data タブを追加"
type: feature
emoji: "📊"
topics:
  - Library
  - Frontend
  - Next.js
  - React
  - Notion-like
  - dnd-kit
published: true
targetFiles:
  - apps/library/src/app/v1beta/[org]/[repo]/
  - apps/library/src/app/v1beta/_components/constant.ts
  - apps/library/src/app/v1beta/_components/navigation.tsx
github: https://github.com/quantum-box/tachyon-apps
---

# Library リポジトリ画面に Notion風 Data タブを追加

## 概要

Library アプリのリポジトリ画面に Notion風のリッチなデータビューを持つ Data タブを追加する。

## 背景・目的

- **現状の課題**: データの閲覧・管理機能が限定的
- **解決したい課題**: Notion のようなリッチなデータビュー体験を提供
- **期待される成果**: 
  - Contents タブ: 現状維持
  - Data タブ: Notion風のリッチなデータビュー

## 詳細仕様

### 機能要件

1. **ナビゲーションタブの変更** ✅
   - `NAV_ITEMS` に `data` を追加
   - タブ順序: Contents → Data → Properties → Settings

2. **Contents タブ** ✅
   - 現状維持（変更なし）

3. **Data タブ（Notion風）** ✅
   - **検索・フィルタリング**
     - テキスト検索（名前、全プロパティ）
     - プロパティごとのフィルター
     - 複数フィルター条件の組み合わせ
   - **ソート機能**
     - 各カラムでのソート（昇順/降順）
     - 複数カラムソート
   - **ビュー切替**
     - テーブルビュー（デフォルト）
     - カードビュー（ギャラリー）
     - リストビュー
     - カンバンビュー（Select/MultiSelectプロパティでグループ化）
     - マップビュー（Locationプロパティがある場合）
   - **テーブル機能**
     - カラムの表示/非表示切替
     - カラムの並べ替え（ドラッグ＆ドロップ）
     - インライン編集（セルをクリックして直接編集）
     - Selectプロパティはドロップダウンで変更
     - String/Integerプロパティはクリックで編集モード（IDは読み取り専用）
   - **カンバン機能**
     - Select/MultiSelectプロパティでカラムをグループ化
     - ドラッグ＆ドロップでステータス変更
     - @dnd-kit/core を使用した高性能D&D
   - **一括操作**
     - 複数選択（チェックボックス）
     - 一括削除
     - 一括エクスポート（CSV/JSON）
   - **統計ダッシュボード**
     - 総データ数
     - 最終更新日時
     - プロパティ別集計

### 非機能要件

- 既存の URL パス構造との互換性維持
- `/v1beta/[org]/[repo]/data/[dataId]` は個別データ詳細として引き続き動作
- レスポンシブ対応

## 実装方針

### ファイル構成

```
apps/library/src/app/v1beta/[org]/[repo]/
├── data/
│   ├── page.tsx                    # Data タブページ
│   ├── actions.ts                  # Server Actions（プロパティ値更新）
│   └── components/
│       ├── data-view.tsx           # メインコンポーネント
│       ├── data-toolbar.tsx        # ツールバー（検索、フィルター、ビュー切替）
│       ├── data-table-view.tsx     # テーブルビュー（インライン編集対応）
│       ├── data-card-view.tsx      # カードビュー
│       ├── data-kanban-view.tsx    # カンバンビュー（D&D対応）
│       ├── data-table-view.stories.tsx   # Storybook
│       ├── data-kanban-view.stories.tsx  # Storybook
│       ├── data-card-view.stories.tsx    # Storybook
│       └── data-toolbar.stories.tsx      # Storybook
```

### 技術選定

- shadcn/ui コンポーネント活用
- @dnd-kit/core, @dnd-kit/sortable（ドラッグ＆ドロップ）
- nuqs v2（URLクエリパラメータでの状態管理 - ビュー切替）
- Server Actions（プロパティ値の更新）

## タスク分解

### Phase 1: 基本構造 ✅
- [x] NAV_ITEMS に data を追加
- [x] 翻訳キー追加
- [x] 基本的な Data タブページ作成

### Phase 2: Notion風 UI 実装 ✅
- [x] ツールバー（検索、フィルター、ビュー切替ボタン）
- [x] テーブルビュー（カラム設定、ソート対応）
- [x] カードビュー（ギャラリー表示）
- [x] リストビュー（コンパクトテーブル）
- [x] マップビュー（Locationプロパティがある場合）
- [x] フィルター機能（複数条件対応）
- [x] ソート機能

### Phase 3: 高度な機能 ✅
- [x] 一括選択・操作（チェックボックス）
- [x] エクスポート機能（CSV/JSON）
- [x] カラム表示/非表示切替

### Phase 4: カンバンビュー ✅
- [x] Select/MultiSelectプロパティでグループ化
- [x] GraphQL フラグメントに `meta` を追加（オプション取得）
- [x] カンバンカラムの表示
- [x] @dnd-kit/core でドラッグ＆ドロップ実装
- [x] Server Action でプロパティ値を更新
- [x] ドロップ時にトースト通知

### Phase 5: インライン編集 ✅
- [x] テーブルビューでセルクリックで編集モード
- [x] Selectプロパティはドロップダウンで即時変更
- [x] String/Integerプロパティはテキスト入力
- [x] IDプロパティは読み取り専用
- [x] Enter で保存、Esc でキャンセル
- [x] 更新中はローディング表示

### Phase 7: カラム並べ替え ✅
- [x] @dnd-kit/sortable でヘッダーのドラッグ＆ドロップ
- [x] カラムの順序をステートで管理
- [x] グリップアイコンをドラッグハンドルとして使用

### Phase 8: ビュー切替のURL管理 ✅
- [x] nuqs パッケージをインストール
- [x] NuqsAdapter をプロバイダーに追加
- [x] viewMode を `?view=` クエリパラメータで管理
- [x] ブックマーク・履歴操作でビュー状態を保持

### Phase 6: Storybook ✅
- [x] data-table-view.stories.tsx
- [x] data-kanban-view.stories.tsx
- [x] data-card-view.stories.tsx
- [x] data-toolbar.stories.tsx

### 実装メモ

#### コンポーネント構成
- `data/components/data-view.tsx`: メインコンポーネント（フィルタリング、ソート、エクスポートロジック）
- `data/components/data-toolbar.tsx`: ツールバーUI（検索、フィルター、ソート、カラム設定、ビュー切替）
- `data/components/data-table-view.tsx`: テーブルビュー（チェックボックス、ソートアイコン、インライン編集）
- `data/components/data-card-view.tsx`: カードビュー（グリッド表示、ホバーでチェックボックス表示）
- `data/components/data-kanban-view.tsx`: カンバンビュー（D&D、ステータス変更）

#### GraphQL 変更
- `PropertyFieldOnRepoPage` フラグメントに `meta` を追加
  - SelectType / MultiSelectType の `options { id, key, name }` を取得

#### Server Actions
- `updatePropertyValueAction`: プロパティ値を更新
  - Select タイプ: optionId を設定
  - String タイプ: 文字列値を設定
  - 現在のプロパティデータを保持しつつ特定のプロパティのみ更新

#### 依存パッケージ
- `@dnd-kit/core`: ドラッグ＆ドロップのコア機能
- `@dnd-kit/sortable`: ソート可能リスト
- `@dnd-kit/utilities`: ユーティリティ

## Playwright MCPによる動作確認

### 動作確認チェックリスト

- [x] Contents タブでリポジトリ情報のみ表示されること
- [x] Data タブでデータリストが表示されること
- [x] Data タブで List/Table/Card/Kanban/Map 切替が動作すること
- [x] Data タブでページネーションが動作すること
- [x] Kanban ビューでステータスごとにカラムが分かれること
- [x] Kanban ビューでドラッグ＆ドロップが動作すること
- [x] Table ビューでセルをクリックして編集できること
- [x] Table ビューでSelectドロップダウンから値を変更できること
- [ ] 「Add Data」ボタンが正しく機能すること
- [ ] 個別データ詳細ページへの遷移が正常に動作すること
- [ ] モバイル表示でナビゲーションが正常に動作すること

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 既存URLとの競合 | 中 | `/data/page.tsx` と `/data/[dataId]/page.tsx` の共存を確認 |
| 翻訳漏れ | 低 | 日英両方の翻訳キーを追加 |
| D&Dライブラリ互換性 | 低 | @dnd-kit は React 18 完全対応 |

## 完了条件

- [x] すべての機能要件を満たしている
- [ ] 動作確認レポートが完成している
- [x] タスクディレクトリを completed/library-v1.9.0/ に移動済み

### バージョン番号の決定基準

**マイナーバージョン（x.X.x）を上げる場合:**
- [x] 新機能の追加（Data タブ）
- [x] 新しい画面の追加（/data/ ページ）
- [x] 高度なインタラクション（D&D、インライン編集）

→ library-v1.9.0 へ移動完了







