# 動作確認レポート

## Playwright MCP セッション

- 実行日時: 2025-10-12T18:45:00-07:00（PDT）
- シナリオ: `apps/tachyon` を起動した状態でログイン → Anthropic Claude 3.5 Sonnet を選択 → `provider/model` 形式のモデル指定でチャット送信。
- 検証内容:
  - [x] 送信前に `PaymentApp::check_billing` が呼ばれ、残高十分な場合にのみチャット送信が継続すること。
  - [x] ストリーミング応答内の usage 情報が `tachyon_apps_llms.llm_usages` に保存され、プロンプト/コンプリーションのトークン数が一致すること。
  - [x] 送信完了後に `consume_credits` がトリガーされ、NanoDollar残高が減算されること。
  - [x] UI 上で Anthropic 応答がレンダリングされ、OpenAI API エラーが発生しないこと。

## 追加確認

- [x] `model=anthropic/claude-3-5-sonnet-20241022` 指定時に `LLMModelName` が `Provider::Anthropic` を返し、フォールバックが発生しないこと。
- [x] 残高不足環境でチャットを送信した場合、HTTP 402 が返りメッセージ保存が行われないことを手動テストで確認。
