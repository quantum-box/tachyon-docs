---
title: "Context Cache明示的有効化（cache_controlブロック送信）"
type: feature
emoji: "💾"
topics:
  - LLM
  - Anthropic
  - AWS Bedrock
  - Google AI
  - Context Cache
  - Cost Optimization
published: true
targetFiles:
  - packages/llms/
  - packages/providers/
  - packages/llms-provider/
github: https://github.com/quantum-box/tachyon-apps
created: 2026-02-01
---

# Context Cache明示的有効化（cache_controlブロック送信）

## 概要

Context Cache機能のPhase 1-5（トークン追跡・料金計算）が完了したため、次のステップとしてキャッシュを**明示的に有効化**するAPI呼び出しを実装する。

## 背景・目的

### 前提条件（完了済み）

- `Usage`構造体に`cache_creation_input_tokens`と`cache_read_input_tokens`フィールド追加済み
- `AgentCostCalculator`でキャッシュトークンの料金計算対応済み
- OpenAI/Google AIのUsage解析対応済み
- 全プロバイダーの`ModelPricing`に`cache_creation_input_token_cost`フィールド追加済み

### 課題

1. **Anthropic**: `cache_control`ブロックをリクエストに付与しないとキャッシュが有効化されない
2. **AWS Bedrock**: Anthropicモデル使用時のキャッシュ対応が未実装
3. **Google AI**: Explicit Caching（cachedContent API）が未実装

### 期待される成果

- Anthropicプロバイダーでキャッシュを明示的に有効化できる
- AWS BedrockでAnthropicモデルのキャッシュが利用可能
- Google AIでExplicit Cachingが利用可能（最小32Kトークン制約あり）

## 詳細仕様

### Anthropic cache_controlブロック

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
  "messages": [...]
}
```

### キャッシュ戦略

```rust
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
```

### キャッシュTTL

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CacheTtl {
    /// 5分間（デフォルト、Anthropic）- 1.25x料金
    FiveMinutes,
    /// 1時間（Anthropic）- 2.0x料金
    OneHour,
}
```

## タスク分解

### Phase 1: Anthropic cache_control送信 📝 TODO

- [ ] `ChatCompletionRequest`に`cache_control`フィールド追加
- [ ] Anthropicプロバイダーでリクエスト時に`cache_control`ブロック付与
- [ ] キャッシュ戦略の実装（SystemPromptOnly, SystemAndTools等）
- [ ] 1時間キャッシュオプション対応
- [ ] 単体テスト作成

### Phase 2: AWS Bedrock対応 📝 TODO

- [ ] AWS Bedrock料金定義ファイル追加
- [ ] Converse APIでのcache_control対応
- [ ] Anthropicモデル使用時のキャッシュ有効化
- [ ] 結合テスト作成

### Phase 3: Google AI Explicit Caching 📝 TODO

- [ ] cachedContent API対応
- [ ] 最小32Kトークン制約のバリデーション
- [ ] キャッシュTTL管理（60秒〜1時間）
- [ ] ストレージコスト計算対応

### Phase 4: テスト・ドキュメント 📝 TODO

- [ ] 各プロバイダーの結合テスト
- [ ] キャッシュ効果の検証（コスト削減率、レイテンシ改善）
- [ ] ユーザードキュメント作成

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 最小トークン数に満たないケース | 低 | 条件を満たさない場合は自動的に通常リクエスト |
| 1時間キャッシュの追加コスト | 低 | デフォルトは5分キャッシュ、1時間は明示的指定が必要 |
| Google AI cachedContent APIの複雑性 | 中 | 最小32Kトークン制約を明確にドキュメント化 |

## 参考資料

- [Anthropic Prompt Caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
- [Anthropic 1-hour Cache Duration](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching#1-hour-cache-duration)
- [Google AI Context Caching](https://ai.google.dev/gemini-api/docs/caching)
- [AWS Bedrock Converse API](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html)

## 完了条件

- [ ] Anthropicプロバイダーでキャッシュを明示的に有効化できる
- [ ] AWS BedrockでAnthropicモデルのキャッシュが利用可能
- [ ] Google AIでExplicit Cachingが利用可能
- [ ] 各プロバイダーの結合テストがパスする
- [ ] ドキュメントが更新されている

## 関連タスク

- [enable-context-cache](../completed/enable-context-cache/task.md) - Phase 1-5（トークン追跡・料金計算）完了済み
