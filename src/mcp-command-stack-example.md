# MCP対応CommandStackの例

## ✅ DONE
- MCPハブを使用したCommandStackの例を追加
- CommandStackにMCPハブを渡せるように拡張
- システムプロンプト生成時にMCPハブを利用するよう修正

## 実装内容

### 1. MCPハブを使用したCommandStackの例
`packages/llms/examples/command_stack_mcp.rs`にMCPハブを使用したCommandStackの例を追加しました。この例では、以下の機能を実装しています：

- MCPハブの初期化と設定
- MCPサーバーへの接続
- 利用可能なMCPサーバーとツールの表示
- CommandStackにMCPハブを渡して対話を実行

```shell
cargo run -p llms --example command_stack_mcp
```

### 2. CommandStackの拡張
`packages/llms/src/usecase/command_stack/recursive.rs`のCommandStack構造体とメソッドを拡張し、MCPハブを扱えるようにしました：

- CommandStack構造体にMCPハブフィールドを追加
- `new`メソッドと`start_new_task`メソッドにMCPハブパラメータを追加
- システムプロンプト生成時にMCPハブを渡すよう修正

### 3. 使用例

```rust
// MCPハブを作成
let mcp_hub = McpHub::new(workspace_path, settings_path)?;

// MCPサーバーに接続
mcp_hub.connect_server("git-server").await?;

// MCPハブのクローンを作成
let mcp_hub_clone = mcp_hub.clone();

// CommandStackの作成（MCPハブを指定）
let command_stack = CommandStack::start_new_task(
    chat_stream_presenter,
    chat_message_repo,
    "GitリポジトリのステータスをチェックしてMCPを使って結果を表示してください。",
    false, // auto_approve
    5,     // max_requests
    ChatRoomId::default(),
    UserId::default(),
    None, // user_custom_instructions
    None, // assistant_name
    Some("MCPサーバーを使ってGitリポジトリの操作ができます。"), // additional_tool_description
    Some(mcp_hub_clone), // MCPハブを追加
);
```

## 今後の課題
- 実際のMCPサーバーとの統合テスト
- エラーハンドリングの強化
- より複雑なMCPツール呼び出しの例の追加
