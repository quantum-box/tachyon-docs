---
title: "ChatRoom/Session オーナーフィルタリング"
type: "bug"
emoji: "🔒"
topics: ["security", "authorization", "llms", "chatroom", "agent-session"]
published: true
targetFiles:
  - packages/llms/domain/src/chat_room.rs
  - packages/llms/src/adapter/gateway/sqlx_chatroom_repository.rs
  - packages/llms/src/usecase/find_all_chat_rooms.rs
  - packages/llms/src/usecase/execute_agent.rs
  - packages/llms/src/usecase/delete_chat_room.rs
  - packages/llms/src/usecase/update_chat_room.rs
  - packages/llms/src/usecase/get_agent_history.rs
  - packages/llms/src/usecase/list_agent_sessions.rs
---

# ChatRoom/Session オーナーフィルタリング

## 概要

同一テナント内でユーザー間のChatRoom・AgentSessionが互いに閲覧・操作できてしまうセキュリティ上の問題を修正する。テナント分離（operator_id）は機能していたが、テナント内でのユーザーレベルのアクセス制御が欠落していた。

## 背景・目的

- **課題**: ChatRoom / AgentSession に対する操作で、テナント分離は行われているが、同一テナント内の他ユーザーのリソースにアクセスできてしまう
- **影響**: ユーザーAがユーザーBのチャットルーム一覧を閲覧、会話履歴を取得、チャットルームを削除・更新できる
- **ドメインモデルの状況**: `ChatRoom` エンティティには `owner: ActorId` と `is_owner()` メソッドが存在するが、アクセス制御に使われていなかった

## 詳細仕様

### 対象エンドポイントと対応

| エンドポイント | 修正内容 |
|---------------|---------|
| `find_all_chat_rooms` | executor の ID で `owner_id` フィルタを自動適用 |
| `execute_agent` | 実行前にターゲット（ChatRoom/Session）の所有者チェック |
| `delete_chat_room` | 削除前に所有者チェック |
| `update_chat_room` | 更新前に所有者チェック |
| `list_agent_sessions` | 取得後に所有者でインメモリフィルタ |
| `get_agent_history` | 取得前にセッション所有者チェック |

### アクセス制御ルール

- **一般ユーザー**: 自分が owner のリソースのみ操作可能
- **SystemUser / ServiceAccount (`sa_*`)**: すべてのリソースにアクセス可能（管理用途）
- **サブエージェント実行**: `parent_execution_id` が存在する場合は所有者チェックをスキップ（親エージェントが自身で作成したChatRoomを使用するため）

### 既存動作への影響

- 通常ユーザー: 自分のChatRoomを作成・操作する通常フローは変更なし
- ServiceAccount/SystemUser: 全リソースへのアクセスを維持
- サブエージェント: `parent_execution_id` によるスキップで既存動作を維持

## 実装方針

### ChatRoomFilter に owner_id を追加

`ChatRoomFilter` に `owner_id: Option<ActorId>` を追加し、SQLクエリの WHERE 句に反映。`metadata_user_id`（外部ユーザーID）とは AND 条件で併用される。

### Usecase 層での一貫したパターン

```rust
let executor_id = input.executor.get_id().to_string();
let is_privileged = executor_id == "system" || executor_id.starts_with("sa_");
if !is_privileged {
    // ownership check
}
```

## タスク分解

### 主要タスク
- [x] ChatRoomFilter に owner_id フィールド追加
- [x] SqlxChatRoomRepository の find_all で owner_id WHERE 句追加
- [x] FindAllChatRooms usecase で executor ベースの自動フィルタ適用
- [x] ExecuteAgent usecase で verify_target_ownership 追加
- [x] DeleteChatRoom usecase で所有者チェック追加
- [x] UpdateChatRoom usecase で所有者チェック追加
- [x] ListAgentSessions usecase で所有者フィルタ追加
- [x] GetAgentHistory usecase で所有者チェック追加
- [x] コンパイル確認
- [ ] テスト確認
- [ ] コミット・PR作成

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 既存APIクライアントが他ユーザーリソースに依存 | 中 | SystemUser/SA はバイパスするため管理系は影響なし |
| サブエージェントの動作不全 | 高 | parent_execution_id チェックでスキップを実装済み |
| metadata_user_id との競合 | 低 | AND条件で併用、owner_id が優先的にセキュリティを担保 |

## 完了条件

- [x] すべての対象エンドポイントで所有者チェックが実装されている
- [x] SystemUser / ServiceAccount はバイパスできる
- [x] サブエージェント実行は parent_execution_id でスキップされる
- [x] コンパイルが通る
- [ ] 既存テストが通る
- [ ] PRレビュー完了
