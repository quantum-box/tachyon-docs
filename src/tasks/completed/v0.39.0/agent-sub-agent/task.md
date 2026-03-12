---
title: "Agent API: Sub Agent機能"
type: "feature"
emoji: "🔀"
topics: ["agent", "llms", "sub-agent", "recursive"]
published: true
targetFiles:
  - packages/llms/src/agent/tool/
  - packages/llms/src/agent/recursive.rs
  - packages/llms/src/usecase/execute_agent.rs
  - packages/llms/src/usecase/resume_agent.rs
  - packages/llms/src/agent/tool_access.rs
  - packages/llms/domain/src/agent_execution_state.rs
github: ""
---

# Agent API: Sub Agent機能

## 概要

親agentの実行中に、同システム内のagent APIを使って子agent（sub agent）をサブタスクとして起動し、結果を親agentに返す機能を実装する。

現在の `execute_coding_agent_job` ツールは外部CLIツール（Codex, Claude Code, Cursor Agent等）にタスクを委譲するが、sub agentは**同一システム内のagent API**を再帰的に呼び出す点が異なる。これにより、親agentが複雑なタスクを分割し、専門化された子agentに並列・直列で処理を委譲できるようになる。

## 背景・目的

### 現状の課題

1. **外部CLI依存**: 現在のTool Jobは外部CLIツール（Codex, Claude Code等）への委譲のみ。同システム内で完結するサブタスク委譲ができない
2. **タスク分割の困難**: 複雑なタスクを1つのagentで処理するため、コンテキストウィンドウの制約やタスクの焦点がぼやける
3. **専門化の不足**: 異なるモデル・プロンプト・ツール設定を持つ子agentを動的に生成できない

### 期待される成果

- 親agentが複雑なタスクをサブタスクに分解し、子agentに委譲
- 子agentは独自のモデル・ツール設定・プロンプトで動作
- 子agentの結果が親agentのコンテキストに統合される
- 並列実行によるスループット向上（将来的）

## 詳細仕様

### 機能要件

#### 1. `execute_sub_agent` ツール

親agentが呼び出す新規ツール。以下のパラメータを受け付ける:

```yaml
tool_name: execute_sub_agent
parameters:
  task:
    type: string
    required: true
    description: "子agentに実行させるタスクの説明"
  model:
    type: string
    required: false
    description: "子agentが使用するモデル（省略時は親と同じ）"
  max_requests:
    type: integer
    required: false
    default: 10
    description: "子agentの最大リクエスト数"
  tool_access:
    type: object
    required: false
    description: "子agentのツールアクセス設定（省略時は親の設定を継承）"
  context:
    type: string
    required: false
    description: "子agentに渡す追加コンテキスト"
  user_custom_instructions:
    type: string
    required: false
    description: "子agent向けのカスタム指示"
  timeout_seconds:
    type: integer
    required: false
    default: 300
    description: "タイムアウト（秒）"
```

#### 2. 実行フロー

- 子agentの完了を待ってから結果を親agentに返す（同期実行）
- 子agentの最終応答（`AttemptCompletion`テキスト）を結果として返却
- タイムアウト制御あり（デフォルト300秒）
- 非同期モード（即時返却 + コールバック再開）は別タスク: `backlog/agent-sub-agent-async`

#### 3. 子agentの特性

- 独自の `ChatRoom` を生成（親のChatRoomとは別）
- 独自の `AgentExecutionState` を持つ
- 親agentの `executor` / `multi_tenancy` を継承
- Billing は親agent実行の一部として計上（子agentの使用量も親のexecution_idに紐づく）
- 子agentは `execute_sub_agent` ツールを持たない（再帰深度制限として最初は1段のみ）

#### 4. 結果の返却

```yaml
# 成功時
result:
  status: "completed"
  sub_agent_execution_id: "exec_01..."
  sub_agent_chatroom_id: "cr_01..."
  response: "子agentの最終応答テキスト"
  usage:
    total_input_tokens: 1500
    total_output_tokens: 800
    iterations: 3

# 失敗時
result:
  status: "failed"
  sub_agent_execution_id: "exec_01..."
  error: "エラーメッセージ"
```

### 非機能要件

- **再帰深度制限**: 初期実装では1段のみ（子agentは更にsub agentを呼べない）
- **タイムアウト**: 同期モードのデフォルトタイムアウトは300秒
- **リソース制御**: 子agentの `max_requests` はデフォルト10（親より少なく制限）
- **Billing統合**: 子agentのコストは親のexecution全体のコストに加算
- **冪等性**: 親agentの再実行時に同じsub agentが二重起動しない制御
- **スコープ**: 同期モードのみ。非同期モードは `backlog/agent-sub-agent-async` で後続対応

### コンテキスト別の責務

```yaml
contexts:
  llms:
    description: "Sub Agent実行管理"
    responsibilities:
      - execute_sub_agent ツールの実装
      - 子agent用ChatRoom/ExecutionStateの生成
      - 子agentの結果収集と親への返却
      - Billing統合（子agentコストの親への加算）

  llms_domain:
    description: "ドメインモデル拡張"
    responsibilities:
      - AgentExecutionState に parent_execution_id フィールド追加
      - SubAgentRelation（親子関係）のモデリング
```

## 実装方針

### アーキテクチャ設計

```
親 RecursiveAgent
  │
  ├── AttemptApiRequest (LLM呼び出し)
  │     └── ToolInvoker
  │           └── execute_sub_agent ツール
  │                 ├── 新規ChatRoom作成
  │                 ├── ExecuteAgent usecase呼び出し（内部）
  │                 ├── ストリーム全消費→結果テキスト抽出
  │                 └── 結果を親に返却
  │
  └── MessageCollection (メッセージ管理)
```

### 技術選定

- **子agentの実行**: 既存の `ExecuteAgent` usecaseを内部的に再利用
- **同期モード**: `RecursiveAgent::handle()` が返すストリームを全消費し、最終応答を抽出
- **ChatRoom管理**: 子agent用に自動生成。命名: `sub-agent-{parent_execution_id}-{index}`
- **Billing**: `BillingAwareRecursiveAgent` が子agentのストリームもラップ

### 既存Tool Jobとの関係

| 項目 | Tool Job (coding_agent) | Sub Agent |
|------|------------------------|-----------|
| 実行先 | 外部CLIツール | 同システム内agent API |
| プロセス | 別プロセス/ワーカー | 同一プロセス内（async task） |
| Git操作 | worktree分離あり | なし（親と同じワークスペース） |
| モデル | 外部ツール依存 | 自由に指定可能 |
| ツール | 外部ツールのツール | システムのツール一式 |
| 課金 | 外部ツールの課金 | 内部Billing統合 |

## タスク分解

### フェーズ1: ドメインモデル拡張 ✅
- [x] `AgentExecutionState` に `parent_execution_id: Option<String>` 追加
- [x] DBマイグレーション: `agent_execution_states` テーブルに `parent_execution_id` カラム追加
- [x] `StoredToolAccessConfig` に `sub_agent: bool` 追加

### フェーズ2: execute_sub_agent ツール実装 ✅
- [x] `packages/llms/src/agent/tool/sub_agent.rs` 新規作成
- [x] `handle_execute_sub_agent` 関数の実装
- [x] `ToolAccessConfig` に `sub_agent: bool` フィールド追加
- [x] ツール定義（名前・説明・パラメータスキーマ）をシステムプロンプトに追加
- [x] `DefaultToolExecutor` へのディスパッチ追加
- [x] 子agentの結果テキスト抽出ロジック（AttemptCompletion/Say/Usage）
- [x] 再帰深度制限（子agentでは `sub_agent: false` に強制）
- [x] `ToolExecutionContext` に `execute_agent` / `executor` フィールド追加
- [x] `AttemptApiRequest` に `execute_agent` / `executor` フィールド追加
- [x] `ExecuteAgent` に `OnceLock` ベースの自己参照DIパターン実装
- [x] `app.rs` / `agent_builtin.rs` でDI配線

### フェーズ3: Billing統合 ✅
- [x] `ExecuteAgentInputData` に `parent_execution_id: Option<String>` 追加
- [x] 子agentの `parent_execution_id` を親の `execution_state_id` から設定
- [x] 全 `ExecuteAgentInputData` 構築箇所の更新（handler, examples, tests, tachyond）

### フェーズ4: バグ修正・統合 ✅
- [x] stack overflow修正: `ExecuteAgent` の `#[derive(Debug)]` が自己参照で無限再帰 → 手動 `Debug` impl に変更
- [x] API キー解決修正: operator テナントの IaC から AI/web プロバイダーを削除し、system-config フォールバックに統一
- [x] `execution_state_id` を `AttemptApiRequest` に渡す修正（Devin AI レビュー指摘）
- [x] Say チャンク蓄積バグ修正: sub-agent レスポンスが1文字しか返らない → 全 Say テキストを蓄積し AttemptCompletion を優先
- [x] `messages_to_chunk.rs` の `GENERIC_TOOL_TAGS` に `execute_sub_agent` を追加: `getAgentMessages` でXMLがsayとして表示される問題を修正

### フェーズ5: AgentChunkストリーム中継対応 🔄

**目的**: sub-agentの実行チャンクを親agentのストリームにリアルタイム中継し、ユーザーに実行状況を見せる。ただし親agentのコンテキスト（メッセージ履歴）には要約のみ入れ、コンテキスト分離の価値を維持する。

#### 設計

**AgentChunk構造の変更**:
現在の `enum AgentChunk` をstructでラップし、共通メタデータを持たせる。

```rust
// 現在のenum → AgentChunkEvent にリネーム
pub enum AgentChunkEvent {
    ToolCall(ToolCall),
    ToolCallArgs(ToolCallArgs),
    ToolResult(ToolResult),
    Thinking(Thinking),
    Say(Text),
    User(UserMessage),
    Ask(Ask),
    AttemptCompletion(AttemptCompletionResult),
    Usage(Usage),
}

// 新しいAgentChunk: メタデータ + イベント
pub struct AgentChunk {
    /// None = main agent からのチャンク
    pub agent: Option<AgentSource>,
    pub event: AgentChunkEvent,
}

pub struct AgentSource {
    pub chatroom_id: ChatRoomId,
    // 将来: depth, agent_name 等を拡張可能
}
```

**ストリーム中継の仕組み**:
- `ToolExecutionContext` に `parent_tx: Option<Sender<AgentChunk>>` を追加
- `execute_sub_agent_stream` 内で sub-agent のチャンクを `parent_tx` 経由で中継
- 中継するチャンクには `agent: Some(AgentSource { chatroom_id })` を付与
- tool handlerの戻り値（親のコンテキストに入る部分）は引き続き要約JSONのみ

**フロント側の対応**:
- `agent` フィールドが存在するチャンクはsub-agentの出力として表示を分ける
- 既存のチャンク（`agent: None`）は従来通りの表示

#### タスク
- [x] `AgentChunk` を struct化（`AgentChunkEvent` enum + メタデータ）
- [x] 全ファイルの `AgentChunk::*` パターンマッチを `AgentChunkEvent` に移行
- [x] `ToolExecutionContext` に `parent_chunk_tx` 追加
- [x] `AttemptApiRequestTrait` に `set_parent_chunk_tx` メソッド追加（interior mutability パターン）
- [x] `RecursiveAgent::handle()` で tx を `set_parent_chunk_tx` 経由で設定
- [x] `execute_sub_agent_stream` でチャンク中継ロジック実装（8テスト付き）
- [x] フロントのストリームパーサーを `agent` フィールド対応
- [ ] `messages_to_chunks` の `GENERIC_TOOL_TAGS` ハードコードを将来的に除去（構造化保存への移行で不要になる）

### フェーズ6: テスト・品質確認 🔄
- [x] コンパイルチェック通過（`mise run check`）
- [x] フォーマットチェック通過（`mise run fmt`）
- [x] UI からの動作確認（Playwright MCP）
- [ ] シナリオテスト作成（REST API経由のsub-agent実行）
- [ ] DBマイグレーション適用確認

## 実装進捗メモ

### 2025-02-01: UI動作確認 & バグ修正

1. **Stack overflow**: `ExecuteAgent` に `#[derive(Debug)]` を付けていたが、`sub_agent_executor: OnceLock<Arc<dyn ExecuteAgentInputPort>>` が自己参照しておりDebug出力で無限再帰。手動impl に置き換え。
2. **APIキー解決**: operator テナントのIaCマニフェストに `$secret_ref: openai/api_key` があったが、`.secrets.json` にはsystem-configテナント分しかキーがない。operator IaCからAI/webプロバイダーを削除してsystem-configフォールバックで動作するようにした。
3. **Sayチャンク蓄積バグ**: `execute_sub_agent_stream` で `say_text` への蓄積が最初のチャンクしか取れていなかった。全チャンクを蓄積するように修正し、`AttemptCompletion` があればそちらを優先するロジックに変更。
4. **messages_to_chunk でのXML表示バグ**: DB保存されたメッセージを `getAgentMessages` で返す際、`GENERIC_TOOL_TAGS` に `execute_sub_agent` がなかったため、XMLが `Say` として返されていた。タグリストに追加して `ToolCall` + `ToolCallArgs` として返すように修正。

### 2025-02-01: Phase 4 & 5 実装

**Phase 4: AgentChunk struct化**
- `AgentChunk` enum → `AgentChunkEvent` enum にリネーム
- `AgentChunk` を struct (agent: Option<AgentSource>, event: AgentChunkEvent) に再構築
- `AgentSource` struct 追加 (chatroom_id でsub-agent識別)
- `From<AgentChunkEvent> for AgentChunk` impl で既存コード互換
- `AgentChunk::from_sub_agent()` コンストラクタ追加
- 全ファイル(~15ファイル)のパターンマッチを `AgentChunkEvent` に移行

**Phase 5: ストリーム中継**
- `AttemptApiRequestTrait::set_parent_chunk_tx()` メソッド追加（default no-op）
- `AttemptApiRequest` に `Arc<Mutex<Option<Sender>>>` で interior mutability パターン適用
- `ToolExecutionContext` に `parent_chunk_tx` フィールド追加
- `RecursiveAgent::handle()` で tx 設定呼び出し
- `execute_sub_agent_stream` でbest-effort中継実装（receiver dropped でも失敗しない）
- 8つの包括的テスト追加:
  1. relay_chunks_to_parent_stream
  2. no_relay_when_parent_tx_is_none
  3. fallback_to_say_text_when_no_completion
  4. empty_stream_returns_default_message
  5. stream_error_propagates
  6. relay_continues_when_parent_rx_dropped
  7. completion_takes_priority_over_say
  8. agent_source_contains_correct_chatroom_id

### 2026-02-01: Phase 5 フロント側ストリーム中継の動作確認 (Playwright MCP)

**確認方法**: MutationObserverでストリーミング中のDOM変更を88回キャプチャし、sub-agentチャンクの表示を検証。

**確認結果**:
- SSEストリームで `{"agent":{"chatroom_id":"ch_01kgcfrt3abhwms6e681d8dhjn"},"type":"say","index":1,"text":"C"}` 形式のsub-agentチャンクが1文字ずつリアルタイム中継されることを確認
- フロント側で `agent` フィールドの存在を検知し、`sub_agent` タイプのメッセージグループとして分類されることを確認
- sub-agentチャンクが以下のtealカラーネスト表示で描画されることをDOMレベルで検証:
  - `article[aria-label="Message from sub-agent"]`
  - CSSクラス: `ml-6 border-l-2 border-teal-300 dark:border-teal-700 pl-3`
  - アバター: `bg-teal-600` の Bot アイコン
  - ラベル: 「Sub Agent」
- テキストが逐次更新される様子をMutationObserverでキャプチャ: 「Sub Agent → Th → The Moon is → The Moon is Earth's → ...」
- refetch後（DB由来）のメッセージはメインagentの表示に統合される（DBにはsub-agentメタデータが保存されないため正常動作）
- 3回のsub-agent実行すべてで正常にストリーム中継とteal表示を確認

**スクリーンショット**: `screenshots/` ディレクトリに保存

### コミット履歴（PR #1043）
- `e8c6b67e6` fix: accumulate all Say chunks in sub-agent response collection
- `2bb55e515` fix: pass execution_state_id to AttemptApiRequest for sub-agent parent tracking
- `acd80ce52` fix: resolve stack overflow in ExecuteAgent Debug and clean up operator IaC providers

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 再帰的な無限ループ | 高 | 子agentでは `sub_agent` ツールを無効化（再帰深度1段制限） |
| コンテキストウィンドウ溢れ | 中 | 子agentの応答を要約して親に返す（将来的） |
| Billing二重計上 | 中 | 子agentのコストは `parent_execution_id` で親に紐づけ、重複を回避 |
| 同期モードのタイムアウト | 中 | デフォルト300秒 + 明示的なタイムアウト設定パラメータ |
| 子agent失敗時の親への影響 | 低 | 子agent失敗はツール結果としてエラーを返し、親agentが判断 |

## 参考資料

- 既存のTool Job実装: `packages/llms/src/agent/tool/coding_agent.rs`
- RecursiveAgent: `packages/llms/src/agent/recursive.rs`
- ExecuteAgent usecase: `packages/llms/src/usecase/execute_agent.rs`
- ResumeAgent usecase: `packages/llms/src/usecase/resume_agent.rs`
- ToolAccessConfig: `packages/llms/src/agent/tool_access.rs`
- AgentExecutionState: `packages/llms/domain/src/agent_execution_state.rs`

## 完了条件

- [x] 親agentが `execute_sub_agent` ツールで子agentを起動できる
- [x] 子agentが独自のモデル・ツール設定で動作する
- [x] 子agentの結果が親agentのコンテキストに統合される
- [x] 再帰深度制限が機能する（子agentはsub agentを呼べない）
- [x] Billing が正しく親execution に統合される（`parent_execution_id` 連携）
- [x] `getAgentMessages` で sub-agent ツール呼び出しが正しく表示される
- [ ] シナリオテストが通る
- [ ] コードレビューが完了

### バージョン番号の決定基準

- マイナーバージョン（x.X.x）を上げる: 新機能の追加に該当

## 備考

- 同期モードのみをスコープとする。非同期モード（即時返却 + コールバック再開）は `backlog/agent-sub-agent-async` で後続対応
- 将来的に複数の子agentの並列実行にも対応予定（非同期モード前提）
- 子agentのログ・メッセージは独自ChatRoomに保存され、UI上で親子関係を表示する拡張も検討
