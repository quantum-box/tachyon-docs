# チャットルーム管理REST API

LLMSコンテキストで提供するチャットルームの更新・削除REST APIの仕様をまとめる。

## 背景

- Tachyon AI Studio と Agent UI ではチャットルームの名称変更と削除が必須の操作となった。
- 既存のREST APIは作成 (`POST /v1/llms/chatrooms`) と一覧 (`GET /v1/llms/chatrooms`) のみで、運用上のCRUDが揃っていなかった。
- Policy基盤には `llms:UpdateChatRoom` と `llms:DeleteChatRoom` が登録済みで、ユースケースとハンドラを追加することで統一した権限制御を実現する。

## 対象エンドポイント

### `PATCH /v1/llms/chatrooms/{chatroom_id}`

| 項目 | 内容 |
| ---- | ---- |
| 認可 | `llms:UpdateChatRoom` ポリシーが許可されている `Executor` |
| 入力ヘッダー | `x-operator-id`, `x-platform-id`(任意), `Authorization: Bearer dummy-token` |
| リクエスト | `{"name":"<new_name>"}` ※1〜100文字、前後空白はトリム |
| 成功レスポンス | `200 OK`。本文は `ChatRoomResponse`（一覧APIと同形式）。`updated_at` は更新時刻で上書き |
| エラー | `400`(ID不正) / `422`(名前バリデーション) / `403`(Policy違反) / `404`(対象なし) |

### `DELETE /v1/llms/chatrooms/{chatroom_id}`

| 項目 | 内容 |
| ---- | ---- |
| 認可 | `llms:DeleteChatRoom` |
| 入力ヘッダー | `x-operator-id`, `x-platform-id`(任意), `Authorization` |
| 処理 | `chatrooms.deleted_at` にUTC現在時刻を設定するソフトデリート |
| 成功レスポンス | `204 No Content` |
| エラー | `400` / `403` / `404` |

## バリデーションとドメイン制約

- `chatroom_id` は `ChatRoomId` 値オブジェクトでULID形式を検証。失敗時は `errors::invalid_request` を経由して `400`。
- `name` は `ChatRoomName` を再利用。空文字、100文字超過、制御文字は `422` (`errors::invalid_field`).
- 操作者オペレーターが一致しない場合は `Repository` 層で `None` を返し、API層では `404` を返却して情報漏洩を防ぐ。
- 削除済みチャットルーム (`deleted_at` `IS NOT NULL`) は一覧APIから除外され、更新/削除ともに `404` を返す。

## 実装ポイント

- `packages/llms/src/usecase/chatroom` に `UpdateChatRoom` / `DeleteChatRoom` ユースケースを追加。`policy_check` を共通化し、`Executor` と `MultiTenancy` を渡す。
- `packages/llms/src/adapter/axum/chatrooms` に `patch_chatroom.rs` と `delete_chatroom.rs` ハンドラを追加。バリデーションエラーは `ApiError::invalid_argument` で整形。
- `SqlxChatRoomRepository` に `soft_delete` と `update_name` を実装し、`updated_at` および `deleted_at` の更新を集中させる。
- OpenAPI (`packages/llms/llms.openapi.yaml`) にエンドポイントを追記、`mise run codegen` で `apps/tachyon` のRestクライアントを再生成。

## テスト

- ユースケース単体テスト: `cargo test -p llms chatroom_interactor::tests::update_chat_room` ほか。
- REST統合テスト: `packages/llms/tests/adapter/axum/chatrooms_update_delete.rs`。
- シナリオテスト: `apps/tachyon-api/tests/scenarios/chatroom.yaml`。CRUDフローと削除後の404を確認。
- いずれも `mise run tachyon-api-scenario-test` で回帰。

## モニタリング

- 削除/更新ともに `tracing::info!` で `chatroom_id` と `operator_id` を記録。拒否時は `warn` ログでアクション名を含める。
- `DeletedChatRoom` は今後の監査用途に備えてソフトデリートを維持。必要であれば `deleted_at IS NOT NULL` で監視クエリを追加。

## 関連リンク

- タスクドキュメント: `docs/src/tasks/completed/v0.21.0/chatroom-delete-update-api/task.md`
- 動作確認レポート: `docs/src/tasks/completed/v0.21.0/chatroom-delete-update-api/verification-report.md`
- Agentチャットルーム一覧UI仕様: `../frontend/agent-chatroom-list.md`
