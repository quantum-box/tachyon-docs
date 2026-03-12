# Stripe使用量ベース課金 taskdoc

## 基本情報
- 着手日: 2025-10-11
- 担当: Codex (assistant)
- 参照タスク: docs/src/tasks/improvement/stripe-usage-based-billing/task.md
- 関連システム: LLMsコンテキスト課金、Stripe使用量報告

## 進行状況
- フェーズ0 調査準備 ✅ (2025-10-11 完了)
  - [x] タスク仕様(task.md)の確認
  - [x] 関連コードのスキャン (`billing_aware.rs`, `report_usage_to_stripe.rs`, `execute_agent.rs`, `payment/sdk.rs`)
  - [x] 既存実装のギャップ整理（Stripe Usage Record数量が二重換算になっている可能性を特定）
- フェーズ1 方針策定 ✅
  - [x] Stripe課金フローの現状整理
  - [x] レポート単位/変換仕様の再確認
  - [x] 実装差分のドラフト化
- フェーズ2 実装 ✅
  - [x] BillingAwareCommandStack調整
  - [x] Payment層/Usecase更新
  - [x] DI/設定反映
- フェーズ3 テスト & 動作確認 ✅
  - [x] 単体テスト追加/更新
  - [x] mise run check/ci-node
  - [x] Stripeダッシュボードでの確認手順整理（本番テナントで検証）
- フェーズ4 ドキュメント/共有 ✅
  - [x] task.md/taskdoc更新
  - [x] verification-report.md 更新

## 2025-10-19
- ✅ Stripe Usage Record の換算を修正し、`mise run check` / `mise run ci-node` / Stripeダッシュボード確認まで完了。検証結果を taskdoc・verification-report に反映。

## 現状理解メモ
- 課金Decorator `BillingAwareCommandStack` でUsageチャンク受信時に `consume_credits` と Stripe報告を非同期実行している。
- `ReportUsageToStripeInput.quantity` は nanodollar を 10 で割った値を渡しているが、従来は Usecase 側でさらに10倍してStripeへ送信しており、Stripe Usage Record が想定より10倍過剰報告される恐れがあった（本タスクで補正済み）。
- Payment SDKで `multi_tenancy` から operator id をtenantに変換し Stripeレポートユースケースへ委譲。
- `task.md` ではフェーズ3の Stripeダッシュボード確認が未完了として残っていたが、本タスクで完了し更新済み。
- 環境変数の列挙はタスク管理上不要との指示を受け、`task.md` から削除済み（再確認済み）。

## 初期課題・疑問
1. Stripeへ送信する`quantity`の単位が期待通りか（特に二重換算の問題）。
2. 使用量報告失敗時のリトライ戦略が存在しない点をどう扱うか。
3. バッチ報告 or 即時報告切替の既存設定有無。

## 直近TODO
- [x] Stripe Usage Recordの数量換算仕様をStripe最新ドキュメントと照合。
- [x] 二重換算解消案を `BillingAwareCommandStack` / `ReportUsageToStripe` のどちらで補正するか検討しtaskdocに追記。
- [x] `task.md` の環境変数セクションを削除し、更新内容を反映。
- [x] 次ステップの実装計画を作成しユーザーへ共有。

## その他メモ
- ドキュメントは日本語で記載、コードコメントは英語で追加すること。
- タスク進行中は当ファイルを逐次更新する。
