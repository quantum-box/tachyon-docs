---
title: "Stripe残高の負値表示を是正する"
type: "bug"
emoji: "🪙"
topics:
  - payment
  - billing
  - stripe
published: true
targetFiles:
  - packages/payment/src/usecase/check_billing.rs
  - packages/value_object/src/nano_dollar.rs
github: https://github.com/quantum-box/tachyon-apps
---

# Stripe残高の負値表示を是正する

## 概要

Stripeのカスタマー残高を負値のままNanoDollarへ変換してしまい、Agent API実行時の残高チェックで `Available: $-2248676.83` のような異常値が表示される問題を解消する。

## 背景・目的

- Stripe `customer.balance` フィールドの符号を正しく扱えておらず、実際の与信がない場合でも巨大な負の残高が表示されてしまう。
- 残高チェックに失敗するとLLMエージェントを実行できず、サポート対応が必要になる。
- 負値表示を正し、UI／API両方で信用残高が正確に把握できる状態を目指す。

## 詳細仕様

### 機能要件

1. `CheckBillingUseCase` でStripeカスタマー残高をNanoDollarへ変換する際、Stripe仕様に基づき利用可能残高を `max(-customer.balance, 0)` として評価する。
2. 利用可能残高が0未満の場合は0として扱い、エラー文言の `Available` 表示も0ドルとする。
3. ログ出力およびエラー内容は既存形式（`PaymentRequired: Insufficient balance. Required: $X, Available: $Y`）を維持する。

### ユーザーストーリー

- `tenant_id` を持つオペレーターとしてAgent APIを呼び出したとき、Stripeに残高がなければ `Available: $0.00` と表示され、必要金額との差分が明示される。
- Stripeでプリペイド残高がある場合は、その絶対値をUSD表示し、十分であればチェックを通過する。

### 受け入れ条件

- Stripeの `balance` が `-5000`（$50クレジット）なら `Available: $50.00` と表示される。
- Stripeの `balance` が `0` もしくは正の値なら `Available` が `0` となり、残高不足のエラーが返る。
- 単体テストで上記ケースを再現できる。

### 非機能要件

- APIレスポンス性能への影響は極小であること。
- Stripe APIへのアクセス経路／認証は既存ロジックを流用し、セキュリティ要件に変更を加えない。
- 変換ロジックは将来の再利用を考慮し、値オブジェクト内にヘルパーがある場合はそちらを活用する。

### コンテキスト別の責務

```yaml
contexts:
  payment:
    description: "Stripe残高を元に請求可否を判断する"
    responsibilities:
      - Stripe APIから残高を取得
      - NanoDollar単位への正規化
      - 残高不足エラーの生成
  llms:
    description: "Agent API実行時にPaymentコンテキストの結果を利用"
    responsibilities:
      - Paymentのチェック結果を受けて課金処理を継続または停止
      - エラーメッセージをUIやAPIレスポンスに反映
```

### 仕様のYAML定義

```yaml
stripe_balance_conversion:
  description: "Stripe customer.balance を NanoDollar へ変換するルール"
  inputs:
    stripe_balance_cents: int   # Stripe APIのcustomer.balance（センチ単位、負値=クレジット）
  conversion:
    available_cents: "max(-stripe_balance_cents, 0)"
    available_nanodollars: "available_cents * 10_000_000"
  notes:
    - "Stripeでは負値が利用可能残高、正値が未収金を表す"
    - "利用可能残高は常に0以上で扱う"
```

## 実装方針

### アーキテクチャ設計

- Clean Architectureの既存構成を維持し、Payment usecase層のみで符号処理を完結させる。
- 必要であれば `NanoDollar` にStripe残高を扱うための小さなヘルパーメソッドを追加し再利用性を高める。

### 技術選定

- Rust（Paymentコンテキスト）での実装を継続。
- 既存の`value_object::NanoDollar` 型と `rust_decimal` を利用し、追加ライブラリは導入しない。

### TDD（テスト駆動開発）戦略

#### 既存動作の保証
- `CheckBillingUseCase` の既存テストを確認し、負値／正値のケースをカバーするテストを追加する。
- Stripeレスポンスのモックは既存リポジトリのテストダブルを流用する。

#### テストファーストアプローチ
- 残高変換の振る舞いを規定するテストを先に追加し、期待する表示が得られることを確認する。

#### 継続的検証
- `mise run check` を実行し、Paymentクレートのテストが通過することを保証する。

## タスク分解

### 主要タスク
- [x] Stripe残高の取得・変換ロジックを調査し、期待挙動をドキュメントに反映
- [x] 残高変換の単体テストを追加（負値・正値・ゼロ）
- [x] `CheckBillingUseCase` の変換ロジック修正
- [x] `mise run check` および関連テストの実行
- [x] タスクドキュメント・動作確認レポートの更新
- [x] Stripe残高を表現する値オブジェクトを導入し、符号変換ロジックをそこへ集約
- [x] 値オブジェクトを用いた `CheckBillingUseCase` のリファクタリングと追加テスト
- [x] Stripe依存の命名を排除し、汎用的なUSDセント値オブジェクトへ差し替え
- [x] `CheckBillingUseCase` を新しい値オブジェクトに追従させる
- [x] Stripeサンドボックスで `cargo run --bin verify_stripe_customers tn_01hjryxysgey07h5jz5wagqj0m` を実施し、顧客データ取得を確認
- [x] GraphQL/APIでの残高単位変換をUSD/JYPごとに正規化
- [x] 取引履歴の金額変換ロジックを通貨ベースで再計算し、USDの場合はNanoDollar→USDに統一
- [x] 残高レスポンスでマイナス値（未収金額）もそのまま表示されるよう通貨別換算を調整
- [x] 月次使用量の集計をNanoDollar→セント換算に修正し、UI表示が実際の金額と一致するよう調整
- [x] GraphQLでトランザクション説明をドル表記に再生成し、既存データでも"credit"表記が出ないよう整備
- [x] Stripe Customer Balanceとのやり取りをNanoDollar⇔セント換算に統一し、購入時チャージが10倍になる問題を解消
- [x] CreditTransactionメタデータへ`amount_cents`/`amount_nanodollars`/`balance_after_nanodollars`を保存し、フロントとRESTの表記がUSD基準で揃うよう更新

## Playwright MCPによる動作確認

- 今回はバックエンドロジックのみの変更予定のため、Playwright MCPによるブラウザ確認は不要。
- UIでの確認が必要になった場合は別途チェックリストを作成する。

## スケジュール

- 調査と実装で約2時間、テストとドキュメント更新で1時間を想定。即日対応を目指す。

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| Stripe APIレスポンス仕様の読み違い | 中 | 公式ドキュメントと既存実装の利用例を再確認する |
| テスト環境でStripe呼び出しが行われ本番に影響 | 低 | 単体テストではHTTP呼び出しをモックし、実APIへアクセスしない |
| NanoDollar変換の副作用 | 中 | 値オブジェクトにヘルパー追加時は既存利用箇所との互換性を確認する |

## 参考資料

- Stripe Docs: https://docs.stripe.com/customers/balance
- 社内ドキュメント: `docs/src/tachyon-apps/payment/usd-billing-system.md`

## 完了条件

- [ ] Stripe残高が正しく0以上に正規化され、利用可能残高の表示が期待通りになる
- [ ] 単体テストで符号処理のケースをカバーし通過している
- [ ] `mise run check` が成功する
- [ ] 動作確認レポート（必要に応じて）が更新されている
- [ ] 本タスクドキュメントのステータスを最新化してPRに添付する

## 備考

- Stripeのサンドボックス環境で残高を調整する必要がある場合は、バックオフィスチームへ依頼する。
