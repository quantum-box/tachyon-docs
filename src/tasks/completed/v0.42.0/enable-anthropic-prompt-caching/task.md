---
title: "全プロバイダーPrompt Caching有効化"
type: "improvement"
emoji: "⚡"
topics: ["LLM", "Anthropic", "Bedrock", "XAI", "Google AI", "prompt-caching", "cost-optimization"]
published: true
targetFiles:
  - packages/providers/anthropic/src/chat/types.rs
  - packages/providers/anthropic/src/chat/client.rs
  - packages/providers/aws/src/bedrock/chat.rs
  - packages/providers/aws/src/bedrock/stream_v2.rs
  - packages/providers/aws/src/bedrock/pricing.rs
  - packages/providers/xai/src/chat.rs
  - packages/procurement/src/pricing_registry.rs
  - apps/tachyon-api/src/di.rs
github: https://github.com/quantum-box/tachyon-apps
---

# 全プロバイダーPrompt Caching有効化

## 概要

Agent APIの全LLMプロバイダーでPrompt Cachingを有効化・最適化する。`cache_control`パラメータの送信（Anthropic/Bedrock）、キャッシュトークンのレスポンス読み取り（XAI）、価格定義の追加・検証を行う。

## 背景・目的

- Agent APIでは毎回のLLM呼び出しで大量のシステムプロンプト（ツール定義含む）が送信されている
- Anthropic/BedrockのPrompt Cachingが未有効化
- XAIのキャッシュトークン読み取りが未実装
- Bedrockの価格定義が未作成

## プロバイダー別対応

### Anthropic ✅

`cache_control`パラメータをリクエストに付与し、システムプロンプトと会話履歴プレフィックスをキャッシュ。

**キャッシュ戦略:**
- ブレークポイント1: システムプロンプトの末尾（全ターンで共通）
- ブレークポイント2: 会話履歴の最後から2番目のメッセージ（プレフィックスキャッシュ）

**価格（NanoDollar/token）:**
| モデル | 入力 | キャッシュ読み取り | キャッシュ作成 |
|--------|------|---------------------|----------------|
| Claude Sonnet 4.5 | 3,000 | 300 (90%減) | 3,750 (25%増) |
| Claude Opus 4.5 | 20,000 | 2,000 (90%減) | 25,000 (25%増) |
| Claude Haiku 4.5 | 150 | 15 (90%減) | 188 (25%増) |

### AWS Bedrock ✅

Anthropicと同じ`cache_control`メカニズムを適用（BedrockはAnthropic Messages API形式を使用）。

**変更内容:**
- [x] `BedrockRequest.system`を`Option<Vec<TextContentBlock>>`に変更
- [x] `CacheControl`/`TextContentBlock`型の追加
- [x] `BedrockUsage`にキャッシュフィールド追加
- [x] `message_start`イベントからキャッシュトークン読み取り
- [x] `stream_v2.rs`でキャッシュトークンの集約・伝搬
- [x] `pricing.rs`新規作成（Claude 4.5 Sonnet/Haiku）
- [x] `IntegratedPricingProvider`に`bedrock/`プレフィックス対応
- [x] `di.rs`にBedrockPricingProvider登録

**価格**: Anthropic直接APIと同一

### XAI ✅

自動キャッシュ（OpenAI互換）。レスポンスからキャッシュトークンを読み取るよう修正。

**変更内容:**
- [x] `PromptTokensDetails`構造体追加
- [x] `ResponseUsage.prompt_tokens_details`フィールド追加
- [x] `From<ResponseUsage> for Usage`でキャッシュトークンをマッピング
- [x] `chat_stream_v2`でキャッシュトークンを伝搬

**価格（NanoDollar/token）:**
| モデル | 入力 | キャッシュ読み取り | 割引率 |
|--------|------|---------------------|--------|
| grok-4 | 3,000 | 750 | 75%減 |
| grok-4-fast-* | 200 | 50 | 75%減 |

### Google AI ✅ (変更不要)

Implicit caching（自動キャッシュ）により追加対応不要。
- レスポンスの`cached_content_token_count`読み取りは実装済み
- 価格設定は入力価格の25%（75%割引）で正確

**価格（NanoDollar/token）:**
| モデル | 入力 | キャッシュ読み取り | 割引率 |
|--------|------|---------------------|--------|
| Gemini 3.0 Pro | 1,250 | 313 | 75%減 |
| Gemini 3.0 Flash | 100 | 25 | 75%減 |
| Gemini 2.5 Flash Lite | 20 | 5 | 75%減 |

### OpenAI (対応済み)

自動キャッシュ、`prompt_tokens_details.cached_tokens`読み取り実装済み。

## タスク分解

### Anthropicプロバイダー ✅
- [x] `types.rs`: `CacheControl`, `TextContentBlock` 型の追加
- [x] `types.rs`: `ChatRequest.system`を`Option<Vec<TextContentBlock>>`に変更
- [x] `types.rs`: `ChatMessageRequest::AssistantCached`, `ChatMessageUserResponse::Cached` バリアント追加
- [x] `client.rs`: `build_request_body`でシステムプロンプトに`cache_control`を付与
- [x] `client.rs`: `apply_conversation_cache`で会話履歴プレフィックスにキャッシュブレークポイント付与
- [x] `types.rs`: シリアライズテスト4件追加

### Bedrockプロバイダー ✅
- [x] `chat.rs`: `CacheControl`/`TextContentBlock`型追加、system配列化
- [x] `chat.rs`: `BedrockUsage`にキャッシュフィールド追加
- [x] `chat.rs`: `message_start`イベントハンドリング追加
- [x] `stream_v2.rs`: キャッシュトークン集約・伝搬
- [x] `pricing.rs`: Bedrock価格定義（新規作成）
- [x] `pricing_registry.rs`: `bedrock/`/`global.`プレフィックス対応
- [x] `di.rs`: BedrockPricingProvider登録

### XAIプロバイダー ✅
- [x] `chat.rs`: `PromptTokensDetails`構造体追加
- [x] `chat.rs`: `ResponseUsage`にキャッシュフィールド追加
- [x] `chat.rs`: Usage変換でキャッシュトークンマッピング
- [x] `chat.rs`: `chat_stream_v2`でキャッシュトークン伝搬

### Google AIプロバイダー ✅ (変更不要)
- [x] 価格検証（25%割引率 = 正確）
- [x] `cached_content_token_count`読み取り実装済み

### 検証 ✅
- [x] コンパイル確認（`mise run check` 成功、warning 0件）
- [x] ユニットテスト合格（50/50、統合テスト5件はAPIキー未設定でスキップ）

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 最小トークン未満のシステムプロンプト | 低 | 短い場合はキャッシュが無視されるだけで害はない |
| API互換性 | 低 | Anthropic/Bedrock APIは文字列/配列両方をsystem fieldに受け付ける |
| キャッシュ作成コスト | 低 | 初回25%増だが、2回目以降90%減。即座にペイ |
| Bedrock APIバージョン互換性 | 低 | `bedrock-2023-05-31`はcache_controlをサポート |

## 完了条件

- [x] Anthropicプロバイダーが`cache_control`付きリクエストを送信する
- [x] Bedrockプロバイダーが`cache_control`付きリクエストを送信する
- [x] Bedrockのキャッシュトークンをレスポンスから読み取る
- [x] XAIのキャッシュトークンをレスポンスから読み取る
- [x] Bedrock価格定義が作成されている
- [x] 全プロバイダーの価格が正確に設定されている
- [x] コンパイルが通る
- [x] 既存の動作に影響がない（後方互換）
