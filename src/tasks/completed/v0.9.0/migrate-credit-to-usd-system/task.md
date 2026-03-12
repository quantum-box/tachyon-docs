---
title: "クレジット換算システムをUSD建てに移行"
type: "refactor"
emoji: "💵"
topics: ["billing", "pricing", "refactoring", "USD", "credit-system"]
published: true
targetFiles: [
  "packages/catalog/src/pricing/",
  "packages/payment/",
  "packages/llms/src/usecase/command_stack/billing_aware.rs",
  "packages/providers/*/src/pricing.rs",
  "scripts/seed-api-services.sql"
]
github: ""
---

# クレジット換算システムをUSD建てに移行

## 概要

現在のシステムでは「クレジット」という中間単位を使用していますが（1 USD = 100クレジット）、これを廃止し、外部表現をすべてUSD建てに統一します。内部ではnanodollars（ナノドル = 0.000000001 USD）を使用し、システムの複雑性を削減します。

## 背景・目的

### 現状の問題点
1. **二重変換の複雑性**: USD → クレジット → 内部単位という二重変換が発生
2. **ドキュメントと実装の不整合**: 1クレジット = 0.01 USDという記載と実装の乖離
3. **開発者の混乱**: どの単位で計算すべきか不明確
4. **PaymentとCatalogの単位差異**: 異なる内部単位（10倍 vs 1000倍）

### 移行後のメリット
1. **シンプルな計算**: USDから直接内部単位へ変換
2. **グローバル標準**: 世界共通の通貨単位で統一
3. **保守性向上**: 変換ロジックの削減
4. **透明性**: エンドユーザーにも分かりやすい価格表示

## 詳細仕様

### 現在の単位体系
```yaml
current_system:
  external:
    - display: "クレジット"
    - conversion: "1 USD = 100 クレジット"
  internal:
    catalog:
      - unit: "内部単位"
      - conversion: "1クレジット = 1000内部単位"
    payment:
      - unit: "内部単位" 
      - conversion: "1クレジット = 10内部単位"
```

### 移行後の単位体系
```yaml
new_system:
  external:
    - display: "USD"
    - no_conversion_needed: true
  internal:
    - unit: "nanodollars" # 0.000000001 USD
    - conversion: "1 USD = 1,000,000,000 nanodollars"
    
# 計算例:
# Claude Sonnet 4 Input: $0.000003/token = 3,000 nanodollars
# Claude Sonnet 4 Output: $0.000015/token = 15,000 nanodollars
# Gemini 2.5 Flash-Lite Input: $0.0000001/token = 100 nanodollars
# 最小単位: $0.000000001 = 1 nanodollar
```

### 影響を受けるコンポーネント（詳細調査結果）

#### 1. データベーステーブル【高重要度】
**Payment Context**
- `credit_balances` → `usd_balances` - 残高管理テーブル（名称変更）
- `credit_packages` → `usd_packages` - USDパッケージ定義（名称変更）
- `credit_transactions` → `usd_transactions` - 取引履歴（名称変更）
- `billing_policies` - 課金ポリシー設定（free_trial_credits → free_trial_amount、monthly_credit_limit → monthly_limit_amount）

**Order/Catalog Context**
- `service_price_mappings.fixed_price` - サービス価格マッピング
- `product_usage_pricing.rate_per_unit` - 従量課金レート
- `agent_execution_costs` - Agent実行コスト記録

#### 2. 値オブジェクト【高重要度】
- `/packages/payment/src/domain/credit.rs` - Credit値オブジェクト
- `/packages/catalog/src/pricing/price_unit.rs` - InternalCreditUnit
- `/packages/payment/src/domain/credit_package.rs` - CreditPackageドメイン
- 変換: `InternalCreditUnit` → `NanoDollar`
- 変換: `CreditAmount` → `UsdAmount`
- 変換: `Credit` → 廃止

#### 3. GraphQL API【高重要度】
**スキーマ変更**
- `/apps/tachyon-api/schema.graphql` - メインスキーマ
  - `CreditBalance` → `UsdBalance`
  - `CreditTransaction` → `UsdTransaction`
  - `CreditPackage` → `UsdPackage`
- `/packages/payment/schema.graphql` - Paymentサブスキーマ
  - Query/Mutation名の変更

**リゾルバー変更**
- `/packages/payment/src/adapter/graphql/query.rs`
- `/packages/payment/src/adapter/graphql/mutation.rs`
- `/packages/payment/src/adapter/graphql/types.rs`

#### 4. フロントエンド【高重要度】
**メインページ**
- `/apps/tachyon/src/app/v1beta/[tenant_id]/billing/`
  - `credit-balance-section.tsx` - 残高表示
  - `transaction-history.tsx` - 取引履歴
  - `purchase-credits-dialog.tsx` - 購入ダイアログ

**料金ページ**
- `/apps/tachyon/src/app/v1beta/[tenant_id]/pricing/`
- `/apps/tachyon/src/app/(public)/pricing/llm/`

**国際化**
- `/apps/tachyon/src/lib/i18n/translations.ts` - 翻訳テキスト

#### 5. 計算ロジック【高重要度】
- `/packages/catalog/src/service_pricing/service_cost_calculator.rs`
- `/packages/llms/src/usecase/agent_cost_calculator.rs`
- `/packages/payment/src/usecase/consume_credits.rs`
- `/packages/payment/src/usecase/check_billing.rs`
- `/packages/llms/src/usecase/command_stack/billing_aware.rs`

#### 6. プロバイダー実装【中重要度】
- `/packages/providers/anthropic/src/pricing.rs`
- `/packages/providers/openai/src/pricing.rs`
- `/packages/providers/google_ai/src/pricing.rs`
- 他のプロバイダーの価格設定ファイル

#### 7. Stripe統合【中重要度】
- `/apps/tachyon-api/src/stripe_webhook.rs`
- `/packages/payment/src/usecase/report_usage_to_stripe.rs`
- 負の値表現の変更（クレジット → USD）

#### 8. ドキュメント【高重要度】
- `/docs/src/tachyon-apps/billing/credit-unit-system.md`
- `/docs/src/for-developers/llm-billing-implementation-rules.md`
- `/CLAUDE.md` - プロジェクト課金ガイド
- 各種仕様書の更新

## 実装方針

### アーキテクチャ方針
1. **段階的移行**: 破壊的変更を避けるため段階的に実装
2. **後方互換性**: 移行期間中は両方の単位をサポート
3. **データ移行**: 既存データの変換スクリプト準備

### 技術的実装

#### Phase 1: 新しい値オブジェクトの作成
```rust
// 新しいUSD単位システム（ナノドル）
pub struct NanoDollar(i64); // 1 = 0.000000001 USD

impl NanoDollar {
    pub const CONVERSION_FACTOR: i64 = 1_000_000_000; // 1 USD = 1,000,000,000 nanodollars
    
    // 注意: i64の最大値制限により、最大で約9.2×10^9 USD（92億ドル）まで表現可能
    // これは実用上十分な範囲（Stripeの制限より大きい）
    
    pub fn from_usd(usd: Decimal) -> Self {
        Self((usd * Decimal::from(Self::CONVERSION_FACTOR)).round().to_i64().unwrap_or(0))
    }
    
    pub fn to_usd(&self) -> Decimal {
        Decimal::from(self.0) / Decimal::from(Self::CONVERSION_FACTOR)
    }
    
    pub fn value(&self) -> i64 {
        self.0
    }
}

// 使用例:
// Claude Sonnet 4 Input: $0.000003/token
let price_per_token = NanoDollar::from_usd(Decimal::from_str("0.000003").unwrap());
assert_eq!(price_per_token.value(), 3000); // 3,000 nanodollars

// Gemini Flash-Lite Input: $0.0000001/token  
let flash_lite_price = NanoDollar::from_usd(Decimal::from_str("0.0000001").unwrap());
assert_eq!(flash_lite_price.value(), 100); // 100 nanodollars

// 1000トークンの計算
let total_cost = price_per_token.value() * 1000; // 3,000,000 nanodollars = $0.003
```

#### Phase 2: 並行稼働期間
```rust
// Feature Flagによる切り替え
if feature_flags.is_enabled("usd_pricing") {
    // 新システム: nanodollars使用
    let balance_nanodollars = get_usd_balance(tenant_id).await?;
    let balance_usd = NanoDollar(balance_nanodollars).to_usd();
} else {
    // 旧システム: クレジット使用（移行期間のみ）
    let balance_credits = get_credit_balance(tenant_id).await?;
    let balance_usd = balance_credits * Decimal::from_str("0.01")?;
}

// GraphQL APIレスポンス（移行期間中）
type BalanceResponse {
    # 旧フィールド（廃止予定）
    currentBalance: Float @deprecated(reason: "Use currentBalanceUsd instead")
    # 新フィールド
    currentBalanceUsd: Float!
    # 内部デバッグ用（本番では非表示）
    currentBalanceNanodollars: String
}
```

#### Phase 3: データ移行
- バッチ処理で既存データを変換
- ダウンタイムなしの移行

## タスク分解

### フェーズ1: 調査と設計 📝
- [ ] 現在のクレジット使用箇所の完全な洗い出し
- [ ] データベーススキーマの影響調査
- [ ] API仕様への影響調査
- [ ] **価格設定の修正**（実際のAPI価格との整合性確保）
- [ ] 移行計画書の作成

### フェーズ2: 新システムの実装 📝
- [ ] `NanoDollar`値オブジェクトの実装
- [ ] USD変換ロジックの実装
- [ ] 単体テストの作成
- [ ] Feature Flagシステムの実装

### フェーズ3: 並行稼働の実装 📝
- [ ] 両システムを切り替え可能にする
- [ ] APIレスポンスで両方の単位を返す
- [ ] 管理画面での表示切り替え

### フェーズ4: データ移行 📝
- [ ] 移行スクリプトの作成
- [ ] テスト環境での移行テスト
- [ ] 本番データのバックアップ
- [ ] 段階的なデータ移行

### フェーズ5: 切り替えと検証 📝
- [ ] Feature Flagで新システムに切り替え
- [ ] 動作確認とモニタリング
- [ ] 問題があれば即座にロールバック

### フェーズ6: クリーンアップ 📝
- [ ] 旧システムの削除（クレジット関連のすべてのコード）
- [ ] **ドキュメントの価格情報更新**（実際のAPI価格との整合性確保）
- [ ] 最終的なコードレビュー

## テスト計画

### 単体テスト
- USD変換ロジックの正確性
- 境界値テスト（最小単位、最大値）
- 丸め処理の検証

### 統合テスト
- APIレスポンスの検証
- データベース保存値の検証
- 課金フローの完全性

### 負荷テスト
- 変換処理のパフォーマンス
- 大量データ移行の性能

## リスクと対策

### リスク1: 精度の問題
- **リスク**: 小数点処理での誤差
- **対策**: Decimal型の使用、適切な丸め処理

### リスク2: 既存データの不整合
- **リスク**: 移行中のデータ不整合
- **対策**: トランザクション処理、ロールバック計画

### リスク3: ユーザー混乱
- **リスク**: 表示単位の変更による混乱
- **対策**: 事前告知、移行期間中の両方表示

## Stripe統合の変更詳細

### 現在のStripe実装
```rust
// Stripeでは負の値でクレジット残高を表現
// -10000 = 1000クレジット = $10
let stripe_balance = -(credits * 10);
```

### 移行後のStripe実装
```rust
// 直接USD centで管理（Stripeネイティブ）
// 1000 = $10.00
let stripe_balance_cents = (balance_usd * 100).round() as i64;

// 内部nanodollarsからの変換
let nanodollars = balance.value();
let cents = nanodollars / 10_000_000; // 1 cent = 10,000,000 nanodollars
```

### 注意事項
- Stripeは最小単位がcent（$0.01）
- 内部はnanodollar（$0.000000001）なので、10,000,000倍の差
- 請求時は常にcent単位に丸める必要あり

## スケジュール

- **調査・設計**: 2日
- **実装**: 5日
- **テスト**: 3日
- **移行準備**: 2日
- **本番移行**: 1日
- **合計**: 約13営業日

## 完了条件

1. すべての価格計算がUSDベースで動作
2. データベースの値がUSD単位で保存
3. APIレスポンスがUSD表記
4. 既存データの移行完了
5. **価格設定が実際のAPI価格と一致**
6. ドキュメントの更新完了
7. パフォーマンステストの合格

## 参考資料

- [現在のクレジット単位システム](/docs/src/tachyon-apps/billing/credit-unit-system.md)
- [LLMビリング実装ルール](/docs/src/for-developers/llm-billing-implementation-rules.md)
- [Stripe Billing API仕様](https://stripe.com/docs/billing)

## 関連ドキュメント

- [影響分析詳細](./impact-analysis.md)
- [モデル料金一覧（nanodollar単位）](./model-pricing-nanodollars.md)
- [価格の不一致分析](./price-discrepancy-analysis.md)
- [実装ガイドライン](./implementation-guidelines.md)

## 実装メモ

### 2025-01-11 実装進捗
- ✅ GraphQL APIのNanoDollar対応完了
- ✅ フロントエンドの単位変換実装
- ✅ データベースマイグレーション作成
- ✅ 不要なnanodollarマイグレーションファイルの削除
- ✅ CLAUDE.mdへのドキュメント追加

詳細は [implementation-progress.md](./implementation-progress.md) を参照