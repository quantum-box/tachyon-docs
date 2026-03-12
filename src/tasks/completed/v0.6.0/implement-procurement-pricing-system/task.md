---
title: "調達・価格設定システム（Procurement & Pricing System）の実装"
type: "feature"
emoji: "💰"
topics: ["procurement", "pricing", "supply-chain", "billing", "ddd"]
published: true
targetFiles: [
  "packages/procurement/",
  "packages/payment/src/domain/pricing/",
  "apps/tachyon-api/src/adapter/graphql/procurement/",
  "apps/tachyon/src/app/v1beta/[operatorId]/procurement/",
  "apps/tachyon/src/app/v1beta/[operatorId]/pricing/",
  "docs/src/architecture/procurement-context.md"
]
github: "https://github.com/quantum-box/tachyon-apps"
---

# 調達・価格設定システム（Procurement & Pricing System）の実装

## 概要

Agent APIを含む各種サービスの価格設定を管理し、原価（調達価格）から利益を乗せて顧客提供価格を決定するためのシステムを実装します。これにより、市場価格の変動に応じた柔軟な価格調整と、適切な利益管理を実現します。

## 背景・目的

### 解決したい課題

1. **価格設定の硬直性**
   - 現在はハードコードされた固定価格
   - 市場価格の変動に対応できない
   - 利益率の管理ができない

2. **調達コストの不透明性**
   - OpenAI、Anthropic等の原価が不明瞭
   - 為替変動の影響を考慮できない
   - バルク割引などの特別料金に対応できない

3. **価格戦略の欠如**
   - 顧客セグメント別の価格設定ができない
   - プロモーション価格の管理ができない
   - 競合他社の価格を考慮できない

### 期待される効果

- 適正な利益率の確保
- 市場競争力のある価格設定
- 柔軟な価格調整メカニズム
- 透明性のある価格決定プロセス

## 詳細仕様

### ドメイン設計

```yaml
contexts:
  procurement:
    description: "調達コンテキスト - サプライヤーからの原価管理"
    aggregates:
      - Supplier: "サプライヤー情報"
      - SupplyContract: "調達契約"
      - CostStructure: "コスト構造"
      - ProcurementPrice: "調達価格"
    
  pricing:
    description: "価格設定コンテキスト - 顧客向け価格の決定"
    aggregates:
      - PricingPolicy: "価格設定ポリシー"
      - PriceList: "価格表"
      - PricingRule: "価格決定ルール"
      - CustomerSegment: "顧客セグメント"
```

### コンテキスト境界と責務

```yaml
procurement_context:
  responsibilities:
    - "サプライヤー管理"
    - "調達契約の管理"
    - "原価情報の記録"
    - "為替レート管理"
    - "ボリュームディスカウント管理"
  
  boundaries:
    - "顧客向け価格決定は行わない"
    - "請求処理は行わない"
    - "在庫管理は対象外（デジタル商品のため）"

pricing_context:
  responsibilities:
    - "価格ポリシーの管理"
    - "マークアップ率の設定"
    - "顧客セグメント別価格"
    - "プロモーション価格管理"
    - "価格履歴の管理"
  
  boundaries:
    - "調達交渉は行わない"
    - "支払い処理は行わない"
    - "在庫管理は対象外"

payment_context:
  integration_points:
    - "PricingContextから価格情報を取得"
    - "実際の課金処理を実行"
    - "使用量に基づく請求計算"
```

### データモデル

```sql
-- 調達コンテキスト
CREATE TABLE `suppliers` (
    `id` VARCHAR(32) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `supplier_type` ENUM('LLM_PROVIDER', 'INFRASTRUCTURE', 'SERVICE') NOT NULL,
    `api_endpoint` VARCHAR(255),
    `currency` VARCHAR(3) NOT NULL DEFAULT 'USD',
    `status` ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    `created_at` TIMESTAMP NOT NULL,
    `updated_at` TIMESTAMP NOT NULL,
    PRIMARY KEY (`id`)
);

CREATE TABLE `supply_contracts` (
    `id` VARCHAR(32) NOT NULL,
    `supplier_id` VARCHAR(32) NOT NULL,
    `contract_name` VARCHAR(255) NOT NULL,
    `effective_from` DATE NOT NULL,
    `effective_until` DATE,
    `base_currency` VARCHAR(3) NOT NULL,
    `payment_terms` JSON,
    `volume_discounts` JSON,
    `created_at` TIMESTAMP NOT NULL,
    PRIMARY KEY (`id`),
    FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`)
);

CREATE TABLE `procurement_prices` (
    `id` VARCHAR(32) NOT NULL,
    `contract_id` VARCHAR(32) NOT NULL,
    `resource_type` VARCHAR(100) NOT NULL, -- 'gpt-4-tokens', 'claude-3-tokens', etc.
    `unit_type` VARCHAR(50) NOT NULL, -- 'per_million_tokens', 'per_request', etc.
    `base_cost` DECIMAL(15, 6) NOT NULL,
    `currency` VARCHAR(3) NOT NULL,
    `tier_pricing` JSON, -- ボリューム別価格
    `effective_from` TIMESTAMP NOT NULL,
    `effective_until` TIMESTAMP,
    PRIMARY KEY (`id`),
    FOREIGN KEY (`contract_id`) REFERENCES `supply_contracts`(`id`),
    INDEX `idx_resource_effective` (`resource_type`, `effective_from`)
);

-- 価格設定コンテキスト
CREATE TABLE `pricing_policies` (
    `id` VARCHAR(32) NOT NULL,
    `tenant_id` VARCHAR(29) NOT NULL,
    `policy_name` VARCHAR(255) NOT NULL,
    `description` TEXT,
    `base_markup_rate` DECIMAL(5, 2) NOT NULL, -- 基本マークアップ率（%）
    `min_markup_rate` DECIMAL(5, 2) NOT NULL,
    `max_markup_rate` DECIMAL(5, 2) NOT NULL,
    `status` ENUM('ACTIVE', 'DRAFT', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `created_at` TIMESTAMP NOT NULL,
    `updated_at` TIMESTAMP NOT NULL,
    PRIMARY KEY (`id`),
    INDEX `idx_tenant_status` (`tenant_id`, `status`)
);

CREATE TABLE `pricing_rules` (
    `id` VARCHAR(32) NOT NULL,
    `policy_id` VARCHAR(32) NOT NULL,
    `rule_type` ENUM('VOLUME', 'SEGMENT', 'PROMOTION', 'COMPETITIVE') NOT NULL,
    `priority` INT NOT NULL DEFAULT 0,
    `conditions` JSON NOT NULL,
    `adjustment_type` ENUM('PERCENTAGE', 'FIXED', 'OVERRIDE') NOT NULL,
    `adjustment_value` DECIMAL(15, 6) NOT NULL,
    `effective_from` TIMESTAMP NOT NULL,
    `effective_until` TIMESTAMP,
    PRIMARY KEY (`id`),
    FOREIGN KEY (`policy_id`) REFERENCES `pricing_policies`(`id`)
);

CREATE TABLE `customer_prices` (
    `id` VARCHAR(32) NOT NULL,
    `tenant_id` VARCHAR(29) NOT NULL,
    `resource_type` VARCHAR(100) NOT NULL,
    `unit_type` VARCHAR(50) NOT NULL,
    `base_price` DECIMAL(15, 6) NOT NULL,
    `currency` VARCHAR(3) NOT NULL,
    `policy_id` VARCHAR(32) NOT NULL,
    `procurement_price_id` VARCHAR(32) NOT NULL,
    `markup_rate` DECIMAL(5, 2) NOT NULL,
    `final_price` DECIMAL(15, 6) NOT NULL,
    `effective_from` TIMESTAMP NOT NULL,
    `effective_until` TIMESTAMP,
    `created_at` TIMESTAMP NOT NULL,
    PRIMARY KEY (`id`),
    FOREIGN KEY (`policy_id`) REFERENCES `pricing_policies`(`id`),
    FOREIGN KEY (`procurement_price_id`) REFERENCES `procurement_prices`(`id`),
    INDEX `idx_tenant_resource` (`tenant_id`, `resource_type`, `effective_from`)
);

-- 価格履歴（監査用）
CREATE TABLE `price_change_history` (
    `id` VARCHAR(32) NOT NULL,
    `customer_price_id` VARCHAR(32) NOT NULL,
    `changed_by` VARCHAR(32) NOT NULL,
    `change_type` ENUM('COST_UPDATE', 'POLICY_CHANGE', 'MANUAL_OVERRIDE') NOT NULL,
    `previous_price` DECIMAL(15, 6) NOT NULL,
    `new_price` DECIMAL(15, 6) NOT NULL,
    `change_reason` TEXT,
    `created_at` TIMESTAMP NOT NULL,
    PRIMARY KEY (`id`),
    FOREIGN KEY (`customer_price_id`) REFERENCES `customer_prices`(`id`)
);
```

### API設計

```graphql
# GraphQL スキーマ

type Supplier {
  id: ID!
  name: String!
  supplierType: SupplierType!
  currency: String!
  status: SupplierStatus!
  contracts: [SupplyContract!]!
}

type SupplyContract {
  id: ID!
  supplier: Supplier!
  contractName: String!
  effectiveFrom: DateTime!
  effectiveUntil: DateTime
  baseCurrency: String!
  procurementPrices: [ProcurementPrice!]!
}

type ProcurementPrice {
  id: ID!
  contract: SupplyContract!
  resourceType: String! # "gpt-4-prompt-tokens", "claude-3-opus-completion-tokens"
  unitType: String! # "per_million_tokens"
  baseCost: Float!
  currency: String!
  tierPricing: [TierPrice!]
  effectiveFrom: DateTime!
  effectiveUntil: DateTime
}

type TierPrice {
  minVolume: Int!
  maxVolume: Int
  unitPrice: Float!
}

type PricingPolicy {
  id: ID!
  policyName: String!
  description: String
  baseMarkupRate: Float!
  minMarkupRate: Float!
  maxMarkupRate: Float!
  status: PolicyStatus!
  rules: [PricingRule!]!
}

type CustomerPrice {
  id: ID!
  resourceType: String!
  unitType: String!
  basePrice: Float!
  currency: String!
  markupRate: Float!
  finalPrice: Float!
  effectiveFrom: DateTime!
  effectiveUntil: DateTime
}

# クエリ
type Query {
  # 調達価格の取得
  currentProcurementPrice(resourceType: String!): ProcurementPrice
  procurementPriceHistory(resourceType: String!, limit: Int = 10): [ProcurementPrice!]!
  
  # 顧客価格の取得
  currentCustomerPrice(resourceType: String!): CustomerPrice
  customerPriceHistory(resourceType: String!, limit: Int = 10): [CustomerPrice!]!
  
  # 価格ポリシーの取得
  activePricingPolicy: PricingPolicy
  pricingPolicies(status: PolicyStatus): [PricingPolicy!]!
}

# ミューテーション
type Mutation {
  # サプライヤー管理
  createSupplier(input: CreateSupplierInput!): Supplier!
  updateSupplier(id: ID!, input: UpdateSupplierInput!): Supplier!
  
  # 調達契約管理
  createSupplyContract(input: CreateSupplyContractInput!): SupplyContract!
  updateProcurementPrice(input: UpdateProcurementPriceInput!): ProcurementPrice!
  
  # 価格ポリシー管理
  createPricingPolicy(input: CreatePricingPolicyInput!): PricingPolicy!
  updatePricingPolicy(id: ID!, input: UpdatePricingPolicyInput!): PricingPolicy!
  activatePricingPolicy(id: ID!): PricingPolicy!
  
  # 価格計算と更新
  recalculateCustomerPrices(policyId: ID!): RecalculationResult!
  overrideCustomerPrice(input: OverrideCustomerPriceInput!): CustomerPrice!
}
```

### 価格計算ロジック

```yaml
price_calculation:
  base_formula: |
    顧客価格 = 調達価格 × (1 + マークアップ率/100)
  
  rules_application:
    - volume_discount: "使用量に応じた割引"
    - segment_pricing: "顧客セグメント別価格"
    - promotional_pricing: "期間限定プロモーション"
    - competitive_pricing: "競合価格を考慮した調整"
  
  example:
    procurement_cost: 10.00  # $10/百万トークン（OpenAI GPT-4）
    base_markup: 50%         # 基本マークアップ率
    volume_discount: -10%    # 大口割引
    final_calculation: |
      基本価格: $10.00 × 1.5 = $15.00
      割引適用: $15.00 × 0.9 = $13.50
      最終価格: $13.50/百万トークン
```

### 統合ポイント

```rust
// PaymentContext との統合
#[async_trait]
pub trait PricingService: Send + Sync {
    /// リソースタイプから現在の顧客価格を取得
    async fn get_current_price(
        &self,
        tenant_id: &TenantId,
        resource_type: &str,
    ) -> Result<CustomerPrice>;
    
    /// 使用量に基づく価格計算
    async fn calculate_cost(
        &self,
        tenant_id: &TenantId,
        usage: &ResourceUsage,
    ) -> Result<Cost>;
}

// LLMsContext での利用
pub struct AgentCostCalculator {
    pricing_service: Arc<dyn PricingService>,
}

impl AgentCostCalculator {
    pub async fn calculate_token_cost(
        &self,
        tenant_id: &TenantId,
        prompt_tokens: u32,
        completion_tokens: u32,
    ) -> Result<Cost> {
        let prompt_price = self.pricing_service
            .get_current_price(tenant_id, "gpt-4-prompt-tokens")
            .await?;
        
        let completion_price = self.pricing_service
            .get_current_price(tenant_id, "gpt-4-completion-tokens")
            .await?;
        
        // 価格計算
        let prompt_cost = (prompt_tokens as f64 / 1_000_000.0) * prompt_price.final_price;
        let completion_cost = (completion_tokens as f64 / 1_000_000.0) * completion_price.final_price;
        
        Ok(Cost {
            amount: prompt_cost + completion_cost,
            currency: prompt_price.currency,
        })
    }
}
```

## 実装方針

### フェーズ1: 基盤構築
- Procurementコンテキストの実装
- 基本的なCRUD操作
- サプライヤー・契約管理

### フェーズ2: 価格設定機能
- Pricingコンテキストの実装
- 価格計算エンジン
- ルールベース価格決定

### フェーズ3: 統合と移行
- PaymentContextとの統合
- 既存の固定価格からの移行
- 価格履歴の管理

### フェーズ4: 高度な機能
- リアルタイム価格更新
- 競合価格分析
- 価格最適化アルゴリズム

## タスク分解

### フェーズ1: 調達コンテキストの基盤構築 ✅ (2025-01-14 完了)

#### ドメイン層の実装
- [x] Supplier集約の実装
  - [x] エンティティ定義
  - [x] ビジネスルール実装
  - [x] バリデーション
- [x] SupplyContract集約の実装
  - [x] 契約期間管理
  - [x] ボリュームディスカウント
- [x] ProcurementPrice値オブジェクトの実装
  - [x] 価格計算ロジック
  - [x] 通貨変換

#### インフラ層の実装
- [x] データベーススキーマ作成
  - [x] マイグレーションファイル
  - [x] インデックス設計
- [x] リポジトリ実装
  - [x] SupplierRepository
  - [x] ContractRepository (SQLx実装)
  - [x] PriceRepository (SQLx実装)

#### ユースケース層の実装
- [x] サプライヤー管理
  - [x] CreateSupplier
  - [x] UpdateSupplier
  - [x] ListSuppliers
- [x] 契約管理
  - [x] CreateContract (スタブ実装)
  - [x] UpdateContract (スタブ実装)
  - [x] TerminateContract (スタブ実装)
- [x] 調達価格管理
  - [x] RegisterPrice (スタブ実装)
  - [x] UpdatePrice (スタブ実装)
  - [x] GetCurrentPrice (スタブ実装)

実装メモ:
- procurementパッケージをクリーンアーキテクチャで実装
- Currency型にUSDバリアントとSerialize/Deserialize traitを追加
- Text型のas_str()メソッドをto_string()に変更
- BigDecimalとrust_decimal::Decimalの相互変換を実装
- SQLxのオフラインモードに対応（.sqlxディレクトリ生成済み）

### フェーズ2: 価格設定コンテキストの実装 ✅ (2025-01-14 完了)

#### ドメイン層の実装
- [x] PricingPolicy集約の実装
  - [x] ポリシー定義
  - [x] ルール管理
- [x] PricingRule値オブジェクトの実装
  - [x] 条件評価エンジン
  - [x] 価格調整計算
- [x] CustomerSegmentエンティティ

#### 価格計算エンジン
- [x] 基本価格計算
  - [x] マークアップ適用
  - [x] 為替レート考慮
- [x] ルールエンジン実装
  - [x] ルール優先順位
  - [x] 条件評価
  - [x] 価格調整
- [x] 価格履歴管理

#### GraphQL API実装
- [x] スキーマ定義
- [x] リゾルバー実装（コードファースト）
  - [x] procurement_prices_by_tenant
  - [x] supply_contracts_by_tenant
  - [x] suppliers_by_tenant
- [x] 実データベース連携
- [ ] 権限チェック

実装メモ:
- paymentパッケージ内にpricingドメインを実装
- PricingEngine: 価格計算の中核ロジック、ルール評価と適用
- PricingService: 高レベルの価格設定業務ロジック
- 多様なルールタイプ（Volume, Seasonal, Customer, Promotion, Custom）をサポート
- ProcurementPriceRepositoryにfind_allメソッドを追加
- UnitTypeにunit_type_str()メソッドを追加してStringへの変換を実装

### フェーズ3: 既存システムとの統合 ✅ (2025-01-15 完了)

#### PaymentContextとの統合
- [x] PricingServiceインターフェース定義
- [x] PaymentAppへの組み込み
- [x] 既存の固定価格からの移行

#### LLMsContextとの統合
- [x] AgentCostCalculatorの改修
- [x] 動的価格取得の実装
- [ ] キャッシュ戦略

実装メモ：
- `EnhancedPaymentApp`トレイトを追加し、`get_current_price`と`calculate_cost`メソッドを定義
- `AgentCostCalculatorV2`で動的価格計算を実装
- 価格取得と実際のコスト計算を分離し、柔軟な価格設定を実現

#### データ移行
- [ ] 既存価格データの移行スクリプト
- [ ] 初期サプライヤーデータ投入
- [ ] デフォルトポリシー設定

### フェーズ4: 運用機能の実装 ✅ (2025-01-16 完了)

#### 管理画面（apps/tachyon）
- [x] 調達管理UI（Procurement）
  - [x] 調達原価一覧画面（Provider Costs）
  - [x] サプライヤー一覧画面
  - [x] 契約管理画面
  - [x] フィルタリング機能（リソースタイプ、サプライヤー、ステータス）
  - [x] 統計情報表示（総数、アクティブ数など）
  - [x] 階層価格（Tier Pricing）表示
- [x] 価格設定UI（Pricing）
  - [x] 価格ポリシー設定画面
  - [x] ルール管理画面
  - [x] 価格シミュレーション機能
  - [x] 顧客セグメント管理画面
  - [x] 価格分析ダッシュボード
  - [ ] 価格変更履歴・監査ログ（次フェーズ）

#### バックエンド実装 ✅
- [x] SQLxリポジトリの実装
  - [x] SqlxPricingPolicyRepository
  - [x] SqlxCustomerPriceRepository
  - [x] SqlxCustomerSegmentRepository
- [x] GraphQL APIの統合
  - [x] Query: pricing_policies_by_tenant, pricing_policy, calculate_current_price
  - [x] Mutation: create_pricing_policy, add_pricing_rule, activate_pricing_policy
- [x] データベースマイグレーション (20250615004129_create_pricing_tables)

#### UI実装詳細
- [x] 共通コンポーネント
  - [x] 価格表示コンポーネント（通貨対応）
  - [x] 価格計算プレビュー
  - [x] ルール条件エディタ
  - [x] 期間選択コンポーネント
- [x] ページ構成
  - [x] `/procurement` - 調達原価一覧（Provider Costs）
  - [x] `/procurement/suppliers` - サプライヤー管理
  - [x] `/procurement/contracts` - 契約管理
  - [x] `/pricing` - 価格設定ダッシュボード
  - [x] `/pricing/[policyId]` - ポリシー詳細・ルール管理
  - [x] 価格シミュレーター（ポリシー詳細内に統合）
  - [x] `/pricing/segments` - 顧客セグメント管理
  - [x] `/pricing/analysis` - 価格分析ダッシュボード

実装メモ:
- Next.js App RouterとGraphQLを使用した価格管理画面を実装
- **価格設定（Pricing）**:
  - PricingPolicyList: ポリシー一覧表示（カードグリッド形式）
  - PricingPolicyDialog: ポリシー作成・編集ダイアログ
  - PricingRuleList: ルール一覧表示（テーブル形式、優先度順）
  - PricingRuleDialog: ルール追加・編集ダイアログ（JSONエディタ付き）
  - PriceSimulator: 価格シミュレーション機能（リアルタイム計算）
  - CustomerSegmentList/Dialog: 顧客セグメント管理画面
  - PriceAnalysis: 価格分析ダッシュボード（収益・マークアップ・最適化提案）
- **調達管理（Procurement）**:
  - ProcurementPriceList: 調達原価一覧（フィルタリング、統計表示、階層価格）
  - SupplierList: サプライヤー一覧（検索、ステータスフィルタ）
  - SupplyContractList: 契約一覧（ステータス別統計、サプライヤーフィルタ）
  - GraphQLクエリをコンポーネント近くに配置（コード生成活用）
  - 実データベース連携（モックデータを排除）
  - 空の状態のハンドリング
- サイドバーナビゲーションに価格設定・調達管理メニューを追加
- Rechartsライブラリを使用したチャート表示
- Apollo ClientでSSR無効化（ssr: false）

#### モニタリング
- [ ] 価格変更通知
- [ ] 利益率レポート
- [ ] 競合価格追跡

#### 自動化
- [ ] 為替レート自動更新
- [ ] 競合価格自動取得
- [ ] 価格最適化提案

## テスト計画

### 単体テスト
- ドメインロジックのテスト
- 価格計算の精度テスト
- ルールエンジンのテスト

### 統合テスト
- API統合テスト
- 価格更新の反映テスト
- 既存システムとの連携テスト

### E2Eテスト
- 価格設定から課金までのフロー
- 管理画面の操作テスト
- パフォーマンステスト

## リスクと対策

### リスク1: 価格計算の複雑性
- **リスク**: ルールが複雑になりすぎて管理困難
- **対策**: ルールの可視化ツール、シミュレーション機能

### リスク2: リアルタイム性能
- **リスク**: 価格取得がボトルネックになる
- **対策**: Redis等でのキャッシュ、事前計算

### リスク3: 価格変更の影響
- **リスク**: 急激な価格変更による顧客離反
- **対策**: 段階的な価格変更、事前通知機能

## 完了条件

- [x] 調達価格の動的管理が可能（バックエンド実装済み）
- [x] 柔軟な価格ポリシー設定が可能
- [x] Agent APIが動的価格で課金される（PaymentApp統合済み）
- [ ] 価格変更履歴が追跡可能（テーブルは作成済み、UIは未実装）
- [x] 管理画面から価格設定・調達管理が可能
- [x] GraphQLコード生成を活用した型安全な実装
- [x] 実データベースとの連携（モックデータ排除）
- [x] ドキュメントが完備されている（このタスクドキュメント）

## 参考資料

- [Domain-Driven Design](https://www.amazon.com/Domain-Driven-Design-Tackling-Complexity-Software/dp/0321125215)
- [Implementing Domain-Driven Design](https://www.amazon.com/Implementing-Domain-Driven-Design-Vaughn-Vernon/dp/0321834577)
- [価格戦略の理論と実践](https://www.amazon.co.jp/dp/4478025746)