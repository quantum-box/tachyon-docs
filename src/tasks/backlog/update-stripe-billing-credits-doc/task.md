---
title: "Stripe Billing Creditsドキュメント更新"
type: documentation
emoji: "📝"
topics:
  - Stripe
  - Billing
  - Documentation
published: true
targetFiles:
  - docs/src/tachyon-apps/billing/stripe-billing-credits.md
  - packages/payment
  - packages/llms
github: ""
---

# Stripe Billing Creditsドキュメント更新

## 概要

`docs/src/tachyon-apps/billing/stripe-billing-credits.md` を最新の実装状況（2025年10月時点）に合わせて刷新し、Stripe Billing Credits運用の手順・仕様を正確に反映する。

## 背景・目的

- ドキュメントが2025年6月時点の情報で固定されており、その後の実装変更や仕様調整が反映されていない。
- Payment/Llmsコンテキスト双方の責務が拡張された結果、完了タスクや未実装項目の記載が実態と乖離している。
- Stripe Billing Credits導入プロジェクトの参照元として利用されるケースが増えたため、最新の構成・運用ガイドを提供してオンボーディング工数を削減したい。

## 詳細仕様

### 機能要件

1. ドキュメントに記載されているアーキテクチャ、フェーズ進捗、APIサンプルコードを現行コードベースと照合し、差異がある箇所を更新する。
2. Stripe Billing Creditsのセットアップ手順をテスト／本番の二系統で整理し、価格設定・通貨・Webhook・サブスクリプション構成を明確化する。
3. Agent実行時の使用量報告・残高照合・移行ステップのチェックリストを最新化し、完了済み／未完了の状況を正しく反映する。

### 非機能要件

- 金額・単位をNanoDollarとStripe Creditsの双方で明示し、誤解が生じないようにする。
- セクション構造とYAMLブロックを維持し、将来の仕様変更にも追従しやすい構成に整える。
- 外部リンクと内部参照（関連ドキュメント／コードファイル）を整備して保守性を向上させる。

### コンテキスト別の責務

```yaml
contexts:
  payment:
    responsibilities:
      - Stripeカスタマーとサブスクリプションの管理
      - クレジット付与・消費およびUsage報告APIのブリッジ
      - Webhook処理と内部残高の同期
  llms:
    responsibilities:
      - Agent実行における消費量計算とPaymentApp連携
      - BillingAwareCommandStackによる非同期Usage報告
      - NanoDollar換算と料金テーブル参照
  billing:
    responsibilities:
      - 管理画面／レポートに必要な残高・履歴の集約
      - Stripe残高との照合プロセス
      - 監査ログと異常検知の仕組み
```

### 仕様のYAML定義

Stripeの商品・価格・クレジットパッケージ・Webhookイベント・移行フローをYAMLで構造化し、環境変数や必須設定値を併記する。

```yaml
stripe:
  product:
    id: "prod_xxx"
    name: "Tachyon AI Credits"
    tax_behavior: "unspecified"
  prices:
    jpy:
      unit_amount: 1
      currency: "jpy"
      usage_type: "licensed"
    usd:
      unit_amount: 1
      currency: "usd"
      exchange_rate_policy: "nanodollar-reference"
  credit_packages:
    - currency: "jpy"
      amount: 1000
      bonus_rate: 0
    - currency: "usd"
      amount: 100
      bonus_rate: 0.05
  usage_reporting:
    subscription_item_env_var: "STRIPE_USAGE_SUBSCRIPTION_ITEM_ID"
    reporting_mode: "async"
    retry_policy: "exponential-backoff"
  webhooks:
    endpoints:
      - event: "customer.credit.created"
        handler: "HandleStripeWebhook::credit_created"
      - event: "customer.credit.updated"
        handler: "HandleStripeWebhook::credit_updated"
      - event: "invoice.created"
        handler: "HandleStripeWebhook::invoice_created"
    security:
      secret_env_var: "STRIPE_WEBHOOK_SECRET"

migration:
  phases:
    - name: "parallel_run"
      duration: "2 weeks"
      actions:
        - "両システムへ使用量記録"
        - "日次でStripe残高を照合"
    - name: "data_migration"
      duration: "1 week"
      actions:
        - "既存残高のStripe移行"
        - "Auditログのバックアップ"
    - name: "cutover"
      duration: "1 day"
      actions:
        - "従来システムを読み取り専用に切替"
        - "Stripe Creditsを単一の課金ソースに設定"
```

## 実装方針

### アーキテクチャ設計

- Payment/Llms/ Billing各コンテキストの最新コード（usecase・domain・adapter）を精査し、ワークフロー図と責務の境界を再整理した上でドキュメントへ反映する。
- Mermaidダイアグラムを更新し、非同期処理（Usage報告やWebhook）を含む全体フローを可視化する。

### 技術選定

- Stripe操作のコードサンプルは最新の `stripe-rust` バージョンとAPI仕様に合わせて更新し、非同期処理やIdempotencyキーのベストプラクティスを追記する。
- NanoDollar換算処理やフォーマッタの参照先（`packages/catalog/src/presentation/mod.rs` など）をドキュメント内で明示する。

### TDD（テスト駆動開発）戦略

#### 既存動作の保証
- PaymentAppおよびBillingAwareCommandStackの既存テストケースを確認し、Usage報告・残高照合がカバーされていることをドキュメントで参照する。
- Webhookハンドラ周辺のユニットテスト／シナリオテスト（`apps/tachyon-api/tests/scenarios/`）の有無を調査し、検証済み項目を追記する。

#### テストファーストアプローチ
- ドキュメント更新に合わせて不足しているテスト項目を洗い出し、追加入力が必要な箇所はTODOとして明記する。

#### 継続的検証
- 今後の仕様変更時に `mise run check` や関連テストを実行する手順をドキュメントへ記載し、継続的検証のフローを示す。

## タスク分解

### フェーズ1: 現状調査 🔄
- [x] Payment/Llms/Billingコンテキストの最新コミットを確認し、Stripe Billing Credits関連コードの差分を洗い出す。
- [ ] Stripeダッシュボードの設定（商品・価格・Webhook・サブスクリプション）をヒアリングし、ドキュメントに反映する。

### フェーズ2: ドキュメント更新案の作成 ✅
- [x] 既存ドキュメントのセクション構造を見直し、改訂構成案を策定する。
- [x] Mermaid図、YAMLブロック、チェックリストを最新状態に書き換える。

### フェーズ3: レビューとフィードバック 🔄
- [ ] 更新案を関係者へ共有し、フィードバックを収集する。
- [ ] 未確定事項はTODOとして明記し、追跡可能にする。

### フェーズ4: 最終反映と整合性確認 🔄
- [x] ドキュメントを `docs/src/tachyon-apps/billing/stripe-billing-credits.md` に反映し、更新日と責任者を記載する。
- [ ] タスク完了後に `verification-report.md` へ確認内容を記録する。

## テスト計画

- Stripeクレジット付与・Usage報告周辺のユニットテスト／シナリオテストを確認し、必要であれば追加タスクとして記載する。
- ドキュメントで案内する `mise run` 系コマンドや確認手順を実環境で追従し、再現性を担保する。

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 実装とドキュメントの齟齬 | 高 | コードリーディングと担当者レビューで二重確認 |
| Stripe機能アップデートの取りこぼし | 中 | 公式ドキュメント更新履歴を確認し、差分をタスクに追加 |
| 通貨・単位変換の誤記 | 高 | NanoDollar仕様とStripeダッシュボード設定を相互確認 |

## スケジュール

- **開始日**: 2025年10月11日
- **一次ドラフト**: 2025年10月14日
- **レビュー反映**: 2025年10月16日
- **最終更新公開**: 2025年10月18日

## 完了条件

- [ ] ドキュメントが最新実装と整合し、完了／未完了項目が正しく更新されている。
- [ ] Stripeセットアップ手順と運用フローが明確に記載され、参照リンクが有効である。
- [ ] 運用・監査観点のチェックリストが追加されている。
- [ ] `verification-report.md` に確認内容が記録されている。

## 実装メモ

- 既存ドキュメントのコードサンプルは `stripe-rust` 0.23系想定の可能性があるため、最新版との差分を確認する。
- PaymentAppインターフェースの更新有無を確認し、正しいメソッドシグネチャを引用する。
- CustomerBalanceFundsAdded等の未対応Stripeイベントがある場合、対応方針を整理して記載する。

## 参考資料

- Stripe公式 Billing Credits ドキュメント
- `docs/src/architecture/nanodollar-system.md`
- 過去のBilling/Payment関連タスクドキュメント
