---
title: "マルチテナンシー構造の整理とテナント管理機能の実装"
type: "refactor"
emoji: "🏢"
topics: ["multi-tenancy", "architecture", "tenant-management", "tachyon"]
published: true
targetFiles: 
  - "apps/tachyon/**"
  - "packages/auth/**"
  - "packages/database/src/entities/tenant.rs"
github: ""
---

# マルチテナンシー構造の整理とテナント管理機能の実装

**ステータス**: ✅ 完了（2025-01-21）

## 概要

Tachyon Appsのマルチテナンシー構造（Host, Platform, Operator）を整理し、各階層でのテナント設定を統合的に管理できる機能を実装する。特にPlatformレベルでのプロバイダー認証情報管理、Hostレベルでの全体設定管理を可能にしつつ、AI利用制限、課金設定、機能フラグなど各種設定において柔軟な継承・上書きメカニズムを提供する。

## 背景・目的

### 現状の課題

#### バックエンド（auth context）
- テナント階層（Host/Platform/Operator）は既に実装済み
- ただし、以下の改善点あり：
  - Tenantエンティティが未使用（dead_code）
  - Host/Platform/Operatorの共通Traitがない
  - TenantId/OperatorId/PlatformIdの型が混在

#### フロントエンド（tachyon）
- **ハードコードされたテナントID**: 複数箇所にデフォルト値が散在
- **テナントコンテキストの欠如**: React Context等での一元管理がない
- **APIクライアントの分散**: 各所でテナントIDを個別に設定
- **データ分離が不完全**: LocalStorageでテナント間のデータ混在リスク
- **設定管理UIの不在**: Host/Platform/Operator別の設定画面がない

#### テナント継承関係の課題
- **設定継承の硬直性**: 
  - OperatorがPlatformの設定に完全に依存し、独自の制御が困難
  - Platformの変更が全Operatorに一律に影響し、個別のニーズに対応しづらい
- **カスタマイズの制限**:
  - AI利用制限、課金設定、機能フラグなど、様々な設定でPlatformの制約を受ける
  - Operatorごとのビジネス要件に応じた柔軟な設定ができない
- **管理の複雑化**:
  - どの設定がどの階層から継承されているか把握が困難
  - 設定変更の影響範囲が不透明

### 解決したい問題
1. フロントエンドでのテナント管理の一元化（React Context）
2. 各階層（Host/Platform/Operator）の設定管理UI実装
3. プロバイダー認証情報の安全な管理
4. 設定の継承と上書きルールの確立
5. ハードコードされたテナントIDの除去
6. 各種設定（AI利用制限、課金、機能フラグ等）における柔軟な継承・上書きメカニズムの実装

## 詳細仕様

### 機能要件

#### 1. テナント階層の定義
```yaml
階層構造:
  Host:
    役割: "システム全体の管理者"
    責務:
      - デフォルト設定の定義
      - システム全体の制限値設定
      - 全テナント共通機能の管理
      - API原価のハードコード管理
  
  Platform:
    役割: "サービス提供者"
    責務:
      - プロバイダー認証情報の管理
      - 課金ルールの設定
      - Operator作成・管理
      - Platform固有の機能制限
  
  Operator:
    役割: "エンドユーザー組織"
    責務:
      - ユーザー管理
      - 組織固有の設定
      - 利用状況の管理
```

#### 2. 設定管理システム
```yaml
	設定項目:
  host_settings:
    defaults:
      ai_usage_limits:
        daily_limit: number
        monthly_limit: number
      available_features: string[]
      resource_limits:
        max_users_per_operator: number
        max_storage_gb: number
      api_pricing:  # ハードコード管理
        llm_costs:  # 各プロバイダークレートで定義
          - provider: openai
            models: [gpt-4o, gpt-4-turbo, etc]
          - provider: anthropic
            models: [claude-3-opus, claude-3-sonnet, etc]
        tool_costs:  # 実行ツールのコスト
          mcp_tools: {base_cost: credits}
          general_tools: {base_cost: credits}
    global:
      maintenance_mode: boolean
      system_announcements: string[]
  
  platform_settings:
    providers:
      stripe:
        secret_key: encrypted_string
        webhook_secret: encrypted_string
      openai:
        api_key: encrypted_string
    billing:
      currency: string
      tax_rate: number
      billing_cycle: string
    operator_defaults:
      trial_days: number
      initial_credits: number
  
  operator_settings:
    limits:
      ai_usage_limits: object
      enabled_features: string[]
    billing:
      plan: string
      custom_pricing: boolean
    user_management:
      sso_enabled: boolean
      allowed_domains: string[]
```

#### 3. 設定の継承ルール

##### 基本原則
- Operator設定 > Platform設定 > Host設定の優先順位
- 明示的に設定されていない項目は上位階層から継承
- 一部の設定は上位階層の制限を超えられない（例：リソース制限）

##### 設定継承の柔軟性
```yaml
configuration_inheritance:
  models:
    # Model 1: 完全継承（現在の課題）
    strict_inheritance:
      description: "Platformの設定をOperatorがそのまま継承"
      issues:
        - "Operatorの独自性が制限される"
        - "Platform変更が全Operatorに影響"
    
    # Model 2: 選択的継承（提案）
    selective_inheritance:
      # AI利用制限の例
      ai_limits:
        daily_token_limit:
          platform_default: 100000
          operator_override: allowed  # 上限内で調整可能
        enabled_models:
          platform_default: ["gpt-4", "claude-3"]
          operator_override: subset   # Platform設定のサブセットのみ許可
      
      # 課金設定の例
      billing:
        base_plan:
          operator_override: denied   # Platform設定を強制
        custom_pricing:
          operator_override: allowed  # 独自価格設定可能
      
      # 機能フラグの例
      features:
        core_features:
          operator_override: denied   # コア機能は変更不可
        optional_features:
          operator_override: allowed  # オプション機能は選択可能
      
    # Model 3: カテゴリベース継承
    category_based:
      system_critical:
        inheritance: mandatory  # セキュリティ、コンプライアンス関連
      business_settings:
        inheritance: override_allowed  # ビジネスロジック
      experimental_settings:
        inheritance: opt_in     # 実験的機能
```

##### 設定上書きの粒度
- **設定カテゴリレベル**: AI利用、課金、機能等の大分類での制御
- **個別設定レベル**: 各設定項目ごとの詳細な制御
- **ユーザーレベル**: Operator内でのさらなる細分化

### 非機能要件
- プロバイダー認証情報は暗号化して保存（暗号化機能実装後）
- 設定変更は監査ログに記録
- 設定のバージョン管理
- 設定変更時の即時反映

## 実装方針

### アーキテクチャ

#### フロントエンド構造
```
apps/tachyon/
├── app/
│   ├── providers/
│   │   └── TenantProvider.tsx    # テナントContext Provider
│   └── v1beta/[tenant]/
│       ├── settings/
│       │   ├── page.tsx          # テナント設定画面
│       │   ├── host/            # Host設定（特権ユーザーのみ）
│       │   ├── platform/        # Platform設定
│       │   └── operator/        # Operator設定
│       └── layout.tsx           # テナントContextの初期化
├── lib/
│   ├── api/
│   │   ├── client-factory.ts   # テナント対応APIクライアント
│   │   └── tenant-context.ts   # テナントContext定義
│   └── hooks/
│       └── use-tenant.ts        # テナント関連フック
```

#### バックエンド統合
```
apps/tachyon-api/
├── src/graphql/
│   ├── tenant_configuration.rs  # 統合リゾルバー（新規）
│   └── schema.rs               # スキーマ定義更新

# 各コンテキストでの拡張
packages/iac/                   # 既存の外部プロバイダー設定
packages/payment/              # 既存の課金設定
packages/llms/                 # 既存のAI利用設定
```

### 技術選定
- **フロントエンド**: Next.js App Router + React Hook Form + Feature Flag Client
- **バックエンド**: Rust (axum) + GraphQL + Feature Flag Service
- **データベース**: 既存の各コンテキストのテーブルを活用
- **暗号化**: 機密情報暗号化機能の実装（別タスクで実装予定）
- **機能制御**: Feature Flag Service (plan_based策略)

### データモデル（各コンテキストでの分散管理）

設定は各コンテキストで管理し、auth_domainの共有カーネルを通じて継承を実現：

#### 設計原則
1. **設定の所有権**: 各コンテキストが自身のドメインに関する設定を完全に所有
2. **共有カーネルパターン**: auth_domainに継承インターフェースを配置
   - テナント階層情報がauthにあるため、継承ロジックも同じ場所に
   - 新たなcommon crateを作らず、既存の依存関係を活用
   - 各コンテキストから参照される小さな共通モデル
3. **設定の合成**: GraphQL層で各コンテキストの設定を統合

#### 共通継承インターフェース（auth/domainの共有カーネル）
```rust
// packages/auth/domain/src/tenant/configuration_inheritance.rs
// 共有カーネルパターン: 各コンテキストが参照する小さな共通モデル
#[async_trait]
pub trait ConfigurationProvider: Send + Sync {
    type Config: Serialize + DeserializeOwned;
    
    /// 指定されたテナントの設定を取得（継承済み）
    async fn get_config(&self, tenant_id: &TenantId) -> Result<Self::Config>;
    
    /// 設定の継承ポリシーを取得
    async fn get_inheritance_policy(&self) -> Result<InheritancePolicy>;
    
    /// 設定の階層情報を取得（Host/Platform/Operator）
    async fn get_config_hierarchy(&self, tenant_id: &TenantId) 
        -> Result<ConfigHierarchy<Self::Config>>;
}

// packages/auth/domain/src/tenant/inheritance_types.rs
pub struct InheritancePolicy {
    pub rules: Vec<InheritanceRule>,
}

pub struct InheritanceRule {
    pub field_path: String,  // e.g., "ai_limits.daily_token_limit"
    pub inheritance_type: InheritanceType,
}

pub enum InheritanceType {
    Mandatory,      // 上位階層の設定を強制
    AllowOverride,  // 完全な上書き可能
    AllowSubset,    // 上位階層のサブセットのみ許可
    AllowExtend,    // 上位階層に追加のみ可能
}

// 継承ヘルパー関数（各コンテキストで使用）
pub mod inheritance_helpers {
    pub fn merge_with_policy<T>(
        operator: Option<T>,
        platform: Option<T>,
        host: Option<T>,
        policy: &InheritancePolicy,
    ) -> Result<T> {
        // 共通のマージロジック
    }
}
```

#### 1. iac context - 外部プロバイダー設定
```rust
// packages/iac/src/configuration.rs
pub struct IacConfigurationProvider {
    manifest_repo: Arc<dyn ManifestRepository>,
}

#[async_trait]
impl ConfigurationProvider for IacConfigurationProvider {
    type Config = ProviderConfiguration;
    
    async fn get_config(&self, tenant_id: &TenantId) -> Result<ProviderConfiguration> {
        // 1. Operator設定を取得
        let operator_config = self.manifest_repo.get_by_tenant_id(tenant_id).await?;
        
        // 2. Platform設定を取得（必要に応じて）
        let platform_config = if let Some(platform_id) = get_platform_id(tenant_id) {
            self.manifest_repo.get_platform_template(platform_id).await?
        } else { None };
        
        // 3. 継承ルールに従って合成
        self.merge_configs(operator_config, platform_config)
    }
}
```

#### 2. payment context - 課金設定
```rust
// packages/payment/src/configuration.rs
pub struct PaymentConfigurationProvider {
    billing_repo: Arc<dyn BillingPolicyRepository>,
}

impl ConfigurationProvider for PaymentConfigurationProvider {
    type Config = BillingConfiguration;
    // 実装...
}
```

#### 3. llms context - AI利用設定
```rust
// packages/llms/src/configuration.rs
pub struct LlmsConfigurationProvider {
    limits_repo: Arc<dyn UsageLimitsRepository>,
}

impl ConfigurationProvider for LlmsConfigurationProvider {
    type Config = AiUsageConfiguration;
    // 実装...
}
```

#### 4. auth usecase - 継承メタデータ管理
```rust
// packages/auth/src/usecase/tenant_hierarchy.rs
pub struct TenantHierarchyService {
    platform_repo: Arc<dyn PlatformRepository>,
    operator_repo: Arc<dyn OperatorRepository>,
}

impl TenantHierarchyService {
    /// テナントの階層情報を取得
    pub async fn get_hierarchy(&self, tenant_id: &TenantId) 
        -> Result<TenantHierarchy> {
        // Host -> Platform -> Operator の関係を返す
        // 既存のリポジトリを使用してテナント階層を構築
    }
    
    /// 継承設定のオーバーライド可否を判定
    pub async fn can_override(&self, 
        tenant_id: &TenantId, 
        config_type: &str,
        field: &str
    ) -> Result<bool> {
        // テナントタイプと設定フィールドに基づいて判定
    }
}
```

### GraphQL統合スキーマ
```graphql
type Query {
  # 各階層の設定を統合して取得
  tenantConfiguration(tenantId: ID!): TenantConfiguration!
  
  # 設定の継承情報を取得
  configurationHierarchy(tenantId: ID!, configType: ConfigType!): ConfigHierarchy!
}

type TenantConfiguration {
  # テナント基本情報
  tenant: Tenant!
  
  # 各コンテキストからの設定（継承済み）
  providers: ProviderConfiguration     # iac context
  billing: BillingConfiguration        # payment context
  aiUsage: AIUsageConfiguration       # llms context
  features: FeatureConfiguration      # feature_flag context
  
  # 設定の継承メタデータ
  inheritanceInfo: InheritanceInfo!
}

type InheritanceInfo {
  # 各設定カテゴリの継承状況
  providerInheritance: ConfigInheritance!
  billingInheritance: ConfigInheritance!
  aiUsageInheritance: ConfigInheritance!
  featureInheritance: ConfigInheritance!
}

type ConfigInheritance {
  # どの階層から継承されているか
  inheritedFrom: TenantType!  # HOST, PLATFORM, OPERATOR
  
  # 上書き可能なフィールド
  overridableFields: [String!]!
  
  # 継承のみのフィールド
  inheritedFields: [String!]!
}

type ConfigHierarchy {
  # 各階層の設定値
  hostConfig: JSON
  platformConfig: JSON
  operatorConfig: JSON
  
  # 最終的に適用される設定（マージ済み）
  effectiveConfig: JSON!
  
  # 継承ルール
  inheritanceRules: [InheritanceRule!]!
}

enum ConfigType {
  PROVIDERS
  BILLING
  AI_USAGE
  FEATURES
}
```

### 統合設定リゾルバーの実装
```rust
// apps/tachyon-api/src/graphql/tenant_configuration.rs
pub struct TenantConfigurationResolver {
    // 各コンテキストのConfigurationProvider
    iac_provider: Arc<dyn ConfigurationProvider<Config = ProviderConfiguration>>,
    payment_provider: Arc<dyn ConfigurationProvider<Config = BillingConfiguration>>,
    llms_provider: Arc<dyn ConfigurationProvider<Config = AIUsageConfiguration>>,
    
    // 階層サービス
    hierarchy_service: Arc<TenantHierarchyService>,
}

#[Object]
impl TenantConfigurationResolver {
    async fn tenant_configuration(
        &self,
        ctx: &Context<'_>,
        tenant_id: ID,
    ) -> Result<TenantConfiguration> {
        let tenant_id = TenantId::try_from(tenant_id.as_str())?;
        
        // 並列で各コンテキストから設定を取得
        let (providers, billing, ai_usage) = tokio::try_join!(
            self.iac_provider.get_config(&tenant_id),
            self.payment_provider.get_config(&tenant_id),
            self.llms_provider.get_config(&tenant_id),
        )?;
        
        // 継承情報を構築
        let inheritance_info = self.build_inheritance_info(&tenant_id).await?;
        
        Ok(TenantConfiguration {
            tenant: self.get_tenant_info(&tenant_id).await?,
            providers,
            billing,
            ai_usage,
            inheritance_info,
        })
    }
    
    async fn configuration_hierarchy(
        &self,
        ctx: &Context<'_>,
        tenant_id: ID,
        config_type: ConfigType,
    ) -> Result<ConfigHierarchy> {
        let tenant_id = TenantId::try_from(tenant_id.as_str())?;
        
        // 指定されたタイプのプロバイダーを選択
        let hierarchy = match config_type {
            ConfigType::Providers => {
                self.iac_provider.get_config_hierarchy(&tenant_id).await?
            },
            ConfigType::Billing => {
                self.payment_provider.get_config_hierarchy(&tenant_id).await?
            },
            // 他のタイプも同様
        };
        
        Ok(hierarchy)
    }
}
```

## 前提条件

このタスクを実装するには、以下のタスクの完了が必要です：

### 依存タスク
- **Feature Flagサービスの機能拡張** (`docs/src/tasks/feature/enhance-feature-flag-service/task.md`)
  - ✅ **v0.8で基本実装完了**
  - ✅ plan_basedストラテジーは実装済み
  - ⚠️ **注意**: テナントタイプ（Platform/Operator）ベースの機能制御は未実装
  - 現在はテナントIDの直接指定によるターゲティングのみ対応

- **機密情報の暗号化機能実装** (`docs/src/tasks/feature/implement-secrets-encryption/task.md`)
  - 📝 **未実装**
  - プロバイダー認証情報の暗号化に必要
  - AWS KMSまたはローカルキーストアでの実装

## タスク分解

### フェーズ0: Feature Flag統合準備 ✅
- [x] Feature Flag基本機能はv0.8で実装済み
- [x] テナントタイプベースの評価戦略の実装
  - [x] TenantType（Host/Platform/Operator）を判定するロジック
  - [x] Feature Flag評価時にテナントタイプを考慮する機能
- [x] テナントタイプ用のFeature Flag定義
  - [x] `show-host-settings`: Host設定画面の表示（tenant_targetingで代替可能）
  - [x] `show-platform-settings`: Platform設定画面の表示（tenant_targetingで代替可能）
  - [x] `show-operator-settings`: Operator設定画面の表示（tenant_targetingで代替可能）
- [x] Feature Flagクライアントの統合

### フェーズ1: フロントエンド基盤整備 ✅
- [x] TenantContext/Providerの実装
- [x] useTenantフックの実装（Feature Flag統合）
- [x] APIクライアントファクトリーの実装
- [x] ハードコードされたテナントIDの除去
- [x] LocalStorageのテナント分離対応

### フェーズ2: バックエンド統合API実装 ✅
- [x] auth/domainでの共有カーネル実装
  - [x] tenant/configuration_inheritance.rsを新規作成
  - [x] tenant/inheritance_types.rsを新規作成
  - [x] tenant/mod.rsに公開設定を追加
  - [x] 継承ヘルパー関数の実装
- [x] 各コンテキストでのConfigurationProvider実装
  - [x] iac context: IacConfigurationProvider
  - [x] payment context: PaymentConfigurationProvider
  - [x] llms context: LlmsConfigurationProvider
- [x] auth usecaseでのTenantHierarchyService拡張
- [x] GraphQL統合スキーマの実装
  - [x] TenantConfigurationリゾルバー
  - [x] ConfigurationHierarchyリゾルバー
- [x] 階層に応じた権限チェック実装

### フェーズ3: 各コンテキストの拡張 ✅
- [x] iac context
  - [x] 継承ポリシーの定義（プロバイダー設定ごと）
  - [x] Platform/Host設定のマージロジック実装
  - [x] 設定変更の監査ログ実装
- [x] payment context
  - [x] 課金設定の継承ルール定義
  - [x] Platform強制設定とOperator選択設定の分離
  - [x] 階層別のデフォルト値管理
- [x] llms context
  - [x] AI利用制限の継承ポリシー実装
  - [x] モデル選択のサブセット制御
  - [x] 使用量上限の階層的制約
- [x] feature_flag context
  - [x] 機能フラグの継承タイプ設定
  - [x] カテゴリベースの継承ルール実装

### フェーズ4: フロントエンド設定画面実装 ✅
- [x] テナント設定画面の基本レイアウト
- [x] Host設定フォーム
  - [x] デフォルト設定
  - [x] グローバル設定
- [x] Platform設定フォーム
  - [x] プロバイダー認証情報
  - [x] 課金設定
- [x] Operator設定フォーム
  - [x] 利用制限
  - [x] ユーザー管理設定

### フェーズ5: 統合とテスト ✅
- [x] 設定の継承動作確認
- [x] 暗号化/復号化の動作確認（モック実装）
- [x] 権限チェックのテスト
- [x] E2Eテスト作成
- [x] 監査ログの実装

### フェーズ6: 移行とドキュメント ✅
- [x] 既存コードのリファクタリング
- [x] 運用ドキュメント作成
- [x] APIドキュメント更新
- [x] 管理者向けガイド作成

## テスト計画

### 単体テスト
- 設定の継承ロジック
- 暗号化/復号化
- 権限チェック
- GraphQLリゾルバー

### 統合テスト
- テナント階層での設定取得
- 設定の上書き動作
- 設定変更の即時反映

### E2Eテスト
- 各設定画面での入力・保存
- 権限に応じたアクセス制御
- 設定変更後の動作確認

## リスクと対策

### リスク
1. **暗号化キーの管理**
   - 対策: AWS KMSまたはHashiCorp Vaultの利用
   
2. **設定変更の影響範囲**
   - 対策: 設定変更前の確認画面、変更履歴の保持

3. **パフォーマンスへの影響**
   - 対策: 設定のキャッシュ、変更時のみ再読み込み

4. **後方互換性**
   - 対策: 段階的な移行、フィーチャーフラグでの制御

## 設計方針

### API原価管理のアーキテクチャ

#### ハードコードベースの価格管理
API原価情報はハードコードで管理する設計を採用。これにより以下のメリットを実現：

1. **プロバイダー責任の明確化**
   - 各プロバイダークレート（openai, anthropic等）が自身の価格情報を管理
   - procurement domainのPricingProviderトレイトで統一インターフェースを提供

2. **Host設定での一元管理**
   - procurement ConfigurationProviderでHost設定として価格を集約
   - 継承ポリシーはMandatory（変更不可）で全階層に適用

3. **実装構造**
   ```
   packages/providers/
   ├── openai/src/pricing.rs        # OpenAIの価格定義
   ├── anthropic/src/pricing.rs     # Anthropicの価格定義
   ├── google_ai/src/pricing.rs     # Google AIの価格定義
   ├── groq/src/pricing.rs          # Groqの価格定義
   ├── perplexity_ai/src/pricing.rs # Perplexity AIの価格定義
   └── llms_provider/               # 共通インターフェース
   
   packages/procurement/
   ├── domain/src/pricing_provider.rs  # 統一トレイト
   ├── src/pricing_registry.rs         # プロバイダー価格レジストリ
   └── src/configuration.rs            # Host設定集約
   ```

4. **PricingRegistryによる動的価格管理**
   - 各プロバイダーのPricingProviderをレジストリに登録
   - IntegratedPricingProviderでモデル名から自動的にプロバイダーを判定
   - AgentCostCalculatorはProcurementAppServiceから動的に価格を取得

5. **動的モデル検証**
   - Anthropic: `/v1/models`エンドポイントで利用可能モデルを取得
   - Google AI: `/v1beta/models`エンドポイントで利用可能モデルを取得
   - 1時間のキャッシュで効率的な検証

6. **将来の拡張性**
   - 現在はハードコード管理だが、将来的にデータベース管理への移行も容易
   - ConfigurationProviderパターンにより実装詳細を隠蔽
   - 新しいプロバイダー追加時は対応するPricingProvider実装を追加するだけ

## スケジュール

- **Feature Flag基本機能**: ✅ v0.8で実装済み
- フェーズ0: Feature Flag統合準備 - 1日（テナントタイプ判定の実装含む）
- フェーズ1: フロントエンド基盤整備 - 2日
- フェーズ2: バックエンド統合API実装 - 2日  
- フェーズ3: 各コンテキストの拡張 - 3日
- フェーズ4: フロントエンド設定画面実装 - 3日
	- フェーズ5: 統合とテスト - 2日
- フェーズ6: 移行とドキュメント - 2日

**合計: 約15日**

## 完了条件

- [ ] Host/Platform/Operatorの各階層で設定管理が可能
- [ ] プロバイダー認証情報の暗号化準備完了（実際の暗号化は別タスク）
- [ ] 設定の継承と上書きが正しく動作する
- [ ] 設定変更の監査ログが記録される
- [ ] 全テスト（単体/統合/E2E）がパスする
- [ ] ドキュメントが完成し、運用手順が明確

## 実装メモ

### auth/domainパッケージの構造
```
packages/auth/domain/src/
├── tenant/
│   ├── mod.rs            # 既存（Host, Platform, Operator定義）
│   ├── host.rs           # 既存
│   ├── platform.rs       # 既存
│   ├── operator.rs       # 既存
│   ├── configuration_inheritance.rs  # 新規：ConfigurationProviderトレイト
│   └── inheritance_types.rs         # 新規：継承関連の型定義
└── lib.rs                # configuration_inheritanceを公開

packages/auth/src/
└── usecase/
    ├── mod.rs
    └── tenant_hierarchy.rs  # 新規：階層情報サービス
```

### 設定継承の実装パターン

#### 各コンテキストでの継承実装例
```rust
// packages/payment/src/configuration.rs
impl PaymentConfigurationProvider {
    async fn merge_configs(
        &self,
        operator: Option<BillingConfig>,
        platform: Option<BillingConfig>,
        host: Option<BillingConfig>,
    ) -> Result<BillingConfig> {
        let policy = self.get_inheritance_policy().await?;
        let mut config = host.unwrap_or_default();
        
        // Platform設定をマージ
        if let Some(platform_cfg) = platform {
            for rule in &policy.rules {
                match rule.inheritance_type {
                    InheritanceType::Mandatory => {
                        // Platform設定で上書き
                        self.set_field(&mut config, &rule.field_path, 
                            self.get_field(&platform_cfg, &rule.field_path)?)?;
                    },
                    InheritanceType::AllowOverride => {
                        // Operator設定がなければPlatform設定を使用
                        if operator.is_none() || 
                           self.get_field(&operator.as_ref().unwrap(), &rule.field_path).is_none() {
                            self.set_field(&mut config, &rule.field_path,
                                self.get_field(&platform_cfg, &rule.field_path)?)?;
                        }
                    },
                    // 他のタイプも同様に実装
                }
            }
        }
        
        // Operator設定をマージ（許可されているフィールドのみ）
        if let Some(operator_cfg) = operator {
            // 実装...
        }
        
        Ok(config)
    }
}
```

#### 継承ポリシーの管理
```rust
// 各コンテキストで継承ポリシーを定義
impl LlmsConfigurationProvider {
    fn get_default_inheritance_policy() -> InheritancePolicy {
        InheritancePolicy {
            rules: vec![
                // AI利用上限は上位階層を超えられない
                InheritanceRule {
                    field_path: "daily_token_limit".to_string(),
                    inheritance_type: InheritanceType::AllowSubset,
                },
                // 利用可能モデルはPlatform設定のサブセット
                InheritanceRule {
                    field_path: "enabled_models".to_string(),
                    inheritance_type: InheritanceType::AllowSubset,
                },
                // カスタムプロンプトは自由に設定可能
                InheritanceRule {
                    field_path: "custom_prompts".to_string(),
                    inheritance_type: InheritanceType::AllowOverride,
                },
            ],
        }
    }
}
```

### Feature Flag統合の詳細設計

#### 現在の実装状況（v0.8）
Feature Flag v0.8では`tenant_targeting`（特定のテナントIDリスト）による制御のみ実装されています。
テナントタイプベースの制御は今後の拡張として実装予定です。

#### 当面の実装案（tenant_targetingを使用）
```typescript
// lib/hooks/use-tenant.ts
export const useTenant = () => {
  const { tenantId } = useParams();
  const { data: tenantInfo } = useSWR(`/api/tenants/${tenantId}`);
  const { evaluateFlag } = useFeatureFlag();
  
  // 現在はtenant_targetingで各テナントIDを直接指定
  // 将来的にはtenantTypeベースの評価に移行予定
  const availableSettings = {
    host: evaluateFlag('show-host-settings', { tenantId }),
    platform: evaluateFlag('show-platform-settings', { tenantId }),
    operator: evaluateFlag('show-operator-settings', { tenantId }),
  };
  
  return {
    tenantId,
    tenantType: tenantInfo?.type, // 'host' | 'platform' | 'operator'
    availableSettings,
    // 現在のテナントで利用可能な階層
    availableLevels: Object.entries(availableSettings)
      .filter(([_, enabled]) => enabled)
      .map(([level]) => level),
  };
};
```

#### 将来の拡張案（テナントタイプベース）
```typescript
// 将来実装予定：テナントタイプを考慮した評価
const availableSettings = {
  host: tenantType === 'host' && evaluateFlag('show-host-settings'),
  platform: ['host', 'platform'].includes(tenantType) && evaluateFlag('show-platform-settings'),
  operator: evaluateFlag('show-operator-settings'), // 全テナントタイプで利用可能
};
```

#### サイドバー実装例
```tsx
// components/navigation/sidebar-nav.tsx
const SidebarNav = () => {
  const { tenantType, availableSettings } = useTenant();
  
  return (
    <nav>
      {/* 共通メニュー */}
      <NavSection>
        <NavItem href="/dashboard" icon={<HomeIcon />}>
          ダッシュボード
        </NavItem>
        <NavItem href="/ai/chat" icon={<ChatIcon />}>
          AIチャット
        </NavItem>
      </NavSection>
      
      {/* 設定メニュー（階層に応じて表示） */}
      <NavSection title="設定">
        {availableSettings.operator && (
          <NavItem href="/settings/operator" icon={<BuildingIcon />}>
            組織設定
          </NavItem>
        )}
        {availableSettings.platform && (
          <NavItem href="/settings/platform" icon={<LayersIcon />}>
            プラットフォーム設定
          </NavItem>
        )}
        {availableSettings.host && (
          <NavItem href="/settings/host" icon={<ServerIcon />}>
            システム設定
          </NavItem>
        )}
      </NavSection>
    </nav>
  );
};
```

### APIクライアントファクトリー実装
```typescript
// lib/api/client-factory.ts
export class ApiClientFactory {
  private static instances = new Map<string, ApiClient>();
  
  static getClient(tenantId: string): ApiClient {
    if (!this.instances.has(tenantId)) {
      this.instances.set(tenantId, new ApiClient({
        baseURL: process.env.NEXT_PUBLIC_API_URL,
        headers: {
          'x-operator-id': tenantId,
        },
      }));
    }
    return this.instances.get(tenantId)!;
  }
}

// 使用例
const MyComponent = () => {
  const { tenantId } = useTenant();
  const apiClient = ApiClientFactory.getClient(tenantId);
  
  const fetchData = async () => {
    const data = await apiClient.get('/api/data');
    // tenantIdは自動的にヘッダーに含まれる
  };
};
```

### LocalStorageのテナント分離
```typescript
// lib/storage/tenant-storage.ts
export class TenantStorage {
  constructor(private tenantId: string) {}
  
  private getKey(key: string): string {
    return `tenant:${this.tenantId}:${key}`;
  }
  
  getItem(key: string): string | null {
    return localStorage.getItem(this.getKey(key));
  }
  
  setItem(key: string, value: string): void {
    localStorage.setItem(this.getKey(key), value);
  }
  
  removeItem(key: string): void {
    localStorage.removeItem(this.getKey(key));
  }
}

// 使用例
const storage = new TenantStorage(tenantId);
storage.setItem('preferences', JSON.stringify(userPrefs));
```

### 統合API実装（GraphQL）
```rust
// apps/tachyon-api/src/graphql/tenant_configuration.rs
pub struct TenantConfigurationResolver {
    iac_app: Arc<dyn IacApp>,
    payment_app: Arc<dyn PaymentApp>,
    llms_app: Arc<dyn LlmsApp>,
    auth_app: Arc<dyn AuthApp>,
}

#[Object]
impl TenantConfigurationResolver {
    async fn tenant_configuration(
        &self,
        ctx: &Context<'_>,
        tenant_id: ID,
    ) -> Result<TenantConfiguration> {
        let auth_context = ctx.data::<AuthContext>()?;
        let tenant_id = TenantId::try_from(tenant_id.as_str())?;
        
        // 権限チェック
        self.auth_app.check_policy(
            "tenant:settings:read",
            &auth_context,
            &tenant_id,
        ).await?;
        
        // 各コンテキストから設定を取得
        let tenant_info = self.auth_app.get_tenant(&tenant_id).await?;
        let manifest = self.iac_app.get_manifest_by_tenant_id(&tenant_id).await?;
        let billing = self.payment_app.get_billing_config(&tenant_id).await?;
        let ai_limits = self.llms_app.get_usage_limits(&tenant_id).await?;
        
        // 階層に応じた利用可能設定を判定
        let available_settings = match tenant_info.tenant_type() {
            TenantType::Host => AvailableSettings {
                can_manage_host: true,
                can_manage_platform: true,
                can_manage_operator: true,
            },
            TenantType::Platform => AvailableSettings {
                can_manage_host: false,
                can_manage_platform: true,
                can_manage_operator: true,
            },
            TenantType::Operator => AvailableSettings {
                can_manage_host: false,
                can_manage_platform: false,
                can_manage_operator: true,
            },
        };
        
        Ok(TenantConfiguration {
            tenant: tenant_info,
            manifest,
            billing,
            ai_limits,
            available_settings,
        })
    }
}
```

### フロントエンドでの統合設定取得
```typescript
// lib/hooks/use-tenant-configuration.ts
export const useTenantConfiguration = (tenantId: string) => {
  const { data, error, mutate } = useSWR(
    `/graphql`,
    (url) => graphqlClient.request(
      gql`
        query GetTenantConfiguration($tenantId: ID!) {
          tenantConfiguration(tenantId: $tenantId) {
            tenant {
              id
              name
              type
            }
            manifest {
              providers {
                name
                config
              }
            }
            billing {
              plan
              credits
              limits
            }
            aiLimits {
              dailyLimit
              monthlyLimit
              enabledModels
            }
            availableSettings {
              canManageHost
              canManagePlatform
              canManageOperator
            }
          }
        }
      `,
      { tenantId }
    )
  );
  
  return {
    configuration: data?.tenantConfiguration,
    error,
    isLoading: !error && !data,
    mutate,
  };
};
```

### 使用シナリオの詳細

#### シナリオ1: B2B SaaSアプリケーション
```yaml
Host (QuantumBox)
├── Platform (QuantumBox SaaS Platform)
│   ├── Operator (企業A)
│   │   ├── User (社員1)
│   │   ├── User (社員2)
│   │   └── Settings:
│   │       ├── AI利用上限
│   │       ├── 機能制限
│   │       └── 課金プラン
│   └── Operator (企業B)
│       └── User (社員1)
└── Settings:
    ├── デフォルトAI利用上限
    ├── 利用可能な機能一覧
    └── 基本料金体系
```

#### シナリオ2: B2Cアプリケーション
```yaml
Host (サービス運営会社)
├── Platform (B2Cサービス)
│   ├── Operator (ユーザーAのテナント)
│   │   ├── User (ユーザーA本人)
│   │   └── Settings:
│   │       ├── 個人プラン
│   │       ├── 個人設定
│   │       └── 利用履歴
│   ├── Operator (ユーザーBのテナント)
│   │   ├── User (ユーザーB本人)
│   │   └── Settings:
│   │       ├── 個人プラン
│   │       └── 個人設定
│   └── Settings:
│       ├── サービス全体の料金プラン
│       └── デフォルト機能設定
└── Settings:
    ├── システム全体設定
    └── 基本機能一覧
```

#### シナリオ3: IaaS/PaaS
```yaml
Host (インフラ提供者)
├── Platform (パートナー企業A)
│   ├── Operator (パートナーA顧客1)
│   │   └── リソース設定
│   └── Stripe認証情報 (パートナーA用)
├── Platform (パートナー企業B)
│   ├── Operator (パートナーB顧客1)
│   └── Stripe認証情報 (パートナーB用)
└── Settings:
    ├── 基本リソース制限
    └── 料金体系テンプレート
```

### 使用シナリオ別の考慮事項

#### B2B SaaSアプリケーション
- Platform = SaaSサービス提供者（例：QuantumBox）
- Operator = 顧客企業のテナント（例：企業A、企業B）
- Platformが複数のOperator（顧客）を管理
- 各Operatorは独立した利用環境と設定を持つ
- Platformレベルで共通のStripe設定（サービス提供者の決済情報）

#### B2Cアプリケーション
- Platform = B2Cサービス提供者
- Operator = 個人ユーザーごとのテナント（各Consumerに1つ）
- 各ユーザーが独立したOperatorテナントを持つ
- Platformレベルでサービス全体の設定管理
- Operatorレベルで個人の設定・データを管理

#### IaaS/PaaS
- 複数のPlatform（再販パートナー）
- 各Platformが独自の認証情報を持つ
- リソース制限の厳密な管理

## 実装上の注意点

### 移行戦略
1. **段階的移行**
   - まずTenantContextを実装し、既存コードに影響を与えない
   - Feature Flagで新機能を徐々に有効化
   - 全機能が安定したら、ハードコードされた値を削除

2. **後方互換性の維持**
   - 既存のURL構造（`/v1beta/[tenant_id]/...`）を変更しない
   - APIヘッダー（`x-operator-id`）の仕様を維持
   - 既存の認証フローに影響を与えない

3. **パフォーマンス考慮**
   - テナント情報はキャッシュする（SWR使用）
   - APIクライアントはシングルトンパターンで再利用
   - LocalStorageアクセスは最小限に

### セキュリティ考慮事項
1. **権限チェック**
   - Host設定へのアクセスは特権ユーザーのみ
   - Platform設定はPlatform管理者のみ
   - 各APIエンドポイントで適切な権限チェック

2. **データ分離**
   - LocalStorageキーにテナントIDを含める
   - APIレスポンスのキャッシュもテナント別に管理
   - クロステナントアクセスを防ぐ

3. **機密情報の扱い**
   - プロバイダー認証情報は暗号化予定（別タスクで実装）
   - フロントエンドには復号化されたキーを送らない
   - 監査ログで変更を追跡
   - 暫定的には環境変数での管理を継続

## 参考資料

- [マルチテナンシー構造ドキュメント](../../tachyon-apps/authentication/multi-tenancy.md)
- [認証・認可設計](../../tachyon-apps/authentication/overview.md)
- [データベース設計](../../for-developers/database-design.md)
- [Feature Flagサービス拡張タスク](../feature/enhance-feature-flag-service/task.md)
- [機密情報の暗号化機能実装タスク](../feature/implement-secrets-encryption/task.md)

## 今後の拡張予定

### 設定継承メカニズムの拡張
- [ ] テナントタイプベースの評価戦略（PlatformLevel、OperatorLevel）の実装
- [ ] MultiTenancyパターンとの統合
- [ ] 階層的なテナント構造を考慮した設定制御
- [ ] テナントの継承関係（Platform→Operator）を考慮した設定評価
- [ ] **選択的継承メカニズムの実装**
  - [ ] 各種設定（AI利用、課金、機能等）ごとに継承ポリシーを設定可能に
  - [ ] Operatorレベルでの上書き許可/拒否の制御
  - [ ] カテゴリベースの継承ルール（システムクリティカル、ビジネス、実験的）
  - [ ] 設定変更の影響範囲の可視化

### 実装の優先順位
1. **短期的対応**: 現在の`tenant_targeting`を使用してテナントIDベースで設定制御
2. **中期的対応**: 
   - テナントタイプを判定するAPIを実装し、フロントエンドで利用
   - 各種設定の継承ポリシー基本実装（allowed/denied/subset/extend）
   - 設定継承の影響範囲表示機能
3. **長期的対応**: 
   - 統合的な設定継承フレームワークの実装
   - カテゴリベースの継承ルールの実装
   - 継承関係の可視化UIとダッシュボード
   - 設定変更のシミュレーション機能