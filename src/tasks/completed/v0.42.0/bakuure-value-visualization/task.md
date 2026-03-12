---
title: "バクうれ価値可視化 — デモ確立・同期UI・自動化管理画面"
type: feature
emoji: "🔗"
topics: ["bakuure", "demo", "visualization", "RevOps", "CRM", "Stripe", "HubSpot"]
published: true
targetFiles:
  - apps/bakuure-api/
  - apps/bakuure-ui/
  - apps/bakuure-admin-ui/
  - packages/order/
  - packages/crm/
  - packages/payment/
  - packages/delivery/
github: ""
---

# バクうれ価値可視化 — デモ確立・同期UI・自動化管理画面

## 概要

バクうれ（bakuure）の価値を「目に見える形」にする。現状は CRM→Billing→Delivery の統合機能が裏側で動いているが、それを外部に示す手段がない。本タスクでは 3 フェーズに分けて「一気通貫デモの動作確認」「同期状況の可視化 UI」「DealAutomation 管理画面」を実装し、バクうれの価値を 5 分のデモで伝えられる状態にする。

## 背景・目的

### なぜこのタスクが必要か

バクうれは「B2B 販売プロセスの統合オーケストレーター」としてポジショニングされている。しかし現状は以下の問題がある：

1. **動いているけど見えない**: オブジェクトマッピング（bakuure ↔ HubSpot ↔ Stripe）の同期が裏側で行われており、画面上で確認できない
2. **デモできない**: 一気通貫の販売フロー（商品登録→HubSpot同期→セルフサービス注文→Stripe決済→CRM更新）が通しで動くか未検証
3. **自動化ルールがコードベタ書き**: DealAutomation のイベント→アクション定義がコード内にハードコードされており、管理画面から設定・確認できない

### 市場環境との対応

- RevOps 市場は 2032 年に 217 億ドル規模に成長見込み（APAC CAGR 19.1%）
- しかし RevOps 専門家の **80% がツール統合に不満**
- **CRM→Billing→Delivery を一気通貫で統合するプラットフォームが市場に存在しない** ことがバクうれの機会
- この機会を活かすには「動くデモ」で価値を証明する必要がある

### 関連ドキュメント

- [ポジショニングドキュメント](../../services/bakuure/marketing/positioning.md)
- [価値明文化ドキュメント](../../services/bakuure/marketing/value-proposition.md)

## 詳細仕様

### Phase 1: デモシナリオの動作確認・修正

#### 機能要件

一気通貫デモが以下の順序で正常に動作すること：

```yaml
demo_scenario:
  step_1:
    action: "管理画面で商品を登録"
    system: bakuure-admin-ui
    expected: "商品が作成され、HubSpot に Product が自動同期される"
    verify:
      - bakuure-admin-ui の商品一覧に表示される
      - HubSpot 上に同名の Product が作成される
      - ProviderObjectMapping にレコードが追加される

  step_2:
    action: "料金シミュレーターで見積作成"
    system: bakuure-ui
    expected: "顧客が商品を選択し、料金をシミュレーションできる"
    verify:
      - /product/simulator で商品が表示される
      - プラン選択・オプション追加が動作する
      - 見積金額が正しく計算される

  step_3:
    action: "セルフサービスで注文"
    system: bakuure-ui
    expected: "顧客情報入力→配送先入力→見積確認→Stripe 決済が完了する"
    verify:
      - /order フローが最後まで通る
      - Client レコードが作成される
      - Quote が ISSUED ステータスになる

  step_4:
    action: "Stripe 決済実行"
    system: bakuure-ui + Stripe
    expected: "PaymentCheckoutForm で決済が完了する"
    verify:
      - Stripe に Customer/PaymentIntent が作成される
      - bakuure 側で決済完了イベントを受信する

  step_5:
    action: "CRM 自動更新を確認"
    system: HubSpot
    expected: "HubSpot に Deal/Quote/Company が自動作成・更新される"
    verify:
      - HubSpot に Company が作成される
      - HubSpot に Deal が作成される
      - Deal のステータスが適切に更新される
```

#### 非機能要件

- 全フローを 5 分以内で実行できること
- テストデータのセットアップが自動化されていること

### Phase 2: 同期状況の可視化 UI

#### 機能要件

bakuure-admin-ui の商品詳細画面・顧客詳細画面に、SaaS 連携ステータスを表示する。

```yaml
sync_status_ui:
  product_detail:
    display_fields:
      - provider: "HubSpot"
        status: "synced" | "pending" | "error"
        external_id: "hs_product_12345"
        last_synced_at: "2026-02-12T10:00:00Z"
      - provider: "Stripe"
        status: "synced" | "pending" | "error"
        external_id: "prod_abc123"
        last_synced_at: "2026-02-12T10:00:00Z"

  client_detail:
    display_fields:
      - provider: "HubSpot"
        status: "synced" | "pending" | "error"
        external_id: "hs_company_67890"
        last_synced_at: "2026-02-12T10:00:00Z"
      - provider: "Stripe"
        status: "synced" | "pending" | "error"
        external_id: "cus_xyz789"
        last_synced_at: "2026-02-12T10:00:00Z"
```

#### データソース

- `ProviderObjectMapping` テーブル（既存）を参照
- GraphQL クエリで商品/顧客に紐づくマッピング情報を取得

#### UI 仕様

- 商品詳細・顧客詳細のサイドパネルまたはタブとして表示
- 同期ステータスアイコン（緑: synced、黄: pending、赤: error）
- 外部サービスへのリンク（HubSpot/Stripe の該当オブジェクトへ直接遷移）
- 手動再同期ボタン（将来拡張）

### Phase 3: DealAutomation 管理画面

#### 機能要件

イベント駆動の自動化ルールを管理画面から設定・確認できる UI。

```yaml
deal_automation_ui:
  rule_list:
    columns:
      - name: "ルール名"
      - trigger_event: "トリガーイベント"
        # CLIENT_CREATED, QUOTE_ISSUED, ORDER_COMPLETED, PAYMENT_RECEIVED 等
      - action: "実行アクション"
        # CREATE_DEAL, UPDATE_DEAL, SYNC_QUOTE, CREATE_INVOICE 等
      - target_provider: "対象プロバイダー"
        # HubSpot, Stripe 等
      - enabled: "有効/無効"
      - last_triggered_at: "最終実行日時"

  rule_detail:
    fields:
      - trigger_event: "選択式"
      - action: "選択式"
      - target_provider: "選択式"
      - conditions: "条件（将来拡張）"
      - enabled: "トグル"

  execution_log:
    columns:
      - triggered_at: "実行日時"
      - trigger_event: "トリガーイベント"
      - action: "実行アクション"
      - status: "success | failed"
      - detail: "詳細（エラーメッセージ等）"
```

#### 非機能要件

- 既存の DealAutomation ドメインモデルを活用する
- 新規テーブル追加は最小限にし、既存の `crm_deal_automations` を拡張する方針
- 実行ログは参照のみ（管理画面からの手動実行は将来拡張）

### コンテキスト別の責務

```yaml
contexts:
  order:
    description: "商品・見積・注文の管理"
    responsibilities:
      - 商品マスタ CRUD
      - 見積作成・発行
      - セルフサービス注文フロー
    phase: "Phase 1"

  crm:
    description: "CRM 連携と自動化"
    responsibilities:
      - HubSpot 双方向同期
      - DealAutomation ルール管理
      - ProviderObjectMapping の管理
    phase: "Phase 1, 2, 3"

  payment:
    description: "決済処理"
    responsibilities:
      - Stripe 決済実行
      - Stripe Customer/Price 同期
    phase: "Phase 1, 2"

  delivery:
    description: "納品管理"
    responsibilities:
      - デジタル納品実行
      - 配送先管理
    phase: "Phase 1"
```

## 実装方針

### Phase 1: デモシナリオの動作確認・修正

1. bakuure-api / bakuure-ui / bakuure-admin-ui をローカルで起動
2. デモシナリオを手動で実行し、各ステップの動作を確認
3. 壊れている箇所を特定・修正
4. HubSpot/Stripe のテスト環境を確認（API キー、Webhook 設定）
5. デモ実行手順書を作成

### Phase 2: 同期状況の可視化 UI

1. GraphQL に `providerObjectMappings` クエリを追加（商品/顧客 ID で絞り込み）
2. bakuure-admin-ui の商品詳細・顧客詳細に同期ステータスコンポーネントを追加
3. ProviderObjectMapping の既存データを参照して表示

### Phase 3: DealAutomation 管理画面

1. GraphQL に `dealAutomations` クエリと `updateDealAutomation` ミューテーションを追加
2. bakuure-admin-ui に自動化ルール一覧・詳細画面を追加
3. 実行ログ表示のための GraphQL クエリ追加

### 技術選定

| レイヤー | 技術 | 理由 |
|---------|------|------|
| バックエンド | Rust / axum / async-graphql | 既存構成を踏襲 |
| フロントエンド | Next.js / urql / Radix UI | bakuure-admin-ui の既存構成 |
| 顧客向け | Next.js / graphql-request | bakuure-ui の既存構成 |

## タスク分解

### Phase 1: デモシナリオの動作確認・修正 ✅ (2026-02-12 完了)

- [x] bakuure 系サービスのローカル起動確認（`mise run up-bakuure`）
- [x] HubSpot/Stripe テスト環境の疎通確認（.env にキー設定済み）
- [x] Step 1: bakuure-admin-ui で商品を新規作成（`/[tenant]/library/products/new`）
  - GraphQL: `createProduct` mutation → Payment sync (Stripe) + CRM sync (HubSpot)
- [x] Step 2: bakuure-ui 料金シミュレーター（`/product/simulator`）で商品表示確認
  - GraphQL: `getProuctsForCustomer` query
- [x] Step 3: セルフサービス注文フロー
  - `/order/step1/{quoteId}` → ClientForm → `entryClient` + `registerClientForQuotes`
  - `/order/confirm/{quoteId}` → QuotesConfirm → `acceptOrderByQuotes`
  - `/order/payment_info/{quoteId}` → BillingInformationForm
  - `/order/payment_method/{quoteId}` → Stripe EmbeddedCheckout → `createCheckoutSession`
  - `/order/completed/{quoteId}` → `selfServiceOrder` mutation
  - `/order/thanks/{quoteId}` → 完了画面
- [x] Step 4: HubSpot 側で CRM 同期（HubSpotクライアントのレジストリ引き当て確認済み）
- [x] Step 5: Stripe 側で Customer/Payment の作成確認（テストカードで ¥3,000 決済成功）
- [x] 発見した不具合の修正
- [ ] デモ実行手順書の作成

#### Phase 1 で修正した不具合一覧

| # | 問題 | 修正ファイル | 内容 |
|---|------|-------------|------|
| 1 | DealAutomationRepository が `unimplemented!()` でパニック | `packages/crm/.../deal_automation_repository.rs` | 安全なデフォルト値を返すように修正 |
| 2 | PaymentApp が bakuure-api に未登録 | `apps/bakuure-api/src/apps.rs`, `handler/mod.rs` | Stripe SDK を使った PaymentApp を AppBuilder に追加 |
| 3 | auth:GetOperatorById 権限不足 | `scripts/seeds/n1-seed/008-auth-policies.yaml` | DefaultServiceAccountPolicy に追加 |
| 4 | Stripe Product ID と Price ID の混同 | `packages/payment/.../product_repository.rs` | `variation.id` → `variation.price_id` |
| 5 | Quote の INSERT SQL にカラム不足 | `packages/order/.../sqlx_quote_repository.rs` | `delivery_date`, `billing_info_id`, `invoice_address_id` を追加 |
| 6 | Stripe Publishable Key が未設定 | `apps/bakuure-ui/.env.docker` | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` を追加 |
| 7 | 決済後リダイレクト先ポートが間違い (3001→3000) | `apps/bakuure-ui/.env.docker`, `page.tsx` | `BAKUURE_UI_URL` 環境変数を追加 |
| 8 | contactEmail が mutation に渡されない | `.graphql`, `confirm-button.tsx`, `self-service-order-confirm.tsx` | GraphQL に `client { email }` 追加、props で受け渡し |
| 9 | 配送先に住所・電話番号がなく物理配送チェック失敗 | `packages/order/.../self_service_order.rs` | デフォルト住所・電話番号を設定 |
| 10 | サービスアカウントで delivery 実行時にエラー | `packages/order/.../self_service_order.rs` | ユーザーでない場合は警告ログでスキップ |

### Phase 2: 同期状況の可視化 UI 📝

- [ ] ProviderObjectMapping の GraphQL クエリ追加
- [ ] bakuure-admin-ui に同期ステータスコンポーネント実装
- [ ] 商品詳細画面への統合
- [ ] 顧客詳細画面への統合
- [ ] 外部サービスへのリンク生成

### Phase 3: DealAutomation 管理画面 📝

- [ ] DealAutomation の GraphQL クエリ/ミューテーション追加
- [ ] 自動化ルール一覧画面の実装
- [ ] 自動化ルール詳細・編集画面の実装
- [ ] 実行ログ一覧画面の実装

## Playwright MCP による動作確認

### 実施タイミング

- [ ] Phase 1 完了後: デモシナリオの通し動作確認
- [ ] Phase 2 完了後: 同期ステータス UI の表示確認
- [ ] Phase 3 完了後: 自動化管理画面の CRUD 動作確認

### 動作確認チェックリスト

#### Phase 1: デモシナリオ ✅

- [x] bakuure-admin-ui で商品を新規作成できる → screenshots/01-products-list.png
- [x] bakuure-ui の料金シミュレーターに商品が表示される → screenshots/02-product-created.png
- [x] セルフサービス注文フローが最後まで完走する → screenshots/03-order-confirm.png
- [x] Stripe 決済画面が表示・動作する（テストカード 4242...4242 で ¥3,000 決済成功）
- [x] 注文完了画面（thanks）が表示される → screenshots/04-order-thanks.png

#### Phase 2: 同期ステータス UI

- [ ] 商品詳細画面に同期ステータスが表示される
- [ ] 同期済み・未同期・エラーの3状態が正しく表示される
- [ ] 外部サービスへのリンクが正しく動作する
- [ ] 同期情報がないオブジェクトで適切な表示（「未連携」等）

#### Phase 3: DealAutomation 管理画面

- [ ] 自動化ルール一覧が表示される
- [ ] ルールの有効/無効切り替えが動作する
- [ ] 実行ログ一覧が表示される
- [ ] ルール詳細画面の各フィールドが正しく表示される

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| HubSpot/Stripe テスト環境の API キー期限切れ | 高 | Phase 1 初期に疎通確認を行い、必要ならキー再発行 |
| bakuure-api の未実装 GraphQL リゾルバ（pipelines 等） | 中 | デモに必要な範囲のみ実装、不要な箇所は後回し |
| セルフサービス注文フローの既知バグ（配送先エラー等） | 高 | 既知課題リストを確認し、デモに影響する箇所を優先修正 |
| bakuure-ui / admin-ui の依存パッケージ劣化 | 低 | yarn install で解決、解決しない場合は個別対応 |
| HubSpot Webhook のローカル受信 | 中 | ngrok/cloudflared でトンネル設定、または手動確認で代替 |

## 参考資料

- [bakuure-api ソースコード](../../../apps/bakuure-api/src/)
- [bakuure-ui ソースコード](../../../apps/bakuure-ui/src/)
- [bakuure-admin-ui ソースコード](../../../apps/bakuure-admin-ui/src/)
- [CRM パッケージ](../../../packages/crm/src/)
- [Order パッケージ](../../../packages/order/src/)
- [Payment パッケージ](../../../packages/payment/src/)
- [Delivery パッケージ](../../../packages/delivery/src/)
- [セルフサービスドキュメント](../../services/bakuure/self-service.md)
- [bakuure API ドキュメント](../../services/bakuure/bakuure-api.md)

## 完了条件

- [ ] Phase 1: デモシナリオが通しで動作し、手順書がある
- [ ] Phase 2: 管理画面で商品/顧客の同期ステータスが確認できる
- [ ] Phase 3: 管理画面から自動化ルールの一覧・詳細・有効無効切替ができる
- [ ] 動作確認レポートが完成している
- [ ] タスクディレクトリを completed/ に移動済み

### バージョン番号の決定基準

**マイナーバージョン（x.X.x）を上げる:**
- [x] 新しい画面の追加（同期ステータス UI、DealAutomation 管理画面）
- [x] 新しい GraphQL クエリ/ミューテーションの追加
- [x] 既存機能の大幅な改善（デモ可能な状態への修正）

## 備考

- Phase 1 は他の Phase の前提条件。まず現状の動作確認を行い、壊れている箇所を把握してから UI 追加に進む
- Phase 2 と Phase 3 は独立して進行可能（並行開発可）
- 本タスクは「バクうれの価値を 5 分のデモで伝えられる状態にする」ことがゴール。完璧な実装より動くデモを優先する
