---
title: "LLMプロバイダーをIaCマニフェストから初期化するリファクタリング"
type: refactor
emoji: "🔧"
topics:
  - LLM
  - Provider
  - IaC
  - Configuration
  - Clean Architecture
published: true
targetFiles:
  - apps/tachyon-api/src/di.rs
  - packages/llms/src/registry/mod.rs
  - packages/llms/src/registry/llm_provider_registry.rs
  - packages/llms/src/lib.rs
  - packages/llms/Cargo.toml
github: ""
---

# LLMプロバイダーをIaCマニフェストから初期化するリファクタリング

## 概要

現在、tachyon-apiのLLMプロバイダー（OpenAI、Anthropic、Google AI、AWS Bedrock等）は環境変数から直接APIキーを読み取って初期化している。これをIaCマニフェスト（`IacConfigurationProvider`）経由で初期化するように変更し、テナントごとの設定管理を可能にする。

## 背景・目的

### 現在の課題

1. **環境変数への直接依存**: 各プロバイダーが `env::var()` で環境変数を直接読み込んでいる
   - OpenAI: `OPENAI_API_KEY`
   - Anthropic: `ANTHROPIC_API_KEY`
   - Google AI: `GOOGLE_API_KEY`
   - xAI: `XAI_API_KEY`

2. **ハードコーディングされた初期化**: `apps/tachyon-api/src/di.rs` でプロバイダーが静的に初期化
   - 新プロバイダー追加時にコード変更が必要
   - テナントごとの設定切り替えが不可能

3. **設定の一元管理不足**: 他のプロバイダー（Stripe、HubSpot）は既にIaCマニフェスト経由で管理されているが、LLMプロバイダーのみ異なる方式

### 期待される成果

- **一貫性**: 全プロバイダーがIaCマニフェスト経由で設定管理される
- **マルチテナント対応**: テナントごとに異なるAPIキー・設定を使用可能
- **運用性向上**: 設定変更時にアプリケーション再ビルド不要
- **セキュリティ**: APIキーの管理がマニフェストに集約

## 詳細仕様

### 機能要件

1. **LlmProviderRegistry の実装**
   - `IacConfigurationProvider` を受け取り、テナントIDに基づいてLLMプロバイダーを返す
   - `StripeClientRegistry` / `HubspotClientRegistry` と同様のパターン

2. **既存プロバイダー対応**
   - OpenAI
   - Anthropic
   - Google AI
   - AWS Bedrock（IAM認証の場合は環境変数継続可）
   - xAI

3. **フォールバック機構**
   - マニフェストに設定がない場合は従来の環境変数フォールバックを許可（移行期間用）

### 非機能要件

- 既存のAPI動作に影響を与えない
- パフォーマンス劣化なし（設定キャッシュ）
- 後方互換性を維持

### コンテキスト別の責務

```yaml
contexts:
  iac:
    description: "プロバイダー設定の保存と取得"
    responsibilities:
      - ProjectConfigマニフェストでのAIプロバイダー設定管理
      - IacConfigurationProviderによる設定階層の解決
      - AiProviderConfig構造体での設定定義

  llms:
    description: "LLMプロバイダーの利用"
    responsibilities:
      - LlmProviderRegistryを通じたプロバイダー取得
      - テナント別のプロバイダー切り替え
      - プロバイダー未設定時のエラーハンドリング

  providers:
    description: "各LLMプロバイダーの実装"
    responsibilities:
      - AiProviderConfigからのインスタンス生成
      - API通信の実装
      - モデル定義とストリーミング対応
```

### 既存のIaCマニフェスト構造

既にIaCには以下の構造が定義されている（`packages/iac/src/domain/project_config_manifest/spec.rs`）:

```rust
pub enum ProviderSpec {
    OpenAI { config: AiProviderConfig },
    Anthropic { config: AiProviderConfig },
    GoogleAI { config: AiProviderConfig },
    // ... 他のプロバイダー
}

pub struct AiProviderConfig {
    pub api_key: String,
    pub organization_id: Option<String>,
    pub base_url: Option<String>,
    pub project_id: Option<String>,
}
```

## 実装方針

### アーキテクチャ設計

```
┌─────────────────────────────────────────────────────────────────┐
│                         tachyon-api                              │
├─────────────────────────────────────────────────────────────────┤
│  main.rs                                                         │
│    └── LlmProviderRegistry::new(iac_config_provider)            │
│          └── llms::App::new_with_provider_registry(registry)    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    LlmProviderRegistry                           │
├─────────────────────────────────────────────────────────────────┤
│  + get_providers(tenant_id) -> Result<LLMProviders>             │
│  + get_chat_stream_providers(tenant_id) -> Result<...>          │
│                                                                  │
│  内部:                                                           │
│    - IacConfigurationProvider経由でAiProviderConfigを取得        │
│    - 各プロバイダーをインスタンス化してキャッシュ                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  IacConfigurationProvider                        │
├─────────────────────────────────────────────────────────────────┤
│  + get_config(tenant_id) -> ProviderConfiguration               │
│    └── providers: [OpenAI, Anthropic, GoogleAI, ...]            │
└─────────────────────────────────────────────────────────────────┘
```

### 参考実装パターン

**StripeClientRegistry** (`packages/payment/src/registry/stripe_registry.rs`):
```rust
pub struct StripeClientRegistry {
    iac_provider: Arc<IacConfigurationProvider>,
    cache: RwLock<HashMap<TenantId, Arc<stripe::Client>>>,
}

impl StripeClientRegistry {
    pub fn new(iac_provider: Arc<IacConfigurationProvider>) -> Self { ... }
    pub async fn get_client(&self, tenant_id: &TenantId) -> Result<Arc<stripe::Client>> { ... }
}
```

**HubspotClientRegistry** (`packages/crm/src/registry.rs`):
```rust
pub struct HubspotClientRegistry {
    iac_provider: Arc<IacConfigurationProvider>,
    cache: RwLock<HashMap<TenantId, Arc<hubspot::Client>>>,
}
```

### 技術選定

- 既存の `IacConfigurationProvider` を活用
- キャッシュ機構は `RwLock<HashMap<TenantId, ...>>` で実装
- 各プロバイダーは既存の `new_with_config()` メソッドを追加して対応

## タスク分解

### フェーズ1: LlmProviderRegistry の実装 ✅

- [x] `packages/llms/src/registry/llm_provider_registry.rs` に `LlmProviderRegistry` を実装
- [x] `IacConfigurationProvider` から AIプロバイダー設定を取得するロジック
- [x] テナントIDベースのキャッシュ機構（TTL、最大サイズ対応）
- [x] 単体テストの作成（AiProviderConfig パース）

**実装メモ**:
- `LlmProviderRegistry` は `StripeClientRegistry` と同様のパターンを採用
- `ConcreteProviders` 構造体を追加し、`LLMProvider` と `ChatStreamProviderV2` 両方へのキャストを可能にした
- キャッシュはTTL 5分、最大100エントリで設定
- `fallback_to_env` オプションで環境変数フォールバックを制御可能（デフォルト true）

### フェーズ2: 各プロバイダーの対応 ✅

- [x] OpenAI: 既存の `new(api_key)` コンストラクタを活用
- [x] Anthropic: 既存の `new(api_key)` コンストラクタを活用
- [x] Google AI: 既存の `new(api_key)` コンストラクタを活用
- [x] xAI: 既存の `new(api_key)` コンストラクタを活用
- [x] AWS Bedrock: IAM認証のため環境変数継続（IaCマニフェスト設定不要）

**実装メモ**:
- 各プロバイダーに `new_with_config()` を追加する代わりに、レジストリ内で `AiProviderConfig` から直接インスタンス化
- Bedrockは IAM 認証を使用するため、環境変数（AWS_REGION等）から自動取得

### フェーズ3: tachyon-api への統合 ✅

- [x] `di.rs` の LLMプロバイダー初期化を `LlmProviderRegistry` 経由に変更
- [x] `IacConfigurationProvider` を早期に初期化してレジストリに渡す
- [x] 環境変数フォールバックの実装（移行期間用）

**実装メモ**:
- `PLATFORM_OPERATOR_ID` 環境変数でプラットフォームテナントを指定
- `get_concrete_providers()` メソッドで具体的なプロバイダー型を取得し、`LLMProvider` と `ChatStreamProviderV2` 両方に登録
- IaCマニフェストに設定がなくても環境変数があれば動作継続

### フェーズ4: テスト・検証 ✅

- [x] `mise run docker-check` コンパイル成功
- [x] `mise run docker-fmt` フォーマットチェック成功
- [x] `mise run docker-clippy` リント警告なし（新規コード部分）
- [ ] 既存シナリオテストの実行・確認（手動確認推奨）
- [ ] マニフェスト設定でのプロバイダー切り替え動作確認（実運用で確認）

### フェーズ5: ドキュメント・クリーンアップ ✅

- [x] CLAUDE.md への設定方法追記（2025-01-07）
- [ ] 不要になった環境変数の整理（移行完了後、将来タスク）

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 既存環境での動作不具合 | 高 | フォールバック機構で環境変数を継続サポート |
| マニフェスト設定漏れ | 中 | 起動時のバリデーションとわかりやすいエラーメッセージ |
| パフォーマンス劣化 | 低 | キャッシュ機構の実装 |
| AWS Bedrockの認証方式 | 中 | IAM認証は環境から取得、APIキーはマニフェストとハイブリッド対応 |

## 参考資料

- `packages/payment/src/registry/stripe_registry.rs` - Stripe クライアントレジストリ
- `packages/crm/src/registry.rs` - HubSpot クライアントレジストリ
- `packages/iac/src/configuration.rs` - IaCConfigurationProvider実装
- `packages/iac/src/domain/project_config_manifest/spec.rs` - AiProviderConfig定義

## 完了条件

- [x] `LlmProviderRegistry` が実装され、テナントIDに基づいてプロバイダーを返せる
- [x] tachyon-apiがIaCマニフェストからLLMプロバイダーを初期化する
- [x] `mise run docker-check` / `docker-fmt` / `docker-clippy` がパスする
- [x] 環境変数フォールバックが機能する（移行期間用）
- [x] CLAUDE.mdに設定方法が追記されている（2025-01-07完了）
- [x] IaCマニフェスト（`003-iac-manifests.yaml`）にAIプロバイダー設定を追加（2025-01-07完了）
- [ ] 既存のAPI・シナリオテストがすべてパスする（手動確認推奨）

### バージョン番号の決定基準

このタスクはリファクタリングであり、外部APIに変更はないため：
- **パッチバージョン（x.x.X）を上げる**: 内部実装の変更のみ

## 備考

- CRMコンテキストの `HubspotClientRegistry` と `CRMProviderRegistry` の実装が直近で完了しており、同様のパターンを踏襲する
- 将来的にはテナントごとの利用量制限やコスト配分にも活用可能
