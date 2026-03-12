# rmcp SSEハンドリング改善

## 概要
`rmcp` / `rmcp-macros` を upstream rev `34f482375c4548a630a480dd9f7c0de74681fab1` に更新し、SSE フレームに空行や control event が混入した際の JSON デシリアライズ失敗を解消した。これにより、MCP クライアントが高頻度でストリームを再接続する環境でも警告ログの氾濫と実行停止が発生しなくなった。

## 変更内容
- `Cargo.toml` で `git` 依存を rev 固定し、`rmcp` と `rmcp-macros` を同コミットへ揃えた。
- SSE クライアントが非 JSON フレームを検知した場合は黙殺し、`debug` ログへ降格。
- 既存の API 呼び出しは変更不要で、`client_side_sse` の戻り値契約を維持。

## 運用インパクト
| 観点 | Before | After |
| --- | --- | --- |
| ログ | `expected value at line 1 column 1` 警告が毎秒発生 | control event は `debug` ログに抑制 |
| ストリーム継続性 | 非 JSON フレームで処理が停止 | イベントをスキップし継続受信 |
| 依存管理 | `0.1.5` 固定、control event 未対応 | rev 固定で修正済みコードを使用 |

## テスト
- `mise run check` および `mise run ci` でワークスペース全体のビルドとテストを検証。
- MCP SSE を利用する統合シナリオで警告ログが出力されないことを確認（手動ログ確認）。

## ロールバック手順
- `Cargo.toml` の `rmcp` / `rmcp-macros` を旧 rev (`22134eb`) に戻し `cargo update -p rmcp --precise <rev>` を実行。
- ロールバック前後で `Cargo.lock` の差分をコミットし、SSE ログ監視を強化する。

## 関連タスク
- [rmcp SSEハンドリング改善](../tasks/completed/v0.20.0/upgrade-rmcp-sse-handling/task.md)
- [rmcp SSEハンドリング改善 動作確認](../tasks/completed/v0.20.0/upgrade-rmcp-sse-handling/verification-report.md)
