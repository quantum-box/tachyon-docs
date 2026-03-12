---
title: "Agent ChatでもSaved Memoryを動作させる"
type: bugfix
emoji: "🧠"
topics:
  - agent-chat
  - saved-memory
  - llms
published: true
targetFiles:
  - packages/llms/src/adapter/axum/chat_completion_on_chatroom_handler.rs
  - packages/llms/src/adapter/axum/agent_handler.rs
  - apps/tachyon/src/app/v1beta/[tenant_id]/ai/chat/*
github: https://github.com/quantum-box/tachyon-apps
---

# Agent ChatでもSaved Memoryを動作させる

## 概要

AI Studio の Agent Chat 画面（チャット補完 API `/v1/llms/chatrooms/{id}/chat/completions` を利用）で「覚えて」「remember」等の Saved Memory トリガーを送っても、永続メモリが保存されない問題を解消する。Agent API (`/agent/execute`) で実装済みの Saved Memory フローをチャット補完 API 側にも適用し、UI の種類に依存せず保存できるようにする。

## 背景・目的

- Saved Memory 判定・保存処理は `agent_handler::execute_agent` にのみ実装されている。
- Agent Chat UI は chat completion SSE API を直接叩いているため、Saved Memory 判定を経由していない。
- ユーザーは Agent Chat で保存できると想定しているが、実際には「このセッションを超えて保持できない」と返答される。SavedMemory 機能追加の目的を果たせていない。

## 詳細仕様

### 機能要件

1. `/v1/llms/chatrooms/{chatroom_id}/chat/completions` ハンドラで、ユーザー最終入力を Saved Memory Intent Detector + キーワードで判定する。
2. Saved Memory フローが発火した場合は `process_saved_memory_command` と同等のレスポンスを SSE で返し、通常のチャット生成は行わない。
3. Saved Memory 処理中に発生したエラーは SSE の `error` イベントで返し、LLM への通常問い合わせは行わない。
4. Saved Memory 判定失敗時は従来どおりチャット生成へフォールバックする。
5. Saved Memory Bio Tool にはチャットで指定されたモデル（未指定時はデフォルト）を `LLMModelOption` として渡し、Agent API と同じ挙動を維持する。
6. UI から見た挙動・文言は Agent API と同一。

### 非機能要件

- Saved Memory 判定は 1 リクエストで 1 回のみ。
- SSE への追加は最小限（`say`/`done`/`error` イベント）で、既存の chunk 構造へ影響を与えない。
- ログに Saved Memory 判定結果を INFO 以上で残し、トラブルシュートしやすくする。

### コンテキスト別の責務

```yaml
contexts:
  llms:
    responsibilities:
      - Saved Memory Intent Detection API 呼び出し
      - Saved Memory Bio Tool の利用
      - Saved Memory CRUD Usecase への委譲
  apps/tachyon:
    responsibilities:
      - 追加実装なし（既存 SSE ハンドリングを流用）
      - 将来の UX 調整時のためにドキュメント更新のみ
```

### 仕様のYAML定義

```yaml
saved_memory_flow:
  trigger_sources:
    - api: "/v1/llms/chatrooms/{chatroom_id}/agent/execute"
    - api: "/v1/llms/chatrooms/{chatroom_id}/chat/completions"
  intent_detection:
    model: "anthropic/claude-haiku-4.5" # fallback
    fallback_keywords:
      - "remember that"
      - "remember i am"
      - "save to memory"
  responses:
    success: "🧠 {count}件のSaved Memoryを登録しました: ..."
    sensitive_reject: "⚠️ 保存できません（センシティブ情報）: ..."
    short_term_reject: "⚠️ 保存できません（短期的な情報）: ..."
```

## 実装方針

### アーキテクチャ設計

- `chat_completion_on_chatroom` の冒頭で Saved Memory 判定 → 保存を追加。
- 共通化できるロジック（intent detection / keyword / process_saved_memory_command）は `agent_handler` 内の既存関数を再利用するか、別モジュールへ切り出す。
- SSE レスポンスは Agent API と同じ `AgentChunk::Say` JSON を返す。

### 技術選定

- Rust（Axum）: 既存 API ハンドラに追記。
- 追加ライブラリは不要。既存の `detect_saved_memory_intent` / `process_saved_memory_command` を再利用。

### TDD戦略

- 影響範囲が広いのでまずユニットテストよりもリグレッションを防ぐ簡易テストを追加（Saved Memory フロー関数を分離した場合は単体テストを記述）。
- フロントエンド変更は不要だが、手動検証 & Playwright MCP による回帰確認を実施。

## タスク分解

### 主要タスク
- [x] 📝 現状の chat completion ハンドラと Agent ハンドラの差分調査（完了）
- [x] 🔄 Saved Memory 判定・保存ロジックを共通化/再利用して chat completion ハンドラへ組み込み
- [ ] 📝 SSE 応答のシナリオテスト（手動）とログ確認
- [ ] 📝 Playwright MCP で Agent Chat から Saved Memory コマンドが成功することを撮影
- [ ] 📝 ドキュメント更新（本 taskdoc / 仕様メモ）

## Playwright MCPによる動作確認

### 実施タイミング
- [ ] 実装完了後の初回動作確認
- [ ] PR前最終確認

### 動作確認チェックリスト
- [ ] Agent Chat で「カレーが好きなことを覚えて」と入力すると Saved Memory 応答が返る。
- [ ] Saved Memory ページで登録済みとして表示される。
- [ ] 通常の質問では Saved Memory フローに入らず、従来の応答が返る。
