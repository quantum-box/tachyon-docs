# AIチャット課金チェックにおけるStripe残高判定仕様

## 目的

AIチャット／エージェント実行前に `PaymentApp::check_billing` が参照する Stripe Customer Balance を正しく評価し、残高不足時のみ `PaymentRequired` を返すことを目的とする。テナント固有の Stripe アカウントへ確実にアクセスし、取得した残高を NanoDollar に正規化したうえで課金見積りと比較する。

## Stripeクライアント解決

- `CheckBillingUseCase` は `StripeClientRegistry` を介して `config_tenant_id` → `stripe::Client` を取得する。
- レジストリは Platform → Operator の優先順位で検索し、いずれも見つからない場合のみデフォルト環境のクライアントにフォールバックする。
- 取得したクライアントで `stripe::Customer::retrieve` を呼び出し、`balance`（最小通貨単位）と `currency` を取得する。

## 残高換算ロジック

```yaml
inputs:
  balance_minor_units: int   # Stripe APIのcustomer.balance（USDならcent, JPYならyen）
  currency: string           # ISO 4217通貨コード（USD/JPY想定）
process:
  available_minor_units: max(-balance_minor_units, 0)   # Stripeは負値で残高を表現する
  available_nanodollars:
    USD: available_minor_units * 10_000_000
    JPY: available_minor_units * 1_000_000
  available_usd: available_nanodollars / 1_000_000_000
output:
  available_nanodollars: int
  available_usd: Decimal128
```

- NanoDollar換算後は `estimate.total_cost_nanodollars` と比較し、充足時は `BillingCheckResult::Allow` を返す。
- 判定結果には `available` / `required` を NanoDollar で保持し、UI 表示時のみ `format_nanodollar_as_usd_plain` を利用する。

## GraphQLレスポンス仕様

- `purchaseCredits` / `purchaseCreditsWithCurrency` の `balanceAfter` フィールドは通貨の最小単位（USD: cent, JPY: yen）で返却する。
- GraphQL スキーマ説明を「チャージ後残高（currency minor unit）」に更新し、フロントエンドは `/100` 換算をそのまま利用する。
- Stripe チャージメタデータには `currency_minor_unit` を付与し、監査ログで単位を判別可能にする。

## テストと監査

- `check_billing` 単体テストで Stripe モックレスポンスから NanoDollar 変換が行われることを検証する。
- GraphQL Mutation のレスポンススナップショットで `balanceAfter` が最小通貨単位であることを確認する。
- `grant_stripe_balance` で記録される監査メタデータに通貨単位が含まれているかを検証する。

## 関連タスク

- [AIチャット課金チェックのStripe残高計算修正](../../tasks/completed/v0.15.0/fix-ai-chat-billing-check/task.md)

