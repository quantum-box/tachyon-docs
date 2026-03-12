---
title: Agent Session Event-Based Storage & Session Independence
type: refactor
emoji: "🗂️"
topics:
  - llms
  - agent
  - session
  - database
  - simplification
published: true
targetFiles:
  - packages/llms/src/adapter/axum/agent_handler.rs
  - packages/llms/src/agent/recursive.rs
  - packages/llms/src/agent/types.rs
  - packages/llms/src/repository.rs
  - packages/llms/src/adapter/gateway/sqlx_agent_session_history_repository.rs
  - packages/llms/src/usecase/execute_agent.rs
  - packages/llms/src/usecase/get_agent_history.rs
  - packages/llms/src/usecase/resume_agent.rs
  - packages/llms/src/usecase/create_agent_session.rs
  - packages/llms/src/usecase/list_agent_sessions.rs
  - packages/llms/domain/src/agent_session.rs
  - packages/llms/src/agent/system_prompt.rs
  - packages/providers/anthropic/src/chat/client.rs
  - packages/providers/anthropic/src/chat/stream_v2.rs
  - packages/llms/migrations
  - docs/src/tachyon-apps/llms/agent-api/
github: https://github.com/quantum-box/tachyon-apps
pr: https://github.com/quantum-box/tachyon-apps/pull/1223
branch: fix/tidb-migration-check-permissions
---

## 概要

エージェントのメッセージ保存を `messages` テーブル経由のXML変換方式から、`agent_message_events` テーブルへの直接イベント保存方式に完全切替し、さらにセッションをチャットルームから独立したエンティティとして分離する。Completion API等のチャットルームは現行のまま維持する。

## 背景・目的

### 現状の問題

エージェント実行時のデータフローが複雑すぎる：

```
保存: AgentChunkEvent → MessageCollection(累積) → Message(構造化) → create_chat_messages(XML生成) → messages テーブル
復元: messages テーブル → ChatMessage → messages_to_chunk.rs(XMLパース) → AgentChunkEvent
```

- チャンク→XML→保存→XMLパース→チャンク の往復変換がバグの温床
- `messages_to_chunk.rs` はXMLタグのパースが脆弱（ジェネリックツールのハードコード等）
- `MessageCollection::push_chunk()` でチャンクを Message に変換し、保存時にまたXMLに戻す無駄
- Agent Messages API のテキスト欠落・順序逆転など、変換起因のバグが複数発生

### 解決策

```
保存: AgentChunkEvent → serde_json::to_value() → agent_message_events テーブル
復元: agent_message_events テーブル → serde_json::from_value() → AgentChunkEvent
```

`AgentChunkEvent` をそのままJSONでDBに保存すれば、XML変換もパースも不要になる。

### スコープ

- **変更対象**: エージェント実行のメッセージ永続化のみ
- **変更なし**: Completion API、チャットルーム、フロントエンドAPI仕様
- **バックフィル**: 不要（新規セッションからイベント保存を開始）

## タスク分解

### Phase 0: 基盤構築 ✅ (完了済み)
- [x] `agent_sessions` / `agent_message_events` migration 追加
- [x] AgentSessionHistoryRepository trait + SQLx実装
- [x] App DI 組み込み
- [x] execute時のイベント保存
- [x] get messages でのイベント読み取り

### Phase 1: レガシー書き込み廃止 ✅ (2026-02-25 完了)
- [x] `recursive.rs` の `RepositoryMessagePersistence` を `NoOpMessagePersistence` に置換
- [x] `save_messages()` メソッドとその3箇所の呼び出しを削除
- [x] `start_new_task()` 内のユーザーメッセージDB保存を削除
- [x] `execute_agent.rs` の resume 検出を `agent_message_events` ベースに切替
- [x] `events_to_messages()` ヘルパー追加（`AgentMessageEventSnapshot` → `Message` 変換）
- [x] tachyond/examples の `ExecuteAgent::new()` に `session_history_repo` パラメータ追加
- [x] レガシーテスト(`test_save_messages_*`, `chat_messages_to_messages_converts_and_sorts`)削除

### Phase 2: レガシー読み取り廃止 ✅ (2026-02-25 完了)
- [x] `GetAgentHistory` usecase を `AgentSessionHistoryRepository` ベースに書き換え
- [x] `agent_handler.rs` のフォールバックロジック（legacy messages → events）を削除
- [x] `messages_to_chunk` への依存を `get_agent_history` から除去
- [x] `AgentSessionHistoryRepository` に `#[mockall::automock]` 追加
- [x] `GetAgentHistory` のテストをイベントベースに書き換え

### Phase 3: resume フロー統一 ✅ (2026-02-25 完了)
- [x] `resume_agent.rs` の `restore_execution_context` からレガシーフォールバック(`chat_message_repo.find_all()`)を削除
- [x] execution state が見つからない場合は `Ok(None)` を返す（エラーではなく継続）
- [x] テスト更新（レガシーフォールバック依存テストの修正）

### Phase 4: 不要コード・マイグレーション整理 ✅ (2026-02-25 完了)
- [x] `20260224000001_backfill_agent_sessions_from_chatrooms.up.sql` / `.down.sql` 削除
- [x] 不要な import 整理（`Part`, `Role`, `ChatMessage`, `MessageId` 等）
- [x] `chat_messages_to_messages()` 関数削除
- [x] `RecursiveAgent` の `chat_message_repo` フィールド削除 (2026-02-25 完了)

### Phase 5: 検証 ✅ (2026-02-25 完了)
- [x] `mise run check` パス（warning なし）
- [x] シナリオテスト全パス（agent_session_api_test 含む）

## 実装メモ

### 変更したファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `packages/llms/src/agent/recursive.rs` | `RepositoryMessagePersistence` → `NoOpMessagePersistence`, `save_messages()` 削除 |
| `packages/llms/src/usecase/execute_agent.rs` | `session_history_repo` 追加、resume検出をeventベースに、`events_to_messages()` 追加 |
| `packages/llms/src/usecase/get_agent_history.rs` | `ChatMessageRepository` → `AgentSessionHistoryRepository` に完全切替 |
| `packages/llms/src/usecase/resume_agent.rs` | レガシーフォールバック削除 |
| `packages/llms/src/adapter/axum/agent_handler.rs` | フォールバックロジック削除、簡素化 |
| `packages/llms/src/app.rs` | `GetAgentHistory` の DI 更新 |
| `packages/llms/src/repository.rs` | `#[mockall::automock]` 追加 |
| `apps/tachyond/src/services.rs` | `MockSessionHistoryRepository` 追加 |
| `apps/tachyond/src/app.rs`, `cli.rs` | `session_history_repo` パラメータ追加 |
| `packages/llms/examples/agent_with_billing.rs` | `MockSessionHistoryRepo` 追加 |

### Phase 4b: RecursiveAgent chat_message_repo 完全除去 ✅ (2026-02-25 完了)
- [x] `RecursiveAgent` 構造体から `chat_message_repo` フィールド削除
- [x] `RecursiveAgent::new()` / `start_new_task()` のシグネチャから `chat_message_repo` パラメータ削除
- [x] `AgentBuilder` (`core/builder.rs`) の呼び出し修正、未使用import削除
- [x] `ExecuteAgent` (`execute_agent.rs`) のフィールド・コンストラクタ・呼び出し修正
- [x] `ResumeAgent` (`resume_agent.rs`) のフィールド・コンストラクタ・呼び出し修正
- [x] `app.rs` DI配線から `message_repo.clone()` 引数削除
- [x] `tachyond` (`agent_builtin.rs`, `cli.rs`, `app.rs`, `services.rs`) から `MockChatMessageRepository` 削除
- [x] `agent_with_billing.rs` example から `chat_message_repo` 削除
- [x] `recursive.rs` テスト (~15箇所) から `mock_repo` 削除
- [x] `billing_aware_test.rs` (~11箇所) から `MockChatMessageRepository` 定義と参照削除
- [x] `chat_stream.rs` テスト (2箇所) から `mock_repo` 削除
- [x] `mise run check` パス（warning なし）

### Phase 6: セッションをチャットルームから独立 ✅ (2026-02-26 完了)

チャットルームに依存していたセッションを独立エンティティとして分離。`as_` プレフィックスの独自IDを持つ独立セッションを作成可能にした。

- [x] `AgentSessionId` 型追加 (`def_id!(AgentSessionId, "as_")`)
- [x] `AgentExecutionTarget` enum 定義 (`Chatroom(ChatRoomId)` / `Session(AgentSessionId)`)
- [x] リポジトリに `create_session` / `get_session` / `list_sessions` メソッド追加
- [x] `CreateAgentSession` / `ListAgentSessions` ユースケース追加
- [x] `ExecuteAgent` / `ResumeAgent` を `AgentExecutionTarget` 対応に変更
- [x] セッション版エンドポイント独立実装（`execute_agent_session`, `get_agent_messages_session` 等）
- [x] `POST /v1/llms/sessions` / `GET /v1/llms/sessions` CRUD エンドポイント追加
- [x] Auth ポリシー追加 (`llms:CreateAgentSession`, `llms:ListAgentSessions`)
- [x] シナリオテスト追加・更新

### Phase 7: AIレビュー対応 ✅ (2026-02-26 完了)

PR #1223 に対するAIレビューのフィードバック対応。

- [x] `ensure_session_from_chatroom` のテーブル未存在時グレースフルデグラデーション
- [x] `table_not_found()` ヘルパー関数の Rustdoc 改善
- [x] Agent Messages API のストリーミングチャンク統合（`normalize_session_history_messages()`）
  - 連続する同種チャンク（thinking/say/attempt_completion）を1メッセージに統合
  - マルチエージェント対応（異なるAgentSourceのチャンクは統合しない）

### Phase 8: ネイティブJSON Tool Callデフォルト化 ✅ (2026-02-26 完了)

XML→JSONツールモードのデフォルト切り替え。

- [x] `requires_json_tool_calls()` のロジック反転（opt-in → opt-out: CLI wrapper以外は全てJSON mode）
- [x] Anthropic プロバイダの `claude-3` モデルプレフィックス制限を削除（全モデルでツール対応）
- [x] Anthropic stream_v2: JSON→XML変換を廃止し、構造化 `ToolCall` チャンクを直接emit
- [x] system_prompt.rs: XMLモードフォールバック用のfilesystemツール定義追加

### Phase 9: API仕様書・OpenAPI ✅ (2026-02-26 完了)

- [x] Agent Execute API 仕様書作成 (`docs/src/tachyon-apps/llms/agent-api/execute-api-specification.md`)
  - リクエスト/レスポンススキーマ全フィールド、SSEイベント12種類、XML/JSONモード比較
- [x] Agent Messages API 仕様書作成 (`docs/src/tachyon-apps/llms/agent-api/messages-api-specification.md`)
  - チャンク統合ロジック、永続化の仕組み、DBスキーマ、Resume変換ルール
- [x] overview.md に仕様書リンク追加
- [x] OpenAPI (utoipa) アノテーション追加
  - `agent_handler.rs`: セッション版executeエンドポイント
  - `models_handler.rs`: モデル一覧エンドポイント
  - `SupportedFeature` enum をスキーマ登録

### 残課題（なし）

全フェーズ完了。`messages_to_chunk.rs` は `get_deleted_messages` で引き続き使用されるため残置。

## 技術的知見

### XML vs JSON ツールモード

| 項目 | XML mode | JSON mode |
|------|----------|-----------|
| ツール定義 | system promptにXMLで記述 | provider APIの `tools` パラメータ |
| パース | `XmlStreamParser` で文字単位処理 | `JsonToolCallEventParser` |
| 対応プロバイダ | opencode, claude_code (CLI wrapper) | anthropic, openai, google_ai, xai, zai, bedrock |
| デフォルト | ❌（フォールバック用） | ✅（v2026-02-26～） |

### セッション分離設計

- `AgentExecutionTarget::Chatroom(ChatRoomId)`: 後方互換。`ensure_session_from_chatroom()` で自動セッション作成
- `AgentExecutionTarget::Session(AgentSessionId)`: 独立セッション。`as_` プレフィックスのID
- `as_chatroom_id()`: 下流コンポーネント（RecursiveAgent, BillingContext等）用に `ch_` プレフィックスのIDを合成
- セッション版エンドポイントは `ch_` プレフィックスIDも受け付け、内部でchatroomハンドラに委譲

## 完了条件

- [x] エージェント実行時に `messages` テーブルへの書き込みがない
- [x] Agent Messages API が `agent_message_events` のみから読み取る
- [x] エージェント再開が `agent_message_events` の履歴で正常動作する
- [x] Completion API のチャットルームが影響を受けていない
- [x] 独立セッション (`as_` ID) で execute/messages/status/resume が動作する
- [x] チャットルーム経由のエージェントAPIが従来通り動作する
- [x] API仕様書が作成されている
- [x] `mise run check` パス
- [x] シナリオテストパス
