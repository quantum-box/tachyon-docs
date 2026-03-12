---
title: "Agent API: Sub Agent 非同期モード"
type: "feature"
emoji: "⏳"
topics: ["agent", "llms", "sub-agent", "async"]
published: true
targetFiles:
  - packages/llms/src/agent/tool/sub_agent.rs
  - packages/llms/src/usecase/resume_agent.rs
  - packages/llms/domain/src/agent_execution_state.rs
github: "feat/agent-sub-agent-async"
---

# Agent API: Sub Agent 非同期モード

## 概要

`agent-sub-agent`（同期モード）の後続タスク。親agentが子agentを起動後、完了を待たずに即座にjob IDを返し、子agent完了時にコールバックで親agentを再開する非同期モードを実装する。

## 背景・目的

- 同期モードでは子agentの完了まで親agentがブロックされ、タイムアウトリスクがある
- 複数の子agentを並列実行し、全完了後に親agentを再開するユースケースに対応
- 既存のTool Jobコールバック機構（`HandleToolJobCallback` → `ResumeAgent`）を再利用可能

## 前提条件

- `agent-sub-agent`（同期モード）が完了していること

## 詳細仕様

### 機能要件

#### 1. 非同期モード（`async_mode: true`）

`execute_sub_agent` ツールに `async_mode: true` を指定した場合:
- 子agentをバックグラウンドタスクとして起動
- 即座にjob情報を返却
- 親agentの `AgentExecutionState` を `WaitingSubAgent` に遷移
- 子agent完了時にコールバックで親agentを再開

#### 2. 状態遷移

```
親agent Running
  → execute_sub_agent(async_mode: true)
  → WaitingSubAgent (pending_sub_agent_execution_id をセット)
  → 子agent完了
  → HandleSubAgentCompletion: 親のmetadataにsub_agent_result保存
  → ResumeAgent: 親agent Running (子agentの結果をコンテキストに含む)
```

#### 3. 結果の返却

```yaml
# 非同期モード: 即時返却
result:
  async: true
  sub_agent_execution_id: "exec_01..."
  sub_agent_chatroom_id: "cr_01..."
  message: "Sub agent dispatched. Agent execution will be resumed when sub agent completes."
```

#### 4. 将来的な並列実行

複数の子agentを並列起動し、全完了後に親を再開する:
- `execute_sub_agents` (複数形) ツールの追加検討
- `WaitingSubAgents` 状態で複数のpending IDを管理
- 全子agent完了時に親を再開

### 非機能要件

- 子agent失敗時は親agentを再開し、エラー結果を返す
- 子agentのタイムアウト検出と親への通知
- 冪等性: 親agentの再実行時に同じsub agentが二重起動しない制御

## 実装方針

### 既存Tool Jobコールバック機構の再利用

現在の `HandleToolJobCallback` → `ResumeAgent` フローを参考に:

1. 子agent完了時のイベント発火
2. `AgentExecutionState` の `WaitingSubAgent` → `Running` 遷移
3. `ResumeAgent` が子agentの結果をコンテキストに含めて再開

### 変更対象

- `AgentExecutionStatus` に `WaitingSubAgent` バリアント追加
- `AgentExecutionState` に `pending_sub_agent_execution_id` フィールド追加
- `ResumeAgent` に子agent結果のコンテキスト復元ロジック追加
- 子agent完了時のコールバックハンドラ実装

## 実装進捗

### Step 1: ドメイン層 ✅
- `AgentExecutionStatus::WaitingSubAgent` バリアント追加
- `pending_sub_agent_execution_id: Option<String>` フィールド追加
- `set_pending_sub_agent()` / `clear_pending_sub_agent()` メソッド追加
- `as_str()`, `FromStr`, `is_terminal()` 対応
- テスト追加

### Step 2: DBマイグレーション ✅
- `create-migration` スキルで TiDB互換マイグレーション作成
- `ALTER TABLE agent_execution_states ADD COLUMN pending_sub_agent_execution_id VARCHAR(255) NULL`
- `CREATE INDEX idx_agent_exec_states_pending_sub_agent`

### Step 3: リポジトリ層 ✅
- `AgentExecutionStateRepository` トレイトに `find_by_pending_sub_agent()` 追加
- `SqlxAgentExecutionStateRepository` の全クエリに新カラム対応
- `ExecutionStateRow` に新フィールド追加

### Step 4: HandleSubAgentCompletion usecase ✅
- 新ファイル `packages/llms/src/usecase/handle_sub_agent_completion.rs` 作成
- 子agent完了時に親のmetadataに結果を保存
- `clear_pending_sub_agent()` で親の状態を Running に戻す
- ユニットテスト追加

### Step 5: sub_agent.rs 非同期モード ✅
- `async_mode` パラメータのパース追加
- `handle_async_sub_agent()` 関数実装
- `tokio::spawn` でバックグラウンド実行
- 子agent完了後に `HandleSubAgentCompletion` 呼び出し
- 完了後に `ResumeAgent` で親を自動再開

### Step 6: ToolExecutionContext / AttemptApiRequest 拡張 ✅
- `AsyncSubAgentDeps` 構造体追加（`handle_sub_agent_completion` + `resume_agent`）
- `ToolExecutionContext` に `async_sub_agent_deps` フィールド追加
- `AttemptApiRequest` に `async_sub_agent_deps` フィールド + ビルダーメソッド追加

### Step 7: execute_agent.rs 拡張 ✅
- 非同期sub-agent検出ロジック追加（`sub_agent_execution_id` をパース）
- 完了ガード: `WaitingSubAgent` 状態は `mark_completed()` スキップ
- `OnceLock` パターンで `AsyncSubAgentDeps` フィールド + セッターメソッド
- AttemptApiRequestへの受け渡しワイヤリング

### Step 8: ResumeAgent - sub_agent_result 復元 ✅
- `restore_execution_context()` を拡張
- `pending_tool_job_id` チェック後に `metadata.sub_agent_result` もチェック
- resume task メッセージを汎用化（Tool Job / sub-agent 両対応）

### Step 9: DI配線 (app.rs) ✅
- `HandleSubAgentCompletion` を構築
- `AsyncSubAgentDeps` を作成し `execute_agent.set_async_sub_agent_deps()` で注入

### Step 10: ツール定義の更新 ✅
- `execute_sub_agent` のスキーマに `async_mode` パラメータ追加

### コンパイルチェック ✅
- `mise run check` 通過

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `packages/llms/domain/src/agent_execution_state.rs` | WaitingSubAgent追加, pending_sub_agent_execution_id追加 |
| `packages/llms/migrations/20260221000000_add_pending_sub_agent_execution_id.up.sql` | **新規** - マイグレーション |
| `packages/llms/domain/src/repository.rs` | find_by_pending_sub_agent追加 |
| `packages/llms/src/adapter/gateway/sqlx_agent_execution_state_repository.rs` | 全クエリに新カラム対応 |
| `packages/llms/src/usecase/handle_sub_agent_completion.rs` | **新規** - 子agent完了ハンドラ |
| `packages/llms/src/usecase/mod.rs` | 新usecase登録 |
| `packages/llms/src/agent/tool/sub_agent.rs` | async_modeブランチ追加 |
| `packages/llms/src/agent/tool/context.rs` | AsyncSubAgentDeps追加 |
| `packages/llms/src/agent/tool/mod.rs` | context module可視性変更 |
| `packages/llms/src/agent/tool/client.rs` | ToolExecutionContextに新フィールド追加 |
| `packages/llms/src/agent/chat_stream.rs` | deps受け渡し |
| `packages/llms/src/usecase/execute_agent.rs` | 非同期検出拡張, 完了ガード追加 |
| `packages/llms/src/usecase/resume_agent.rs` | sub_agent_result復元 |
| `packages/llms/src/app.rs` | DI配線 |
| `packages/llms/src/agent/tool_definitions.rs` | ツールスキーマ更新 |
| `apps/tachyond/src/services.rs` | MockRepository に新メソッド追加 |

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 子agentが完了しない（ハング） | 高 | タイムアウト検出 + 親agentへの通知 |
| コールバック漏れ | 中 | 既存Tool Jobコールバックの実績ある機構を再利用 |
| 並列実行時の状態管理複雑化 | 中 | 初期は1子agent限定、並列は後続対応 |

## 参考資料

- 前提タスク: `docs/src/tasks/todo/agent-sub-agent/task.md`
- Tool Jobコールバック: `packages/llms/src/usecase/handle_tool_job_callback.rs`
- ResumeAgent: `packages/llms/src/usecase/resume_agent.rs`
- AgentExecutionState: `packages/llms/domain/src/agent_execution_state.rs`

## 完了条件

- [x] 非同期モードで子agentを起動し、完了後に親agentが再開する
- [x] 子agent失敗時に親agentが適切にエラーを受け取る
- [x] コンパイルチェック通過
- [x] シナリオテストが通る
- [ ] コードレビューが完了
