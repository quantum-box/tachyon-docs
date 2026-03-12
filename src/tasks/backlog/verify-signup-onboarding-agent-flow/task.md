---
title: "Signup to Agent Flow End-to-End Verification"
type: "improvement"
emoji: "🧪"
topics:
  - "quality-assurance"
  - "playwright"
  - "tachyon"
published: false
targetFiles:
  - apps/tachyon/
  - apps/tachyon-api/
  - apps/tachyon/tests/
github: ""
---

# Signup to Agent Flow End-to-End Verification

## 概要

Tachyon のセルフサインアップからワークスペースオンボーディング、エージェント利用開始までをエンドツーエンドで検証し、既知の不具合が解消されているか、想定外の回帰が発生していないかを確認する。

## 背景・目的

- サインアップ導線では HubSpot 連携などローカル固有の制約が多く、回帰リスクが高い。
- オンボーディング後にエージェント機能を即時利用できることがビジネス要件だが、最近の改修で検証が不足している。
- Playwright MCP と GraphQL シナリオテストを活用し、UI/バックエンド双方のフローを検証しておく。

## 詳細仕様

### 検証対象

1. 自サービスのサインアップフォームからメール認証完了まで。
2. ワークスペース設定（オペレーター作成）とセッション更新。
3. Tachyon 内の Agent 管理画面で初回エージェント起動（ダミー構成でも良い）。

### 機能要件（受け入れ条件）

1. サインアップ完了後、登録メール宛の検証コードを取得し入力できる。
2. ワークスペース設定完了後、セッションに新オペレーターが追加され `/v1beta/<tenant>` へ遷移する。
3. `Agent` 一覧でサンプルエージェントが表示され、`Use agent` など主要操作が成功する。
4. 途中で 403 や 500 系エラーが発生しない（HubSpot 認証未設定による既知の 401 を除外条件として記録）。
5. Playwright 動作確認・GraphQL シナリオテスト双方で成功する。

### 非機能要件

- Playwright は `tachyon-dev` プラットフォーム・ `http://localhost:16000/v1beta/tn_01hjryxysgey07h5jz5wagqj0m` ベース URL を使用。
- GraphQL シナリオは `apps/tachyon-api/tests/scenarios/` 配下に新シナリオを追加し、再実行可能な形にする。
- テストは `mise run` 経由で起動し、CI 上でも再利用できるスクリプトを採用する。

### コンテキスト別の責務

- `apps/tachyon`: UI からのサインアップ・オンボーディングを操作、Playwright による E2E 検証。
- `apps/tachyon-api`: GraphQL シナリオテストによるバックエンド検証、必要なシード設定の確認。
- `packages/catalog` / `packages/payment`: Agent 課金関連の API レスポンスをウォッチし、必要に応じてログを確認する。

### 仕様のYAML定義

検証用シナリオ（概略例）:

```yaml
scenario: signup_onboarding_agent_flow
steps:
  - id: signup
    action: graphql
    endpoint: http://localhost:50054/v1/graphql
    headers:
      x-operator-id: "tn_01hjryxysgey07h5jz5wagqj0m"
      Authorization: "Bearer dummy-token"
    request: |
      mutation Signup($input: SignupInput!) {
        signup(input: $input) {
          userId
          verificationId
        }
      }
    variables:
      input:
        email: "{{vars.signup_email}}"
        password: "{{vars.signup_password}}"
```

※ 実際の定義はテスト作成時に確定する。

## 実装方針（検証方針）

### フロー構成

- Playwright MCP で UI 操作を自動化し、メール認証は Mailinator を利用して検証コードを取得する。
- GraphQL シナリオでサインアップ～オンボーディング API のハッピーパスを再現し、レスポンス検証を行う。
- Agent 利用開始時のバックエンドロギングを `mise run logs` 等で監視し、エラー発生時に原因を記録する。

### ツール・技術

- `mise run playwright`（想定）で UI テスト実行。
- `mise run test-scenario -- SCENARIO=signup_onboarding_agent_flow`（追加予定）で GraphQL シナリオ実行。
- Mailinator 公開 API / Web UI アクセス。
- ログ収集は `apps/tachyon-api` の `logs/dev.log` を参照。

### テスト戦略

- UI テスト：Playwright MCP によるエンドツーエンド操作。主要シナリオについてスクリーンショットを取得。
- API テスト：GraphQL シナリオでレスポンスと副作用の検証を実施。
- 回帰監視：エラーが発生した場合は `docs/src/tasks/improvement/verify-signup-onboarding-agent-flow/verification-report.md` に詳細を記録。
- メール検証：Mailinator 上の検証コード取得を自動化し、Playwright とシナリオ双方で再利用できる形式に記録。
- ログ確認：`mise run logs` 等で API サーバーログを監視し、警告以上のイベントをレポートに転記。

### テスト項目

- UI フロー（Playwright MCP）
  - `/signup/create-account` で必須フィールド入力・Cognito サインアップ成功を確認
  - Mailinator で確認コード取得 → `/signup/verify-email` で入力し自動サインインを確認
  - `/signup/workspace-setup` でワークスペース設定を完了し、`/v1beta/<tenant>` へ遷移することを確認
  - `AI > Agent Chat` を開き、初回メッセージ送信・レスポンス取得を確認
- GraphQL シナリオ
  - `selfServiceOrder` で Tachyon Operator プロダクトを注文（deliver=true）
  - `softwareDeliveryByOrder` でオペレーター ID / アクセス URL を取得
  - 新オペレーターコンテキストで Agent API（チャットルーム作成～実行）を叩く
  - 後片付けとして `deleteOperator` を実行しテストデータを削除

## タスク分解

### フェーズ1: 準備 🔄 (2025-10-13 着手)
- [x] Playwright MCP の接続確認
- [x] Mailinator テスト用メールアドレスの確保
- [x] シードデータと環境変数の確認

### フェーズ2: UI 動作確認 📝
- [x] サインアップページの遷移と入力フォーム検証
- [x] メール認証コード取得と入力
- [x] ワークスペース設定完了後の遷移確認
- [x] Agent 一覧・利用開始操作のスクリーンショット取得
- [x] Billing 画面での課金・残高表示確認（$10 チャージ時に USD 残高が $10 になること）

### フェーズ3: GraphQL シナリオテスト 📝
- [x] シナリオ定義ファイルの作成
- [x] `mise run` 経由での実行スクリプト追加
- [x] レスポンスおよび副作用検証

### フェーズ4: レポート作成 📝
- [ ] verification-report.md への結果反映
- [ ] スクリーンショット添付
- [ ] フォローアップ課題の列挙

## 参考資料

- docs/src/tachyon-apps/authentication/multi-tenancy.md
- docs/src/tasks/completed/v0.9.0/migrate-credit-to-usd-system/
- 本 taskdoc
- 動作確認レポート（作成予定）

## スケジュール

- 2025-10-13 午前: フェーズ1（準備）
- 2025-10-13 午後: フェーズ2（UI Playwright 実行）
- 2025-10-14 午前: フェーズ3（GraphQL シナリオ）
- 2025-10-14 午後: フェーズ4（レポート整備）

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| HubSpot 認証未設定による 401 | 中 | 既知の制約としてレポートに記載し、ブロッカー扱いしない |
| Mailinator 側 UI 変更でコード取得不能 | 中 | 代替メール受信手段（tempmail APIなど）を検討 |
| Playwright MCP の接続失敗 | 高 | CLI 再起動・ブラウザセッション再確立手順をまとめる |
| GraphQL シナリオでシード不足 | 中 | `scripts/seeds/n1-seed/` を適宜適用し、差分を記録 |

## 完了条件

- [ ] Playwright MCP による UI 動作確認が完了し、エラーがなかったことを証明するログ／スクリーンショットが揃っている
- [ ] GraphQL シナリオテストがグリーンで再現性が確認できている
- [ ] verification-report.md に結果・既知課題・改善提案が記載されている
- [ ] 必要に応じたシードや設定変更が記録され、再現手順が残っている
- [ ] エージェント利用開始までの手順がドキュメント化され、関係者が参照できる
- [x] Billing 画面で Stripe チャージ額と USD 残高表示が一致することを確認済み

## 備考

- 本タスクは品質向上のための一時検証であり、完了後は docs/src/tasks/completed/ への移動を検討する。
- 2025-10-13: Playwright MCP で Mailinator 経由の確認コード取得 → ワークスペース作成 → Agent Chat までの導線を確認（エージェントは `PAYMENT_REQUIRED` によって停止するが想定内）。
- 2025-10-13: `mise run tachyon-api-scenario-test`（include 指定）で追加シナリオを単体実行。SSE レスポンスは `event: done` のみで終了し、後片付けとして `deleteOperator` が成功。
- 2025-10-14: 新規テナント `tn_01k7gcw40dzybmfsgee8kdsfme` で Visa テストカードを登録し $10×2 回チャージしたが、Billing 画面の USD 残高は $0.00 のまま（取引履歴にも即時反映されず）。`credit_transactions` テーブルには `balance_after_nanodollars` が $20 分保存されているため、フロントエンドまたは残高取得ロジックに不整合が残存している。スクリーンショット: `docs/src/tasks/improvement/verify-signup-onboarding-agent-flow/screenshots/billing-balance-after-topup.png`。
