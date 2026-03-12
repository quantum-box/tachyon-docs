---
title: "Payment計算のValue Object化"
type: "improvement"
emoji: "💳"
topics:
  - Payment
  - ValueObject
  - Rust
published: true
targetFiles:
  - packages/payment
  - packages/value_object
  - docs/src/tasks/completed/v0.15.0/payment-use-value-object/task.md
github: ""
---

# Payment計算のValue Object化

## 概要

Paymentコンテキストの残高処理およびStripe連携で、`i64`/`f64` 等のプリミティブ値を直接操作している箇所を値オブジェクトへ置き換え、金額計算の安全性と可読性を高める。

### バージョン

- リリースバージョン: v0.15.0

## 背景・目的

- 依然として `amount_cents` / `amount_nanodollar` といった変換ロジックが各所に散在し、単位の取り違えリスクが残っている。
- 新設済みの `UsdCents` / `NanoDollar` 値オブジェクトを十分に活用できておらず、今後の課金仕様変更に対して脆弱。
- StripeメタデータやGraphQLレスポンスの金額保証を型レベルで担保したい。

## 詳細仕様

### 機能要件

1. `packages/payment` 内の金額演算を `UsdCents`・`NanoDollar` などの値オブジェクトへ統一し、プリミティブ演算を排除する。
2. Stripe API との入出力では、値オブジェクトから安全に変換した値のみを渡す。
3. GraphQL/REST レスポンスも値オブジェクト経由で生成し、単位を明示する。
4. 既存の公開インターフェース（GraphQLスキーマ等）は変更しない。

### 非機能要件

- 金額計算に伴うパフォーマンス劣化を招かない（必要に応じて `Copy` / `From` 実装を活用）。
- 変換時のオーバーフロー、丸め誤差を防止するガードを持たせる。
- 既存テスト資産を更新し、回帰を防ぐ。

### コンテキスト別の責務

```yaml
contexts:
  payment:
    description: "残高計算とStripe連携"
    responsibilities:
      - 金額演算を値オブジェクトへ統一
      - Stripe metadata ↔ 内部表現の変換を一元化
      - 取引履歴へNanoDollar変換済み値を記録

  billing:
    description: "残高提供と照会"
    responsibilities:
      - 値オブジェクトから外部向けフォーマットを整形
      - GraphQLレスポンスの単位整合性を保証
```

### 仕様のYAML定義

```yaml
value_objects:
  usd_cents:
    description: "Stripe連携の最小単位"
    methods:
      - raw(): "i64 cents"
      - to_nano_dollar(): "NanoDollarへの変換"
      - credit(): "負債残高→前払残高への正規化"
  nano_dollar:
    description: "内部計算の基本単位"
    methods:
      - from_usd_cents(cents)
      - value(): "i128 nanodollar"
```

## 実装結果 (2025-10-12 完了)

- `packages/payment` 配下のユースケース（`top_up_balance` / `deduct_balance` / `handle_stripe_webhook` など）で `UsdCents`・`NanoDollar` の値オブジェクトを必須化し、プリミティブ演算を排除。
- 残高更新・Stripeメタデータ入出力の変換関数を `value_object` クレートに集約し、`TryFrom` / `From` 実装でオーバーフロー検知と単位保証を追加。
- GraphQL / REST レスポンス生成で新しい値オブジェクト経由のフォーマッタを採用し、`*_nanodollars` と USD表示値を同時に提供。
- 既存の外部向けインターフェースを変更せずに、内部実装のみ値オブジェクトへ移行する形で後方互換性を維持。

## タスク分解

- [x] 影響範囲の棚卸し（金額演算箇所の列挙）
- [x] 値オブジェクト変換ヘルパーの設計・実装
- [x] ユースケース（top_up/deduct/webhook 等）の移行
- [x] Stripe metadata / GraphQL 層の整合性調整
- [x] テストコードの更新・追加
- [x] lint / ts / cargo check などの再実行

## 実施テスト

- `cargo test -p payment`
- `yarn ts --filter=tachyon`
- `yarn lint --filter=tachyon`
- `mise run check`

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 単位変換ミスによる課金額の誤り | 高 | 値オブジェクトで換算処理を一元化し、テストケースを網羅 |
| Stripeメタデータとの整合性崩れ | 中 | 既存キーを変更せず、値オブジェクトから必要なスカラー値を取得 |
| 変更範囲が広くレビューが困難 | 中 | サブタスク分割と段階的なPRでリスク低減 |

## スケジュール

- 調査: 2025-10-12
- 実装: 2025-10-13〜2025-10-14
- テスト・ドキュメント: 2025-10-14

## 完了条件

- [x] 金額演算が値オブジェクト経由に統一されている。
- [x] lint / ts / cargo check が成功している。
- [x] 新旧テスト（ユニット/統合）が通過している。
- [x] 本タスクドキュメント・検証レポートが更新されている。

## 参考資料

- `packages/value_object/src/usd_cents.rs`
- `packages/value_object/src/nano_dollar.rs`
- `packages/payment/src/usecase/top_up_balance.rs`
- `docs/src/architecture/nanodollar-system.md`
- `docs/src/tachyon-apps/payment/payment-value-object-refactor.md`
