---
title: "Agent API resume 実装"
type: improvement
emoji: "🔄"
topics:
  - LLMS
  - CommandStack
  - AgentAPI
published: true
targetFiles:
  - packages/llms/src/usecase/execute_agent.rs
  - packages/llms/src/usecase/resume_agent.rs
  - packages/llms/src/usecase/command_stack/recursive.rs
  - packages/llms/src/adapter/axum/agent_handler.rs
github: https://github.com/quantum-box/tachyon-apps/tree/main/docs/src/tasks/improvement/agent-resume-support
---

# Agent API resume 実装

## 概要

Start Task API（`POST /v1/llms/chatrooms/{chatroom_id}/agent/execute`）に対して、既存メッセージがあるチャットルームで追加指示を送った場合に Resume 処理へ自動で切り替わるよう拡張する。これにより、初回実行後にユーザーが追記した指示を既存会話コンテキストへ蓄積しつつエージェント処理を再開できるようにする。

## 背景・目的

- 現状は `start_new_task` 相当の処理のみで、チャットメッセージが保存済みでも毎回 `<task>` から会話を作り直すため、エージェントがユーザーの追加指示を参照できない。
- 追加指示を送った際に、前回の応答や進捗を踏まえて再実行（Resume）する必要がある。
- Billing 周りの仕組みは既存の `ExecuteAgent` / `BillingAwareCommandStack` を流用したまま、Resume 時の会話やメッセージ保存ロジックを整備する。

期待成果:

- 既存チャット履歴がある場合は Resume モードでエージェントを再開し、ユーザーからの追記メッセージを履歴とリポジトリに保存した上で LLM に渡す。
- Start と Resume を同一 REST エンドポイントとユースケースで扱えるようにし、クライアント側の API 変更を発生させない。

## 詳細仕様

### 機能要件

1. `ExecuteAgent` ユースケースでチャットルームに紐づくメッセージを取得し、空でなければ Resume 処理へ切り替える。
2. Resume 時は既存メッセージ（System＋Assistant＋User）を `MessageCollection` へ復元し、追加指示を新たな User メッセージとして append する。
3. 追加指示の User メッセージを `ChatMessageRepository` に保存する（`<task>` タグは付与しない）。
4. CommandStack 生成時に Resume モード向けの `CommandStack::new` を使用し、`messages` を既存履歴＋追加指示で初期化する。
5. Billing 連携は既存フローを維持しつつ、Resume 時も `BillingAwareCommandStack` を利用する。

### ユーザーストーリー

- *Operator 管理者として*、初回タスクを実行後に追加の条件を伝えるため同じチャットルームへ追記を送ると、前回の結果を踏まえた再実行が行われ、履歴が一貫して残る。

### 受け入れ条件

- 既存メッセージが無いチャットルームでは従来通り `<task>` 付きで新規開始される。
- 既存メッセージがある場合は追加指示が User メッセージとして保存され、同じチャットルームの履歴とともに LLM へ渡される。
- Resume 実行後に `ChatMessageRepository` 上で追加指示が保存されていることを確認できる。
- 既存ユニットテスト＋新規テストが通過し、`mise run check` も成功する。

### 非機能要件

- 追加で取得するメッセージ数はチャットルーム単位の既存履歴のみ。大量履歴時も Mutex を長時間保持しないよう変換処理は前処理で完了させる。
- セキュリティ面は既存の認可ポリシー／課金チェックを流用するため変更不要。
- 保守性確保のため、ChatMessage -> Message 変換ロジックは専用ヘルパー関数として実装し単体テストを付与する。

### コンテキスト別の責務

```yaml
contexts:
  llms:
    description: "Agent API の Start/Resume 判定と CommandStack 制御"
    responsibilities:
      - chatroom メッセージ履歴の取得・復元
      - CommandStack の Start/Resume 切り替え
      - 追加指示メッセージの保存
  payment:
    description: "課金判定と課金実行"
    responsibilities:
      - 既存の見積・チェック・消費処理を利用（変更なし）
  catalog:
    description: "モデルごとの Product 紐付けと料金計算"
    responsibilities:
      - 既存の `get_product_id_for_model` / `calculate_service_cost` を利用
```

### 仕様のYAML定義

```yaml
resume_judgement:
  mode: auto
  trigger:
    - chatroom_messages_count > 0
  actions:
    start:
      description: "履歴が空の場合"
      message_template: "<task>{task}</task>"
    resume:
      description: "履歴が存在する場合"
      append_user_message: true
      persist_user_message: true
```

## 実装方針

### アーキテクチャ設計

- Clean Architecture 構成を維持し、ユースケース層（`ExecuteAgent`）で Start/Resume 判定と CommandStack インスタンス化を制御する。
- 変換ロジックはユースケース内のプライベート関数として実装し、テスト可能な形で切り出す。
- REST ハンドラ側の I/F は変更せず、ユースケース内部で自動判定を行う。

### 技術選定

- 既存の Rust + tokio + Mutex を継続使用。
- 変換処理は標準ライブラリのみで実装（新規依存追加なし）。

### TDD 戦略

- 追加テスト
  - ChatMessage -> Message 変換のユニットテスト
  - 履歴有り／無しそれぞれで Start/Resume を切り替えるユースケーステスト（Mock を活用）
- `mise run check` を実行し型・Lint を確認。
- 既存テストで回帰が無いことを確認。

## タスク分解

- ✅ 既存メッセージの復元ロジック調査 (2025-10-12)
- ✅ ChatMessage -> Message 変換ヘルパー実装 (2025-10-12)
- ✅ ExecuteAgent に Start/Resume 判定を追加 (2025-10-12)
- ✅ 追加テスト作成（履歴有/無）(2025-10-12)
- ✅ ドキュメント更新、本ファイルの進捗反映 (2025-10-12)

## テスト計画

- ユニットテスト: `cargo test -p llms -- execute_agent` 相当を新設/更新
- Lint: `mise run check`
- 手動確認: 可能であればローカルで REST を叩き履歴有り/無しパスを確認（時間次第）

## リスクと対策

- 大量履歴で Mutex 取得が遅延する → 変換はローカル変数に落としてから Mutex を構築。
- ToolCall などテキスト以外の Part が存在するケース → 未サポートの場合は警告ログを出しスキップ、テストで明示。
- Billing execution_id の扱い → 現段階は新規発行のままにし、将来的な要件に備えてタスクへ追記。

## スケジュール

- 2025-10-12 着手
- 2025-10-12 実装・テスト完了を目標

## 2025-10-19
- ✅ `cargo test -p llms execute_agent::tests::resume_existing_chatroom` など履歴有/無パターンのユニットテストを再実行、`mise run check` / `mise run ci-node` を完走。
- ✅ `POST /v1/llms/chatrooms/{chatroom_id}/agent/execute` をローカルで叩き、履歴無し→Start、履歴あり→Resume に自動切り替わることを確認。追加Userメッセージが `ChatMessageRepository` に保存されていることをDBで検証。
- ✅ task.md を更新し、残課題無しを明示。

## 完了条件

- [x] Start/Resume 自動切り替えが実装され、ユニットテストで検証済み。
- [x] `mise run check` が成功。
- [x] 追加指示がチャット履歴に保存されることを確認できる。
- [x] 本 taskdoc を最新状態に更新する。
