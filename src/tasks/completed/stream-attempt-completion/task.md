---
title: "attempt_completion イベントのストリーミング対応"
type: "feature"
emoji: "🌊"
topics:
  - Agent API
  - Streaming
  - XML Parser
  - Frontend
published: true
targetFiles:
  - packages/llms/src/agent/parse_xml.rs
  - packages/llms/src/agent/chat_stream.rs
  - packages/llms/src/agent/types.rs
  - apps/tachyon/src/components/agent/AgentStream.tsx
  - apps/tachyon/src/components/agent/AgentCompletion.tsx
  - apps/tachyon/src/components/ai-studio/agent/AgentStream.tsx
  - apps/tachyon/src/components/ai-studio/agent/AgentCompletion.tsx
  - apps/tachyond/src/agent_builtin.rs
github: ""
---

# attempt_completion イベントのストリーミング対応

## 概要

エージェントの `attempt_completion` イベントを `say` イベントと同様にチャンク単位でストリーミング送信する。従来は `</attempt_completion>` 閉じタグを待ってから結果全体を一括送信していたが、`<result>` 内のテキストを文字単位で逐次送信するように変更し、UIにリアルタイムなフィードバックを提供する。

## 背景・目的

- `say` イベントは文字単位でストリーミングされ、UIに逐次表示される
- `attempt_completion` は閉じタグまで蓄積後に一括送信されるため、長い結果テキストの場合にユーザーが待たされる
- 同様のストリーミング体験を `attempt_completion` にも適用し、UX を改善する

## 詳細仕様

### 機能要件

1. `AttemptCompletionResult` に `is_finished: Option<bool>` フィールドを追加
2. XML パーサが `<attempt_completion><result>` 内テキストを文字単位で `ToolCallEvent::Text` として emit
3. `chat_stream` が `attempt_completion_id` アクティブ時の `Text` イベントを `AttemptCompletion` チャンクに変換
4. フロントエンドが `result` テキストを連結表示し、`is_finished` でストリーミング状態を制御
5. TUI (`tachyond`) でも部分テキストのストリーミング表示に対応

### 非機能要件

- 後方互換性: `is_finished` は `Option<bool>` + `#[serde(default)]` で旧クライアント対応
- `command` パラメータはストリーミングせず、最終チャンクで一括送信
- 履歴データ再構築時は `is_finished: Some(true)` の完了チャンクのみ処理

## 実装方針

### データフロー

```
LLM Stream → Parser: <attempt_completion><result>Hello</result></attempt_completion>
  1. ToolStart{attempt_completion}     → chat_stream: attempt_completion_id 保存, skip
  2. Text("H")                         → AttemptCompletion{result:"H", is_finished:false}
  3. Text("e")                         → AttemptCompletion{result:"e", is_finished:false}
  4. Text("l"), Text("l"), Text("o")   → 各文字チャンク送信
  5. Parameter{result:"Hello"}         → arguments_map 保存, skip
  6. ToolEnd                           → AttemptCompletion{result:"", command:..., is_finished:true}
Frontend: result を連結 → "Hello" を逐次表示
```

### 変更レイヤー

| レイヤー | ファイル | 変更内容 |
|---------|---------|---------|
| 型定義 | `types.rs` | `is_finished: Option<bool>` 追加、`new_from_chunks`/`push_chunk` で部分チャンクスキップ |
| パーサ | `parse_xml.rs` | `current_param` 追跡、`attempt_completion > result` 内テキスト emit |
| ストリーム | `chat_stream.rs` | `Text` → `AttemptCompletion(is_finished=false)` 変換、`ToolEnd` で最終チャンク |
| TUI | `agent_builtin.rs` | `is_finished` に応じた表示切替 |
| フロント | `AgentStream.tsx` | result 連結 + `isStreaming = !is_finished` |
| フロント | `AgentCompletion.tsx` | `isStreaming` プロップ活用、スピナー・色切替 |

## タスク分解

### フェーズ1: バックエンド実装 ✅

- [x] `AttemptCompletionResult` に `is_finished: Option<bool>` 追加
- [x] XML パーサに `current_param: Option<String>` フィールド追加
- [x] `process_opening_tag` / `process_closing_tag` で `current_param` の設定・クリア
- [x] `process_in_parameter_tag_state` で `attempt_completion > result` 内テキスト emit
- [x] `chat_stream.rs` の `Text` ハンドラで `attempt_completion` 判定
- [x] `ToolEnd` ハンドラで最終チャンク送信
- [x] `messages_to_chunk.rs` / `billing_aware_test.rs` / `sub_agent.rs` / `recursive.rs` 更新
- [x] `agent_builtin.rs` (TUI) ストリーミング対応

### フェーズ2: フロントエンド実装 ✅

- [x] `AgentStream.tsx` (agent): result 連結 + isStreaming 制御
- [x] `AgentStream.tsx` (ai-studio): 同上
- [x] `AgentCompletion.tsx` (agent): isStreaming 活用、Loader2 スピナー、色切替
- [x] `AgentCompletion.tsx` (ai-studio): 同上

### フェーズ3: テスト ✅

- [x] `test_chat_stream_presenter_attempt_completion` 更新（複数チャンク検証）
- [x] `test_chat_stream_presenter_attempt_completion_without_command` 更新
- [x] XML パーサテスト通過確認
- [x] 全 9 テスト通過

### フェーズ4: バグ修正 ✅

- [x] **根本原因修正**: `chat_stream.rs` ToolEnd ハンドラの最終チャンクに完全な result を含める
  - 修正前: `result: String::new()` → DB保存時に空文字列
  - 修正後: `arguments_map` から result を取得 → DB保存時に完全なテキスト
- [x] **フロントエンド**: `is_finished: true` チャンクの result は置換（連結ではなく重複防止）
- [x] **ai-studio AgentStream.tsx**: 最初の `attempt_completion` チャンクの `break` フォールスルーバグ修正
- [x] **isLoading オーバーライド**: `attempt_completion` を除外（`is_finished` で独自制御）
- [x] **デバッグログ削除**: ai-studio版の `console.log` を削除
- [x] tachyond コンパイル成功確認（エラーなし）
- [x] TypeScript 型チェック通過

## テスト計画

- `cargo nextest run -p llms -E 'test(attempt_completion) | test(xml_stream_parser)'`
- attempt_completion 関連: 6 tests
- XML parser 関連: 3 tests
- 動作確認: エージェント実行時にブラウザで `attempt_completion` テキストがリアルタイム表示されることを確認

## リスクと対策

| リスク | 対策 |
|-------|------|
| 旧クライアントとの互換性 | `Option<bool>` + `#[serde(default)]` + `skip_serializing_if` |
| 文字単位チャンクによるオーバーヘッド | `say` イベントと同一パターンのため実績あり |
| `MessageCollection` の履歴再構築 | `is_finished == Some(false)` のチャンクをスキップ、最終チャンクに完全な result |
| ストリーム中の result 重複 | フロントで `is_finished: true` 時は置換、`false` 時は連結 |

## 完了条件

- [x] `attempt_completion` の `result` テキストが文字単位でストリーミングされる
- [x] 最終チャンクに `result`、`command` と `is_finished: true` が含まれる
- [x] フロントエンドで "Completing..." → "Task Completed" の遷移が表示される
- [x] 全テスト通過
- [x] ブラウザでの動作確認（google_ai/gemini-3-flash-preview でストリーミング＋Task Completed表示を確認済み）
- [x] `mise run check` エラーなし通過
- [x] tachyon-api バイナリ正常ビルド・起動確認
- [ ] ブラウザでの動作確認（ストリーム終了後も result テキストが保持されることを確認）— 環境制約により未実施

## API 動作確認 (2026-02-08)

### 環境

- Worktree: `/home/ubuntu/tachyon-apps.feat-stream-attempt-completion`
- Branch: `feat/stream-attempt-completion` (`bc8c3421c`)
- Docker Compose project: `tachyon-apps-pr1070`
- Ports: tachyon=16100, tachyon-api=50154, redis=6479

### 検証手順

1. ChatRoom を GraphQL mutation `createChatroom` で作成
2. `POST /v1/llms/chatrooms/{id}/agent/execute` に `{"task": "Say hello world", "auto_approve": true}` を送信
3. SSE レスポンスをキャプチャして各イベントの構造を確認

### 結果: OK

SSE ストリームのイベントシーケンスが仕様どおりに動作することを確認した。

#### イベントフロー

```
1. say events (index 172-186)
   文字単位でストリーミング: \n, \n, H, e, l, l, o, ' ', w, o, r, l, d, \n, \n

2. attempt_completion events (is_finished: false)
   文字単位でストリーミング: \n, H, e, l, l, o, ' ', w, o, r, l, d, \n
   → フロントエンドはこれを連結して "Hello world" を逐次表示

3. attempt_completion final event (is_finished: true)
   {"type":"attempt_completion","result":"","command":null,"is_finished":true}
   → 完了シグナル

4. usage event
   {"type":"usage","prompt_tokens":3321,"completion_tokens":75,"total_tokens":3396,
    "cache_creation_input_tokens":0,"cache_read_input_tokens":0,"total_cost":0.07392}

5. done event
   → ストリーム終了
```

#### 確認ポイント

| 項目 | 結果 |
|------|------|
| `is_finished: false` で文字単位ストリーミング | OK |
| `is_finished: true` で完了シグナル送信 | OK |
| `command` フィールドが含まれる | OK (null) |
| `say` と `attempt_completion` が両方ストリーミング | OK |
| `usage` イベントでトークン使用量が返る | OK |
| `done` イベントでストリーム正常終了 | OK |
| 後方互換性 (`is_finished` は Optional) | OK (serde default) |

#### 未確認事項

- ブラウザ UI でのストリーミング表示（"Completing..." → "Task Completed" 遷移）
- `command` パラメータ付き completion のストリーミング
- 履歴データ再構築時の動作（`is_finished: false` チャンクのスキップ）
