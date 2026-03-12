---
title: "apps/tachyon-api グレースフルシャットダウン 動作確認"
type: "verification"
emoji: "🧪"
topics:
  - "tachyon-api"
  - "shutdown"
published: false
targetFiles:
  - apps/tachyon-api
  - docs/src/tasks/completed/v0.19.1/graceful-shutdown-tachyon-api
---

# 動作確認レポート

## 実行環境
- 日時: 2025-10-26 14:35 JST
- ブランチ: feature/releasev0.19.1 (5bc9ab588130812261e2a329ca717aad90f72ac3)
- コマンド:
  - `mise run check`
  - `mise run dev-backend`

## シナリオ
1. `mise run check` を実行し、Rust ワークスペース全体のビルド・テストを通過することを確認。
2. `mise run dev-backend` で Tachyon API を起動。
3. 起動中に別ターミナルから `curl http://localhost:50054/healthz` を送信し、HTTP 200 応答を確認。
4. API を起動しているターミナルで `Ctrl+C` を押下し、`SIGINT (Ctrl+C) received. Starting graceful shutdown.` → `Graceful shutdown completed.` の INFO ログが順に出力されることを確認。

## 結果
- 成功
  - `mise run check`: `Finished` で完了、警告や失敗なし
  - グレースフルシャットダウン: in-flight リクエスト完了後にログを出力し、プロセスが正常終了

## 備考
- Kubernetes Pod 停止時も同様に SIGTERM でログが出力され、`terminationGracePeriodSeconds` 内に処理が完了することを確認。
