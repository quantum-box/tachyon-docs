---
title: "OpenAI Responses API Streaming Migration"
date: 2025-10-22
tags:
  - openai
  - llms
  - streaming
  - gpt5
summary: |
  GPT-5 系モデルを Tachyon の LLM スタックから利用するため、OpenAI Responses API を用いたストリーミング処理と課金連携を整備した。Chat Completions API では扱えなかった `delta` の配列形式に対応し、Usage 情報を正しく BillingAwareCommandStack に伝播させる。
---

## 概要

2025 年 10 月時点で GPT-5 系モデルは Responses API (`/v1/responses`) でのみ正式にサポートされている。既存の Chat Completions API 前提のストリーム実装では以下の問題が発生していた。

- `delta.content` が配列で返却されるため、チャンクが破棄され途中終了する。
- Usage 情報が含まれず BillingAwareCommandStack が課金処理を行えない。
- `temperature` など非サポートパラメーターを送信すると 400 エラーとなる。

本仕様では Responses API を利用したストリーミングフローを定義し、LLMS コンポーネント各所での呼び出し互換性を確保する。

## リクエスト仕様

### エンドポイント

- `POST https://api.openai.com/v1/responses`

### 必須ヘッダー

- `Authorization: Bearer <OPENAI_API_KEY>`
- `Content-Type: application/json`
- `Accept: text/event-stream`
- `OpenAI-Beta: responses-v1`

### ボディ主要項目

| フィールド | 型 | 備考 |
| --- | --- | --- |
| `model` | string | `gpt-5` 系モデル ID (`gpt-5`, `gpt-5-mini`, etc.) |
| `input` | array | `role` と `content` のペアでメッセージを定義。`content[].type` は `input_text`/`output_text`/`tool_result` など Responses API の仕様に従う。|
| `stream` | bool | SSE ストリーミングを有効化するため `true` |
| `temperature` | number? | GPT-5 では非サポートのため送信しない |
| `tools` | array? | ツール呼び出しを有効化する場合のみ指定 |

Sample:

```json
{
  "model": "gpt-5",
  "input": [
    {
      "role": "user",
      "content": [
        { "type": "input_text", "text": "List three colors." }
      ]
    }
  ],
  "stream": true
}
```

## レスポンス仕様

SSE (`text/event-stream`) にて JSON 行が返却される。主なイベントと処理内容は以下の通り。

| イベントタイプ | 対応処理 |
| --- | --- |
| `response.output_text.delta` / `response.refusal.delta` | テキストチャンクとして `ChatStreamChunk::Text` を生成 |
| `response.function_call.xxx` | ツール呼び出しを XML 互換形式に整形しチャンク化 |
| `response.reasoning.*` | `<thinking>...</thinking>` としてストリームへ連結 |
| `response.completed` | `usage.input_tokens` / `usage.output_tokens` から `ChatStreamChunk::Usage` を生成 |
| `response.error` | ProviderError としてストリームを終了 |

Usage チャンクは 1 度のみ送出され、BillingAwareCommandStack で課金処理を行う。

## 実装変更点

- `packages/providers/openai/src/chat/responses_stream.rs`
  - Responses API 用の SSE デコーダーとチャンク変換ロジックを追加。
  - GPT-5 系では `temperature` など非サポートパラメーターを除去。
- `packages/providers/openai/src/chat/stream_v2.rs`
  - モデル判定後に Responses API／Chat Completions API を切り替え。
- `packages/llms/src/usecase/command_stack/chat_stream.rs`
  - `ChatStreamInput.model` から Responses API 用の `Options` を正規化するヘルパーを追加。
- `packages/llms/src/adapter/gateway/llm_command_service.rs`
  - Agent API 経路でも同じ正規化を適用。

## テスト計画

- 単体テスト: `cargo test -p openai`、`cargo test -p llms`。
- 手動テスト: `OPENAI_API_KEY=... cargo run -p openai --example gpt5_chat_stream_v2`。
- Agent API 経路: `curl` または Tachyon UI から `openai/gpt-5` を指定し、チャンクが途切れず Usage が発火することを確認。

## 既知の制約 / 今後の対応

- GPT-5 の Responses API は現在テキスト出力のみサポート。画像・音声等が必要になった際は `input_image` 等のコンテンツタイプ対応が必要。
- `function_call` ブロックの arguments は JSON として返るが、一部文字列化された断片が流れるため、既存の XML パーサーで扱えるよう文字列マージと JSON 変換を実施している。
- 将来的に OpenAI 側が真のストリーミング（チャンク分割改善）を提供した場合には、Chunk 結合ロジックの再調整が必要。
