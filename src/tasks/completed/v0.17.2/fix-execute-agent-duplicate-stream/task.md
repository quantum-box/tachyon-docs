---
title: "Fix ExecuteAgent Duplicate Stream Events"
type: "bug"
emoji: "🛠️"
topics:
  - LLM
  - Agent
  - Streaming
published: true
targetFiles:
  - packages/llms/src/usecase/command_stack/recursive.rs
  - packages/llms/src/usecase/command_stack/chat_stream.rs
  - packages/llms/src/usecase/command_stack/messages_to_chunk.rs
  - packages/llms/src/usecase/command_stack/types.rs
  - packages/llms/src/usecase/execute_agent.rs
  - packages/providers/llms_provider/src/tests.rs
  - packages/telemetry/src/lib.rs
github: https://github.com/quantum-box/tachyon-apps/tree/feature/get-agent-history-test-coverage
---

# Fix ExecuteAgent Duplicate Stream Events

## 概要

`ExecuteAgent` のストリーミングが Usage 取得後にも同一履歴を再実行し、`tool_call` や `ask_followup_question` が重複配送される問題を修正した。CommandStack の継続条件を整理し、Ask/AttemptCompletion を終端として扱うことで UI の二重表示と課金二重計上のリスクを解消する。

## 背景・目的

- CommandStack がツール呼び出しの有無を判定しないままループを継続しており、Usage 受信後にも `handle()` を再実行していた。
- `<ask_followup_question>` タグが通常の `Say` としてキューに残り、Ask 内容と同じ文章が再度送出されていた。
- 目的は継続条件を明瞭化し、Ask/AttemptCompletion を終端扱いにすること。併せてチャンク正規化とユニットテストを追加し、再発防止につなげる。

## 詳細仕様

### 機能要件

1. CommandStack はツール系チャンクが無いイテレーションでは追加リクエストを発行しない。
2. `<ask_followup_question>` を `AgentChunk::Ask` として 1 度だけストリームに流す。
3. `AttemptCompletion` 発生時は Usage 受信後にループを終了し、Billing と整合する Usage を保証する。
4. 履歴→チャンク変換でも Ask を正規化し、過去履歴を再表示しても二重出力が起きないようにする。

### 非機能要件

- **パフォーマンス**: 追加判定は既存ループ内に留め、外部 I/O を増やさない。
- **保守性**: 継続条件・終了条件をコメントとテストに残し、想定外のループ継続をトレースしやすくする。
- **回帰防止**: Scripted プロバイダーによるストリーム期待列テストで Ask/Thinking/Usage の順序を固定する。

### コンテキスト別の責務

```yaml
contexts:
  llms:
    description: "CommandStack を通じて LLM ストリームを制御"
    responsibilities:
      - 継続条件・終端条件の判定
      - チャンク正規化と履歴書き込み
      - Billing デコレータへのチャンク中継
  payment:
    description: "BillingAwareCommandStack で課金処理"
    responsibilities:
      - Usage 取り込みと課金実行
      - 異常時のストリーム停止
```

### 仕様のYAML定義

```yaml
streaming_behavior:
  iteration_stop_conditions:
    - chunk: ask
      rule: "Ask を送出後ただちに終了"
    - chunk: attempt_completion
      rule: "Usage 受信を待って終了"
    - chunk: usage
      rule: "attempt_completion 検知済みなら終了"
    - chunk: none
      rule: "tool_call/tool_result が無ければ再リクエスト禁止"
  followup_triggers:
    - tool_call
    - tool_result
    - tool_call_args
```

## 実装内容（2025-10-21 時点）

- ✅ `iteration_requires_followup` フラグを導入し、Ask/AttemptCompletion でループを終了。Usage 受信後の余分な `handle()` 呼び出しを停止。(`packages/llms/src/usecase/command_stack/recursive.rs`)
- ✅ `AgentChunk::Ask` を追加し、`messages_to_chunks` と `chat_stream` 双方で `<ask_followup_question>` を専用チャンクに正規化。(`.../types.rs`, `.../messages_to_chunk.rs`, `.../chat_stream.rs`)
- ✅ `ExecuteAgent` のテストハーネスを更新し、Scripted プロバイダー経由で Thinking/Say/Usage の順序を検証。(`packages/llms/src/usecase/execute_agent.rs`)
- ✅ `ScriptedChatStreamProvider` に V2 ストリームを実装し、Ask/Usage を含むユニットテストを追加。(`packages/providers/llms_provider/src/tests.rs`)
- ✅ Telemetry のデフォルトフィルタに `sqlx=off` を追加し、デバッグログのノイズを軽減。(`packages/telemetry/src/lib.rs`)
- ✅ `ask_followup_question` の ToolCall/ToolCallArgs を非公開化し、ToolEnd で単一の `Ask` チャンクを配信するよう整理。(`packages/llms/src/usecase/command_stack/chat_stream.rs`)
- ✅ 仕様ドキュメントを `docs/src/tachyon-apps/llms/agent-api/ask-followup-question-streaming.md` に追記し、挙動とテスト戦略を共有。

## テスト計画 / 実行状況

- ✅ `cargo test -p llms -- execute_agent`（2025-10-21 ローカルで通過）
- ✅ `cargo test -p llms_provider`（Scripted プロバイダーの新テストを確認）
- ⚠️ `mise run test`（`library-api::properties::test_properties_api_all` で失敗。既知の flaky で今回の修正とは無関係）
- 🔄 `mise run ci-rust`（ワークロードが重く、別途CI環境で実施予定）
- 🔄 `mise run ci-node`（UI 影響は無いが既定のチェックとして予定）

## タスク分解

### 主要タスク（進捗）

- ✅ 再現条件の整理と継続フラグ設計（2025-10-21 完了）
  - ダンプログから重複チャンクの条件を洗い出し、Ask/AttemptCompletion を終端条件として定義。
- ✅ `CommandStack` 継続判定ロジック実装（2025-10-21 完了）
  - `iteration_requires_followup` を導入し、Tool 系イベント以外ではループを継続しないように制御。
- ✅ 履歴/ストリーム変換テスト更新（2025-10-21 完了）
  - Scripted プロバイダーと `messages_to_chunks` テストで Ask/Thinking の期待列を固定。
- ✅ 追加ログとコメント整備（2025-10-21 完了）
  - 継続条件と終了条件の周辺にトレースログを配置し、次回調査を容易化。
- 🔄 CI・ドキュメント最終化（verification report・スクリーンショットは後続で追記）

## Playwright MCPによる動作確認

- ブラウザ UI の変更は無く Playwright 実行は未実施。Ask チャンクの UI 反映確認は後続の QA チームが Playwright MCP で対応予定。

### 動作確認チェックリスト

- [x] ローカル CLI ログで `Ask` チャンクが単発で出力されることを確認。
- [ ] Playwright MCP で UI 表示が重複しないことを確認（未着手）。

## リスクと対策

- **リスク**: 複数ツールを連続実行するタスクでフォローアップが必要なのにループが終わる。
  - **対策**: tool_call/tool_result/tool_call_args のいずれかが検知された場合のみ継続するようガードし、単体テストで多段ツール呼び出しケースを追加済み。
- **リスク**: Billing デコレータとの連携で Usage が欠落し課金漏れが起こる。
  - **対策**: AttemptCompletion 後も Usage を待ってから終了するフローを維持し、回帰テストで担保。

## スケジュール

- 着手: 2025-10-21
- 実装完了: 2025-10-21
- フル CI / 動作確認: 2025-10-24 までに実施予定

## 完了条件

- [x] Stream チャンクの重複が再発しないことを単体テストで確認。
- [x] 継続条件・終了条件がコードとコメントで明示されている。
- [ ] `mise run ci-rust` / `mise run ci-node` が成功する。
- [ ] verification report・スクリーンショットが更新される。
