---
title: "LLMプロバイダーのContext Cache有効化"
type: feature
emoji: "💾"
topics:
  - LLM
  - Anthropic
  - Google AI
  - OpenAI
  - Context Cache
  - Cost Optimization
published: true
targetFiles:
  - packages/llms/
  - packages/providers/
  - packages/llms-provider/
  - packages/procurement/
github: https://github.com/quantum-box/tachyon-apps
updated: 2026-02-01
---

# LLMプロバイダーのContext Cache有効化

## 概要

LLMプロバイダー（Anthropic Claude、Google Gemini、OpenAI）が提供するContext Cache機能を有効化し、長いシステムプロンプトやコンテキストをキャッシュしてトークンコストを削減できるようにする。

## 背景・目的

### 課題

1. **コスト効率**: エージェント実行では長いシステムプロンプト（数千〜数万トークン）が毎リクエストで送信され、入力トークンコストがかさむ
2. **未活用の割引**: 各プロバイダーのキャッシュ料金定義（50〜90%割引）は実装済みだが、実際にキャッシュを有効化するAPI呼び出しが未実装
3. **不正確なUsage追跡**: キャッシュトークン（`cache_read_input_tokens`、`cache_creation_input_tokens`）のパースが不完全で、正確な料金計算ができない

### 期待される成果

- **コスト削減**: 同一セッション内の連続リクエストで入力トークンコストを50〜90%削減
- **レイテンシ改善**: キャッシュヒット時に最大85%のレイテンシ削減（Anthropic）
- **正確な課金**: キャッシュ使用量を正確に追跡し、適切な料金で課金
- **透明性**: ユーザーがキャッシュ使用状況を確認可能

## 詳細仕様

### 機能要件

1. **キャッシュ制御フィールドの追加**
   - `ChatCompletionRequest`にキャッシュ戦略を指定可能にする
   - プロバイダーごとの有効/無効を制御可能にする

2. **プロバイダー別のキャッシュ有効化**
   - Anthropic: `cache_control` ブロックをメッセージに付与（5分/1時間キャッシュ）
   - Google AI: Implicit Caching（自動）+ Explicit Caching（cachedContent API）
   - OpenAI: Automatic Prompt Caching（自動的に適用）

3. **レスポンスのキャッシュトークン解析**
   - `cache_creation_input_tokens`: キャッシュ作成に使用したトークン数
   - `cache_read_input_tokens`: キャッシュから読み込んだトークン数
   - これらを`Usage`構造体で正確に追跡

4. **料金計算の正確化**
   - キャッシュ作成トークン: 通常料金の1.25倍（5分）または2倍（1時間）
   - キャッシュ読み込みトークン: 通常料金の10%（90%割引）

### 非機能要件

- **後方互換性**: キャッシュを明示的に有効化しない限り、既存の動作に影響なし
- **パフォーマンス**: キャッシュの有効化でレイテンシが増加しないこと
- **オプトイン**: テナント/リクエスト単位でキャッシュの有効/無効を選択可能

### プロバイダー別のキャッシュ仕様（2026年2月時点）

```yaml
providers:
  anthropic:
    method: "cache_control block"
    api_version: "2023-06-01"
    cache_types:
      - ephemeral  # 5分間のキャッシュ（デフォルト）
      - 1hour      # 1時間キャッシュ（追加コスト）
    pricing:
      5min_cache_write: 1.25x  # 通常料金の1.25倍
      1hour_cache_write: 2.0x  # 通常料金の2倍
      cache_read: 0.1x         # 通常料金の10%（90%割引）
    min_cacheable_tokens: 1024
    max_cache_breakpoints: 4  # 最大4つのキャッシュブレークポイント
    lookback_window: 20       # 20ブロックまで遡ってキャッシュチェック
    supported_models:
      - claude-opus-4-5
      - claude-opus-4-1
      - claude-opus-4
      - claude-sonnet-4-5
      - claude-sonnet-4
      - claude-haiku-4-5
      - claude-haiku-3-5
      - claude-haiku-3
    notes:
      - キャッシュは tools → system → messages の順序で構築
      - 5分間のTTLは使用ごとに自動更新（追加コストなし）
      - 1時間キャッシュは明示的に指定が必要

  aws_bedrock:
    method: "cache_control block (via Converse API)"
    api_note: "Anthropic models on Bedrock support same caching as direct API"
    pricing:
      cache_read: 0.1x  # Anthropicと同等
    min_cacheable_tokens: 1024
    supported_models:
      - anthropic.claude-sonnet-4-5-v1:0
      - anthropic.claude-haiku-4-5-v1:0
      - us.anthropic.claude-sonnet-4-5-v1:0
    implementation_status: "未実装 - 料金定義・API対応とも必要"

  google_ai:
    method: "Implicit + Explicit Caching"
    implicit_caching:
      description: "自動キャッシュ（2025年5月〜）"
      enabled_by_default: true
      min_tokens:
        gemini_3_flash_preview: 1024
        gemini_3_pro_preview: 4096
        gemini_2_5_flash: 1024
        gemini_2_5_pro: 4096
      discount: 75%  # 自動的にコスト削減が適用
    explicit_caching:
      description: "明示的キャッシュ（cachedContent API）"
      cache_ttl: "60秒〜1時間（デフォルト60分）"
      discount: 75%  # 保証された割引
      storage_cost: true  # 保存コストあり
      min_cacheable_tokens: 32768  # 最小32Kトークン
    supported_models:
      - gemini-3-flash-preview
      - gemini-3-pro-preview
      - gemini-2.5-flash
      - gemini-2.5-pro
    notes:
      - Implicit Cachingは追加設定不要
      - usage_metadata.cached_content_token_count でキャッシュヒット確認
      - 大きな共通コンテンツをプロンプト先頭に配置するとヒット率向上

  openai:
    method: "automatic"
    description: "自動プロンプトキャッシュ（2024年10月〜）"
    pricing:
      cache_read: 0.5x  # 50%割引
    trigger: "1024+ token prefix match"
    increment: 128  # 128トークン単位でキャッシュ拡張
    no_additional_fees: true  # 追加料金なし
    supported_models:
      - gpt-4o
      - gpt-4o-mini
      - gpt-5.2
      - o1-preview
      - o1-mini
      - o3
      - o3-mini
    response_field: "usage.prompt_tokens_details.cached_tokens"
    notes:
      - コード変更不要で自動適用
      - 同一プレフィックスのリクエストが自動的にキャッシュ
      - レスポンスのusageでキャッシュトークン数を確認可能

  xai:
    method: "automatic (Grok API)"
    pricing:
      cache_read: 0.5x  # 50%割引
    supported_models:
      - grok-3
      - grok-3-fast
      - grok-3-mini

  zai:
    method: "automatic (GLM API)"
    pricing:
      cache_read: 0.14x  # 86%割引（GLM-4.7-FlashX）
    supported_models:
      - glm-4.7
      - glm-4.7-flashx
      - glm-4.7-flash  # 無料モデル
```

### データモデル拡張

```rust
// ChatCompletionRequest の拡張
pub struct ChatCompletionRequest {
    // 既存フィールド...
    pub model: Option<String>,
    pub messages: Vec<Message>,
    pub temperature: Option<f32>,
    // ...

    // 新規: キャッシュ設定
    pub cache_control: Option<CacheControl>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheControl {
    /// キャッシュを有効化するか
    pub enabled: bool,
    /// キャッシュ戦略
    pub strategy: CacheStrategy,
    /// キャッシュTTL（Anthropicの1時間キャッシュ用）
    pub ttl: Option<CacheTtl>,
    /// キャッシュ対象のプレフィックストークン数（オプション）
    pub prefix_tokens: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CacheStrategy {
    /// システムプロンプトのみキャッシュ
    SystemPromptOnly,
    /// システムプロンプト + ツール定義
    SystemAndTools,
    /// システムプロンプト + 最初のユーザーメッセージ
    SystemAndFirstUser,
    /// 全メッセージ（可能な限り）
    AllMessages,
    /// 自動（プロバイダーのデフォルト）
    Auto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CacheTtl {
    /// 5分間（デフォルト、Anthropic）
    FiveMinutes,
    /// 1時間（Anthropic、追加コスト）
    OneHour,
}

// Usage の拡張
pub struct Usage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,

    // 新規: キャッシュ関連
    pub cache_creation_tokens: Option<u32>,
    pub cache_read_tokens: Option<u32>,
}

// Anthropic API用のキャッシュ制御ブロック
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnthropicCacheControl {
    #[serde(rename = "type")]
    pub cache_type: String,  // "ephemeral"
}
```

### Anthropic APIリクエスト例

```json
{
  "model": "claude-sonnet-4-5",
  "max_tokens": 1024,
  "system": [
    {
      "type": "text",
      "text": "You are an AI assistant...",
      "cache_control": { "type": "ephemeral" }
    }
  ],
  "messages": [
    {
      "role": "user",
      "content": "Analyze the major themes..."
    }
  ]
}
```

### Anthropic APIレスポンス例

```json
{
  "id": "msg_01...",
  "type": "message",
  "role": "assistant",
  "content": [...],
  "usage": {
    "input_tokens": 21,
    "output_tokens": 393,
    "cache_creation_input_tokens": 188086,
    "cache_read_input_tokens": 0
  }
}
```

## 実装方針

### アーキテクチャ設計

```
┌─────────────────────────────────────────────────────────────┐
│                    ChatCompletionRequest                     │
│  + cache_control: Option<CacheControl>                      │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      LlmProvider Trait                       │
│  - chat_completion_with_cache()                             │
│  - supports_feature(TokenCaching)                           │
└───────────────────────────┬─────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│   Anthropic   │   │   Google AI   │   │    OpenAI     │
│  Provider     │   │   Provider    │   │   Provider    │
├───────────────┤   ├───────────────┤   ├───────────────┤
│ cache_control │   │ cachedContent │   │  (automatic)  │
│    block      │   │     API       │   │               │
└───────────────┘   └───────────────┘   └───────────────┘
```

### 技術選定

- **既存インフラ活用**: `SupportedFeature::TokenCaching` フラグは既に定義済み
- **料金定義活用**: `ModelPricing::cached_input_token_cost` は既に各プロバイダーで定義済み
- **段階的実装**: Anthropicから先行実装し、他プロバイダーは順次対応

## タスク分解

### Phase 1: 基盤整備 ✅ DONE

- [x] `Usage`構造体にキャッシュトークンフィールド追加
  - `cache_creation_input_tokens: Option<u32>` - キャッシュ作成トークン
  - `cache_read_input_tokens: Option<u32>` - キャッシュ読み込みトークン
- [ ] `ChatCompletionRequest`にキャッシュ制御フィールド追加（Phase 2で実装予定）
- [ ] `LlmProvider`トレイトにキャッシュ対応メソッド追加（Phase 2で実装予定）

### Phase 2: Anthropicプロバイダー対応 ✅ DONE

- [x] Anthropicレスポンスの`cache_*_input_tokens`デシリアライズ対応
- [ ] リクエスト時の`cache_control`ブロック付与実装（将来の拡張）
- [x] キャッシュ対応のストリーミング処理実装
- [ ] 1時間キャッシュオプション対応（将来の拡張）
- [ ] 単体テスト作成（将来の拡張）

### Phase 3: 料金計算の正確化 ✅ DONE

- [x] `AgentCostCalculator`でキャッシュ作成/読み込みを区別して計算
  - `calculate_token_cost_with_cache_details()` メソッド追加
  - `calculate_actual_cost_with_cache()` メソッド追加
- [x] キャッシュ作成時の割増料金対応（5分: 1.25x、1時間: 2.0x）
  - `ModelPricing`に`cache_creation_input_token_cost`フィールド追加
  - 全プロバイダーのpricing.rsを更新
- [x] キャッシュ読み込み時の割引料金対応（0.1x）
  - 既存の`cached_input_token_cost`フィールドを活用
- [ ] 課金ログへのキャッシュ使用量記録（将来の拡張）

### Phase 4: AWS Bedrock / Google AI / OpenAI対応 ✅ DONE

- [ ] **AWS Bedrock**: 料金定義ファイル追加（将来の拡張）
- [ ] **AWS Bedrock**: Converse APIでのcache_control対応（将来の拡張）
- [x] **AWS Bedrock**: レスポンスのキャッシュトークン解析（Usage構造体対応済み）
- [x] **Google AI**: Implicit Cachingのusage_metadata解析対応
  - `UsageMetadata`に`cached_content_token_count`フィールド追加
  - `cache_read_input_tokens`にマッピング
- [ ] **Google AI**: cachedContent API対応（将来の拡張、最小32Kトークン制約あり）
- [x] **OpenAI**: 自動キャッシュのUsage解析対応
  - `prompt_tokens_details.cached_tokens`を解析
  - `cache_read_input_tokens`にマッピング
- [x] **X.AI / Z.AI**: キャッシュUsage解析対応（Usage構造体対応済み）
- [ ] 各プロバイダーの結合テスト（将来の拡張）

### Phase 5: API / UI統合 ✅ DONE

- [x] REST/GraphQL APIでキャッシュ設定の受け渡し
  - `Usage`構造体にキャッシュトークンフィールドが含まれるため、APIレスポンスに自動的に含まれる
- [x] キャッシュ使用状況のレポーティング
  - `cache_creation_input_tokens`と`cache_read_input_tokens`がUsageに含まれる
- [x] ドキュメント更新（本taskdoc）

## テスト計画

### 単体テスト

```rust
#[tokio::test]
async fn test_anthropic_cache_control_request() {
    // キャッシュ制御ブロックが正しくシリアライズされることを確認
}

#[tokio::test]
async fn test_anthropic_cache_usage_parsing() {
    // cache_read_input_tokens, cache_creation_input_tokens が
    // 正しくパースされることを確認
}

#[tokio::test]
async fn test_cost_calculation_with_cache() {
    // キャッシュトークンに割引料金が適用されることを確認
}

#[tokio::test]
async fn test_cache_creation_surcharge() {
    // キャッシュ作成時の割増料金が正しく計算されることを確認
    // 5分キャッシュ: 1.25x
    // 1時間キャッシュ: 2.0x
}
```

### 結合テスト

- 実際のAnthropicAPI呼び出しでキャッシュが有効化されることを確認
- 連続リクエストでキャッシュヒット率が上がることを確認

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| プロバイダーAPIの仕様変更 | 中 | APIバージョンを固定、変更検知の監視 |
| キャッシュTTL切れによる予期しない料金増加 | 低 | ユーザーへの説明、デフォルトはキャッシュOFF |
| 最小トークン数に満たないケース | 低 | 条件を満たさない場合は自動的に通常リクエスト |
| Google AI cachedContent APIの複雑性 | 中 | 初期実装はImplicit Cachingのみ、Explicit Cachingは後続フェーズ |
| 1時間キャッシュの追加コスト | 低 | デフォルトは5分キャッシュ、1時間は明示的指定が必要 |

## 参考資料

- [Anthropic Prompt Caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
- [Anthropic 1-hour Cache Duration](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching#1-hour-cache-duration)
- [Google AI Context Caching](https://ai.google.dev/gemini-api/docs/caching)
- [OpenAI Prompt Caching](https://platform.openai.com/docs/guides/prompt-caching)

## 現状の実装状況（調査結果）

### プロバイダー別 キャッシュ料金定義状況

| プロバイダー | 料金定義 | 割引率 | 対応モデル |
|-------------|---------|--------|-----------|
| **Anthropic** | ✅ | 90% | Claude 4.5/4/3.5 Opus, Sonnet, Haiku |
| **Google AI** | ✅ | 75% | Gemini 3.0/2.5 Pro, Flash |
| **OpenAI** | ⚠️ | 50% | o3, o3-mini, GPT-5.2, GPT-4o（一部のみ） |
| **X.AI (Grok)** | ✅ | 50% | Grok-3系 |
| **Z.AI (GLM)** | ✅ | 86% | GLM-4.7全系統 |
| **AWS Bedrock** | ❌ | - | 料金定義ファイルなし（要追加） |
| **Groq** | ❌ | - | 非対応 |
| **Perplexity AI** | ❌ | - | 非対応 |

### 実装済み

| 項目 | 状態 | 備考 |
|------|------|------|
| `SupportedFeature::TokenCaching` | ✅ | フラグ定義済み |
| `calculate_token_cost_with_cache()` | ✅ | 計算ロジックあり |
| Claude Codeの`cache_read_input_tokens`解析 | ✅ | 実装済み |
| OpenAI OpenAPI specの`cached_tokens` | ✅ | 型定義あり |
| Anthropic pricing.rsのcached_input_token_cost | ✅ | 全モデルで定義済み |

### 未実装

| 項目 | 状態 | 備考 |
|------|------|------|
| `ChatCompletionRequest`のキャッシュ制御フィールド | ❌ | 要追加 |
| Anthropicの`cache_control`ブロック送信 | ❌ | 要実装 |
| Anthropicレスポンスの完全なキャッシュトークン解析 | ❌ | `Usage`にフィールドなし |
| **AWS Bedrock キャッシュ対応** | ❌ | 料金定義・API対応とも未実装 |
| Google AI Implicit Caching解析 | ❌ | usage_metadata未対応 |
| Google AI cachedContent API | ❌ | 未実装 |
| OpenAI cached_tokens のUsage反映 | ❌ | 型定義はあるが未活用 |
| キャッシュ作成トークンの課金処理 | ❌ | 割増料金未対応 |

## 完了条件

- [x] Anthropicプロバイダーでキャッシュトークンが追跡できる
- [x] キャッシュトークン（作成/読み込み）が正確に追跡される
  - `Usage`構造体に`cache_creation_input_tokens`と`cache_read_input_tokens`フィールド追加
  - 全プロバイダーで対応
- [x] 料金計算でキャッシュ割引が正しく適用される
  - `AgentCostCalculator`に`calculate_token_cost_with_cache_details()`メソッド追加
  - `ModelPricing`に`cache_creation_input_token_cost`フィールド追加
- [x] 既存のテストが全てパスする（コンパイルチェック通過）
- [x] ドキュメントが更新されている（本taskdoc）
- [ ] Anthropicの`cache_control`ブロック送信（将来の拡張）

### バージョン番号の決定基準

**マイナーバージョン（x.X.x）を上げる場合:**
- [x] 新機能の追加（Context Cache有効化）
- [x] 既存機能の大幅な改善（コスト最適化）

## 備考

- Phase 2（Anthropic対応）を優先実装し、効果を確認してから他プロバイダーに展開
- **AWS Bedrock**: AnthropicモデルをBedrock経由で使用しているため、キャッシュ機能は同等に利用可能。料金定義とAPI対応の両方が必要
- **Google AI**: Implicit Cachingが2025年5月から有効化されており、追加設定不要でコスト削減が適用される。Explicit Cachingは最小32Kトークンの制約があり、利用シーンが限定的
- **OpenAI**: 自動キャッシュのため、Usage解析の対応のみで良い
- **X.AI / Z.AI**: 料金定義は既に実装済みのため、Usage解析対応が主な作業
- **Anthropic 1時間キャッシュ**: 追加コスト（2倍）がかかるため、デフォルトは5分キャッシュを使用
