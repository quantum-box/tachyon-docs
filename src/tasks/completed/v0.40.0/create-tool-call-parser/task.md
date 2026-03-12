# Tool Call Parser実装タスク

**作成日**: 2026-01-31
**ステータス**: ✅ Completed
**優先度**: High
**担当**: Claude Agent

## 概要

現在、Agent APIのloop処理はXML形式のパース（`XmlStreamParser`）に依存しているが、これをJSON形式のtool call（OpenAI/Anthropic API標準形式）でも処理できるようにする。

## 背景

### 現在の実装（XML方式）

**ファイル**: `packages/llms/src/agent/parse_xml.rs`

- `XmlStreamParser`がLLMのストリーミングレスポンスから以下のXMLタグをパース:
  ```xml
  <tool_name>read_file</tool_name>
  <parameter>{"path": "/home/user/file.txt"}</parameter>
  ```

- パース結果を`ToolCallEvent`に変換:
  ```rust
  pub enum ToolCallEvent {
      Text(String),
      ToolStart { id: String, name: String },
      Parameter { id: String, arguments: serde_json::Value },
      ToolEnd { id: String },
      Thinking { text: String, is_finished: bool },
  }
  ```

- `RecursiveAgent`（`packages/llms/src/agent/recursive.rs`）がこのイベントストリームを処理してloopを回す

### 目標（Tool Call方式）

LLMレスポンスがJSON形式のtool callを含む場合にも対応する:

```json
{
  "choices": [{
    "message": {
      "tool_calls": [{
        "id": "call_abc123",
        "type": "function",
        "function": {
          "name": "read_file",
          "arguments": "{\"path\": \"/home/user/file.txt\"}"
        }
      }]
    }
  }]
}
```

あるいはAnthropicの形式:

```json
{
  "content": [{
    "type": "tool_use",
    "id": "toolu_abc123",
    "name": "read_file",
    "input": {
      "path": "/home/user/file.txt"
    }
  }]
}
```

## 要件

### 機能要件

1. **新しいパーサーの実装**
   - `ToolCallEventParser`トレイトを実装した`JsonToolCallEventParser`を作成
   - JSON形式のtool callを`ToolCallEvent`ストリームに変換
   - ストリーミング対応（チャンクごとに処理）

2. **複数フォーマット対応**
   - OpenAI形式のtool call
   - Anthropic形式のtool use
   - 将来的に他のプロバイダー形式も追加可能な設計

3. **既存コードとの互換性**
   - `XmlToolCallEventParser`と並行して使用可能
   - `RecursiveAgent`は変更不要（`ToolCallEventParser`トレイトを使用しているため）

4. **エラーハンドリング**
   - 不正なJSON形式の検出
   - パース失敗時の適切なエラーメッセージ

### 非機能要件

1. **パフォーマンス**
   - ストリーミング処理で低遅延を実現
   - 大きなargumentsでもメモリ効率的に処理

2. **保守性**
   - 各プロバイダー形式ごとにモジュール分割
   - テストコード充実

3. **拡張性**
   - 新しいtool call形式の追加が容易
   - カスタムフィールドのサポート

## 実装計画

### Phase 1: ChatStreamChunkにToolCallバリアント追加 ✅

- [x] `ChatStreamChunk::ToolCall` バリアントを追加（id, name, arguments）
- [x] `ChatStreamChunk::Thinking` バリアントを追加（thinking content用）
- [x] 全プロバイダーの既存matchパターンを更新（ワイルドカード追加）
- [x] chat_stream.rsのフィルタロジックを更新

### Phase 2: JsonToolCallEventParser 実装 ✅

- [x] `packages/llms/src/agent/parse_tool_call.rs` を作成
- [x] `JsonToolCallEventParser` 構造体を定義
- [x] `ToolCallEventParser` トレイトを実装（text passthrough）
- [x] `ChunkConverter` ストリームアダプター実装
- [x] ToolCallチャンク → ToolStart/Parameter/ToolEnd 変換

### Phase 3: プロバイダー統合 ✅

- [x] OpenAIプロバイダーでtool_callsデルタの段階的蓄積（`ToolCallAccumulator`）
- [x] `AttemptApiRequest::with_json_tool_calls()` でパーサー切り替え
- [x] chat_stream.rsで XML/JSON 両経路の分岐処理
- [ ] Anthropicプロバイダーのtool_use処理をToolCallチャンク経由に変更（将来対応）
- [ ] モデル設定から自動でパーサー選択（将来対応）

### Phase 4: テスト ✅

- [x] JsonToolCallEventParser単体テスト（6件）
- [x] OpenAI ToolCallAccumulator ユニットテスト（3件）
- [x] chat_stream.rs JSON tool callモード統合テスト
- [x] 全21テスト通過確認

### Phase 5: JSON Mode System Prompt + Tool Definitions ✅ (2026-02-09)

- [x] `tool_definitions.rs` 作成 — ToolAccessConfig → Vec<Tool> JSON Schema 変換（全19ツール対応、7テスト）
- [x] `system_prompt.rs` に `json_mode_system_prompt()` 追加 — XML tool定義を除いた簡潔版
- [x] `chat_stream.rs` に `use_json_tool_calls` フィールド追加、`with_json_tool_calls()` ビルダー
- [x] `chat_stream.rs` ストリームパイプライン分岐 — XML/JSON両モードを `ChatStreamChunk` レベルで分岐
- [x] `Options.tools` / `Options.tool_choice` を JSON モード時に自動設定
- [x] `recursive.rs` `start_new_task` に `use_json_tool_calls` パラメータ追加
- [x] `execute_agent.rs`, `resume_agent.rs`, `core/builder.rs` の呼び出し更新
- [x] `mise run check` ビルド成功（0エラー）

### Phase 6: 実API検証 ✅ (2026-02-09)

- [x] OpenAI API (gpt-4.1-mini) でストリーミングtool callレスポンス検証
  - `finish_reason: tool_calls` でtool call完了
  - delta形式: index, id, function.name, function.arguments が逐次チャンクで到着
  - `ToolCallAccumulator` が delta→完全な ToolCall に正しく変換される
- [x] `json_tool_call_test.rs` example作成（手動検証用）
- [x] パイプライン全体: Options.tools → API → streaming delta → ToolCallAccumulator → ChatStreamChunk::ToolCall → JsonToolCallEventParser → ToolCallEvent

### Phase 7: Responses API (GPT-5) 統合 ✅ (2026-02-09)

- [x] `responses_stream.rs` — `handle_function_call_arguments_done` を `ChatStreamChunk::ToolCall` 出力に変更（旧: XML text出力）
- [x] `ResponsesTool` 構造体追加 — Responses API用フラット形式 `{"type":"function","name":..}` に変換
- [x] `ResponsesTool::from_provider_tools()` — Chat Completions形式 → Responses API形式の変換
- [x] `chat_stream.rs` XML mode — `ChatStreamChunk::ToolCall` を XML text に変換する `tool_call_to_xml()` 追加（Responses API互換性維持）
- [x] `gpt-5.2-codex` 実API検証 — ストリーミングtool callレスポンス確認
  - `response.output_item.added` (function_call, name, call_id)
  - `response.function_call_arguments.delta` × N回 (引数の段階的構築)
  - `response.function_call_arguments.done` (完全なarguments)
  - `response.completed` (usage)
- [x] テスト更新: `tool_call_events_emit_tool_call_chunk` — ToolCall chunk出力を検証
- [x] `mise run check` ビルド成功（0エラー）
- [x] gpt-5.2-codex フルループ検証（curl）:
  - Step 1: User prompt → `read_file({"path":"Cargo.toml"})` tool call
  - Step 2: Mock tool result送信 → `"The package name is tachyon-apps."` 最終応答
  - ストリーミングでもテキストがトークン単位で到着を確認

### Phase 8: Tool Result返却メカニズム ✅

- [x] `Message` 構造体に `tool_call_id: Option<String>` フィールド追加（domain/provider両方）
- [x] `Message::tool()` / `Message::assistant_with_tool_calls()` コンストラクタ追加
- [x] `MessageCollection` でツールコール追跡（`PendingToolCallInfo`, `flush_tool_calls()`）
- [x] ToolResult時に `Message::tool(tool_call_id, content)` で構造化メッセージ生成
- [x] OpenAI Chat Completions API: `role: "tool"` + `tool_call_id` + assistant `tool_calls` 配列対応
- [x] OpenAI Responses API: `function_call` / `function_call_output` input items対応
- [x] `ResponsesInputItem` enum（`#[serde(untagged)]`）で異種アイテム混在対応
- [x] 全プロバイダー（anthropic, aws, google_ai, xai, zai, groq, perplexity_ai, opencode, claude-code）の Message struct literal更新
- [x] ユニットテスト7件パス（MessageCollection tool call tracking）
- [x] llms_domain 52件、llms_provider 3件、llms 305件テストパス

### Phase 9: RecursiveAgent E2E Integration — `use_json_tool_calls` パラメータ伝播 ✅

- [x] `ExecuteAgentInputData` に `use_json_tool_calls: bool` フィールド追加
- [x] `execute_agent.rs`: ハードコード `false` → `input.use_json_tool_calls` に置換
- [x] `ResumeAgentInputData` に `use_json_tool_calls: bool` フィールド追加
- [x] `resume_agent.rs`: ハードコード `false` → `input.use_json_tool_calls` に置換
- [x] `AgentBuilder` に `use_json_tool_calls` フィールド + `with_json_tool_calls()` ビルダーメソッド追加
- [x] `builder.rs`: `build_command_stack_for_new_task` のハードコード `false` → `self.use_json_tool_calls` に置換
- [x] `AgentExecuteRequest` に `use_json_tool_calls: Option<bool>` 追加（`#[serde(default)]`）
- [x] handler で `unwrap_or(false)` して `ExecuteAgentInputData` に渡す
- [x] テスト/examples/sub_agent/tachyond の全 `ExecuteAgentInputData` / `ResumeAgentInputData` リテラルに `use_json_tool_calls: false` を追加
- [x] `mise run check` コンパイル通過

## 技術的な検討事項

### 1. JSON Streaming Parsing

JSON全体を一度に受け取るのではなく、チャンクごとに処理する必要がある。

**アプローチ案**:
- バッファリング: 不完全なJSONを蓄積し、完全なオブジェクトになったらパース
- State Machine: パーサーの状態を管理（InObject, InArray, InString等）
- `serde_json::from_str`の段階的な適用

### 2. Tool Call IDの生成

XMLパーサーでは`Uuid::new_v4()`でIDを生成しているが、JSON形式では`id`フィールドがレスポンスに含まれる。

**対応**:
- レスポンスの`id`を優先的に使用
- `id`がない場合のみUUIDを生成

### 3. Arguments のパース

```json
"arguments": "{\"path\": \"/home/user/file.txt\"}"
```

文字列としてエスケープされたJSONをパースする必要がある。

**対応**:
```rust
let args_str: String = /* from JSON */;
let args: serde_json::Value = serde_json::from_str(&args_str)?;
```

### 4. Thinking タグの扱い

Anthropicの`<thinking>`タグ相当の処理。JSON形式では：

```json
{
  "type": "text",
  "text": "<thinking>考え中...</thinking>テキスト"
}
```

**対応**:
- `text`フィールド内のXMLタグを検出してThinkingイベントに変換
- あるいは、thinking専用のcontent typeがあればそれを使用

## ファイル構成

```
packages/llms/src/agent/
├── parse_xml.rs              # 既存（XmlStreamParser）
├── parse_tool_call.rs        # 新規（JsonToolCallEventParser）
│   ├── mod.rs
│   ├── openai.rs            # OpenAI形式パーサー
│   ├── anthropic.rs         # Anthropic形式パーサー
│   └── streaming.rs         # 共通ストリーミング処理
└── core/
    └── traits.rs            # ToolCallEventParserトレイト（既存）
```

## 依存関係

- `serde_json`: JSONパース
- `tokio_stream`: ストリーミング処理
- `uuid`: ID生成（フォールバック用）

## テスト戦略

### 単体テスト

- [ ] OpenAI形式の正常系パース
- [ ] Anthropic形式の正常系パース
- [ ] 不正なJSON形式のエラーハンドリング
- [ ] ストリーミングチャンクの段階的処理
- [ ] `arguments`文字列のパース

### 統合テスト

- [ ] `RecursiveAgent`との統合
- [ ] 実際のLLMレスポンスを使ったEnd-to-Endテスト
- [ ] XML形式とJSON形式の切り替え

### パフォーマンステスト

- [ ] 大量のtool callを含むレスポンスの処理時間
- [ ] メモリ使用量の測定

## リスクと対策

| リスク | 影響 | 対策 |
|--------|------|------|
| JSON Streaming Parsingの複雑さ | 実装遅延 | 既存ライブラリ（serde_json）を最大限活用 |
| プロバイダー間の形式差異 | 保守コスト増 | 共通インターフェース（トレイト）で抽象化 |
| 既存XMLパーサーとの互換性 | 破壊的変更 | トレイトベースで並行稼働可能な設計 |
| パフォーマンス劣化 | ユーザー体験悪化 | ベンチマークテストで検証 |

## マイルストーン

| マイルストーン | 期限 | 成果物 |
|---------------|------|--------|
| Phase 1完了 | 2026-02-07 | 基本トレイト実装 |
| Phase 2完了 | 2026-02-14 | プロバイダー別パーサー |
| Phase 3完了 | 2026-02-21 | ストリーミング処理 |
| Phase 4完了 | 2026-02-28 | テスト完了 |
| Phase 5完了 | 2026-03-07 | ドキュメント完成 |

## 関連ファイル

- `packages/llms/src/agent/parse_xml.rs` - 既存XMLパーサー
- `packages/llms/src/agent/parse_tool_call.rs` - JSONツールコールパーサー（新規）
- `packages/llms/src/agent/tool_definitions.rs` - JSON Schema ツール定義生成（新規）
- `packages/llms/src/agent/core/traits.rs` - `ToolCallEventParser`トレイト
- `packages/llms/src/agent/recursive.rs` - Agent loopのメイン処理
- `packages/llms/src/agent/chat_stream.rs` - ツール実行処理
- `packages/llms/src/agent/system_prompt.rs` - システムプロンプト（JSON mode追加）
- `packages/providers/openai/src/chat/stream_v2.rs` - OpenAI ToolCallAccumulator
- `packages/providers/openai/src/chat/responses_stream.rs` - Responses API (GPT-5) ToolCall出力 + ResponsesTool変換

## 参考リンク

- [OpenAI Tool Calls API](https://platform.openai.com/docs/guides/function-calling)
- [Anthropic Tool Use](https://docs.anthropic.com/claude/docs/tool-use)
- [serde_json Documentation](https://docs.rs/serde_json/)

## 進捗ログ

### 2026-02-09 (continued)
- ✅ Phase 9 完了: `use_json_tool_calls` パラメータ伝播
  - REST API → ExecuteAgent usecase → RecursiveAgent まで一貫してフラグを伝播
  - `AgentBuilder` にビルダーメソッド追加
  - 全テスト・examples・tachyond の struct literal を更新
  - `mise run check` コンパイル通過

### 2026-02-09
- ✅ Phase 5 完了: JSON Mode System Prompt + Tool Definitions
- ✅ Phase 6 完了: gpt-4.1-mini 実API検証（Chat Completions API）
- ✅ Phase 7 完了: Responses API (GPT-5) 統合
  - `responses_stream.rs` を `ChatStreamChunk::ToolCall` 出力に変更
  - `ResponsesTool` でResponses APIフラット形式に変換
  - XMLモードでもToolCallチャンクをXMLに再変換して互換性維持
  - `gpt-5.2-codex` でストリーミングtool call動作確認済み
- 📝 残: Anthropic ToolCall経由移行、モデル設定自動選択（将来対応）

### 2026-02-08
- ✅ 既存アーキテクチャの詳細調査完了
- ✅ Phase 1-4 実装完了（詳細は実装計画セクション参照）
- ✅ 21テスト全通過、`mise run check` ビルド成功
- 📝 残: Anthropic ToolCall経由移行、モデル設定自動選択（将来対応）

### 2026-01-31
- ✅ タスクドキュメント作成
- ✅ 既存実装の調査完了

---

## メモ

### 既存実装の重要なポイント

1. **`ToolCallEvent`の設計**:
   - `ToolStart` → `Parameter` → `ToolEnd`の順序でイベントが発行される
   - `Parameter`は複数回発行される可能性がある（段階的にargsを構築）

2. **非同期実行**:
   - `ToolEnd`イベント時に`tokio::spawn`でツール実行を非同期化
   - 結果は`mpsc::channel`で受信

3. **ループ制御**:
   - `iteration_requires_followup`フラグでloop継続を判定
   - `AttemptCompletion`または`Ask`でloop終了

4. **メッセージ永続化**:
   - `MessagePersistence`トレイトで抽象化
   - DBへの保存は`RecursiveAgent`が担当

### JSON形式の特徴

1. **tool_callsは配列**:
   ```json
   "tool_calls": [
     { "id": "call_1", "function": {...} },
     { "id": "call_2", "function": {...} }
   ]
   ```
   複数のツールを一度に呼び出せる

2. **argumentsは文字列**:
   JSONとしてエスケープされた文字列なので2段階パースが必要

3. **ストリーミング時の特性**:
   - OpenAI: `delta.tool_calls`で段階的に送信
   - Anthropic: content blockごとに完全なオブジェクト

### 実装時の注意点

- `ToolCallEvent::Parameter`を複数回発行してargs を段階的に構築するか、完全なargsを一度に発行するか検討が必要
- XMLパーサーとの一貫性を保つため、段階的構築を推奨
- `thinking`タグの扱いはプロバイダー依存なので、柔軟な設計が必要
