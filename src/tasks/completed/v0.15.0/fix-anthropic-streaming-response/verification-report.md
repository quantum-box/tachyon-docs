---
title: "Anthropic Streaming SSE 修正 動作確認"
type: bugfix
emoji: "🧪"
topics:
  - LLM
  - Anthropic
  - Streaming
published: true
targetFiles:
  - packages/providers/anthropic/src/chat/stream.rs
  - packages/providers/anthropic/src/chat/stream_v2.rs
  - packages/providers/anthropic/src/chat/client.rs
  - apps/tachyon/src/app/v1beta/[tenant_id]/ai/chat/components/chat.tsx
github: https://github.com/quantum-box/tachyon-apps
---

# 動作確認レポート

## 概要
- [x] Rustサンプル（`cargo run --package anthropic --example stream`）ではコンテンツチャンクを確認
- [x] Tachyon API経由のSSEでコンテンツチャンクが流れることを `curl -N` と UI 双方で確認
- [x] 既存の非ストリーミングAPIが影響を受けないこと（`stream=false` リクエストは従来どおりJSONを返却）

## 確認項目
- [x] `/v1/llms/chatrooms/{id}/chat/completions` のストリーミング（`curl -sS -N` 実行で複数の `data: {...content...}` を受信）
- [x] `/v1/llms/chat/completions` のストリーミング（`curl -sS -N` 実行で複数の `data: {...content...}` を受信）
- [x] `/v1/llms/chat/completions` の非ストリーミング（正常）

## メモ
- 実施前
  - ストリームは `[DONE]` のみでコンテンツなし
- 実施後
  - Rustサンプルは従来どおりチャンクを取得
  - `curl -sS -N http://localhost:50054/v1/llms/chatrooms/<id>/chat/completions` で複数の `data:` イベントに本文が含まれることを確認
  - `GET /v1/llms/chatrooms/<id>/messages` で保存されたアシスタントメッセージに本文が格納されていることを確認（新規チャット）
  - Playwright で `http://localhost:16000/v1beta/<tenant>/ai/chat/new` を操作し、新規チャットではアシスタント応答がリアルタイムに表示されることを確認（既存の空レスポンスは従前データ）
  - 空文字のアシスタントメッセージが履歴に含まれても、API側でフィルタされ 500 応答は再現せず（UI も同様に非表示）
  - フロントのストリームエラー時に `isLoading` を解除し、再送できることを手動確認
