---
title: "AIチャット課金対応とモデル指定不具合修正"
type: "improvement"
emoji: "💬"
topics:
  - LLMs
  - Payment
  - Frontend
published: true
targetFiles:
  - packages/llms/src/adapter/axum/chat_completion_handler.rs
  - packages/llms/src/adapter/axum/chat_completion_on_chatroom_handler.rs
  - packages/llms/src/usecase/completion_chat.rs
  - packages/llms/src/usecase/stream_completion_chat.rs
  - packages/llms/src/domain/service/chat_completion.rs
  - packages/providers/llms_provider/src/models/stream.rs
  - packages/providers/openai/src/chat/stream.rs
  - packages/providers/anthropic/src/chat/stream.rs
  - apps/tachyon/src/app/v1beta/[tenant_id]/ai/chat/api.ts
  - docs/src/tasks/completed/v0.15.0/enable-chat-billing-and-model-routing/task.md
github: https://github.com/quantum-box/tachyon-apps
---

# AIチャット課金対応とモデル指定不具合修正

## 概要

LLMチャット画面で `model=anthropic/claude-opus-4-1-20250805` 等を指定した際に `openai` 向けモデルへ誤ってフォールバックし、OpenAI API キーエラーで送信に失敗する問題を解消する。また、チャット補完 API（同期・ストリーミング）に課金チェックとクレジット消費を組み込み、実際のトークン使用量に基づく NanoDollar 課金を可能にする。

### バージョン

- リリースバージョン: v0.15.0

## 背景・目的

- 現状の `LLMModelName::from_str` は `provider/model` 形式を扱えず、Anthropic を選択しても `openai:` プレフィックスが付与されるため 401 (invalid_api_key) が発生している。
- 運用要件として「チャットも課金対象にする」ことが決定しているが、Agent 実行と異なりチャット補完では `PaymentApp` との連携が未実装である。
- モデル選択の不具合を修正し、チャット補完経路でも Payment/Catalog コンテキストを活用することで、利用実績と課金記録を同期させる。

## 詳細仕様

### 機能要件

1. `LLMModelName::from_str` の解析ロジックを拡張し、`provider/model`・`provider:model`・`large`/`small` の各形式を正規化する。UI から渡されたモデル ID をそのまま backend に渡せば正しいプロバイダーが選択されること。
2. `POST /v1/llms/chat/completions` と `POST /v1/llms/chatrooms/{chatroom_id}/chat/completions` の両ハンドラーで、実行前に `PaymentApp::check_billing` を呼び出し、事後に `consume_credits` で確定額を差し引く。`CatalogAppService` から `product_id` と `ServiceCostBreakdown` を取得し、NanoDollar 金額を使用すること。
3. ストリーミング中に得られるトークン使用量を `LLMCompletionDomainServiceImpl::stream_completion` が集計できるように、`llms_provider::StreamOutput` に `usage` フィールドを追加し、OpenAI/Anthropic などの SSE パーサーを更新して usage が提供されたら埋め込む。
4. チャットメッセージ保存時に課金が失敗した場合はメッセージの永続化を行わず、400 番台のエラーを返す。課金成功後にのみユーザー・アシスタント両方のメッセージを保存すること。

**ユーザーストーリー**
- オペレーター管理者として、Anthropic モデルを選択してチャットを送信した際に OpenAI エラーなしで応答を得たい。
- 財務担当者として、チャット利用が NanoDollar の残高から差し引かれ、残高不足時には送信前にブロックしてほしい。

**受け入れ条件**
- `provider/model` 形式のモデルでチャット送信が成功し、レスポンスに Anthropic 応答が含まれる。
- チャット API 呼び出し時に `PaymentApp::check_billing` が呼ばれ、残高不足環境では 402/403 が返る。
- 正常完了時に `consume_credits` が呼ばれ、`ServiceCostBreakdown.total_nanodollars` と一致する NanoDollar が消費される。
- `tachyon_apps_llms.llm_usages` にプロンプト・コンプリーション両方のトークン数が保存される。
- 既存の Agent 実行フローは今回の変更で回帰しない。

### 非機能要件

- パフォーマンス: ストリーミング処理での追加負荷を最小限にし、SSE レイテンシの悪化を許容 5% 以内に抑える。
- セキュリティ: API キーなどセンシティブ情報をログに出力しない。課金失敗時も詳細な内部情報を返さない。
- 保守性: モデル ID の正規化は `LLMModelName` に集約し、他ユースケースからも再利用可能にする。課金ロジックはユースケース層で一元化し、`NoOpPaymentApp` 環境でも動作するように分岐する。

### コンテキスト別の責務

```yaml
contexts:
  llms:
    description: "チャット補完の API/ユースケース"
    responsibilities:
      - モデル名の正規化と LLM provider への委譲
      - ストリーミング出力からの usage 値抽出と保存
      - 課金チェック・消費のトリガー
  payment:
    description: "チャット利用分の残高検証とクレジット差し引き"
    responsibilities:
      - check_billing での実行可否判断
      - consume_credits による NanoDollar 消費
  catalog:
    description: "モデルごとの単価計算"
    responsibilities:
      - get_product_id_for_model で商品解決
      - calculate_service_cost でトークン数から費用算定
  frontend:
    description: "チャット UI"
    responsibilities:
      - 選択したモデル ID を `/` 形式含めそのまま送信
      - エラー発生時にユーザーへトースト表示
```

### 仕様のYAML定義

```yaml
usage_payload_example:
  executions: 1
  prompt_tokens: <prompt_tokens_from_stream>
  completion_tokens: <completion_tokens_from_stream>
  tool_calls:
    get_weather: <count>
    web_search: <count>

payment_inputs:
  resource_type: "llms_chat_completion"
  check_billing:
    executor: <executor_id>
    multi_tenancy: <MultiTenancy>
    estimated_cost_nanodollars: <estimate>
  consume_credits:
    amount_nanodollars: <actual_total_from_catalog>
    description: "chatroom:{chat_room_id} message:{message_id}"
```

## 実装結果 (2025-10-12 完了)

- `LLMModelName::from_str` を刷新し、`provider/model`・`provider:model`・ショートハンド (`large`/`small`) を正規化。Anthropic / Google / OpenAI の各モデルをUI指定どおりに解決。
- チャット補完API（通常・チャットルーム）で `CatalogAppService` → `PaymentApp` の課金フローを組み込み、残高不足時は `Error::PaymentRequired` を返却。
- `llms_provider::StreamOutput` に usage を追加し、OpenAI/Anthropic SSE パーサーが最終チャンクのトークン情報を抽出。`LLMCompletionDomainServiceImpl` で `tachyon_apps_llms.llm_usages` へ永続化。
- 課金とメッセージ保存を同一トランザクションにまとめ、`consume_credits` 成功後にのみチャット履歴をコミット。NoOpPaymentApp では課金チェックをスキップする分岐で後方互換性を維持。

## スケジュール

- ✅ 2025-10-12: モデルID正規化の調査・実装、APIハンドラ改修完了
- ✅ 2025-10-12: Catalog/Payment 連携設計とユースケース実装、Rustユニットテスト整備
- ✅ 2025-10-12: Playwright MCP セッションによる Anthropic モデル送信の動作確認、レポート更新

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| プロバイダーが usage 情報を返さない | 中 | usage 未提供時は推定値で課金し、警告ログとフォローアップタスクを記録 |
| 課金失敗後にメッセージだけ保存される | 高 | 課金成功前はメッセージを永続化しないトランザクション構成に変更 |
| モデル ID 正規化のバグで既存 API が壊れる | 中 | `large` `small` など既存ケースの回帰テスト追加 |

## 参考資料

- `docs/src/for-developers/llm-billing-implementation-rules.md`
- `docs/src/tachyon-apps/payment/llm-agent-billing.md`
- `docs/src/tachyon-apps/llms/tachyon_ai_studio.md`
- `docs/src/tachyon-apps/llms/chat-billing-and-model-routing.md`

## 実施テスト

- `cargo test -p llms`
- `cargo test -p providers` (SSEストリーム usage パーサーの追加分を含む)
- `mise run check`
- `yarn ts --filter=tachyon`
- `yarn lint --filter=tachyon`
- Playwright MCP: `apps/tachyon` のサインイン後に Anthropic Claude 3.5 Sonnet を指定したチャットを送信し、レスポンス成功と残高差分を確認

## 完了条件

- [x] Anthropic モデルを指定したチャット送信が成功し、OpenAI エラーが発生しない
- [x] チャット API 実行で `PaymentApp::check_billing` と `consume_credits` が呼ばれる（ログ・テストで確認）
- [x] `tachyon_apps_llms.llm_usages` にチャット実行ぶんのトークンが記録される
- [x] Rust/TypeScript 両方の静的チェック・テストが成功する
- [x] Playwright MCP での動作確認レポートを更新済み
