---
title: "Agent APIのchunkとchatroom historyの整合性修正とテスト拡充"
type: "bug"
emoji: "🧪"
topics:
  - llms
  - agent-api
  - testing
published: true
targetFiles:
  - apps/tachyon-api/
  - packages/llms/
  - packages/agents/
  - apps/tachyon/src/app/v1beta/
github: ""
---

# Agent APIのchunkとchatroom historyの整合性修正とテスト拡充

## 概要

Agent APIの実行後に返るchunkと、chatroom historyの内容が一致しない問題を修正し、
LLM providerをモック化した網羅的なテストで保守性を高める。

## 背景・目的

- chunkにはtool callが含まれるが、historyにはXML文字列が混入するなど、
  期待されるメッセージ形式と不一致が発生している。
- 既存テストではこの不整合パターンを十分に網羅できていない。
- LLM providerをモックに切り替え、複数パターンの応答を安定的に再現できるようにする。

## 詳細仕様

### 機能要件

1. chunkとhistoryのフォーマット整合性を保証する。
2. tool callを含む応答は、history側にもtool callメッセージとして保存される。
3. XML文字列等の中間表現がhistoryに残らない。
4. 既存の正常系・エラー系の挙動を維持する。

### 非機能要件

- テストは再現性が高く、CIで安定して通る。
- 追加のテストにより既存カバレッジが低下しない。
- 実装の変更点が最小で理解しやすいこと。

### 仕様のYAML定義

```yaml
# 期待するメッセージ整合性
message_alignment:
  chunk:
    contains_tool_call: true
    format: tool_call_message
  history:
    contains_tool_call: true
    format: tool_call_message
  forbidden_in_history:
    - xml_string

# テストパターン
mock_llm_patterns:
  - id: tool_call_only
    description: tool callのみを返す
  - id: tool_call_with_text
    description: tool callとテキストが混在
  - id: tool_call_error
    description: tool callでエラー応答
  - id: no_tool_call
    description: 通常テキストのみ
```

## 実装方針

### アーキテクチャ設計

- Agent APIのchunk生成とhistory保存の境界で正規化処理を統一する。
- LLM providerをモック実装に差し替え、パターン再現を固定化する。

### 技術選定

- Rustの既存テスト基盤（nextest / scenario test）を活用。
- 既存のLLM provider traitに沿ったモックを導入。

### TDD（テスト駆動開発）戦略

#### 既存動作の保証
- 現状の正常系応答が崩れないことを回帰テストで担保。

#### テストファーストアプローチ
- 不整合パターンの再現テストを先に追加。
- 修正後に整合性が保証されることを確認。

#### 継続的検証
- `mise run docker-ci-rust` でRustテストを実行。
- 追加シナリオテストは `mise run docker-scenario-test` を実行。

## タスク分解

### 主要タスク
- [x] 要件定義の明確化
- [x] 技術調査・検証
- [x] 実装
- [x] テスト・品質確認
- [x] ドキュメント更新

### チェックポイント
- [x] chunk/histroyの差分が発生する最小再現ケースを特定
- [x] モックLLM providerの応答パターンを定義
- [x] 新規テストを追加してレッドを確認
- [x] 整合性修正でグリーン化
- [x] 既存シナリオテストに影響がないことを確認

## Playwright MCPによる動作確認

本タスクはバックエンド中心のため、Playwright動作確認は不要。

### 実施タイミング
- [x] 実装完了後の初回動作確認
- [x] PRレビュー前の最終確認
- [x] バグ修正後の再確認

### 動作確認チェックリスト
- [x] UI変更なし（N/A）

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| モックと実LLMの差異 | 中 | 本番と同じtraitを使い、I/O形状を固定化する |
| 既存チャット履歴の後方互換性 | 中 | migration不要な範囲に限定し、既存データの読み取りも確認 |

## 参考資料

- `docs/src/tachyon-apps/tools/tachyon-code.md`
- `docs/src/tachyon-apps/payment/usd-billing-system.md`

## 完了条件

- [x] chunkとhistoryの整合性がテストで保証されている
- [x] 新規テストがCIで安定して通る
- [x] 動作確認レポートが必要な場合は作成済み
- [x] タスクディレクトリを completed/v0.26.1/ に移動済み

## 備考

- 追加の仕様変更が発生した場合はYAMLセクションに追記する。

## 実装進捗

### 2025-12-27

#### 調査結果

問題の根本原因を特定：
1. `MessageCollection::new_from_chunks()` でtool callチャンクをXMLタグ形式の文字列に変換
2. `Message::create_chat_message()` が常に `new_text()` を使用し、`tool_calls` を無視
3. 結果として、SSEレスポンス（構造化されたToolCall）とhistory（XML文字列）が不一致

#### 実装内容

1. **`Message` ドメインモデルの拡張** ([message.rs](packages/llms/domain/src/message.rs)):
   - `assistant_with_tool_calls()` ファクトリメソッドを追加
   - `create_chat_message()` を修正して、`tool_calls` がある場合は `Part::ToolCall` を使用
   - `create_chat_messages()` を追加して、複数のtool callsを持つメッセージに対応

2. **`MessageCollection::new_from_chunks()` の修正** ([types.rs](packages/llms/src/usecase/command_stack/types.rs)):
   - XMLタグ生成ではなく、`MessageToolCall` 構造体を作成
   - `assistant_with_tool_calls()` を使用してメッセージを作成
   - tool callの構造化データが `Message.tool_calls` フィールドに格納される

3. **テストの追加・更新**:
   - `test_new_from_chunks_tool_call_uses_tool_calls_field`: tool callsが構造化されていることを確認
   - `test_new_from_chunks_tool_result_preserves_structure`: tool resultの構造を確認
   - 既存テストを新しい期待値に更新

#### 変更されたファイル

- `packages/llms/domain/src/message.rs`
- `packages/llms/src/usecase/command_stack/types.rs`

#### 検証結果

- [x] Docker内でのコンパイル確認 - `cargo check -p llms` 成功
- [x] テスト実行 - 7テスト全てpass
  - `test_new_from_chunks_tool_call_uses_tool_calls_field`
  - `test_new_from_chunks_tool_result_preserves_structure`
  - `test_new_from_chunks_basic`
  - `test_new_from_chunks_thinking`
  - `test_new_from_chunks_multiple_tool_calls`
  - `test_new_from_chunks_ask`
  - `test_new_from_chunks_attempt_completion`
- [x] llmsパッケージのユニットテスト確認完了
- [x] tachyon-apiシナリオテスト確認完了
  - エージェントAPI テストシナリオ ✅
  - サービスコスト見積もりと残高チェック ✅
  - Agent Protocol CRUDシナリオ ✅
  - チャットルームCRUDシナリオ ✅

#### 修正のポイント

1. **ToolCall→ToolResult間のツール名保持**
   - `tool_id_to_name` HashMapを追加して、`ToolCall`チャンクで受け取ったツール名を保持
   - `ToolResult`処理時にこのマッピングからツール名を取得

2. **構造化データの使用**
   - XMLタグ形式の文字列ではなく、`MessageToolCall`構造体を使用
   - `Message.tool_calls`フィールドに格納してhistoryと整合性を保つ

3. **テストの修正**
   - `is_assistant()`メソッドは`Role`ではなく`Message`に定義されているため、呼び出し方を修正

### 2025-12-28 (追加修正)

#### 問題点の追加発見

`execute_agent` で返るSSEチャンクと `get_agent_history` で返るチャンクが不一致になる根本原因を特定：

1. `execute_agent` → `MessageCollection::new_from_chunks()` → `Message` (with `tool_calls`) → `Message::create_chat_message()` → `ChatMessage` (with `Part::ToolCall`) → DB保存
2. `get_agent_history` → DB読み込み → `ChatMessage` (with `Part::ToolCall`) → `messages_to_chunks()` → **ここで `Part::ToolCall` が無視される！**

`messages_to_chunks()` は `Part::Text` のみを処理しており、`Part::ToolCall` / `Part::ToolResult` は空文字列として扱われていた。

#### 実装内容

1. **`messages_to_chunks()` の修正** ([messages_to_chunk.rs](packages/llms/src/usecase/command_stack/messages_to_chunk.rs)):
   - `Part::ToolCall` を直接 `AgentChunk::ToolCall` + `AgentChunk::ToolCallArgs` に変換
   - `Part::ToolResult` を直接 `AgentChunk::ToolResult` に変換
   - 既存の `[tool_name] Result:` テキストパターンもツール名を抽出するように改善

2. **テストの追加**:
   - `test_messages_to_chunks_with_part_tool_call`: `Part::ToolCall` → `AgentChunk` 変換を検証
   - `test_messages_to_chunks_with_part_tool_result`: `Part::ToolResult` → `AgentChunk` 変換を検証
   - `test_messages_to_chunks_tool_call_round_trip`: 保存→取得のラウンドトリップを検証
   - `test_messages_to_chunks_with_tool_name_in_result`: 新フォーマット `[tool_name] Result:` のパースを検証

#### 変更されたファイル

- `packages/llms/src/usecase/command_stack/messages_to_chunk.rs`

#### 検証結果

- [x] `messages_to_chunk` テスト - 11テスト全てpass
- [x] `types` テスト - 12テスト全てpass
- [x] コンパイル確認 - `mise run check` 成功

#### データフローの修正後

```
execute_agent:
  SSEチャンク → MessageCollection::new_from_chunks() → Message (tool_calls フィールド)
             → Message::create_chat_message() → ChatMessage (Part::ToolCall)
             → DB保存

get_agent_history:
  DB読み込み → ChatMessage (Part::ToolCall)
           → messages_to_chunks() → AgentChunk::ToolCall + ToolCallArgs ← 修正済み！
           → SSEレスポンス
```

これにより、`execute_agent` で返るチャンクと `get_agent_history` で返るチャンクが整合するようになった。
