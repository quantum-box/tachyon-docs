# command_stack を agents クレートへ移行（recursive_agent へリネーム）

## 概要

`packages/llms/src/usecase/command_stack/` のコア部分とステートレスな部分を `packages/agents/src/recursive_agent/` へ移行する。

## 背景・目的

### 現状の課題

1. **命名の問題**: `command_stack` という名前が実装詳細を表しており、目的（再帰的エージェントループ）が不明瞭
2. **責務の配置**: agents クレートがツール実行のみを担当し、エージェントループ本体が llms にある不自然な構成
3. **依存関係**: llms が巨大化し、コアロジックと永続化/課金が混在

### 目標

- agents クレートを「エージェント実行」の責務を持つクレートとして再定義
- ステートレスなコア部分を agents へ移動
- 課金/永続化依存の部分は llms に残す

## 実装結果

### ✅ Phase 1: ディレクトリ作成と純粋関数の移動

**作成されたディレクトリ構造:**
```
packages/agents/src/recursive_agent/
├── mod.rs            # モジュール定義とre-export
├── types.rs          # AgentChunk, MessageCollection, ToolCall等
├── parse_xml.rs      # XmlStreamParser, ToolCallEvent
├── messages_to_chunk.rs
└── tool_access.rs    # ToolAccessConfig
```

### ✅ Phase 2: MCPモジュールとsystem_promptの移動

**作成されたMCPモジュール:**
```
packages/agents/src/recursive_agent/mcp/
├── mod.rs
├── types.rs          # McpServer, McpServerConfig等
├── hub.rs            # McpHub
└── cache.rs          # HubAcquisition
```

**作成されたファイル:**
```
packages/agents/src/recursive_agent/system_prompt.rs
```

### ⏸️ Phase 3-4: tool_executor/core agentの移動（スキップ）

以下のファイルはllms固有の依存のため移動できませんでした：

| ファイル | 移動不可の理由 |
|---------|---------------|
| `tool_executor.rs` | `CreateToolJob`, `GetToolJob`, `CancelToolJob` usecase依存 |
| `chat_stream.rs` | tool_executorとllms usecase依存 |
| `recursive.rs` | `ChatMessageRepository`, `ChatRoomId` (llms_domain)依存 |
| `billing_aware.rs` | `PaymentApp`, `CatalogApp` 依存 |

### ✅ Phase 5: llmsからの再エクスポート設定

**llms/src/usecase/command_stack/mod.rs の更新:**
```rust
// Re-export from agents crate for backwards compatibility
pub mod mcp {
    pub use agents::recursive_agent::mcp::*;
}

pub mod messages_to_chunk {
    pub use agents::recursive_agent::messages_to_chunk::*;
}

pub mod parse_xml_streaming {
    pub use agents::recursive_agent::parse_xml::*;
}

pub mod system_prompt {
    pub use agents::recursive_agent::system_prompt::*;
}

pub mod tool_access {
    pub use agents::recursive_agent::tool_access::*;
}

pub mod types {
    pub use agents::recursive_agent::types::*;
}
```

### ✅ Phase 6: クリーンアップ

- llmsから移動済みの古いファイルを削除
- Cargo.toml依存関係の更新
- コンパイル確認

## 技術的変更

### Cargo.toml の変更

**packages/agents/Cargo.toml:**
```toml
# For recursive_agent module
llms_domain = { path = "../llms/domain", default-features = false }
tokio-stream = { workspace = true }
async-stream = "0.3"
regex = { workspace = true }
walkdir = "2.5"
rmcp = { ..., optional = true }
once_cell = { workspace = true }
tower = { workspace = true, optional = true }
anyhow = { workspace = true }
reqwest = { workspace = true, optional = true }
sha2 = { workspace = true, optional = true }

[features]
mcp = ["rmcp", "tower", "reqwest", "sha2"]
```

**packages/llms/Cargo.toml:**
```toml
agents = { path = "../agents", features = ["axum", "claude", "mcp"] }
```

**Cargo.toml (workspace):**
```toml
sha2 = "0.10"  # 新規追加
```

## 移動したファイル一覧

| 移動元 (llms) | 移動先 (agents) |
|--------------|----------------|
| `types.rs` | `recursive_agent/types.rs` |
| `parse_xml_streaming.rs` | `recursive_agent/parse_xml.rs` |
| `messages_to_chunk.rs` | `recursive_agent/messages_to_chunk.rs` |
| `tool_access.rs` | `recursive_agent/tool_access.rs` |
| `mcp/types.rs` | `recursive_agent/mcp/types.rs` |
| `mcp/hub.rs` | `recursive_agent/mcp/hub.rs` |
| `mcp/cache.rs` | `recursive_agent/mcp/cache.rs` |
| `system_prompt.rs` | `recursive_agent/system_prompt.rs` |

## 残りの課題（将来のタスク）

1. **CommandStack → RecursiveAgent リネーム**: core agentがllmsに残っているためリネームは未実施
2. **tool_executorの抽象化**: usecaseへの依存をtrait化すれば移動可能
3. **llms_domainとの依存整理**: ChatMessageRepository等の抽象化

## 完了条件

- [x] `packages/agents/src/recursive_agent/` にステートレス機能が移動
- [x] MCPモジュールがagentsに移動
- [x] system_promptがagentsに移動
- [x] llmsからの再エクスポート設定
- [x] `mise run docker-check` 通過
- [x] `mise run docker-fmt` 通過（フォーマット適用済み）
- [x] 古いファイルの削除

## 進捗

### 2025-01-06
- [x] taskdoc 作成
- [x] Phase 1: 純粋関数の移動完了
- [x] Phase 2: MCP/system_prompt移動完了
- [x] Phase 3-4: 依存関係の制約により一部スキップ
- [x] Phase 5: 再エクスポート設定完了
- [x] Phase 6: クリーンアップ完了
- [x] フォーマット修正適用

## ステータス

✅ **完了** - command_stack のステートレス部分を agents クレートの recursive_agent モジュールへ移行しました。
