# LLMプロバイダーIaC設定

## 概要

LLMプロバイダー（OpenAI、Anthropic、Google AI、xAI等）はIaCマニフェスト経由で設定・管理される。環境変数へのフォールバックも有効で、移行期間中の互換性を維持している。

## 設定方法

### IaCマニフェストでの設定

`scripts/seeds/n1-seed/003-iac-manifests.yaml` の対象テナント設定に以下の形式でAIプロバイダーを追加：

```yaml
spec:
  providers:
    - config:
        api_key: your-openai-api-key
      name: openai
      provider_type: ai
    - config:
        api_key: your-anthropic-api-key
      name: anthropic
      provider_type: ai
    - config:
        api_key: your-google-ai-api-key
      name: google_ai
      provider_type: ai
    - config:
        api_key: your-xai-api-key
      name: xai
      provider_type: ai
```

設定後は `mise run docker-seed` でDBに適用し、APIを再起動する。

### 環境変数フォールバック

IaCマニフェストに設定がない場合、以下の環境変数にフォールバック：

| プロバイダー | 環境変数 |
|-------------|----------|
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| Google AI | `GOOGLE_AI_API_KEY` または `GEMINI_API_KEY` |
| xAI | `XAI_API_KEY` |

AWS Bedrockは IAM認証を使用するため、IaCマニフェスト設定不要（環境のAWS認証情報を使用）。

## アーキテクチャ

### コンポーネント

```
┌─────────────────────────────────────────────────────────────────┐
│                         tachyon-api                              │
├─────────────────────────────────────────────────────────────────┤
│  di.rs                                                           │
│    └── LlmProviderRegistry::new(iac_config_provider)            │
│          └── get_concrete_providers(tenant_id)                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    LlmProviderRegistry                           │
├─────────────────────────────────────────────────────────────────┤
│  + get_providers(tenant_id) -> Result<LLMProviders>             │
│  + get_concrete_providers(tenant_id) -> Result<ConcreteProviders>│
│                                                                  │
│  内部:                                                           │
│    - IacConfigurationProvider経由でAiProviderConfigを取得        │
│    - 各プロバイダーをインスタンス化してキャッシュ                  │
│    - 環境変数フォールバック（fallback_to_env = true）            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  IacConfigurationProvider                        │
├─────────────────────────────────────────────────────────────────┤
│  + get_config(tenant_id) -> ProviderConfiguration               │
│    └── providers: [OpenAI, Anthropic, GoogleAI, xAI, ...]       │
└─────────────────────────────────────────────────────────────────┘
```

### キャッシュ機構

- **TTL**: 1時間（デフォルト）
- **最大エントリ数**: 100
- テナントIDをキーにしたプロバイダーキャッシュ
- 期限切れまたは最大サイズ超過時に自動evict

## 関連ファイル

| ファイル | 説明 |
|---------|------|
| `packages/llms/src/registry/llm_provider_registry.rs` | LlmProviderRegistry実装 |
| `packages/llms/src/registry/mod.rs` | モジュールエクスポート |
| `apps/tachyon-api/src/di.rs` | プロバイダー初期化・DI設定 |
| `scripts/seeds/n1-seed/003-iac-manifests.yaml` | IaCマニフェストシード |

## 対応プロバイダー

| プロバイダー | IaC設定 | 環境変数フォールバック | 備考 |
|-------------|---------|----------------------|------|
| OpenAI | ✅ | ✅ | |
| Anthropic | ✅ | ✅ | |
| Google AI | ✅ | ✅ | `GEMINI_API_KEY`も対応 |
| xAI | ✅ | ✅ | |
| AWS Bedrock | - | - | IAM認証使用 |

## 参考

- タスクドキュメント: `docs/src/tasks/completed/v0.27.1/llm-provider-from-iac-config/task.md`
- 類似実装: `packages/payment/src/registry/stripe_registry.rs` (StripeClientRegistry)
- 類似実装: `packages/crm/src/registry.rs` (HubspotClientRegistry)
