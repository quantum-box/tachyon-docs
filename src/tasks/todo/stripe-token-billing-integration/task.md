---
title: "Stripe Token Billing統合 — Agent APIのLLMトークン従量課金自動化"
type: "feature"
emoji: "💰"
topics:
  - Stripe
  - Billing
  - Agent API
  - LLM
published: true
targetFiles:
  - "packages/payment/src/usecase/report_usage_to_stripe.rs"
  - "packages/payment/src/app.rs"
  - "packages/providers/stripe/src/lib.rs"
  - "packages/llms/src/agent/mod.rs"
---

# Stripe Token Billing統合

## 概要
Stripeの Token Billing（LLMトークン従量課金）機能をTachyon Agent APIに統合する。現在の自前クレジット管理（NanoDollar + consume_credits）から、Stripeネイティブのトークンベース従量課金に移行し、課金・請求・レポートを自動化する。

## 背景・目的
### 現状の課題
- LLMトークン使用量をNanoDollarに変換し、自前でクレジット残高管理している
- report_usage_to_stripeは非同期でStripeに使用量を送信しているが、課金体系の設定・更新は手動
- モデル価格変更時のメンテナンスコストが高い（pricing_plan.yamlの手動更新）
- テナントごとのマークアップ設定が柔軟でない

### Token Billingで解決できること
- Stripeが各LLMプロバイダー（OpenAI, Anthropic, Gemini）の最新モデル価格を自動同期
- マークアップ率を設定するだけで従量課金が自動構成
- 使用状況の記録・請求・レポートが自動化
- 3つの統合方式: AIゲートウェイ、パートナー連携、SDK

### ゴール
1. Agent API実行時のトークン使用量がStripe Token Billingで自動課金される
2. Operatorごとにマークアップ率を設定可能
3. 既存のNanoDollar課金との共存（段階的移行）
4. Stripeダッシュボードでトークン使用量・売上が可視化される

## 詳細仕様

### 機能要件
1. **Token Billing設定API**: Operator単位でToken Billing有効化・マークアップ率設定
2. **使用量自動記録**: Agent API実行完了時にStripe Token Billing APIへトークン数を送信（モデル・タイプ別）
3. **課金自動化**: Stripeが使用量に基づき請求を自動生成
4. **移行フラグ**: Operator単位で旧方式（NanoDollar）/ 新方式（Token Billing）を切り替え
5. **フォールバック**: Token Billing API障害時は旧方式にフォールバック

### 統合方式の選定
Stripeが提供する3方式のうち、Tachyonの構成に最適なのは:
- **SDK方式（Token Meter SDK）** — Anthropic/OpenAI/Gemini対応、既存のLLMプロバイダー呼び出しに組み込みやすい
- もしくは **AIゲートウェイ方式** — TachyonのAgent APIハンドラーをゲートウェイとして登録

### コンテキスト別の責務
payment:
  - Token Billing設定の管理（有効/無効、マークアップ率）
  - 使用量レポートの送信先切り替え（旧方式 or Token Billing）
  - フォールバックロジック

llms:
  - Agent実行完了時のトークン使用量集計（input/output/cache別）
  - 使用モデル情報の伝達

billing:
  - Operatorごとの課金方式設定
  - Stripeダッシュボードとの連携確認

### 非機能要件
- 使用量送信は非同期（tokio::spawn）で実行失敗してもAgent応答に影響しない（既存パターン踏襲）
- Private Preview中のため、機能フラグで全体ON/OFF可能にする
- 既存テストを壊さない（NoOpPaymentApp互換維持）

## タスク分解

### Phase 1: 調査・設計
- [ ] Stripe Token Billing Private Previewへのアクセス申請
- [ ] Token Meter SDKの評価（Rust互換性、対応プロバイダー確認）
- [ ] 既存report_usage_to_stripeとの統合ポイント特定
- [ ] API設計（設定CRUD + 使用量送信）

### Phase 2: 基盤実装
- [ ] Token Billing設定のドメインモデル追加（payment context）
- [ ] Operator単位の課金方式切り替えフラグ実装
- [ ] Stripe Token Billing API呼び出しユースケース実装
- [ ] 機能フラグ（環境変数 or IaC設定）

### Phase 3: Agent API統合
- [ ] Agent実行完了時のトークン使用量をToken Billing APIに送信
- [ ] モデル・タイプ（input/output/cache）別の使用量分類
- [ ] フォールバック実装（Token Billing失敗時→旧方式）
- [ ] 非同期送信のエラーハンドリング・ログ強化

### Phase 4: 管理画面・テスト
- [ ] Operator設定画面にToken Billing設定追加
- [ ] Stripeダッシュボードでの動作確認
- [ ] シナリオテスト追加
- [ ] 負荷テスト（大量トークン使用時の送信パフォーマンス）

## リスクと対策
| リスク | 影響 | 対策 |
|---|---|---|
| Private Previewのためアクセスできない | 開発着手不可 | 早期申請、代替としてStripe Meter Events APIで同等実装 |
| Token Meter SDKがRust未対応 | SDK方式が使えない | REST API直接呼び出しで代替 |
| 価格自動同期の精度 | 請求額のずれ | NanoDollar計算との照合チェック実装 |
| 旧方式との二重課金 | 顧客への過剰請求 | 排他フラグで確実に片方のみ動作させる |

## 完了条件
- [ ] Agent API実行時にStripe Token Billingでトークン使用量が記録される
- [ ] Operatorごとにマークアップ率を設定できる
- [ ] 旧方式（NanoDollar）との切り替えが可能
- [ ] Stripeダッシュボードで使用量・売上が確認できる
- [ ] シナリオテストが通過
- [ ] taskdocをcompleted/に移動済み

## 備考
- Stripe Token BillingはPrivate Preview（2026-03時点）。正式リリース時にAPI変更の可能性あり
- 参考: https://docs.stripe.com/billing/token-billing
- 既存の類似実装: report_usage_to_stripe.rs、stripe-usage-based-billing taskdoc（v0.17.0）
