# テストケース詳細

`MessageCollection::new_from_chunks()` の整合性を検証するテストケースの一覧です。

---

## 1. test_new_from_chunks_tool_call_uses_tool_calls_field

### 概要
ToolCallチャンクが構造化された `tool_calls` フィールドに格納されることを検証。

### 入力チャンク

```json
[
  {
    "type": "ToolCall",
    "tool_id": "call_123",
    "tool_name": "get_weather"
  },
  {
    "type": "ToolCallArgs",
    "tool_id": "call_123",
    "args_chunk": "{\"city\": \"Tokyo\"}"
  },
  {
    "type": "ToolResult",
    "tool_id": "call_123",
    "result": "Sunny, 25°C"
  }
]
```

### 期待される出力メッセージ

| # | Role | Content | tool_calls |
|---|------|---------|------------|
| 1 | Assistant | (empty) | `[{id: "call_123", name: "get_weather", arguments: "{\"city\": \"Tokyo\"}"}]` |
| 2 | User | `[get_weather] Result:\nSunny, 25°C` | None |

### 検証ポイント
- ✅ `tool_calls` が `Some` で構造化データを保持
- ✅ XML文字列（`<tool_call>...</tool_call>`）が生成されない
- ✅ ToolResultのユーザーメッセージにツール名が含まれる

---

## 2. test_new_from_chunks_tool_result_preserves_structure

### 概要
ToolResultが適切なフォーマットで保存されることを検証。

### 入力チャンク

```json
[
  {
    "type": "ToolCall",
    "tool_id": "call_456",
    "tool_name": "search_files"
  },
  {
    "type": "ToolCallArgs",
    "tool_id": "call_456",
    "args_chunk": "{\"pattern\": \"*.rs\"}"
  },
  {
    "type": "ToolResult",
    "tool_id": "call_456",
    "result": "Found 10 files"
  }
]
```

### 期待される出力メッセージ

| # | Role | Content | tool_calls |
|---|------|---------|------------|
| 1 | Assistant | (empty) | `[{id: "call_456", name: "search_files", arguments: "{\"pattern\": \"*.rs\"}"}]` |
| 2 | User | `[search_files] Result:\nFound 10 files` | None |

### 検証ポイント
- ✅ ToolResult が `[tool_name] Result:` フォーマット
- ✅ ツール名がToolCallからToolResultへ正しく引き継がれる

---

## 3. test_new_from_chunks_basic

### 概要
基本的なSayチャンクの処理を検証。

### 入力チャンク

```json
[
  {
    "type": "Say",
    "content": "Hello, "
  },
  {
    "type": "Say",
    "content": "world!"
  }
]
```

### 期待される出力メッセージ

| # | Role | Content | tool_calls |
|---|------|---------|------------|
| 1 | Assistant | `Hello, world!` | None |

### 検証ポイント
- ✅ 複数のSayチャンクが1つのアシスタントメッセージに結合
- ✅ `tool_calls` は None

---

## 4. test_new_from_chunks_thinking

### 概要
Thinkingチャンクの処理を検証。

### 入力チャンク

```json
[
  {
    "type": "Thinking",
    "content": "Let me analyze this..."
  },
  {
    "type": "Say",
    "content": "Here's my answer."
  }
]
```

### 期待される出力メッセージ

| # | Role | Content | tool_calls |
|---|------|---------|------------|
| 1 | Assistant | `<thinking>Let me analyze this...</thinking>\nHere's my answer.` | None |

### 検証ポイント
- ✅ Thinkingが `<thinking>` タグで囲まれる
- ✅ Sayコンテンツと適切に結合される

---

## 5. test_new_from_chunks_multiple_tool_calls

### 概要
複数のToolCallを含むシーケンスの処理を検証。

### 入力チャンク

```json
[
  {
    "type": "ToolCall",
    "tool_id": "call_1",
    "tool_name": "read_file"
  },
  {
    "type": "ToolCallArgs",
    "tool_id": "call_1",
    "args_chunk": "{\"path\": \"main.rs\"}"
  },
  {
    "type": "ToolResult",
    "tool_id": "call_1",
    "result": "fn main() {}"
  },
  {
    "type": "ToolCall",
    "tool_id": "call_2",
    "tool_name": "write_file"
  },
  {
    "type": "ToolCallArgs",
    "tool_id": "call_2",
    "args_chunk": "{\"path\": \"out.rs\"}"
  },
  {
    "type": "ToolResult",
    "tool_id": "call_2",
    "result": "File written"
  }
]
```

### 期待される出力メッセージ

| # | Role | Content | tool_calls |
|---|------|---------|------------|
| 1 | Assistant | (empty) | `[{id: "call_1", name: "read_file", arguments: "{\"path\": \"main.rs\"}"}]` |
| 2 | User | `[read_file] Result:\nfn main() {}` | None |
| 3 | Assistant | (empty) | `[{id: "call_2", name: "write_file", arguments: "{\"path\": \"out.rs\"}"}]` |
| 4 | User | `[write_file] Result:\nFile written` | None |

### 検証ポイント
- ✅ 各ToolCallが個別のアシスタントメッセージ
- ✅ 各ToolResultが個別のユーザーメッセージ
- ✅ 順序が保持される

---

## 6. test_new_from_chunks_ask

### 概要
Askチャンク（ユーザーへの質問）の処理を検証。

### 入力チャンク

```json
[
  {
    "type": "Ask",
    "question": "Should I proceed with the changes?"
  }
]
```

### 期待される出力メッセージ

| # | Role | Content | tool_calls |
|---|------|---------|------------|
| 1 | Assistant | `<ask>Should I proceed with the changes?</ask>` | None |

### 検証ポイント
- ✅ Askが `<ask>` タグで囲まれる
- ✅ 単独のアシスタントメッセージとして出力

---

## 7. test_new_from_chunks_attempt_completion

### 概要
AttemptCompletionチャンク（タスク完了試行）の処理を検証。

### 入力チャンク

```json
[
  {
    "type": "AttemptCompletion",
    "result": "Task completed successfully",
    "command": null
  }
]
```

### 期待される出力メッセージ

| # | Role | Content | tool_calls |
|---|------|---------|------------|
| 1 | Assistant | `<attempt_completion>\n<result>Task completed successfully</result>\n</attempt_completion>` | None |

### 検証ポイント
- ✅ AttemptCompletionが適切なXML形式で出力
- ✅ resultタグ内に完了メッセージが含まれる

---

## 修正前後の比較

### 修正前（XML文字列形式）

```rust
// ToolCallの処理（旧実装）
AgentChunk::ToolCall(tool_call) => {
    // XML文字列を生成していた
    let xml = format!("<tool_call id=\"{}\" name=\"{}\">",
        tool_call.tool_id, tool_call.tool_name);
    assistant_content.push_str(&xml);
}
```

**問題点**: SSEレスポンスでは構造化されたToolCallが送信されるが、historyにはXML文字列が保存される不整合。

### 修正後（構造化データ形式）

```rust
// ToolCallの処理（新実装）
AgentChunk::ToolCall(tool_call) => {
    current_tool_id = tool_call.tool_id.clone();
    current_tool_name = tool_call.tool_name.clone();
    // ツール名をマッピングに保存
    tool_id_to_name.insert(tool_call.tool_id, tool_call.tool_name);
}

AgentChunk::ToolCallArgs(args) => {
    if args.tool_id == current_tool_id {
        current_tool_calls.push(MessageToolCall {
            id: current_tool_id.clone(),
            name: current_tool_name.clone(),
            arguments: args.args_chunk.clone(),
        });
        // MessageにToolCallを構造化データとして格納
        messages.push(Message::assistant_with_tool_calls(current_tool_calls.clone()));
    }
}
```

**改善点**:
- `Message.tool_calls` フィールドに構造化データとして保存
- SSEレスポンスとhistoryの形式が一致
- XML文字列がhistoryに混入しない

---

---

## messages_to_chunks のテストケース（get_agent_history用）

### 8. test_messages_to_chunks_with_part_tool_call

#### 概要
`Part::ToolCall` として保存された `ChatMessage` が正しく `AgentChunk` に変換されることを検証。

#### 入力 (ChatMessage)

```rust
ChatMessage::new_tool_call(
    &MessageId::default(),
    &created_at,
    owner,
    &Role::Assistant,
    "call_123",      // tool_call_id
    "get_weather",   // tool_name
    &json!({"city": "Tokyo"}),  // args
    &chatroom_id,
)
```

#### 期待される出力

| # | Chunk Type | tool_id | tool_name | args |
|---|------------|---------|-----------|------|
| 1 | ToolCall | `call_123` | `get_weather` | - |
| 2 | ToolCallArgs | `call_123` | - | `{"city": "Tokyo"}` |

#### 検証ポイント
- ✅ `Part::ToolCall` が `AgentChunk::ToolCall` + `ToolCallArgs` に変換される
- ✅ tool_call_id と tool_name が正しく引き継がれる

---

### 9. test_messages_to_chunks_with_part_tool_result

#### 概要
`Part::ToolResult` として保存された `ChatMessage` が正しく `AgentChunk` に変換されることを検証。

#### 入力 (ChatMessage)

```rust
ChatMessage::new_tool_result(
    &MessageId::default(),
    &created_at,
    owner,
    &Role::User,
    "call_123",      // tool_call_id
    "get_weather",   // tool_name
    "Sunny, 25°C",   // result
    &chatroom_id,
)
```

#### 期待される出力

| # | Chunk Type | tool_id | result |
|---|------------|---------|--------|
| 1 | ToolResult | `call_123:get_weather` | `Sunny, 25°C` |

#### 検証ポイント
- ✅ `Part::ToolResult` が `AgentChunk::ToolResult` に変換される
- ✅ tool_id に `tool_call_id:tool_name` のフォーマットが使用される

---

### 10. test_messages_to_chunks_tool_call_round_trip

#### 概要
ToolCallの保存→取得のラウンドトリップを検証。execute_agentで保存されたデータがget_agent_historyで正しく取得できることを確認。

#### 入力 (ChatMessage列)

```rust
[
    ChatMessage::new_text(..., "What's the weather in Tokyo?", ...),
    ChatMessage::new_tool_call(..., "call_456", "get_weather", {"city": "Tokyo"}, ...),
    ChatMessage::new_tool_result(..., "call_456", "get_weather", "Sunny, 25°C", ...),
]
```

#### 期待される出力

| # | Chunk Type | 内容 |
|---|------------|------|
| 1 | User | `What's the weather in Tokyo?` |
| 2 | ToolCall | `tool_id: "call_456", tool_name: "get_weather"` |
| 3 | ToolCallArgs | `{"city": "Tokyo"}` |
| 4 | ToolResult | `tool_id: "call_456:get_weather", result: "Sunny, 25°C"` |

#### 検証ポイント
- ✅ ユーザーメッセージ、ToolCall、ToolResultが正しい順序で変換される
- ✅ execute_agent → DB保存 → get_agent_history のフローが整合する

---

### 11. test_messages_to_chunks_with_tool_name_in_result

#### 概要
新フォーマット `[tool_name] Result:` のテキストが正しくパースされることを検証。

#### 入力 (ChatMessage)

```rust
ChatMessage::new_text(
    ...,
    "[get_weather] Result:\nSunny, 25°C",
    ...
)
```

#### 期待される出力

| # | Chunk Type | tool_id | result |
|---|------------|---------|--------|
| 1 | ToolResult | `get_weather` | `Sunny, 25°C` |

#### 検証ポイント
- ✅ `[tool_name]` からツール名が抽出される
- ✅ 結果テキストが正しく抽出される

---

## テスト実行コマンド

```bash
# Docker内でユニットテストを実行
mise run docker-ci-rust

# llmsパッケージのみテスト（ローカル）
cargo test -p llms --lib -- messages_to_chunk::tests
cargo test -p llms --lib -- types::tests

# シナリオテスト
mise run docker-scenario-test
```
