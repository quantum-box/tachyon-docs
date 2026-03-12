# AnthropicストリーミングSSE仕様

## 背景
- Anthropic Claude系モデルを`stream=true`で呼び出した際に本文チャンクが欠落し、`[DONE]`のみがフロントに届く不具合を解消した結果仕様を整理する。
- プロバイダー層からフロントエンドまでのSSEパイプラインを見直し、チャンク破棄やヘッダー不足が再発しないよう責務を明確化する。

## 全体アーキテクチャ
- **プロバイダー層**（`packages/providers/anthropic`）がAnthropic APIへのHTTPストリームを受信し、チャンクをバッファリングして正規化する。
- **LLM API層**（`packages/llms`）がバックエンドSSEへ再ラップし、課金計測とイベント種別ごとのシリアライゼーションを担う。
- **Tachyonフロントエンド**が`EventSource`で受信したチャンクを逐次マージし、テキスト・ツールレスポンス・完了イベントをUIに反映する。

```mermaid
graph TD
  A[Client Request<br/>stream=true] --> B[apps/tachyon-api<br/>/v1/llms/chat(completions)]
  B --> C[packages/llms<br/>StreamCompletionChat]
  C --> D[packages/providers/anthropic<br/>send_chat_completion_stream]
  D -->|SSE| E[Anthropic API]
  D --> C
  C -->|SSE(JSON Lines)| B
  B -->|text/event-stream| F[apps/tachyon<br/>EventSource Handler]
  F --> G[UI State Store]
```

## バックエンド仕様
### Anthropicプロバイダー
- `Accept: text/event-stream` と `anthropic-beta: messages-2023-12-15` を必ず送信する。ヘッダー群は`CLIENT_STREAM_HEADERS`として定数化済み。
- `StreamDecoder`が`data:`行の途中でソケットが切断された場合でもバッファを維持し、次行で連結してからJSONデコードする。
- `content_block_delta`や`message_delta`などイベントタイプはそのまま保持し、欠損させない。

### LLM API層
- `StreamCompletionChat`ユースケースが入力ごとに`StreamOutput::ContentDelta`を即座にSSEへ流し、Billingラッパーでは`StreamOutput::Done`のみでクレジット精算を行う。
- `/v1/llms/chat/completions` と `/v1/llms/chatrooms/:id/chat/completions` の双方で同一ストリームシリアライザを共有し、`delta.content`が**文字列**/**配列**のどちらでもJSON文字列としてそのまま転送する。
- エラー発生時は`event: error`でJSON化した`ErrorPayload`を送信し、SSEクライアントが復旧可能なようにHTTP 200を維持する。

## フロントエンド仕様
- `apps/tachyon/src/app/v1beta/[tenant_id]/ai/chat/api.ts`の`subscribeToChatStream`が`EventSource`を生成し、サーバー送信イベントを`onmessage`で受信する。
- 各イベントの`data`は`JSON.parse`後に`type`スイッチングで処理する：
  - `content_block_delta`: `text_delta`はストアに逐次追加、`input_json_delta`はツール入出力モーダルへ反映。
  - `message_delta`: `stop_reason` を保存してUIフッターで完了表示。
  - `message_stop`: ストリーム完了として会話履歴に永続化。
- `useChatMessages`フックが`delta.content`に配列が届いた場合もflatMapして文字列抽出するロジックを実装し、空文字の初回チャンクも`pending`メッセージとして保持する。

## 動作確認
- **cURL**: `curl -N -H "Authorization: Bearer dummy-token" -H "x-operator-id: tn_01hjryxysgey07h5jz5wagqj0m" http://localhost:50054/v1/llms/chat/completions -d '{..."stream":true}'` で本文チャンクが複数行出力されること。
- **Provider Example**: `cargo run --package anthropic --example stream` で`content_block_delta`が順序通り出力されること。
- **UI**: Tachyonチャット画面でAnthropicモデルを選択し、メッセージ送信後にレスポンスが逐次表示されること。

## 既知の制約
- Anthropic CLI経由のレスポンスはトークン単位ではなくチャンク単位でまとめて届くため、完全なリアルタイム性はAnthropic側仕様に依存する。
- `EventSource` がネットワーク瞬断で落ちた場合は自動再接続するが、バックエンドで`conversation_id`が見つからない場合には400エラーで即座にクローズされる。

## 関連資料
- タスク記録: `docs/src/tasks/completed/v0.15.0/fix-anthropic-streaming-response/`
- 動作確認レポート: `docs/src/tasks/completed/v0.15.0/fix-anthropic-streaming-response/verification-report.md`
