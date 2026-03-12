---
title: "AgentProtocolをToolCall経由で適用する"
type: feature
emoji: "🛠️"
topics:
  - AgentProtocol
  - LLMs
  - Tooling
published: true
targetFiles:
  - packages/llms/src/usecase/command_stack
  - packages/llms/src/adapter/axum/agent_handler.rs
  - apps/tachyon/src/hooks/useAgentStream.ts
github: https://github.com/quantum-box/tachyon-apps/tree/main
---

# AgentProtocolをToolCall経由で適用する

## 概要

AgentProtocol の内容をシステムプロンプトに直接注入する方式を廃止し、他ツールと同じ `ToolCall` フローで取得・適用できるようにする。あわせて `ToolAccessConfig` に AgentProtocol のON/OFFを追加し、タスク開始時には `agent_protocol` ツールの結果が履歴に保存される構造へ刷新する。

## 背景・目的

- 現状は AgentProtocol のMarkdownを実行前にプロンプトへ挿入しており、フロントから見ると「ツール利用」として観測できない。
- ToolCallベースに統一することで、UI上のタイムラインに AgentProtocol が1つのステップとして表示され、再開時もログが残る。
- ToolAccessConfig で他ツールと同じように制御できるため、利用可否を明示できる。

## 詳細仕様

### 機能要件

1. `agent_protocol` というToolCallを追加し、手動指定/自動選択いずれの場合もこのツールが最初に呼び出される。
2. ツール結果には `title/description/markdown/match_reason/match_score/match_mode` を含める。
3. `ToolAccessConfig`/`AgentToolAccessRequest` へ `agent_protocol` フラグを追加し、falseならツールを利用しない。
4. 旧 `agent_protocol` SSE イベントやプロンプト直接注入の処理を削除する。
5. Taskdoc更新と変更仕様の追記、必要に応じて `docs/src/tasks/feature/auto-agent-protocol-selection/task.md` の参照箇所も加筆。

### 非機能要件

- 既存APIレスポンス（AgentChunk）との互換性を保つ（ToolCall/ToolResultとして既に解釈可能）。
- 追加ツールでも既存レート制限・課金計算へ影響させない（テキスト出力のみ）。
- 再開時（Resume）でも AgentProtocol が再評価されないように履歴へ保存されたツール結果を利用。

### コンテキスト別の責務

```yaml
contexts:
  llms:
    responsibilities:
      - AgentProtocol取得/自動選択の結果をToolCallに変換
      - ToolAccessConfigへagent_protocol設定を追加
      - SSEストリームから旧イベントを排除
  frontend:
    responsibilities:
      - ToolCallログをそのまま可視化（追加UI調整が必要ならtask内で追記）
  docs:
    responsibilities:
      - taskdoc更新と関連ドキュメントの反映
```

### 仕様のYAML定義

```yaml
tool_access:
  filesystem: bool
  command: bool
  create_tool_job: bool
  agent_protocol: bool # default true

agent_protocol_tool_call:
  name: agent_protocol
  mode: auto | manual
  protocol_id: string?
  output:
    protocol_id: string
    title: string
    description: string?
    markdown: string
    match_mode: auto | manual
    match_score: float?
    match_reason: string?
```

## タスク分解

1. ✅ taskdoc作成（本ドキュメント）
2. ✅ `ToolAccessConfig` 拡張＆API層の受け渡し
3. ✅ AgentProtocol取得処理をツール呼び出しへリファクタ
4. ✅ 旧プロンプト注入/専用SSEイベント削除
5. 🔄 テスト・ドキュメント更新（必要に応じてシナリオテスト/フロント調整）

## テスト計画

- `packages/llms` ユニットテスト：`execute_agent`・`match_agent_protocol`・コマンドスタック周辺。
- E2E: `useAgentStream` のSSE受信処理で ToolCall を受け取れることを確認（必要ならStory/Mock更新）。
- `mise run tachyon-api-scenario-test`（AgentProtocol CRUDや将来追加するシナリオに影響しないことを目視）。

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| ToolCallに変換する途中で再開時の履歴整合性が乱れる | 中 | 履歴処理 (`MessageCollection`) を確認してから実装、必要なら追加テスト |
| フロントが `agent_protocol` ToolCall に未対応 | 低 | 既存AgentToolCallコンポーネントで表示可能だが、必要に応じてUI改善を別タスク化 |

## 完了条件

- [x] `agent_protocol` ToolCallが導入され、SSEイベントはToolCall/ToolResultのみになる
- [x] ToolAccessConfig経由で有効/無効を制御できる
- [x] プロンプト直接注入のコードが削除されている
- [x] テスト・lintが通過している
- [x] taskdoc・関連ドキュメントが更新済み

## 完了日

2025-12-XX

## 関連ドキュメント

- 仕様ドキュメント: `docs/src/tachyon-apps/llms/agent-api/agent-protocol-tool-call.md`
