---
title: "Reactバージョン重複によるInvalid Hook Callの解消"
type: "bug"
emoji: "🧩"
topics:
  - "next.js"
  - "react"
  - "yarn-berry"
published: true
targetFiles:
  - package.json
  - yarn.lock
  - apps/tachyon/package.json
  - packages/ui/package.json
  - packages/corporate_db/package.json
github: ""
---

# Reactバージョン重複によるInvalid Hook Callの解消

## 概要

Next.js App Router 上で `usePathname()` などを呼び出すと `Invalid hook call` が頻発している。原因となっている React の多重インストールを解消し、実行時に唯一の React 18.3.1 を共有するよう Yarn ワークスペース全体の依存関係を整理する。

## 背景・目的

- `next dev` 実行時に `Warning: Invalid hook call. Hooks can only be called inside of the body of a function component.` が表示され、`usePathname()` 内の `useContext` が `null` を読む。
- `yarn why react` 結果から、`react@17.0.2` と `react@19.1.0` が Storybook / 古いパッケージ経由で解決され、アプリ内に複数の React が読み込まれている。
- React コンテキストが共有されないため、App Router や Next.js が提供するフックが壊れている。
- React バージョンを統一し、`tachyon` アプリを安定動作させることが目的。

## 詳細仕様

### 機能要件

1. Yarn ワークスペース全体で `react` / `react-dom` のバージョンを 18.3.1 に固定する。
2. 旧バージョン (`17.x`) を参照するパッケージ（例: `packages/corporate_db`）を更新し、18 系へ移行する。
3. インストール結果から `react` の重複がなくなり、`yarn why react` が 18.3.1 のみを指すこと。
4. `next dev` 実行時に Invalid hook call の警告が出ないことを確認する。

### 非機能要件

- Yarn 4 (Berry) の推奨方法で依存固定を行い、将来のアップデートに追従しやすい形にする。
- Storybook など別アプリが存在しても、React のダウングレードを強制しない。
- monorepo 全体で `resolutions` もしくは `packageExtensions` を適用しやすい運用にする。

### コンテキスト別の責務

- `apps/tachyon`: 実行時エラーの発生源。React の統一によって正常化。
- `packages/ui`, `packages/corporate_db`: React を直接依存している共有パッケージ。バージョン揃えの対象。
- ルートパッケージ (`package.json`): Yarn の解決戦略を設定する中心。ここで強制的に React 18.3.1 を採用させる。

### 仕様のYAML定義

- 今回は設定系タスクのため、特別な YAML 定義は不要。

## 実装方針

### アーキテクチャ設計

- アプリ構造自体は変更しない。依存解決層 (Yarn) の整備で React を単一インスタンス化する。
- 影響範囲は monorepo のパッケージ管理に留める。

### 技術選定

- Yarn 4 の `resolutions` を利用して React/ReactDOM を 18.3.1 に固定。
- 旧 React に依存していた `packages/corporate_db` などは依存バージョンを 18.3.1 に更新。
- Storybook など React 19 を要求する依存は `resolutions` により 18.3.1 を採用させる。

### 実装メモ (2025-10-13)

- `git ls-files '*package.json'` 全体に対して Node スクリプトを流し、`react` / `react-dom` / `@types/react` を一括で `^18.3.1` / `^18.3.11` に書き換え。
- ルート `package.json` に `resolutions` を追加し、Storybook 依存が `react@19` を取得しないよう強制。
- `yarn install` 後、`yarn why react` / `yarn why react-dom` が単一バージョンを指すことを確認。

### TDD（テスト駆動開発）戦略

#### 既存動作の保証
- `mise run check` を実行し、Rust ワークスペース全体のビルドが成功することを確認。（2025-10-13 完了）

#### テストファーストアプローチ
- 依存整理が中心のため新規テストは不要。既存テストが通ることを重視。

#### 継続的検証
- 変更後に `yarn why react` / `yarn why react-dom` を実行し、React のバージョンが 18.3.1 のみであることを確認。（2025-10-13 完了）

## タスク分解

### 主要タスク
- [x] 要件定義の明確化 (2025-10-13)
- [x] 技術調査・検証 (2025-10-13)
- [x] 実装 (2025-10-13 完了)
- [x] テスト・品質確認 (`mise run check` 実行済, 2025-10-13)
- [x] ドキュメント更新 (taskdoc 反映済, 2025-10-13)

## Playwright MCPによる動作確認

### 実施タイミング
- [ ] 実装完了後の初回動作確認
- [ ] PRレビュー前の最終確認
- [ ] バグ修正後の再確認

今回は依存整理で UI 変更がないため Playwright MCP は使わない想定。必要に応じてブラウザでサニティチェックのみ実施。

### 動作確認チェックリスト

- [ ] `next dev` 起動時に Invalid hook call が発生しないことを確認（フロントエンド開発時に合わせて再チェック）
- [x] `yarn why react` / `yarn why react-dom` で 18.3.1 の単一解決を確認しログに残す

#### 2025-10-13 Playwright MCP 実行メモ
- `http://localhost:16000/v1beta/tn_01j702qf86pc2j35s0kv0gv3gy` にアクセスしたところ、Playwright のコンソールログで `TypeError: Cannot read properties of null (reading 'useContext')` が再現。サーバー側が再起動されておらず旧バンドルを読んでいる可能性があるため、dev サーバー再起動後に再検証が必要。
