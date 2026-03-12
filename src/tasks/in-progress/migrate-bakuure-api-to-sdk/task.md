---
title: "bakuure-api を Tachyon SDK 経由の薄い API ゲートウェイに変更"
type: refactor
emoji: "🔄"
topics: ["bakuure-api", "sdk", "api-gateway", "dependency-reduction"]
published: true
targetFiles:
  - apps/bakuure-api/
  - sdk/rust/
github: ""
---

# bakuure-api を Tachyon SDK 経由の薄い API ゲートウェイに変更

## 概要

bakuure-api (~28パッケージ依存) が tachyon-api と同じドメインパッケージ（order, crm, payment, delivery, catalog 等）を直接コンパイルしており、コンパイル時間が長くサービス境界が曖昧。これを Tachyon SDK (REST クライアント) 経由の薄い API ゲートウェイに変更する。

## 背景・目的

- **現状**: bakuure-api は `order`, `crm`, `delivery`, `payment`, `catalog` 等のドメインパッケージを直接 `use` して GraphQL リゾルバーを提供
- **問題**: コンパイル時間が長い、サービス境界が曖昧、tachyon-api と二重にドメインロジックを持つ
- **目標**: bakuure-api を REST SDK 経由で tachyon-api を呼び出す薄い Gateway に変更
- **効果**: コンパイル時間短縮、サービス境界の明確化、tachyon-api への集約

## 前提条件

- ✅ tachyon-api に REST エンドポイント追加済み（Phase 1-2）
- ✅ OpenAPI spec エクスポート済み（Phase 3）
- ✅ tachyon-sdk リポジトリにRust SDK生成済み（Phase 4）
  - リポジトリ: https://github.com/quantum-box/tachyon-sdk
  - サブモジュール: `sdk/`

## 詳細仕様

### Cargo.toml 変更

```toml
# 削除対象（SDK 経由に切り替え）
# order, crm, delivery, payment, procurement, catalog
# hubspot, square, stripe_provider, payment_provider, crm_provider
# source_explore, notification

# 追加
tachyon-sdk = { path = "../../sdk/rust" }
# 本番/CI では git 依存に切り替え:
# tachyon-sdk = { git = "https://github.com/quantum-box/tachyon-sdk", branch = "main" }

# 維持（ヘッダー抽出・型のみ）
auth, errors, tachyon_apps, telemetry, value_object, persistence
```

### Apps 構造体の簡素化

```rust
// Before
pub struct Apps {
    order_app: Arc<order::App>,
    crm_app: Arc<crm::App>,
    delivery_app: Arc<delivery::App>,
    payment_app: Arc<dyn PaymentApp>,
    catalog_app: Arc<catalog::App>,
    // ... 多数の依存
}

// After
pub struct Apps {
    sdk: Arc<tachyon_sdk::Client>,
    auth: Arc<auth::App>,  // ヘッダー抽出用に維持
}
```

### GraphQL リゾルバーの変換パターン

```rust
// Before: ドメインパッケージを直接呼び出し
let product = apps.order().create_product().execute(input).await?;

// After: REST SDK 経由
let product = apps.sdk.order_api().create_product(input.into()).await?;
```

### SDK クライアント設定

```rust
let config = tachyon_sdk::Configuration {
    base_path: "http://tachyon-api:50054".to_string(),
    // Docker 内通信のためローカル接続
    ..Default::default()
};
let sdk_client = Arc::new(tachyon_sdk::Client::new(config));
```

## Phase A 調査結果

### bakuure-api のドメインパッケージ依存（全17パッケージ）

| パッケージ | 用途 | SDK移行対象 |
|-----------|------|------------|
| `order` | 商品・見積・注文・顧客管理 | ✅ 移行対象 |
| `crm` | HubSpot CRM連携、Deal Automation | ✅ 移行対象 |
| `payment` | Stripe課金・決済・クレジット | ✅ 移行対象 |
| `delivery` | ソフトウェア配信・配送先管理 | ✅ 移行対象 |
| `procurement` | 調達価格・サプライチェーン | ✅ 移行対象 |
| `catalog` | API サービス・価格マッピング | ✅ 移行対象 |
| `source_explore` | ファイル管理・S3/Minio | ✅ 移行対象 |
| `notification` | 通知（auth::App引数として必要） | ✅ 移行対象 |
| `hubspot` | HubSpot クライアント | ✅ 移行対象（CRM移行で不要に） |
| `square` | Square OAuth | ✅ 移行対象 |
| `stripe_provider` | Stripe プロバイダー | ✅ 移行対象（Payment移行で不要に） |
| `payment_provider` | 決済プロバイダー抽象 | ✅ 移行対象 |
| `crm_provider` | CRM プロバイダー抽象 | ✅ 移行対象 |
| `auth` | 認証・ポリシーチェック | 🔒 維持（ヘッダー抽出・認証用） |
| `persistence` | DB接続 | 🔒 維持（Auth用） |
| `errors` / `telemetry` / `value_object` / `tachyon_apps` | 基盤 | 🔒 維持 |
| `iac` | IaCマニフェスト | 🔒 維持（Auth App初期化用） |
| `database-manager` | DB管理 | 検討（auth経由で必要か確認） |

### Usecase ↔ SDK エンドポイント マッピング

#### ✅ SDK にエンドポイントあり（即時移行可能）

| bakuure-api Usecase | SDK エンドポイント |
|----|-----|
| `order::GetProductById` | `GET /v1/order/products/{id}` |
| `order::FindAllProducts` | `GET /v1/order/products` |
| `order::CreateProduct` | `POST /v1/order/products` |
| `order::UpdateProduct` | `PUT /v1/order/products/{id}` |
| `order::DeleteProduct` | `DELETE /v1/order/products/{id}` |
| `order::CreateQuote` | `POST /v1/order/quotes` |
| `order::GetQuoteById` | `GET /v1/order/quotes/{id}` |
| `order::FindAllQuotes` | `GET /v1/order/quotes` |
| `order::IssueQuote` | `POST /v1/order/quotes/{id}/issue` |
| `order::CreateClient` | `POST /v1/order/clients` |
| `order::GetClientById` | `GET /v1/order/clients/{id}` |
| `order::FindAllClients` | `GET /v1/order/clients` |
| `order::SelfServiceOrder` | `POST /v1/order/checkout` |
| `order::RegisterShippingDestination` | `POST /v1/order/shipping-destinations` |
| `crm::CreateObjectMapping` | `POST /v1/crm/object-mappings` |
| `crm::GetObjectMapping` | `GET /v1/crm/object-mappings` |
| `delivery::CreateShippingDestination` | `POST /v1/delivery/shipping-destinations` |
| `delivery::CheckPhysicalShippingAvailability` | `GET /v1/delivery/shipping-destinations/{id}/availability` |
| `delivery::GetSoftwareDeliveryByOrderId` | `GET /v1/delivery/software/by-order/{order_id}` |

#### ❌ SDK にエンドポイント不足（tachyon-api への追加が必要）

| bakuure-api Usecase | 必要なエンドポイント | 優先度 |
|----|-----|------|
| `order::AcceptOrder` | `POST /v1/order/orders/{id}/accept` | 中 |
| `order::CompleteOrder` | `POST /v1/order/orders/{id}/complete` | 中 |
| `order::CalculateRecurringRevenue` | `GET /v1/order/revenue/recurring` | 低 |
| `order::ProductVariantRepository` | `GET /v1/order/products/{id}/variants` | 中 |
| `crm::DealAutomation` CRUD | `POST/PUT/DELETE /v1/crm/deal-automations` | 高 |
| `crm::WebhookHandler` | webhook 受信（bakuure-api独自、SDK不要） | - |
| `payment::FindAllProvidersByEntityId` | `GET /v1/payment/providers` | 高 |
| `payment::CreateCheckoutSession` | `POST /v1/payment/checkout-sessions` | 高 |
| `payment::CreditBalance` | `GET /v1/payment/credits/balance` | 高 |
| `payment::CreditTransactions` | `GET /v1/payment/credits/transactions` | 中 |
| `payment::GrantCredits` | `POST /v1/payment/credits/grant` | 中 |
| `payment::CreateBillingInformation` | `POST /v1/payment/billing-information` | 中 |
| `payment::CreateSetupIntent` | `POST /v1/payment/setup-intents` | 中 |
| `delivery::DeliverSoftware` | `POST /v1/delivery/software/deliver` | 低 |
| `source_explore::AddFile` | `POST /v1/files` | 中 |
| `source_explore::GetFile` | `GET /v1/files/{id}` | 中 |
| `procurement::ListProcurementPrices` | `GET /v1/procurement/prices` | 中 |
| `procurement::UpsertVariantProcurementLink` | `POST /v1/procurement/variant-links` | 中 |
| `procurement::DeleteVariantProcurementLink` | `DELETE /v1/procurement/variant-links/{id}` | 中 |
| `catalog::ApiServices` | `GET /v1/catalog/services` | 低 |

### ギャップ分析サマリー

- **即時移行可能**: 19 usecase（Order大半 + CRM ObjectMapping + Delivery）
- **エンドポイント追加必要**: ~20 usecase（Payment全般、Procurement全般、SourceExplore、CRM DealAutomation）
- **SDK移行不要**: HubSpot Webhook受信（bakuure-api独自機能）

### 推奨アプローチ

1. **Phase B-1**: SDK に既にあるエンドポイントのみで Order + Delivery リゾルバーを移行（低リスク）
2. **Phase B-2**: Payment / CRM DealAutomation / Procurement / SourceExplore の REST エンドポイントを tachyon-api に追加
3. **Phase B-3**: 残りのリゾルバーを移行
4. **Phase D**: 不要パッケージ依存を一括削除

## タスク分解

### Phase A: 準備・調査
- [x] bakuure-api の全ドメインパッケージ依存を洗い出し ✅
- [x] 各リゾルバーが呼び出す usecase と対応 REST エンドポイントのマッピング表作成 ✅
- [x] SDK にまだ足りないエンドポイントの特定 ✅（~20 usecase 分が不足）
- [ ] tachyon-api 側に不足エンドポイントを追加（必要に応じて）→ Phase B-2 で対応

### Phase B: SDK クライアント統合 ✅
- [x] `tachyon-sdk` を Cargo.toml に追加（path 依存）
- [x] `SdkBasePath` ラッパー型を `lib.rs` に定義
- [x] `sdk_client.rs` に SDK Configuration ビルダー（認証ヘッダー転送）を実装
- [x] 共通エラー変換（SDK エラー → GraphQL エラー）を `sdk_error_to_graphql` として実装
- [x] SDK から reqwest を `pub extern crate` で再エクスポート（バージョン不一致対策）
- [x] compose.yml に `./sdk:/app/sdk:cached` ボリュームマウント追加
- [x] SDK コード生成バグ修正（`MessageContent`, `OneOfLessThanGreaterThan`）

### Phase C: リゾルバー移行（段階的）
- [x] **Order リゾルバー** ✅ — `SdkOrderQuery`（9クエリ+ComplexObject）, `SdkOrderMutation`（10ミューテーション）
  - GraphQL context から `apps.order()` と `apps.delivery()` を削除済み
  - enum フィールドは String 化（ProductStatus, QuoteStatus 等）
  - 既知の制限: `self_service_order` は簡略版（checkout のみ）、画像アップロード未対応
- [ ] Payment リゾルバーを SDK 呼び出しに切り替え（REST エンドポイント追加が必要）
- [ ] Procurement リゾルバーを SDK 呼び出しに切り替え（一部エンドポイントあり）
- [ ] CRM DealAutomation を SDK 呼び出しに切り替え（REST エンドポイント追加が必要）
- [ ] SourceExplore を SDK 呼び出しに切り替え（REST エンドポイント追加が必要）

### Phase D: 依存削除・クリーンアップ（後続PR）
- [ ] Order リゾルバー移行済みだが `order` 依存は hubspot webhook で使用中 → webhook も SDK 化が必要
- [ ] Payment / Procurement / CRM DealAutomation / SourceExplore の REST エンドポイントを tachyon-api に追加（~20 endpoint）
- [ ] 上記ドメインのリゾルバーも SDK 経由に移行
- [ ] 不要になったドメインパッケージ依存を Cargo.toml から削除
- [ ] DI コード（`apps.rs`）の簡素化
- [ ] Docker Compose の依存関係更新（bakuure-api → tachyon-api の起動順序）
- [ ] ビルド時間の改善を計測

### 実装メモ

#### 認証ヘッダー転送方式
SDK の `Configuration.client` に `reqwest::Client::builder().default_headers(headers)` で
`Authorization`, `x-operator-id`, `x-platform-id`, `x-user-id` を設定。
リクエストごとに新しい Configuration をビルドする方式。

#### reqwest バージョン問題
workspace は `reqwest 0.12`、SDK は `reqwest 0.13` を使用。
SDK の `lib.rs` で `pub extern crate reqwest;` として再エクスポートし、
bakuure-api は `tachyon_sdk::reqwest` を使用してバージョン不一致を回避。

#### GraphQL 型の String 化
Order ドメインの enum（`ProductStatus`, `QuoteStatus`, `BillingCycle` 等）を
すべて String フィールドに変更。値自体は tachyon-api から返される文字列と一致するため
フロントエンドとの互換性は維持。

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| トランザクション境界の喪失 | 高 | 複合操作は tachyon-api 側に統合エンドポイントを用意 |
| ネットワークレイテンシ増加 | 中 | Docker 内通信で最小限、必要に応じバッチ API |
| SDK の型とドメイン型の不一致 | 中 | 変換レイヤーを薄く保つ、From/Into で対応 |
| サービス起動順序依存 | 低 | Docker Compose depends_on + healthcheck |
| 認証ヘッダーの転送 | 低 | SDK クライアントにヘッダー転送機能を追加 |

## 完了条件

- [ ] bakuure-api から order, crm, delivery, payment, catalog の直接依存が削除されている
- [ ] 全 GraphQL リゾルバーが SDK 経由で動作している
- [ ] 既存の bakuure-api テスト/動作確認がパス
- [ ] コンパイル時間が改善されている（計測結果を記録）
- [ ] Docker Compose での起動順序が正しく設定されている

## 参考資料

- tachyon-sdk: https://github.com/quantum-box/tachyon-sdk
- Phase 1-4 taskdoc: `docs/src/tasks/in-progress/tachyon-rest-sdk/task.md`
- bakuure-api 現在の依存: `apps/bakuure-api/Cargo.toml`
- OpenAPI spec: `sdk/openapi.json`（38エンドポイント）
