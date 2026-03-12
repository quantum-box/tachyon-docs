---
title: "Agent APIメッセージリトライ・巻き戻し機能"
type: feature
emoji: "🔄"
topics:
  - Agent API
  - LLMs
  - Chat
  - Rust
  - React
published: true
targetFiles:
  - packages/llms/domain/src/chat_message.rs
  - packages/llms/src/adapter/gateway/sqlx_message_repository.rs
  - packages/llms/src/usecase/
  - packages/llms/src/adapter/axum/
  - apps/tachyon/src/app/v1beta/[tenant_id]/ai/
github: ""
---

# Agent APIメッセージリトライ・巻き戻し機能

## 概要

Agent APIのチャット履歴において、特定のメッセージ以降を削除（巻き戻し）し、その状態から会話を再開する機能を実装する。ソフトデリート方式を採用し、誤削除時の復元も可能にする。

## 背景・目的

- Agent APIを使用中、期待通りの応答が得られなかった場合に、やり直したいケースがある
- 現状では単一メッセージの削除のみ可能で、範囲削除やリトライ機能がない
- ユーザビリティ向上のため、チャット履歴の巻き戻しとリトライ機能が必要
- 誤操作による削除からの復元も必要

## 詳細仕様

### 機能要件

1. **メッセージ巻き戻し（ソフトデリート）**
   - 指定したメッセージ以降（そのメッセージを含む）をすべて論理削除
   - `deleted_at` カラムを追加し、削除日時を記録
   - 関連するtool_call/tool_resultも同時に削除
   - 削除後、直前のユーザーメッセージまでの状態に戻る

2. **メッセージ復元**
   - 論理削除されたメッセージを復元可能
   - 復元時は `deleted_at` を NULL に戻す

3. **リトライ実行**
   - 巻き戻し後、同じまたは修正したプロンプトでagent実行を再開
   - オプションでモデルやパラメータの変更も可能

4. **UI表示**
   - 各メッセージに「ここからやり直す」ボタンを表示
   - 削除確認ダイアログを表示
   - 削除対象のメッセージ数を表示
   - 削除済みメッセージの復元オプション

### 非機能要件

- 削除はトランザクション内で実行し、途中失敗時はロールバック
- 100件以上のメッセージ削除にも対応（パフォーマンス考慮）
- 権限チェック: 新規ポリシー `llms:RetryMessage`, `llms:RestoreMessage` を追加
- ソフトデリートのため、find_all等は `deleted_at IS NULL` 条件を追加

### データベース変更

```sql
-- Migration: add soft delete support
ALTER TABLE tachyon_apps_llms.chat_messages
ADD COLUMN deleted_at DATETIME(6) NULL DEFAULT NULL;

CREATE INDEX idx_chat_messages_deleted_at
ON tachyon_apps_llms.chat_messages(deleted_at);
```

### API設計

#### REST API

```yaml
# 1. 範囲削除（ソフトデリート）
DELETE /v1/llms/chatrooms/{chatroom_id}/messages?after={message_id}
Response: { deleted_count: number, deleted_message_ids: string[] }

# 2. リトライ専用エンドポイント（削除+再実行）
POST /v1/llms/chatrooms/{chatroom_id}/messages/{message_id}/retry
Request: {
  new_prompt?: string,  # 省略時は元のプロンプトを使用
  model?: string        # 省略時は元のモデルを使用
}
Response: SSE stream (execute_agentと同じ)

# 3. メッセージ復元
POST /v1/llms/chatrooms/{chatroom_id}/messages/{message_id}/restore
Response: { restored_count: number }

# 4. 削除済みメッセージ一覧
GET /v1/llms/chatrooms/{chatroom_id}/messages/deleted
Response: { messages: AgentChunk[] }
```

#### GraphQL

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
    messageId: ID!  # この時点以降の削除済みメッセージを復元
  ): RestoreMessagesResult!
}

type Query {
  # 削除済みメッセージ一覧
  deletedMessages(chatroomId: ID!): [AgentChunk!]!
}

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

## 実装方針

### アーキテクチャ設計

Clean Architectureに従い、以下のレイヤーで実装:

1. **Domain層**: `ChatMessageRepository` traitにメソッド追加
2. **Usecase層**: `DeleteMessagesAfter`, `RetryAgentMessage`, `RestoreMessages` usecase新規作成
3. **Interface Adapter層**: SQLx実装、REST/GraphQLハンドラー
4. **Presentation層**: Reactコンポーネント

### データフロー

```
User Request
    ↓
[REST Handler / GraphQL Resolver]
    ↓
[RetryAgentMessage Usecase]
    ├─→ [DeleteMessagesAfter] (ソフトデリート)
    │       ↓
    │   [ChatMessageRepository::soft_delete_messages_after]
    │       ↓
    │   [SqlxMessageRepository] → DB (UPDATE SET deleted_at = NOW())
    │
    └─→ [ExecuteAgent] (再実行)
            ↓
        [RecursiveAgent]
            ↓
        SSE Response
```

## タスク分解

### Phase 1: データベース・Repository層 ✅

- [x] マイグレーション: `deleted_at` カラム追加 (`packages/llms/migrations/20260115000000_add_deleted_at_to_messages.up.sql`)
- [x] `ChatMessageRepository` traitに以下メソッド追加:
  - `soft_delete_messages_after(chatroom_id, message_id)` → `SoftDeleteResult`
  - `find_deleted_messages(chatroom_id)` → `Vec<ChatMessage>`
  - `restore_messages_after(chatroom_id, message_id)` → `RestoreResult`
- [x] `find_all` に `deleted_at IS NULL` 条件追加
- [x] `SqlxMessageRepository` に実装追加
- [ ] 単体テスト作成

### Phase 2: Usecase層の実装 ✅

- [x] `DeleteMessagesAfter` usecase新規作成 (`packages/llms/src/usecase/delete_messages_after.rs`)
- [x] `RetryAgentMessage` usecase新規作成 (`packages/llms/src/usecase/retry_agent_message.rs`)
- [x] `RestoreMessages` usecase新規作成 (`packages/llms/src/usecase/restore_messages.rs`)
- [x] `GetDeletedMessages` usecase新規作成 (`packages/llms/src/usecase/get_deleted_messages.rs`)
- [x] 権限ポリシー追加 (`scripts/seeds/n1-seed/008-auth-policies.yaml`):
  - `llms:DeleteMessagesAfter` (act_01hjryxysgey07h5jz5w00075)
  - `llms:RestoreMessages` (act_01hjryxysgey07h5jz5w00076)
  - `llms:GetDeletedMessages` (act_01hjryxysgey07h5jz5w00077)
  - `llms:RetryAgentMessage` (act_01hjryxysgey07h5jz5w00078)
- [ ] 単体テスト作成

### Phase 3: REST API層の実装 ✅

- [x] `DELETE /chatrooms/{id}/messages?after={msg_id}` ハンドラー (`delete_messages_after_handler.rs`)
- [x] `POST /chatrooms/{id}/messages/{msg_id}/retry` ハンドラー (`retry_agent_message_handler.rs`)
- [x] `POST /chatrooms/{id}/messages/{msg_id}/restore` ハンドラー (`restore_messages_handler.rs`)
- [x] `GET /chatrooms/{id}/messages/deleted` ハンドラー (`get_deleted_messages_handler.rs`)
- [x] OpenAPI仕様追加 (utoipa annotations)
- [ ] シナリオテスト作成

### Phase 4: GraphQL API層の実装 ✅

- [x] `deleteMessagesAfter` mutation追加 (`mutation.rs`)
- [x] `retryAgentMessage` mutation追加 (`mutation.rs`)
- [x] `restoreMessages` mutation追加 (`mutation.rs`)
- [x] `deletedMessages` query追加 (`resolver.rs`)
- [ ] GraphQLテスト作成

### Phase 5: フロントエンド実装 ✅

- [x] メッセージリストに「Retry from here」ボタン追加 (`MessageActions.tsx`)
- [x] 削除確認ダイアログ実装 (AlertDialog)
- [x] リトライAPI呼び出し実装 (`agent-api.ts`)
- [x] 削除機能実装
- [x] 削除済みメッセージ表示・復元UI (`DeletedMessagesPanel.tsx`)
- [x] メッセージID修正: タスク完了後にrefetchして正しいDB IDを取得 (`useAgentStream.ts`)
- [ ] GraphQL Query/Mutation追加 (REST APIを使用)
- [ ] Storybook作成
- [x] Playwright動作確認

## Playwright MCPによる動作確認

### 実施タイミング
- [x] バックエンドAPI実装完了後
- [x] フロントエンド実装完了後
- [x] 統合テスト (2026-01-15)

### 動作確認チェックリスト

- [x] チャット画面でメッセージが表示される
- [x] 「ここからやり直す」ボタンが各メッセージに表示される（Message actionsドロップダウン内）
- [x] ボタンクリックで確認ダイアログが表示される
- [x] 確認後、指定メッセージ以降が削除される（「Deleted X messages」ステータス表示）
- [x] リトライ実行でagentが再開する
- [x] 削除済みメッセージがDeleted Messageパネルに表示される
- [x] 復元ボタンで削除済みメッセージを復元できる

### スクリーンショット

- `screenshots/agent-chat-control-panel.png` - Agent Chatコントロールパネル
- `screenshots/retry-confirmation-dialog.png` - リトライ確認ダイアログ
- `screenshots/retry-result-with-tool-error.png` - リトライ結果（ツール制限時のエラー表示）

### 確認された動作

1. **削除機能**: メッセージ選択→Delete from here→確認ダイアログ→削除実行→Deleted Messagesパネルに表示
2. **リトライ機能**: メッセージ選択→Retry from here→確認ダイアログ→削除+再実行
3. **復元機能**: Deleted Messagesパネル→復元ボタン→メッセージ復元

### 注意事項

- ツールアクセス設定でファイルシステムやコマンド実行が無効の場合、リトライ時にエージェントがそれらのツールを使用しようとするとエラーになる（正常動作）

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| ソフトデリートによるデータ肥大化 | 中 | 定期的なハードデリートバッチ処理を検討 |
| find_all性能低下 | 中 | deleted_atにインデックス追加、クエリ最適化 |
| 課金済みトークンの扱い | 低 | 削除しても課金は戻らない旨をUI表示 |
| 復元時の整合性 | 中 | 復元はcreated_at順で全て復元する仕様に |

## 完了条件

- [x] 全APIが正常動作
- [x] ソフトデリート・復元が正しく機能
- [x] リトライ後にagentが履歴を正しく引き継ぐ
- [x] 権限チェックが正しく動作
- [ ] シナリオテストがすべてパス
- [x] フロントエンドUIが動作
- [x] Playwright動作確認完了
- [ ] コードレビュー完了

### バージョン番号

- 新機能追加のため、マイナーバージョンを上げる

## 参考資料

- 既存実装: `packages/llms/src/usecase/delete_chat_message.rs`
- execute_agent履歴処理: `packages/llms/src/usecase/execute_agent.rs` 499-553行
- 既存削除API: `packages/llms/src/adapter/axum/delete_message_handler.rs`
