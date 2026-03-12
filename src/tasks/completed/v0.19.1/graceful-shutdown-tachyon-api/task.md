---
title: "apps/tachyon-api グレースフルシャットダウン対応"
type: tech
emoji: "🛡️"
topics:
  - tachyon-api
  - graceful-shutdown
  - rust
  - axum
published: true
targetFiles:
  - apps/tachyon-api/src/main.rs
  - apps/tachyon-api
  - docs/src/tasks/completed/v0.19.1/graceful-shutdown-tachyon-api
github: https://github.com/quantum-box/tachyon-apps
---

# apps/tachyon-api グレースフルシャットダウン対応

## 概要
apps/tachyon-api の HTTP サーバーにグレースフルシャットダウンを導入し、終了シグナル受信時に進行中リクエストを安全に完了させる。

## 背景・目的
- 現状は `axum::serve` のデフォルト動作のみで、SIGTERM を受信すると即時強制終了し得る。
- Kubernetes 等でのローリングアップデート時、Pod への SIGTERM から SIGKILL までの猶予中に処理完了できる仕組みが求められる。
- ログ・外部リソース解放を安全に行い、エラーメトリクスの急増を防ぐ。

## 詳細仕様

### 機能要件
1. SIGTERM・SIGINT 受信時にグレースフルシャットダウンを開始する。
2. シャットダウン開始と完了のログを `tracing::info` レベルで出力する。
3. 新規接続を停止し、進行中リクエストの完了を待機する。

### 非機能要件
- tokio 標準のシグナル API のみを利用し、新規依存関係を追加しない。
- Unix/Windows 双方でコンパイル可能にする (Unix 特有の処理は `cfg` 分岐)。
- シャットダウン処理は 1 回のみ走るよう多重起動を防ぐ。

### コンテキスト別の責務
```yaml
contexts:
  tachyon-api:
    description: "GraphQL/REST エッジサーバー"
    responsibilities:
      - HTTP リスナー管理
      - 依存サービスのライフサイクル管理
      - シャットダウン時のリクエスト完了待機
```

### 仕様のYAML定義
```yaml
shutdown:
  signals:
    primary: SIGTERM
    secondary: SIGINT
  logging:
    start: "Received shutdown signal"
    completed: "Shutdown complete"
  behaviour:
    - "Stop accepting new connections"
    - "Await in-flight requests"
    - "Allow background tasks to drop"
```

## 実装方針

### アーキテクチャ設計
- `apps/tachyon-api/src/main.rs` に非同期関数 `async fn shutdown_signal()` を追加し、`axum::serve(...).with_graceful_shutdown(shutdown_signal())` を適用する。
- SIGTERM 監視は Unix のみ `tokio::signal::unix::signal` を利用し、非 Unix では pending future を用いる。
- シャットダウン開始・完了時にログを出力する。

### 技術選定
- Rust 1.79 / tokio / axum 既存スタックを継続利用。
- 追加のクレートは導入しない。

### TDD（テスト駆動開発）戦略
- `mise run check` で既存テスト・Lint を実行しリグレッションを検出。
- 手動検証: ローカルで `mise run dev-backend` 実行後に Ctrl+C を送信し、ログで開始・完了メッセージが表示されることを確認。

## タスク分解
- [x] 現状のサーバー起動フローの調査
- [x] `shutdown_signal` 実装とサーバーへの組み込み
- [x] ログメッセージとエラーハンドリング追加
- [x] `mise run check` 等でビルド・テスト確認
- [x] 動作確認レポート更新

### 進捗メモ
- 2025-10-26: `mise run check` を実行したが、rustup ツールチェインのリンクエラーで 160 秒タイムアウト。再実行には環境調整が必要。
- 2025-10-26: `rustup` の再インストールと `mise run check` の再実行でビルドが完了、`tokio::signal` 連携の警告なし。
- 2025-10-26: `mise run dev-backend` → `Ctrl+C` で INFO ログ `SIGINT (Ctrl+C) received. Starting graceful shutdown.` → `Graceful shutdown completed.` を確認し、レポートに記録。

## Playwright MCPによる動作確認
該当なし（バックエンドタスクのためブラウザ動作確認は不要）。
