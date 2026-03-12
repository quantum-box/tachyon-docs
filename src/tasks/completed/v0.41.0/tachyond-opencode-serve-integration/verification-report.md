# tachyond-opencode-serve-integration 動作確認レポート

実施日: 2026-02-14
実施者: claude

## 環境情報

- OpenCode Serve: v1.1.65 (port 4096, Basic auth)
- tachyond: Docker Compose (worktree2, port offset +200)
- tachyon-api: port 50254
- tachyon frontend: port 16200

## 動作確認結果

### ✅ バックエンド動作確認

- [x] OpenCode Serve 起動確認 (health endpoint 200 OK)
- [x] tachyond から OpenCode Serve 接続確認 (OPENCODE_SERVER_USERNAME/PASSWORD)
- [x] Tool Job 作成 (open_code provider) → succeeded
- [x] Normalized output に OpenCode レスポンスが格納される
- [x] プロバイダー一覧に `open_code` が含まれる

### ✅ フロントエンド SSE ストリーミング

- [x] queued/running 状態で SSE 接続が確立される
- [x] "Streaming" インジケーター (緑アニメーション) が表示される
- [x] SWR ポーリング (5秒) が SSE フォールバックとして機能する
- [x] ジョブ完了後にステータスが自動更新される (succeeded, Streaming 消失)
- [x] 完了済みジョブでは SSE 接続しない
- [x] ストリーム終了時に `onDone` コールバックで SWR mutate が呼ばれる
- [x] Cancel ボタンが完了済みジョブでは無効化される

### ⚠️ 既知の制限事項

- QUIC gateway: `UnknownIssuer` 証明書エラーで noop publisher にフォールバック
  - リアルタイム text_delta ストリーミングは不可 (フロントエンドコードは実装済み)
  - SWR ポーリングで最終結果の取得は正常に動作

## 発見した問題と修正

| 問題 | 原因 | 修正 |
|------|------|------|
| プロバイダー名 422 エラー | `Display` impl が `"opencode"` を返すが serde は `"open_code"` を期待 | `Display` を `"open_code"` に修正 |
| Docker env var 未反映 | `docker compose restart` は env を再読み込みしない | `docker compose up -d` で再作成 |
| SSE 切断後にページ更新されない | SSE イベント未受信時に SWR mutate が呼ばれない | SWR ポーリング (5秒) をフォールバック追加 |
| `onDone` 二重呼び出し | `done` イベントと `finally` ブロックの両方で呼ばれる | `streamFinalized` フラグで防止 |

## スクリーンショット

- `screenshots/tool-job-streaming-queued.png` - queued + Streaming インジケーター
- `screenshots/tool-job-succeeded.png` - succeeded 状態
- `screenshots/tool-job-auto-updated.png` - SWR ポーリングによる自動更新
- `screenshots/tool-job-detail-failed-no-streaming.png` - failed 状態
- `screenshots/tool-job-detail-cancelled.png` - cancelled 状態
