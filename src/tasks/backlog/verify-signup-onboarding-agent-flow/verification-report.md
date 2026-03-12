---
title: "Signup to Agent Flow Verification Report"
type: "verification"
emoji: "✅"
topics: ["testing", "playwright", "tachyon"]
published: false
targetFiles: []
github: ""
---

## Verification Report

- 実行日: 2025-10-13
- 担当者: Codex (AI)

### 概要
- Playwright MCP を用いてサインアップ → メール認証 → ワークスペース設定 → エージェントチャットまでの UI フローを検証。新規オペレーター `tn_01k7ex8m9yn0svagrf7b7y9rza` がプロビジョニングされ、エージェント API 呼び出しは課金未設定のため `PAYMENT_REQUIRED` エラーで終了することを確認。
- GraphQL シナリオテスト `signup_onboarding_agent_flow.yaml` を追加し、`mise run tachyon-api-scenario-test` で単体実行。SelfServiceOrder → delivery → Agent API 呼び出し → オペレーター削除までが正常に完了することを確認。
- 2025-10-14 に改めて新規テナントで支払い方法登録と $10 チャージを実施したところ、バックエンドには $20 分のトランザクションが記録された一方で Billing 画面の USD 残高表示は $0.00 のままで、バグが再現することを確認。

### 詳細結果
- UI フロー
  - メールアドレス: `tachyon.test.20251013224317@mailinator.com`
  - Mailinator から確認コード `611111` を取得し `/signup/verify-email` で認証完了。
  - `/signup/workspace-setup` にて `mailinator-test-202510132243` ワークスペースを作成し、`/v1beta/tn_01k7ex8m9yn0svagrf7b7y9rza` へリダイレクトされることを確認。
  - エージェントチャットでメッセージ送信 → `PaymentRequired: Payment method not configured` エラーが返る（新規オペレーターは支払い未設定のため想定どおり）。
- シナリオテスト
  - `apps/tachyon-api/tests/scenarios/signup_onboarding_agent_flow.yaml` を追加。
  - `mise run tachyon-api-scenario-test`（`runtime.yaml` 一時設定で対象シナリオに限定）を実行し、全ステップが成功（SSE レスポンスは `event: done`）。
  - テスト内で生成されたオペレーターは `deleteOperator` により削除済み。
- 2025-10-14 USD 残高検証
  - メールアドレス: `tachyonqa20251014123725@mailinator.com`
  - テナント: `tn_01k7gcw40dzybmfsgee8kdsfme`
  - Playwright MCP で Visa テストカード（4242系）を登録後、$10.00 を 2 回チャージ。
  - Billing 画面ではチャージ直後も「利用可能残高 $0.00 / 総残高 $0.00」のまま変化せず、取引履歴も空。
  - `mysql` で `tachyon_apps_payment.credit_transactions` を確認すると `amount=10_000_000_000` / `balance_after=20_000_000_000`（nanodollars）が保存されているため、バックエンドでは 20 ドル相当の残高が記録済み。
  - 課金後のスクリーンショット: `screenshots/billing-balance-after-topup.png`
  - Stripe 上の Customer balance が UI に反映されない、もしくは `creditBalance` 取得ロジックの換算処理に不整合が残っている可能性が高い。

### スクリーンショット
- `screenshots/agent-chat.png` – 新規オペレーターでのエージェントチャット実行結果（PAYMENT_REQUIRED 表示）
- `screenshots/billing-balance-after-topup.png` – $10×2 回チャージ後も USD 残高が $0.00 のままの Billing 画面

### 備考
- エージェント実行で課金が必要なため、実運用では請求情報の事前設定が必須。
- Playwright 実行後のブラウザタブを閉じ、Mailinator で取得したメールは残置（必要に応じて再利用可能）。
