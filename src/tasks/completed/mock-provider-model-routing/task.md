---
title: "ScriptedChatStreamProvider モデル名ベースレスポンスルーティング"
type: "tech"
emoji: "🧪"
topics:
  - Testing
  - Agent API
  - Mock Provider
  - llms_provider
published: true
targetFiles:
  - packages/providers/llms_provider/src/tests.rs
github: ""
---

# ScriptedChatStreamProvider モデル名ベースレスポンスルーティング

## 概要

`ScriptedChatStreamProvider`（Agent APIテスト用モックLLMプロバイダー）を拡張し、`Options::model`に指定されたモデル名に応じて異なるレスポンスを返せるようにする。これにより、1つのプロバイダーインスタンスで複数のテストシナリオ（tool call、ask、completion、thinking等）を切り替えてテストできる。

## 背景・目的

- Agent APIのテストでは、LLMの応答パターン（テキスト応答、ツール呼び出し、フォローアップ質問、タスク完了等）に応じた振る舞いの検証が必要
- 従来の`ScriptedChatStreamProvider`は固定のチャンクしか返せず、シナリオ切り替えには別インスタンスの生成が必要だった
- `Model::Custom(String)`を活用してモデル名でシナリオをルーティングすることで、テストの柔軟性と保守性を向上させる
- `create-tool-call-parser`タスク等、Agent APIパーサー関連のテスト基盤として活用

## 詳細仕様

### 機能要件

1. `ScriptedChatStreamProvider`に`model_responses: HashMap<String, Vec<ChatStreamChunk>>`フィールドを追加
2. `Options::model`が`Model::Custom(name)`の場合、`model_responses`から該当チャンクを返す
3. モデル名が見つからない場合、または`Model::Small`/`Model::Large`の場合はデフォルトチャンクにフォールバック
4. ビルダーパターンで個別登録（`with_model_response`）と一括登録（`with_all_mock_scenarios`）を提供
5. 7つのプリセットシナリオを組み込み:
   - `mock/default` - プレーンテキスト応答
   - `mock/tool-call` - XMLツール呼び出し（`<search>`）
   - `mock/ask` - フォローアップ質問（`<ask_followup_question>`）
   - `mock/completion` - タスク完了（`<attempt_completion>`）
   - `mock/thinking` - 推論+テキスト（`<thinking>`）
   - `mock/empty` - Usage のみ（テキストなし）
   - `mock/multi-turn` - テキスト+ツール+質問の複合

### 非機能要件

- 既存のコンストラクタ・テストとの後方互換性を維持
- 外部クレート（`di.rs`、`execute_agent.rs`等）からの利用に影響しない
- `model_responses`はデフォルト空HashMapで初期化

## 実装方針

### ルーティングロジック

```rust
fn chunks_for_model(&self, opt: &Options) -> &[ChatStreamChunk] {
    let model_name = match &opt.model {
        Model::Custom(name) => Some(name.as_str()),
        _ => None,
    };
    model_name
        .and_then(|name| self.model_responses.get(name))
        .map(|v| v.as_slice())
        .unwrap_or(&self.chunks)
}
```

### 利用イメージ

```rust
// 個別登録
let provider = ScriptedChatStreamProvider::mock_default()
    .with_model_response("mock/tool-call", tool_call_chunks);

// 全プリセット一括登録
let provider = ScriptedChatStreamProvider::mock_default()
    .with_all_mock_scenarios();

// テスト内でモデル名指定
let opt = Options {
    model: Model::Custom("mock/tool-call".to_string()),
    ..Options::default()
};
let stream = provider.chat_stream_v2(&[], &opt).await?;
```

## タスク分解

### フェーズ1: 実装 ✅ (2026-02-06 完了)

- [x] `HashMap`インポートと`model_responses`フィールド追加
- [x] コンストラクタで`model_responses: HashMap::new()`初期化
- [x] `with_model_response()`ビルダーメソッド追加
- [x] `with_all_mock_scenarios()`ビルダーメソッド追加
- [x] `all_mock_scenarios()`で7プリセット定義
- [x] `chunks_for_model()`ルーティングロジック実装
- [x] `chunk_stream()`を`&Options`引数対応に変更
- [x] `chat_stream_v2`から`opt`をルーティングに渡す

### フェーズ2: テスト ✅ (2026-02-06 完了)

- [x] `test_model_based_response_routing` - モデル名指定→専用チャンク返却 & 未登録名→フォールバック
- [x] `test_default_model_fallback_with_small` - `Model::Small`（デフォルト）→フォールバック
- [x] `test_with_all_mock_scenarios` - 7プリセット全シナリオの登録・取得確認
- [x] 既存テスト3件のパス確認（`test_mock_provider_creation`、`test_mock_chat`、`test_scripted_chat_stream_provider`）

### フェーズ3: 後方互換性検証 ✅ (2026-02-06 完了)

- [x] `apps/tachyon-api/src/di.rs` - `mock_default()`利用→影響なし
- [x] `packages/llms/src/usecase/execute_agent.rs` - テスト内ローカル定義→影響なし
- [x] コンパイルチェック（`mise run check`）パス
- [x] テスト実行（Docker内 `cargo nextest run -p llms_provider`）全6件パス

## テスト結果

```
Starting 6 tests across 1 binary
    PASS test_default_model_fallback_with_small
    PASS test_mock_chat
    PASS test_mock_provider_creation
    PASS test_model_based_response_routing
    PASS test_scripted_chat_stream_provider
    PASS test_with_all_mock_scenarios
Summary: 6 tests run: 6 passed, 0 skipped
```

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 既存テストの破壊 | 高 | `model_responses`デフォルト空で後方互換維持、既存テスト全パス確認済み |
| 外部クレートへの影響 | 中 | 全利用箇所を調査し影響なしを確認 |

## 関連タスク

- `create-tool-call-parser` - Agent APIパーサーのテストで本モックを活用予定
- `agent-api-catalog-variants` - Agent APIモデル管理改善

## 対象ファイル

- `packages/providers/llms_provider/src/tests.rs` (866行)

### フェーズ4: パースパイプライン統合テスト ✅ (2026-02-06 完了)

`ScriptedChatStreamProvider` のモデルルーティングを活用し、Agent APIの **XMLパース → イベント変換 → ループ制御** の統合テストを `packages/llms/src/agent/chat_stream.rs` に追加。

**技術的注意点**: `AttemptApiRequest::options_from_model("mock/tool-call")` は `"mock"` / `"tool-call"` に分割し `Options { model: Model::Custom("tool-call") }` を生成するため、`ScriptedChatStreamProvider` のルーティングキーはプロバイダープレフィックスなしの短いキー（`"tool-call"`, `"completion"` 等）で登録。

#### Level 1: パースパイプライン検証（AttemptApiRequest レベル）— 6件

`ScriptedChatStreamProvider` → `AttemptApiRequest::handle()` → `AgentChunkEvent` ストリーム

- [x] `test_scripted_tool_call_scenario` - ToolCall + ToolCallArgs + ToolResult イベント
- [x] `test_scripted_ask_scenario` - Ask イベント、質問テキスト
- [x] `test_scripted_completion_scenario` - AttemptCompletion ストリーミング
- [x] `test_scripted_thinking_scenario` - Thinking + Say イベント
- [x] `test_scripted_empty_scenario` - Usage のみで正常終了
- [x] `test_scripted_model_routing_in_pipeline` - 1インスタンスでモデル切替、異なるイベント

#### Level 2: エージェントループ統合テスト（RecursiveAgent レベル）— 4件

`ScriptedChatStreamProvider` → `AttemptApiRequest`(実物) → `RecursiveAgent` → ループ制御

- [x] `test_recursive_with_scripted_completion` - AttemptCompletion でループ停止
- [x] `test_recursive_with_scripted_ask` - Ask で即座にループ停止
- [x] `test_recursive_with_scripted_tool_call` - ToolResult 後フォローアップ→2回目で停止
- [x] `test_recursive_with_scripted_thinking` - Thinking+Say、ループ1回で停止

#### 実装上の知見

- RecursiveAgent は `spawn_with_taskflow`（tokio::spawn）を使うため `#[tokio::test(flavor = "multi_thread", worker_threads = 2)]` が必須
- RecursiveAgent のストリームは完了後もsenderがdropされないため、per-chunkタイムアウトパターン（`loop { match timeout(5s, stream.next()) { Err(_) => break } }`）で読み取り終了を検知
- `MockChatMessageRepository` には `.expect_save().returning(|_| Ok(()))` と `.expect_bulk_save().returning(|_| Ok(()))` の設定が必要（未設定だとspawned task内でpanicし無限待ちになる）
- XML パーサーは thinking テキストを1文字ずつ emit するため、全文一致ではなく先頭文字の存在で検証

### テスト結果（フェーズ4）

```
Starting 10 tests across 1 binary (336 tests skipped)
    PASS [   5.032s] test_recursive_with_scripted_ask
    PASS [   5.016s] test_recursive_with_scripted_completion
    PASS [   5.022s] test_recursive_with_scripted_thinking
    PASS [   5.021s] test_recursive_with_scripted_tool_call
    PASS [   0.024s] test_scripted_ask_scenario
    PASS [   0.012s] test_scripted_completion_scenario
    PASS [   0.009s] test_scripted_empty_scenario
    PASS [   0.008s] test_scripted_model_routing_in_pipeline
    PASS [   0.005s] test_scripted_thinking_scenario
    PASS [   0.004s] test_scripted_tool_call_scenario
Summary: 10 tests run: 10 passed, 336 skipped
```

既存テスト302件（DB不要分）も全パス、回帰なし。

## 対象ファイル

- `packages/providers/llms_provider/src/tests.rs` — フェーズ1〜3（モデルルーティング実装）
- `packages/llms/src/agent/chat_stream.rs` — フェーズ4（統合テスト追加）

## 完了条件

- [x] すべての機能要件を満たしている
- [x] 既存テストが引き続きパスする
- [x] 新規テスト3件がパスする（フェーズ2）
- [x] 外部利用箇所に影響がない
- [x] パースパイプライン統合テスト10件がパスする（フェーズ4）
- [x] コードレビュー完了
