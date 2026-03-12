# Tachyon API グレースフルシャットダウン

Tachyon API (`apps/tachyon-api`) では、v0.19.1 から HTTP サーバーの終了シーケンスにグレースフルシャットダウンを導入しました。Kubernetes のローリングアップデートやローカル開発中の停止時に、進行中リクエストを完了させた上で安全にプロセスを終了できます。

## 対象バージョン

- `tachyon-api` クレート: v0.19.1 以降
- Tachyon フロントエンド: v0.19.1 以降（API バージョン追従）

## シグナル監視と停止トリガー

- **SIGINT** (`Ctrl+C`): すべてのプラットフォームで `tokio::signal::ctrl_c()` により待機。
- **SIGTERM** (Unix のみ): `tokio::signal::unix::signal(SignalKind::terminate())` で監視。Windows など非 Unix 環境では未サポートのため pending future で待機。
- いずれかのシグナルを受信した際に `"{signal} received. Starting graceful shutdown."` を `tracing::info` レベルで出力。

## シャットダウンの流れ

1. `axum::serve(listener, app)` に `with_graceful_shutdown(shutdown_signal())` を適用。
2. シグナル受信後は新規接続受付を停止し、既存コネクションの処理完了を待機。
3. `axum::serve` の `await` が解決すると `"Graceful shutdown completed."` を `tracing::info` で出力し、`main` が終了する。

## 実装構造

- `apps/tachyon-api/src/main.rs` に `async fn shutdown_signal()` を定義。
  - `tokio::select!` で SIGINT / SIGTERM のどちらか早い方を採用。
  - シグナル監視に失敗した場合は `tracing::warn` で通知しつつフォールバック文字列を返す。
- `shutdown_signal()` は 1 度だけ評価され、同一プロセス内で多重に起動しない。

## ログ出力例

```
INFO tachyon-api::main: SIGTERM received. Starting graceful shutdown.
INFO tachyon-api::main: Graceful shutdown completed.
```

これらは CloudWatch Logs / loki / ローカル標準出力で確認でき、オペレーションの完了確認に利用できます。

## 運用上の注意

- Kubernetes では `terminationGracePeriodSeconds` 内で in-flight リクエストが完了することを前提とする。長時間の外部リクエストがある場合はタイムアウト値を併せて調整する。
- `SIGKILL` を受信した場合は強制終了となるため、Pod 側で十分な猶予を確保する。
- `GENERATE_TACHYON_SCHEMA=1` を指定したスキーマ生成モードでも、サーバー起動フェーズに入る前に `shutdown_signal` が組み込まれるため挙動に影響しない。

## 動作確認

### 手動確認手順

1. `mise run dev-backend` で Tachyon API を起動。
2. ブラウザや `curl` で適当な GraphQL / REST リクエストを送信。
3. ターミナルで `Ctrl+C` を押下し、`Starting graceful shutdown` と `Graceful shutdown completed.` の 2 行の INFO ログを確認。
4. 必要に応じて Pod 側で `kubectl delete pod --grace-period=<seconds>` を実行し、SIGTERM で同様にログが出力されることを確認。

## 関連タスク

- [apps/tachyon-api グレースフルシャットダウン対応](../../tasks/completed/v0.19.1/graceful-shutdown-tachyon-api/task.md)
