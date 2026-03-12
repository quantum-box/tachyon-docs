---
title: "Agent API向けMock LLM Provider整備とAPIテスト追加"
type: "tech"
emoji: "🧪"
topics:
  - llms
  - testing
  - agent-api
published: true
targetFiles:
  - packages/providers/llms_provider/src/tests.rs
  - packages/llms/src/usecase/execute_agent.rs
  - packages/llms/src/usecase/get_agent_history.rs
  - packages/llms/tests/
github: https://github.com/quantum-box/tachyon-apps
---

# Agent API向けMock LLM Provider整備とAPIテスト追加

## 概要

Agent API / Agent History API を安全かつ決定論的に検証するためのモックLLMプロバイダーを整備し、ユースケースレベルのテストを追加する。

## 背景・目的

- 既存テストは実プロバイダーへの依存が残り、安定したCI運用が難しい。
- Agent API は課金・履歴保存へ影響するため、自動テストによる退行検知が不可欠。
- モックプロバイダーを用いた決定論的テストにより、外部サービスへ依存せずに挙動を保証できる。
- 成果: エージェント周辺ユースケースのカバレッジ向上と保守性向上。

## 詳細仕様

### 機能要件

1. `llms_provider::tests` に事前定義チャンクを返却するモックストリームプロバイダーを追加する。
2. ExecuteAgent ユースケースに対してモックを利用したテストケースを新設する。
3. GetAgentHistory ユースケースに対してモックリポジトリ＋モック認可での動作確認テストを追加する。
4. 上記テストは外部APIキー・ネットワーク通信を必要としないこと。

受け入れ条件:
- モックストリームから `AgentChunk::Say` と `AgentChunk::Usage` を検証できる。
- 履歴取得で `AgentChunk::User` / `AgentChunk::Say` 変換が確認できる。
- `cargo test -p llms -- execute_agent` / `-- get_agent_history` が成功する。

### 非機能要件

- **パフォーマンス**: テスト追加による所要時間増は 1 秒未満を目標。
- **セキュリティ**: テストで機密情報を利用しない。
- **保守性**: モックは再利用しやすいAPIにまとめ、将来のテスト拡張を容易にする。

### コンテキスト別の責務

- **providers/llms_provider**: モックストリームプロバイダー実装。
- **llms/usecase**: ExecuteAgent・GetAgentHistory テスト整備。
- **docs**: タスク管理ドキュメント更新。

### 仕様のYAML定義

```yaml
mock_stream_script:
  provider: "openai"
  chunks:
    - type: text
      payload: "Hello from mock provider"
    - type: usage
      prompt_tokens: 10
      completion_tokens: 20
      total_tokens: 30

auth_stub:
  behavior: allow_all
  fallback: not_implemented

catalog_stub:
  product_id: "pd_mock_agent"
  total_nanodollars: 0
```

## タスク分解

### フェーズ1: モックプロバイダー実装 📝
- [ ] `ScriptedChatStreamProvider` を `llms_provider::tests` に追加
- [ ] 任意チャンク列を返せるAPIを整備

### フェーズ2: ExecuteAgentテスト追加 📝
- [ ] モックプロバイダー／NoOp課金・カタログスタブを用意
- [ ] AgentChunkの `say`・`usage` を検証

### フェーズ3: Agent Historyテスト追加 📝
- [ ] 認可スタブ `AllowAllAuthApp` を整備
- [ ] モックリポジトリに履歴を投入し期待チャンクを検証

### フェーズ4: ドキュメント更新 🔄
- [ ] taskdoc と verification-report を更新

## テスト計画

- `cargo test -p llms -- execute_agent` を実行しモックストリーム経由の挙動を検証。
- `cargo test -p llms -- get_agent_history` を実行し履歴変換を検証。
- 余裕があれば `cargo test -p llms` で全体を通し確認。

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| モックが実装との差異を吸収しきれない | 中 | 代表的なシナリオに絞り、必要に応じてシナリオ追加で拡張 |
| モック認可の未実装メソッドが予期せず呼ばれる | 低 | `not_implemented` で早期に失敗させ追跡しやすくする |
| テスト増加によるCI時間の悪化 | 低 | インメモリ処理のみとし負荷を最小化 |

## 参考資料

- `packages/llms/src/usecase/command_stack/chat_stream.rs`
- `packages/llms/src/usecase/command_stack/messages_to_chunk.rs`
- `docs/src/tachyon-apps/llms/event-bus-architecture.md`

## 完了条件

- [ ] モックプロバイダーを用いた新規テストが追加される
- [ ] ExecuteAgent / GetAgentHistory のユースケーステストが成功する
- [ ] 外部サービスに依存せずテストが完結する
- [ ] taskdoc・verification-report が更新される

## 備考

- 将来的に `agent_handler` ルーティングのE2Eテストを別タスクで検討。
