---
title: "Bakuure docker compose整備と動作確認"
type: "tech"
emoji: "🧰"
topics:
  - Bakuure
  - Docker Compose
  - 開発環境
published: true
targetFiles:
  - compose.yml
  - apps/bakuure-api
  - apps/bakuure-ui
  - apps/bakuure-admin-ui
  - docs/src/tasks/completed/v0.28.1/bakuure-docker-compose-setup/task.md
github: "https://github.com/quantum-box/tachyon-apps"
---

# Bakuure Docker Compose 整備

## 概要

Bakuure の Docker Compose での起動を整備し、UI/管理UI/API の動作確認を 1 回実施する。

## 背景・目的

- Bakuure のローカル環境を Docker Compose だけで起動できる状態に統一したい
- 現状の compose 設定や起動手順が分かりづらい/未整備のため、初回立ち上げのコストが高い
- 実際に UI を開いて 1 回は動作確認し、現状の問題点を把握したい

## 詳細仕様

### 機能要件

1. Docker Compose で Bakuure API/UI/管理UI が起動できる
2. UI からの初期表示が行え、致命的なエラーが出ない
3. 起動に必要な手順や注意点が明確になっている（必要ならドキュメントに追記）

### 非機能要件

- 既存のサービス（tachyon / library など）への影響を最小化する
- 既存の Compose 設定・環境変数との整合性を保つ
- 開発フローは `docker compose` / `mise run` を前提にする

### 仕様のYAML定義

本タスクは構造化仕様の追加を伴わないため、YAML 定義は不要。

## 実装方針

### アーキテクチャ設計

- `compose.yml` の Bakuure 関連サービス（`bakuure-api`, `bakuure-api-remote`, `bakuure-ui`）を中心に整備
- 必要に応じて `.env` / `.env.docker` / ドキュメントを更新

### 技術選定

- Docker Compose（既存の `compose.yml` を利用）
- 既存の Bakuure アプリ構成（API + UI + Admin UI）

### TDD（テスト駆動開発）戦略

環境整備タスクのため TDD は対象外とする。

## タスク分解

### フェーズ1: 現状調査 📝
- [x] `compose.yml` / Bakuure 関連ドキュメントの確認
- [x] 現状の起動手順と問題点の洗い出し

### フェーズ2: 整備 📝
- [x] Compose 設定の見直し（依存関係、環境変数、コマンド）
- [x] 必要なドキュメント/手順の追記

### フェーズ3: 動作確認 📝
- [x] Docker Compose で起動
- [x] Playwright MCP で UI 動作確認
- [x] `verification-report.md` を記録

## 作業メモ

- `bakuure-api` は `ghcr.io/quantum-box/tachyon-dev-tools:latest` を直接使う構成に変更。
  - `mise run setup` を含む重いビルドを回避し、`bacon` でローカルコードを起動する方針。
- `bakuure-ui` は `dev-node` のローカルビルドのまま。
  - 初回 `yarn install` で `YN0066`（TypeScript patch）など警告が出るが完了する。
  - 画像のエクスポートに時間がかかるため、初回起動時は数分待つ必要がある。
- Artifact Registry 上の `bakuure-dev-node` 画像は認証が必要だったため採用しない。
- `bakuure-api` 起動時に `prometheus` が 9090 を使用するため、既存プロセスと衝突する場合がある。
- `compose.yml` の `bakuure-api` に `/health` の healthcheck を追加。
- `compose.yml` の `bakuure-api` に `COGNITO_USER_POOL_ID` を追加して起動時の panic を回避。
- pricing テーブルは `packages/order/migrations/20250615004129_create_pricing_tables.up.sql`（`packages/payment` 側にも同一内容あり）を `bakuure` DB に適用して解消。
- `bakuure-sandbox` のサービスアカウントに `DefaultServiceAccountPolicy` を割り当てるシードを追加し、`/product/simulator` の `PermissionDenied` を解消。
- `apps/bakuure-ui/src/app/favicon.ico` を追加して `/favicon.ico` の 404 を解消。
- `/usecase` の Next/Image 警告は `fill`/`sizes` 指定と `objectFit` 移行で解消。

## 現状の課題

- `docker compose up -d bakuure-api` は 9090 ポート競合で失敗する可能性がある。
- `bakuure-ui` の初回イメージ export に時間がかかり、起動完了まで待機が必要。
- `bakuure` DB の pricing テーブルが自動作成されないため、初回は手動でマイグレーションを適用する必要がある。

## Playwright MCPによる動作確認

### 実施タイミング
- [x] 実装完了後の初回動作確認

### 動作確認チェックリスト
- [x] `http://localhost:3000` で Bakuure UI の初期画面が表示される
- [x] `http://localhost:3001` で Bakuure Admin UI の初期画面が表示される
- [x] 画面表示時にコンソールエラーが発生しない
- [x] 主要画面で API エラーが表示されない

### 実施手順
1. Docker Compose で Bakuure 関連サービスを起動
2. Playwright MCP でブラウザを開き、UI と Admin UI を確認
3. スクリーンショットを `docs/src/tasks/completed/v0.28.1/bakuure-docker-compose-setup/screenshots/` に保存
4. `verification-report.md` に結果を記録

## スケジュール

本タスクは短時間完結を想定するため省略。

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| コンテナ起動失敗（依存関係や環境変数不足） | 高 | 起動手順と env を明確化し、必要に応じて追記 |
| ポート競合（3000/3001/14001/50056） | 中 | 競合時は停止/ポート変更の手順を整理 |
| UI からの API 到達不可 | 高 | ローカル/リモート API の接続先を整理し、疎通を確認 |

## 参考資料

- `compose.yml`
- `README.md`
- `apps/bakuure-api/README.md`
- `docs/mise-migration.md`

## 完了条件

- [x] Docker Compose で Bakuure の API/UI/Admin UI が起動できる
- [x] Playwright MCP による動作確認を 1 回実施
- [x] `verification-report.md` に結果を記録
- [x] 必要なドキュメント更新が完了
