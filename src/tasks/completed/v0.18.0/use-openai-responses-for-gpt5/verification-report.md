# Verification Report — GPT-5 Responses API Migration

## 実行した検証

| 種類 | コマンド / 手順 | 結果 |
| --- | --- | --- |
| ユニットテスト | `cargo test -p openai` | ✅ Pass |
| ユニットテスト | `cargo test -p llms` | ✅ Pass |
| 手動検証 (Responses API SSE) | `OPENAI_API_KEY=... cargo run -p openai --example gpt5_chat_stream_v2` | ✅ GPT-5 から `<thinking>` / Usage チャンクを含むストリームを取得 |
| 手動検証 (旧chat API互換性) | `OPENAI_API_KEY=... cargo run -p openai --example gpt5_responses_stream` | ✅ テキストチャンク + Usage が連続して受信 |

## 期待する挙動

- GPT-5 モデル指定時は Responses API を利用し、SSE が途中でキャンセルされない。
- Usage チャンクが必ず 1 度だけ送信され、BillingAwareCommandStack が課金処理を継続できる。
- GPT-4 系モデルは従来どおり Chat Completions API を使用し、回帰は発生しない。

## 今後の確認事項

- OpenAI が `tool_result` 以外の `input_*` / `output_*` ブロックを追加した場合は、`responses_stream.rs` のマッピングに追従する。
- UI 側の動作確認（Playwright）は UI 変更が無いためスキップした。
