# agents クレート廃止・llms への統合

## 概要

`packages/agents` クレートを廃止し、`packages/llms/src/agent/` に統合する。

## 背景

### 現状の構成

```
packages/agents/src/
├── recursive_agent/       # ステートレスな純粋関数
│   ├── mcp/
│   ├── types.rs
│   ├── parse_xml.rs
│   ├── messages_to_chunk.rs
│   ├── tool_access.rs
│   └── system_prompt.rs
├── usecase/               # Tool Job usecase
├── adapter/axum/          # Tool Job REST API
├── manager.rs             # ToolJobManager
├── job.rs                 # ToolJob型
├── runner.rs              # ToolRunner trait
├── claude_runner.rs
├── codex_runner.rs
└── cursor_agent_runner.rs

packages/llms/src/agent/   # 旧 command_stack（Phase 1で移動済み）
├── mod.rs                 # agents::recursive_agent を再エクスポート
├── recursive.rs
├── chat_stream.rs
├── tool_executor.rs
├── billing_aware.rs
└── billing_aware_test.rs
```

### 依存関係

```
llms → agents → llms_domain
```

llms と agents が相互に依存に近い状態。agents を llms に統合することで依存をシンプルにする。

## 実装計画

### Phase 1: command_stack → agent リネーム ✅

- [x] `llms/src/usecase/command_stack/` → `llms/src/agent/` 移動
- [x] インポートパス更新
- [x] `mise run docker-check` 通過

### Phase 2: recursive_agent を llms/src/agent に統合

現在 `llms/src/agent/mod.rs` は `agents::recursive_agent` を再エクスポートしている。
これを直接のモジュールに置き換える。

**移動対象:**
```
packages/agents/src/recursive_agent/
├── mcp/              → packages/llms/src/agent/mcp/
├── types.rs          → packages/llms/src/agent/types.rs（既存と統合）
├── parse_xml.rs      → packages/llms/src/agent/parse_xml.rs
├── messages_to_chunk.rs → packages/llms/src/agent/messages_to_chunk.rs
├── tool_access.rs    → packages/llms/src/agent/tool_access.rs（既存と統合）
└── system_prompt.rs  → packages/llms/src/agent/system_prompt.rs
```

### Phase 3: Tool Job 関連を llms に移動

**移動対象:**
```
packages/agents/src/
├── usecase/          → packages/llms/src/agent/tool_job/usecase/
├── adapter/axum/     → packages/llms/src/agent/tool_job/adapter/
├── manager.rs        → packages/llms/src/agent/tool_job/manager.rs
├── job.rs            → packages/llms/src/agent/tool_job/job.rs
├── runner.rs         → packages/llms/src/agent/tool_job/runner.rs
├── storage.rs        → packages/llms/src/agent/tool_job/storage.rs
├── claude_runner.rs  → packages/llms/src/agent/tool_job/runners/claude.rs
├── codex_runner.rs   → packages/llms/src/agent/tool_job/runners/codex.rs
└── cursor_agent_runner.rs → packages/llms/src/agent/tool_job/runners/cursor_agent.rs
```

### Phase 4: agents クレート削除

- Cargo.toml から `agents` 依存を削除
- ワークスペースメンバーから削除
- `packages/agents/` ディレクトリ削除

### Phase 5: クリーンアップ

- インポートパス更新
- `mise run docker-check` 通過
- `mise run docker-ci` 通過

## 最終的な構成

```
packages/llms/src/agent/
├── mod.rs
│
├── # Core Agent Loop（旧 recursive_agent）
├── types.rs
├── parse_xml.rs
├── messages_to_chunk.rs
├── tool_access.rs
├── system_prompt.rs
├── mcp/
│   ├── mod.rs
│   ├── types.rs
│   ├── hub.rs
│   └── cache.rs
│
├── # Agent Execution（旧 command_stack）
├── recursive.rs
├── chat_stream.rs
├── tool_executor.rs
├── billing_aware.rs
│
└── # Tool Job Management（旧 agents クレート）
    tool_job/
    ├── mod.rs
    ├── job.rs
    ├── manager.rs
    ├── storage.rs
    ├── runner.rs
    ├── runners/
    │   ├── mod.rs
    │   ├── codex.rs
    │   ├── claude.rs
    │   └── cursor_agent.rs
    ├── usecase/
    │   ├── mod.rs
    │   ├── create.rs
    │   ├── get.rs
    │   ├── cancel.rs
    │   └── list.rs
    └── adapter/
        └── axum/
```

## 完了条件

- [x] Phase 1: command_stack → agent リネーム
- [x] Phase 2: recursive_agent 統合
- [x] Phase 3: Tool Job 移動
- [x] Phase 4: agents クレート削除
- [x] Phase 5: docker-check / docker-ci 通過

## 進捗

### 2025-01-08
- [x] Phase 1 完了
- [x] Phase 2 完了: recursive_agent のモジュール（mcp/, parse_xml.rs, messages_to_chunk.rs, system_prompt.rs, types.rs, tool_access.rs）を llms/src/agent/ に統合
- [x] Phase 3 完了: Tool Job 関連ファイルを llms/src/agent/tool_job/ に移動
  - llms/src/usecase/ にある tool_job usecase は維持（これらは auth 統合済み）
  - agent/tool_job/adapter は削除（llms/src/adapter/axum/tool_job_*.rs を使用）
- [x] Phase 4 完了: agents クレートを Cargo.toml から削除、packages/agents ディレクトリ削除
- [x] Phase 5 完了: docker-check, docker-ci（Rust CI）通過
  - Node.js CI で agent-app のエラーが出るが、これは今回の作業とは無関係（既存の問題）

## 実装ノート

### ディレクトリ構成

最終的な構成:
```
packages/llms/src/agent/
├── mod.rs
├── types.rs
├── parse_xml.rs
├── messages_to_chunk.rs
├── tool_access.rs
├── system_prompt.rs
├── mcp/
│   ├── mod.rs
│   ├── types.rs
│   ├── hub.rs
│   └── cache.rs
├── recursive.rs
├── chat_stream.rs
├── tool_executor.rs
├── billing_aware.rs
├── billing_aware_test.rs
└── tool_job/
    ├── mod.rs
    ├── job.rs
    ├── manager.rs
    ├── storage.rs
    ├── runner.rs
    └── runners/
        ├── mod.rs
        ├── codex.rs (worker feature)
        ├── claude.rs (worker feature)
        └── cursor_agent.rs
```

### 重要な変更点

1. `codex-provider` と `claude-code` は `worker` feature でのみ有効
2. `default_runner_registry()` は feature flag で分岐
3. tool_job usecase は llms/src/usecase/ のものを使用（auth 統合済み）
4. tool_job adapter は llms/src/adapter/axum/ のものを使用

## ステータス

✅ **完了**
