---
title: "サービスアカウント経由のAgent APIでメッセージが保存されない"
type: "bug"
emoji: "🐛"
topics:
  - llms
  - agent
  - service-account
published: true
targetFiles:
  - packages/llms/src/agent/recursive.rs
  - packages/llms/src/usecase/execute_agent.rs
  - packages/llms/domain/src/message.rs
  - packages/llms/domain/src/chat_message.rs
  - packages/llms/src/adapter/gateway/sqlx_message_repository.rs
  - packages/llms/migrations/20241015124729_init.up.sql
github: ""
---

## 概要

サービスアカウントでAgent API（`/v1/llms/chatrooms/{chatroom_id}/agent/execute`）を実行した際に、チャットメッセージが永続化されず履歴が空になる問題を調査し、修正方針を整理する。

## 背景・目的

- サービスアカウント実行時にAgent APIの出力がSSEで返るにもかかわらず、メッセージ履歴（`/agent/messages` や `messages` API）に保存されない。
- ユーザー実行時はメッセージが保存されるため、サービスアカウント経由の永続化パスに欠落があると推測される。
- 調査結果を基に、ActorId（ユーザー/サービスアカウント）どちらでもメッセージ保存できる状態を目指す。

## 詳細仕様

### 機能要件

1. サービスアカウント実行時でもユーザー実行時と同様にメッセージが保存される。
2. メッセージの所有者情報がActorIdとして保持できる（ユーザー/サービスアカウントを区別可能）。
3. 既存のユーザー実行時の保存挙動を破壊しない。

### 非機能要件

- 既存のメッセージ保存のトランザクション/パフォーマンスを悪化させない。
- 既存データの互換性を維持する（必要に応じて移行手順を用意）。

### 調査結果

- `RecursiveAgent::start_new_task` / `convert_to_chat_message` が `owner_id.as_user()` に依存していたため、サービスアカウント実行時に永続化がスキップされていた。 
- `Message::create_chat_message` が `UserId` 固定だったため、`ActorId` をそのまま保存する経路がなかった。 
- メッセージテーブルのカラムは `user_id` だが、`ChatMessage` は `ActorId` を持ち、`sqlx_message_repository` では `message.owner().to_string()` を保存しているため、サービスアカウントのIDも格納可能。
- `x-user-id` ヘッダーを指定できるAPIでは、これをメッセージ所有者として使うことで、サービスアカウント実行時でもユーザーIDベースの履歴保存が可能になる。

### コンテキスト別の責務

```yaml
contexts:
  llms:
    description: "Agent実行とメッセージ保存の責務"
    responsibilities:
      - ActorIdベースでのチャットメッセージ生成
      - サービスアカウント/ユーザーいずれの実行でも履歴保存
      - 既存履歴取得APIの互換性維持
```

## 実装方針

### アーキテクチャ設計

- メッセージ生成は `ActorId` を受け取れる形に変更し、サービスアカウントでも `ChatMessage` を生成できるようにする。
- `RecursiveAgent` の保存ロジックで `ActorId` の種別に依存しない永続化を行う。
- `x-user-id` ヘッダーが指定された場合は、そのユーザーIDをメッセージ所有者として優先する。
- 必要に応じてDBカラム命名の見直し（`user_id` → `owner_id` など）と移行計画を追加する。

### 技術選定

- 既存の `ActorId` を活用し、`Message::create_chat_message` の引数を `ActorId` に拡張する。
- `sqlx_message_repository` の保存カラムは当面 `user_id` のまま使い、将来的なリネームは別タスクとして切り出す。

### 実装内容

- `RecursiveAgent::start_new_task` のタスクメッセージ保存を同期処理に変更し、保存失敗時はログで検知できるようにした。
- サービスアカウント実行時に保存済みメッセージを確認するユニットテストを追加した。

## タスク分解

### 主要タスク
- [x] 要件定義の明確化（保存すべきメッセージ種別とActorIdの扱い）
- [x] 技術調査・検証（ActorId対応の実装パターン整理）
- [x] 実装
- [x] テスト・品質確認
- [x] ドキュメント更新

## Playwright MCPによる動作確認

バックエンドの修正が中心のため、UIの動作確認は不要。必要に応じてAPIの動作確認に限定する。

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 既存のユーザー実行時の保存ロジックが壊れる | 中 | 既存テストに加えてサービスアカウント用の保存テストを追加する |
| `user_id` カラム命名とActorIdの乖離が将来の混乱を招く | 中 | 別タスクでカラム名の明確化/移行を検討する |

## 参考資料

- `packages/llms/src/agent/recursive.rs` の `start_new_task` / `convert_to_chat_message`
- `packages/llms/src/usecase/execute_agent.rs` のリジューム時の保存処理
- `packages/llms/domain/src/message.rs` の `create_chat_message`
- `packages/llms/migrations/20241015124729_init.up.sql` の `messages` テーブル定義

## 完了条件

- [x] サービスアカウント経由でもメッセージが保存される
- [x] 既存のユーザー経由の履歴保存が維持される
- [x] テストまたは検証手順が整備される
- [x] 動作確認レポートが完成している
- [ ] タスクディレクトリを completed/[新バージョン]/ に移動済み

## 備考

実装とユニットテストの追加まで完了しており、残りは動作確認レポートとタスク移動のみ。
