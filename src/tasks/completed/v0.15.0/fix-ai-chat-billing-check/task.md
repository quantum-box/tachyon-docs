---
title: "AIチャット課金チェックのStripe残高計算修正"
type: bug
emoji: "🪙"
topics:
  - payment
  - billing
  - llms
published: false
targetFiles:
  - packages/payment/src/usecase/check_billing.rs
  - packages/payment/src/sdk.rs
  - packages/payment/src/adapter/graphql/mutation.rs
  - packages/payment/src/usecase/grant_stripe_balance.rs
github: https://github.com/quantum-box/tachyon-apps
---

# AIチャット課金チェックのStripe残高計算修正

## 概要

AIチャット/エージェント実行時の課金前チェックが、Stripe Customer Balance に十分な残高があっても `PaymentRequired: Insufficient balance` を返してしまう不具合を修正する。あわせて、チャージ直後の残高をGraphQLで返す際に32bitオーバーフローが発生し、表示金額が壊れる問題も解消する。

## 背景・目的

- Stripe連携を再編した結果、`CheckBillingUseCase` がテナント固有のStripeクライアントを参照できず、常にデフォルト環境のシークレットキーで残高照会していた。
- USD対応に伴い残高をNanoDollarで扱うようにしたが、`purchaseCredits` のレスポンスが依然としてGraphQL `Int`（32bit）にNanoDollar値をそのまま詰めており、$2を超えるとオーバーフローして負値になる。
- 上記2点が重なり、UI上は$200以上チャージ済みに見えても、実行直前の残高チェックでは0ドル扱いとなりLLM実行が遮断される。

期待する成果:

- Stripe残高が正しく取得・換算され、所定の閾値内であればLLM実行が通る。
- チャージ直後の残高表示が正しい数値で表示され、ユーザーサポート問い合わせを減らす。
- 仕様と履歴が `docs/src/tachyon-apps/payment/ai-chat-stripe-billing-check.md` に整理されている。

## 詳細仕様

### 機能要件

1. `CheckBillingUseCase` は `StripeClientRegistry` を介して platform/operator に紐づくStripeクライアントを取得し、Customer BalanceをStripeの最小単位で取得すること。
2. Stripeから取得した残高を通貨別ルールでNanoDollarへ正規化し、見積り金額以上の残高があるか判定する。金額表示用のUSD換算は `NanoDollar::to_usd()` を使用する。
3. `PaymentAppImpl::check_billing` は `GetOrCreateStripeCustomer` 出力から `config_tenant_id` を取得し、課金チェックに渡す。
4. `purchaseCredits` / `purchaseCreditsWithCurrency` の GraphQL Payload `balanceAfter` は通貨の最小単位（USDならセント）を返却し、Front側での `/100` 換算がそのまま有効になるようにする。
5. 既存の `grant_stripe_balance` メタデータに通貨単位を追記し、将来の監査ログ整合性を確保する（必要最小限）。
6. 単体テストでStripe残高→NanoDollar変換と`balanceAfter`の単位変換を検証する。

### 非機能要件

- Stripe API呼び出しは既存の `stripe` asyncクライアントを使用し、同期HTTPクライアント（ureq）によるブロッキングを排除する。
- 多テナント環境で誤ったStripeアカウントにアクセスしないこと（config tenant優先、失敗時のみフォールバック）。
- 金額演算はすべて `i64`/`Decimal`ベースで行い、32bit境界を通らない。
- `mise run check` 実行時に支障がないこと（Stripe呼び出し部分はテストでモック化）。

### コンテキスト別の責務

```yaml
contexts:
  payment:
    description: "Stripe Customer Balance を管理し、課金可否を判断する"
    responsibilities:
      - Stripeクライアント解決（プラットフォーム/オペレーター別）
      - Customer Balanceの正規化とNanoDollar換算
      - チャージ直後の残高レスポンス整合性
  llms:
    description: "LLM実行前にPayment結果を参照する"
    responsibilities:
      - `PaymentApp::check_billing` の結果で実行可否を決定
      - エラー時はUIに正しいRequired/Availableを表示
```

### 仕様のYAML定義

```yaml
stripe_balance_conversion:
  inputs:
    balance_minor_units: int   # Stripe APIから取得した最小単位（USDならcent, JPYならyen）
    currency: "USD" | "JPY"
  conversion:
    available_minor_units: "max(-balance_minor_units, 0)"
    available_nanodollars:
      USD: "available_minor_units * 10_000_000"
      JPY: "available_minor_units * 1_000_000"   # 1円 = $0.01 仮定
  output:
    available_nanodollars: int

graphql_purchase_payload:
  balance_after:
    unit: "currency_minor"   # USD: cents, JPY: yen
    description: "チャージ後の利用可能残高（NanoDollarではなく表示用の最小単位）"
```

## 実装方針

1. `CheckBillingUseCase`
   - 依存性に `Arc<StripeClientRegistry>` を追加し、`get_client_for_tenant`→`stripe::Customer::retrieve` に置き換える。
   - `Stripe`レスポンスから残高・通貨を抽出し、NanoDollar換算ロジックを共通メソッド化する。
2. `PaymentAppImpl::check_billing`
   - 既存の `ensure_stripe_customer` を呼び出し、`config_tenant_id` を `CheckBillingUseCase` に連鎖する。
3. GraphQL Mutation
   - `balanceAfter` に返す値をNanoDollarから最小通貨単位へ変換、フィールド説明も更新する。
4. テスト
   - `CheckBillingUseCase` 用にStripeクライアントを差し替えできるよう簡易モック（テスト用struct）を導入。
   - 変換ヘルパーの単体テストを追加。
   - `purchaseCredits` レスポンスの単位が期待通りであることを検証する。

## タスク分解

### フェーズ1: 調査・設計 ✅ (2025-10-14)
- [x] 現行`check_billing`がどのStripeキーを参照しているか確認
- [x] NanoDollar↔最小単位変換の既存実装を棚卸し
- [x] 影響範囲とテスト方針を整理

### フェーズ2: 実装 ✅ (2025-10-14 完了)
- [x] `CheckBillingUseCase` にStripeクライアント依存を追加
- [x] `PaymentAppImpl::check_billing` からconfig tenantを引き渡し
- [x] GraphQL `purchaseCredits` の返却値と説明文を更新
- [x] 変換ロジックをヘルパー化

### フェーズ3: テスト・検証 ✅ (2025-10-14 完了)
- [x] 変換ロジック単体テスト追加 (`#[cfg(test)]`)
- [x] Paymentレイヤーのモックテスト整備（Stripeレスポンス差し替え）
- [x] `mise run check` / `mise run ci-node` 実行
- [x] 必要に応じてPlaywright MCPでUI確認（残高表示）※UI変更なしにつきスキップ判断を記録

### フェーズ4: ドキュメント更新・完了報告 ✅ (2025-10-14 完了)
- [x] taskdoc更新（進捗記録・実装メモ）
- [x] verification-report作成
- [x] 仕様ドキュメントへの反映（`docs/src/tachyon-apps/payment/ai-chat-stripe-billing-check.md`）

## テスト計画

- Rust単体テスト: `CheckBillingUseCase` の残高判定、GraphQL Payload変換。
- 既存E2Eシナリオ: `apps/tachyon-api/tests/scenarios/payment_service_cost_check.yaml` に影響がないか確認。
- 必要ならUI手動確認: `http://localhost:16000/v1beta/[tenant]/billing` でチャージ後の残高表示を確認。

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| Stripeクライアントの誤選択で本番顧客の残高にアクセスしてしまう | 中 | `StripeClientRegistry` のフォールバックロジックを慎重に利用し、テストでconfig tenantを明示 |
| APIレスポンス単位変更によるフロント回帰 | 中 | GraphQLスキーマコメント・Frontの単位換算を再確認し、Storybook/Playwrightで確認 |
| Stripe API呼び出しのテスト難易度 | 低 | テスト用モックと責務分離でHTTPには触れない |

## スケジュール

- 2025-10-14 AM: 実装と単体テスト
- 2025-10-14 PM: 動作確認・ドキュメント更新

## 参考資料

- `docs/src/architecture/nanodollar-system.md`
- `docs/src/tachyon-apps/payment/usd-billing-system.md`
- `docs/src/tachyon-apps/payment/ai-chat-stripe-billing-check.md`
- `docs/src/tasks/bugfix/fix-stripe-credit-balance/task.md`

## 完了条件

- [x] Stripe残高が正しく判定され、$200残高でエージェント実行が通る
- [x] `purchaseCredits` レスポンスの `balanceAfter` が最小通貨単位で返る
- [x] 追加したテストがGreen、`mise run check` が成功
- [x] verification-report.md に動作確認結果を記載
- [x] 本taskdocのステータスを更新し完了

## 備考

- Stripeへの実呼び出しは作業用APIキー（sandbox）を利用。開発環境では `PAYMENT_SKIP_BILLING=1` を用いた暫定回避が可能だが、最終的には不要にする。
