# メッセージリトライ・巻き戻し機能

## 概要

Agent APIのチャット履歴において、特定のメッセージ以降を削除（巻き戻し）し、その状態から会話を再開する機能。ソフトデリート方式を採用しており、誤削除時の復元も可能。

## ユースケース

- エージェントの応答が期待通りでなかった場合に、特定のポイントからやり直したい
- 誤って送信したメッセージを取り消して会話を修正したい
- 異なるモデルやパラメータで同じ会話を再試行したい
- 誤操作で削除したメッセージを復元したい

## REST API

### メッセージ削除（ソフトデリート）

指定したメッセージ以降（そのメッセージを含む）をすべて論理削除する。

```
DELETE /v1/llms/chatrooms/{chatroom_id}/messages?after={message_id}
```

**リクエスト**
- `chatroom_id`: チャットルームID
- `after`: 削除開始位置のメッセージID（このメッセージを含む）

**レスポンス**
```json
{
  "deleted_count": 5,
  "deleted_message_ids": [
    "msg_01abc...",
    "msg_01def...",
    "msg_01ghi...",
    "msg_01jkl...",
    "msg_01mno..."
  ]
}
```

**権限**: `llms:DeleteMessagesAfter`

### リトライ実行

指定したメッセージ以降を削除し、エージェントを再実行する。SSEストリームでレスポンスを返す。

```
POST /v1/llms/chatrooms/{chatroom_id}/messages/{message_id}/retry
```

**リクエストボディ**
```json
{
  "new_prompt": "修正したプロンプト（省略時は元のプロンプト）",
  "model": "claude-3-5-sonnet（省略時は元のモデル）"
}
```

**レスポンス**: SSEストリーム（`execute_agent`と同じ形式）

**権限**: `llms:RetryAgentMessage`

### メッセージ復元

論理削除されたメッセージを復元する。指定したメッセージの作成日時以降に削除されたすべてのメッセージが復元される。

```
POST /v1/llms/chatrooms/{chatroom_id}/messages/{message_id}/restore
```

**レスポンス**
```json
{
  "restored_count": 3,
  "restored_message_ids": [
    "msg_01abc...",
    "msg_01def...",
    "msg_01ghi..."
  ]
}
```

**権限**: `llms:RestoreMessages`

### 削除済みメッセージ一覧

チャットルーム内の削除済みメッセージを取得する。

```
GET /v1/llms/chatrooms/{chatroom_id}/messages/deleted
```

**レスポンス**
```json
{
  "messages": [
    {
      "id": "msg_01abc...",
      "type": "user",
      "text": "削除されたユーザーメッセージ",
      "created_at": "2024-01-15T10:30:00Z"
    },
    {
      "id": "msg_01def...",
      "type": "completion",
      "content": "削除されたAI応答",
      "created_at": "2024-01-15T10:30:05Z"
    }
  ]
}
```

**権限**: `llms:GetDeletedMessages`

## GraphQL API

### Mutation

```graphql
type Mutation {
  # 範囲削除（ソフトデリート）
  deleteMessagesAfter(
    chatroomId: ID!
    messageId: ID!
  ): DeleteMessagesResult!

  # リトライ（削除+再実行）
  retryAgentFromMessage(
    chatroomId: ID!
    messageId: ID!
    newPrompt: String
    model: String
  ): AgentExecutionResult!

  # メッセージ復元
  restoreDeletedMessages(
    chatroomId: ID!
    messageId: ID!
  ): RestoreMessagesResult!
}
```

### Query

```graphql
type Query {
  # 削除済みメッセージ一覧
  deletedMessages(chatroomId: ID!): [AgentChunk!]!
}
```

### 型定義

```graphql
type DeleteMessagesResult {
  deletedCount: Int!
  deletedMessageIds: [ID!]!
  remainingMessages: [AgentChunk!]!
}

type RestoreMessagesResult {
  restoredCount: Int!
  restoredMessageIds: [ID!]!
}
```

## データベース

### スキーマ変更

```sql
ALTER TABLE tachyon_apps_llms.chat_messages
ADD COLUMN deleted_at DATETIME(6) NULL DEFAULT NULL;

CREATE INDEX idx_chat_messages_deleted_at
ON tachyon_apps_llms.chat_messages(deleted_at);
```

### 動作

- **ソフトデリート**: `deleted_at` カラムに削除日時を設定
- **復元**: `deleted_at` を `NULL` に戻す
- **通常のメッセージ取得**: `deleted_at IS NULL` 条件で取得

## UIコンポーネント

### MessageActions

各メッセージにホバー時に表示されるアクションボタン:
- **Retry from here**: 確認ダイアログ後、リトライ実行
- **Delete from here**: 確認ダイアログ後、ソフトデリート

確認ダイアログには影響を受けるメッセージ数が表示される。

### DeletedMessagesPanel

サイドバーに表示される削除済みメッセージパネル:
- 削除済みメッセージをグループ化して表示
- 各グループに復元ボタン
- リフレッシュボタンで最新状態を取得

## 権限（ポリシー）

以下のアクションが追加されている:

| アクション | 説明 |
|-----------|------|
| `llms:DeleteMessagesAfter` | メッセージの範囲削除 |
| `llms:RestoreMessages` | 削除済みメッセージの復元 |
| `llms:GetDeletedMessages` | 削除済みメッセージの取得 |
| `llms:RetryAgentMessage` | リトライ実行 |

これらは `AdminPolicy` に含まれている。

## 注意事項

- **課金**: 削除しても既に発生したトークン課金は戻らない
- **ツールアクセス**: リトライ時、ツールアクセス設定が無効の場合はエラーになる（正常動作）
- **データ肥大化**: ソフトデリートのため、定期的なハードデリート（物理削除）バッチ処理を検討

## 関連ドキュメント

- [Agent API](./agent.md)
- [Chatroom管理REST API](./chatroom-management-rest-api.md)
- [タスクドキュメント](../../tasks/completed/v0.32.0/agent-message-retry-rollback/task.md)

## バージョン履歴

- v0.32.0 (2026-01-16): 初期実装
