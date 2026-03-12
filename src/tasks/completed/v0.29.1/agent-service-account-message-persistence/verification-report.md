# サービスアカウント経由のAgent APIメッセージ保存 調査レポート

実施日: 2026-01-13
実施者: @assistant

## 実施内容

- サービスアカウントAPIキーでチャットルームを作成。
- 作成したチャットルームに対してAgent実行。
- `agent/messages` でメッセージが保存されていることを確認。

### 実施手順

1. `POST /v1/llms/chatrooms` でチャットルーム作成。
2. `POST /v1/llms/chatrooms/{chatroom_id}/agent/execute` を実行。
3. `GET /v1/llms/chatrooms/{chatroom_id}/agent/messages` を確認。

## 結果

- サービスアカウント実行でもメッセージが保存されることを確認。
- チャットルーム未作成だとFK制約で保存に失敗するため、事前作成が必須。
