# Payment値オブジェクト移行ガイド

## 概要

Paymentコンテキストでは残高更新・課金判定・Stripe Webhook処理などの金額計算に値オブジェクト (`NanoDollar` / `UsdCents`) を導入しました。従来は `i64` や `f64` を直接演算していたため、単位変換ミスや丸め誤差のリスクが残っていましたが、v0.15.0 時点で以下の方針に統一されています。

- 内部計算はすべて `NanoDollar` を基本単位として扱う。
- Stripe向け入出力は `UsdCents` を経由し、型レベルで最小単位を保証する。
- 表示用のUSD変換はフォーマッタ関数を通じて行い、手動の割り算は禁則とする。

## 達成事項 (v0.15.0)

- `packages/payment` のユースケース (`top_up_balance` / `deduct_balance` / `handle_stripe_webhook` / `check_billing`) を値オブジェクト対応へ移行。
- `value_object` クレートに `TryFrom` / `From` 実装を追加し、境界値チェックとオーバーフローハンドリングを共通化。
- GraphQL / REST レイヤーで `*_nanodollars` と USD表示値を同時出力するユーティリティを整備。
- Stripeメタデータ (`amount`, `balance_transaction.fee`) の読み書きで `UsdCents` を経由することで丸め誤差を排除。
- 既存シリアライゼーション形式を保ちながら内部実装のみ値オブジェクト化し、後方互換性を確保。

## 値オブジェクト設計

### NanoDollar

- 10^-9 USD を表す内部基本単位。
- `value() -> i128` で生値を取得し、演算は `checked_add` / `checked_sub` を通じて実行。
- `TryFrom<UsdCents>` を実装しており、Stripe由来の整数値を安全に変換可能。
- 表示用途には `format_nanodollar_as_usd_plain` / `format_usd_plain` を利用する。

### UsdCents

- Stripe API とやり取りする最小単位 (1 cent)。
- `raw() -> i64` でStripeへ渡す整数値を取得。
- `to_nano_dollar()` で `NanoDollar` に変換し、内部計算と同期させる。
- 返金や手数料計算などで負の値を扱う場合は `try_normalize_sign()` を通して整合性を検証する。

## Stripe連携の取り扱い

1. Webhook受信時は `UsdCents::try_from(stripe_event.amount)` で取り込み、`NanoDollar` に変換したうえで残高に反映。
2. Checkout生成・残高チャージ時は `NanoDollar` 合計を `UsdCents::from(nano_total)` に変換した後、Stripeセッションに渡す。
3. メタデータに格納する値は `NanoDollar` のまま保持し、後続処理で再利用可能とする。

## GraphQL / REST レスポンス

- `ServiceCostBreakdown` や `PaymentBalance` などのレスポンス構造体は `NanoDollar` を内部フィールドに持ち、`impl From<DomainType>` でDTOへ変換します。
- 表示用のUSD文字列は `packages/catalog/src/presentation/mod.rs` のフォーマッタを呼び出し、同じロジックをフロントと共有します。
- 手動で `nanodollar / 1_000_000_000` のような除算を行うことは禁止です。

## マイグレーション指針

- 既存コードから値オブジェクトへ移行する際は、まず `NanoDollar` を返すヘルパーを追加して段階的に置き換える。
- 多階層の変換が必要な場合は `value_object` クレートに専用コンストラクタを追加し、重複ロジックを排除する。
- 旧来の `amount_cents` など整数フィールドは最終的に削除を目指すが、互換性確保のため当面は `deprecated` ラベル付きで残置する。

## テスト戦略

- `cargo test -p payment` でユースケース単位の演算ロジックをカバー。
- Stripe Webhookの疑似イベントは `tests/payment/stripe_webhook.rs` を通じて `UsdCents` と `NanoDollar` の相互変換を検証。
- `mise run check` によるワークスペース統合検証を定期実行し、型整合性を維持。

## 今後の展望

- Billing履歴の蓄積では `NanoDollar` を主キーにした集計ビューを追加予定。
- フロントエンド向けに `@tachyon-apps/money` としてフォーマッタを公開し、表示ロジックを統一する。
- Stripe以外のプロバイダー追加を見据え、`UsdCents` と同様の値オブジェクトを `value_object` クレートで拡張する。

## 参考リンク

- タスクドキュメント: `docs/src/tasks/completed/v0.15.0/payment-use-value-object/task.md`
- 検証レポート: `docs/src/tasks/completed/v0.15.0/payment-use-value-object/verification-report.md`
- アーキテクチャ基礎: `docs/src/architecture/nanodollar-system.md`
- 既存Stripe連携仕様: `docs/src/tachyon-apps/payment/stripe-dynamic-key-switching.md`

## 変更履歴

- v0.15.0 (2025-10-12): Payment残高計算を値オブジェクトへ統一し、本ドキュメントを追加。
