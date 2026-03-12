# サービスアカウント経由のAgent APIメッセージ保存

## Overview

サービスアカウントで `POST /v1/llms/chatrooms/{chatroom_id}/agent/execute` を実行した際に、メッセージ履歴が保存されない問題を解消した。`ActorId` を起点にメッセージ所有者を保持し、ユーザー/サービスアカウントのどちらでも履歴が永続化される。

## Background

- 既存実装は `owner_id.as_user()` を前提にしており、サービスアカウント実行時にメッセージ保存処理がスキップされていた。
- `messages` テーブルは `user_id` カラムを持つが、値は `ActorId` 文字列で保存できるため、`ActorId` を直接保存する方針を採用した。

## Behavior

- `ActorId` をそのまま `ChatMessage` に渡し、サービスアカウントでも履歴が保存される。
- `x-user-id` が付与された場合はそのユーザーIDを優先し、サービスアカウント実行でもユーザーIDで履歴を残せる。
- 既存のユーザー実行時の保存挙動は変更しない。

## API Notes

- `POST /v1/llms/chatrooms/{chatroom_id}/agent/execute`
  - サービスアカウントの `Authorization: Bearer pk_...` でも実行可能。
  - `x-user-id` がある場合はメッセージ所有者として優先される。
- `GET /v1/llms/chatrooms/{chatroom_id}/agent/messages`
  - サービスアカウント実行のメッセージ履歴も取得できる。

## Operational Notes

- 事前に `POST /v1/llms/chatrooms` でチャットルームを作成する必要がある（未作成の場合、`messages.chatroom_id` のFK制約で保存に失敗する）。

## Related Documentation

- タスク記録: `docs/src/tasks/completed/v0.29.1/agent-service-account-message-persistence/task.md`
- 検証レポート: `docs/src/tasks/completed/v0.29.1/agent-service-account-message-persistence/verification-report.md`
- サービスアカウント対応チャットルームオーナー: `docs/src/tachyon-apps/llms/chatroom-actor-id.md`
