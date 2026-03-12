# Payment System

## 概要

Tachyon Appsにおける決済・課金システムに関するドキュメントです。決済プロバイダー（Stripe）との統合、商品管理、価格設定、サブスクリプション管理などを扱います。

## 主要コンポーネント

### 1. Domain Models
- **Product**: 商品情報の管理
- **Price**: 価格設定（単発・定期）
- **Subscription**: サブスクリプション管理
- **BillingInformation**: 請求情報

### 2. Payment Providers
- **Stripe Integration**: Stripe APIとの統合
- **Provider Object Mapping**: プロバイダー間のオブジェクトマッピング

### 3. Use Cases
- チェックアウトセッション作成
- 商品・価格の同期
- サブスクリプションの作成・更新・解約
- 請求書管理

## 関連ドキュメント

- [LLM Agent API課金システム](./llm-agent-billing.md) - クレジットチャージ式の使用量ベース課金
- [USD Billing System](./usd-billing-system.md) - NanoDollar単位を使用した高精度課金システム
- [Dynamic Stripe Key Switching](./stripe-dynamic-key-switching.md) - テナント別動的Stripe設定管理
- [Payment値オブジェクト移行ガイド](./payment-value-object-refactor.md) - NanoDollar/UsdCentsによる安全な金額演算指針
- [AIチャット課金チェックとStripe残高判定](./ai-chat-stripe-billing-check.md) - Stripe残高照会とNanoDollar換算の仕様
