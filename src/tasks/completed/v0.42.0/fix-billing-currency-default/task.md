---
title: "Billing残高表示が1/10になるバグ修正"
type: "bug"
emoji: "🐛"
topics: ["payment", "stripe", "billing", "NanoDollar"]
published: true
targetFiles:
  - packages/payment/src/domain/stripe_customer.rs
  - packages/payment/src/usecase/get_balance.rs
github: ""
---

# Billing残高表示が1/10になるバグ修正

## 概要

Stripeダッシュボードでは $100.00 USD の残高が、Tachyon Billing画面では $10.00 と表示されるバグを修正する。

## 背景・目的

### 報告された問題
- Stripe: `https://dashboard.stripe.com/acct_1L1umOC0lHhtcjtr/customers/cus_ToaKWfnmLcKlnY` → $100.00 USD
- Tachyon: `https://app.n1.tachy.one/v1beta/tn_01kf8rtnf3vkq467vkr1a79gy4/billing` → $10.00

### 根本原因

`StripeCustomer::new()` のデフォルト通貨が `Currency::JPY` にハードコードされていた。

`GetOrCreateStripeCustomer::execute()` でStripe顧客を新規作成する際、`StripeCustomer::new()` を使用するため、ローカルDBの `stripe_customers.currency` が **JPY** で保存される。

残高取得時（`get_balance.rs`）にこの通貨を基に変換処理が行われるが:
- **USD**: `UsdCents → NanoDollar` で `× 10,000,000` (NANODOLLARS_PER_CENT)
- **JPY**: `from_jpy()` で `× 1,000,000` (NANODOLLARS_PER_JPY)

10倍の差があり、フロントエンドは常に `/ 1,000,000,000` (NANODOLLARS_PER_USD) で表示するため、$100 → $10 と表示されていた。

## 詳細仕様

### 変換フロー（修正前）

```
Stripe API: customer.balance = -10000 (cents, $100 credit)
  ↓
get_balance.rs: stripe_customer.currency = JPY (BUG: should be USD)
  ↓
from_stripe_balance(): JPY path → NanoDollar::from_jpy(10000) = 10,000,000,000
  ↓
Frontend: 10,000,000,000 / 1,000,000,000 = $10.00  ← WRONG
```

### 変換フロー（修正後）

```
Stripe API: customer.balance = -10000 (cents, $100 credit)
  ↓
get_balance.rs: customer_data.currency = USD (Stripe APIから取得)
  ↓
from_stripe_balance(): USD path → UsdCents(10000).to_balance_nanodollar() = 100,000,000,000
  ↓
Frontend: 100,000,000,000 / 1,000,000,000 = $100.00  ← CORRECT
```

## 実装方針

### 修正1: `StripeCustomer::new()` デフォルト通貨変更

`packages/payment/src/domain/stripe_customer.rs`

- `Currency::JPY` → `Currency::USD` に変更
- システムはUSD中心で運用されているため、デフォルトはUSDが妥当

### 修正2: `get_balance.rs` でStripe APIの通貨を優先

`packages/payment/src/usecase/get_balance.rs`

- Stripe APIレスポンスの `customer.currency` を優先的に使用
- ローカルDBの通貨と不一致があれば、ログ出力＋自動修正
- デフォルト通貨を `JPY` → `USD` に変更

### 修正3: テスト追加

既存テストの拡充と通貨不整合ケースのテストを追加。

## タスク分解

### 主要タスク
- [x] 原因調査・特定
- [x] `StripeCustomer::new()` デフォルト通貨修正
- [x] `get_balance.rs` Stripe API通貨優先ロジック追加
- [x] テスト追加
- [x] ビルド確認
- [x] 動作確認（ローカル: Billing画面レンダリング確認済み、本番: デプロイ後に最終確認）

## テスト結果

### 追加したテスト（payment クレート: 29テスト全パス）

#### `stripe_customer.rs` (3テスト追加)
- `new_defaults_to_usd`: `StripeCustomer::new()` がデフォルトで USD を使用することを検証
- `new_with_currency_respects_given_currency`: `new_with_currency()` が指定通貨を保持することを検証
- `set_currency_updates_value`: `set_currency()` が値を正しく更新することを検証

#### `credit_balance.rs` (1テスト追加)
- `wrong_currency_causes_10x_discrepancy`: **バグの核心を証明するテスト**。Stripe残高 `-10000 cents ($100)` に対して:
  - USD変換: `10000 × 10,000,000 = 100,000,000,000 NanoDollar` → `$100.00` (正しい)
  - JPY変換: `10000 × 1,000,000 = 10,000,000,000 NanoDollar` → `$10.00` (10倍小さい)
  - 比率が正確に10倍であることをアサーション

## 動作確認結果（ローカル環境: 2026-02-15）

Playwright MCPでBilling画面を確認。スクリーンショット: `screenshots/billing-page-usd-balance.png`

- [x] Billing画面が正常にレンダリングされる
- [x] 残高が **USD** 表記で正しく表示される（`$0.00` — dev環境にStripe残高なしのため）
- [x] 「USD balance」ヘッダーが表示される
- [x] Payment methods（visa •••• 4242）が正常表示
- [x] Billing画面自体にコンソールエラーなし
- [ ] 本番環境でStripe残高ありのテナントで$100 → $100表示を確認（デプロイ後）

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 既存JPYレコードが残っている | 中 | get_balance.rsの自動修正ロジックで対応 |
| Stripe API currency が None の場合 | 低 | ローカルDBの通貨にフォールバック |

## 完了条件

- [x] バグの根本原因が特定されている
- [x] コード修正が完了
- [x] テストが追加されている
- [x] ビルドが通る（`mise run check` パス）
- [x] テストが通る（`cargo test -p payment` 29テスト全パス）
- [x] 動作確認レポートが完成している（ローカル確認済み、本番は要確認）

### バージョン

パッチバージョン（バグ修正）
