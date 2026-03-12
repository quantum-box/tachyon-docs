---
title: "コンシューマー向け物販EC基盤の構築"
type: "feature"
emoji: "🛒"
topics: ["EC", "bakuure-api", "catalog", "order", "payment", "delivery", "cart"]
published: true
targetFiles:
  - apps/bakuure-api/
  - packages/catalog/
  - packages/order/
  - packages/payment/
  - packages/delivery/
  - packages/crm/
github: ""
---

# コンシューマー向け物販EC基盤の構築

## 概要

既存のB2B受発注プラットフォーム（bakuure-api）をベースに、コンシューマー向け物販ECに必要な機能を追加する。現行のQuote→Order→Deliveryフローを活かしつつ、ショッピングカート・在庫管理・消費者向けチェックアウトなど不足している機能を段階的に実装する。

## 背景・目的

- **現状**: bakuure-apiはB2B受発注（Quote/Order/Delivery）のフローが構築済みだが、コンシューマー向けのセルフサービスEC機能（カート、在庫、商品ブラウジング等）が不足している
- **解決したい課題**:
  - 消費者が自分で商品を閲覧→カートに追加→決済→配送まで完結できるフローがない
  - 在庫管理がなく、売り越しリスクがある
  - 商品カテゴリ・検索・フィルタリングがない
  - 消費者向けの注文履歴・配送追跡がない
- **期待される成果**: 物販ECとして最低限運用可能な機能セットを実装し、エンドユーザーが商品を購入できる状態にする

## 現状分析

### 既に利用可能な機能

| 領域 | 既存機能 | 状態 |
|------|---------|------|
| 商品管理 | `Product` / `ProductVariant` / `ProductVariantRepository` | ✅ 基盤あり |
| 受注 | Quote → PurchaseOrder → CompleteOrder フロー | ✅ B2B向けに動作 |
| 決済 | Stripe Checkout / SetupIntent / BillingInformation | ✅ 基盤あり |
| 配送 | ShippingDestination / ShippingOrder / ShippedInfo / 追跡番号 | ✅ 基盤あり |
| 定期便 | Subscription / DeliveryCycle / SubscriptionList | ✅ 基盤あり |
| CRM | Client / Deal / Quote (HubSpot連携) | ✅ B2B向け |
| 認証 | Multi-tenancy / Policy / User管理 | ✅ 動作中 |

### 不足している機能

| 領域 | 不足機能 | 優先度 |
|------|---------|--------|
| カート | ショッピングカート（セッション/ユーザー紐付け） | 🔴 必須 |
| 在庫 | 在庫数管理・引当・アラート | 🔴 必須 |
| 商品ブラウジング | カテゴリ/検索/フィルタリング/ソート | 🔴 必須 |
| 消費者向けチェックアウト | カート→決済の直接フロー（Quote不要） | 🔴 必須 |
| 注文履歴 | 消費者向け注文一覧・詳細・ステータス追跡 | 🟡 重要 |
| 商品画像 | 画像アップロード・管理・CDN配信 | 🟡 重要 |
| 配送料計算 | 地域・重量・サイズベースの配送料 | 🟡 重要 |
| 返品・返金 | 返品申請・返金処理フロー | 🟡 重要 |
| レビュー | 商品レビュー・評価 | 🟢 あると良い |
| クーポン/プロモーション | 割引コード・キャンペーン管理 | 🟢 あると良い |

## 詳細仕様

### フェーズ1: 商品カタログ拡張

現在の `Product` / `ProductVariant` を物販向けに拡張する。

```yaml
product_extensions:
  product:
    new_fields:
      - name: category_id
        type: "VARCHAR(29)"
        description: "商品カテゴリID"
      - name: images
        type: "JSON"
        description: "商品画像URL配列"
      - name: short_description
        type: "VARCHAR(500)"
        description: "商品短文説明"
      - name: is_published
        type: "BOOLEAN"
        description: "公開フラグ"
      - name: weight_grams
        type: "INT"
        description: "重量（グラム）"

  product_category:
    table: product_categories
    fields:
      - id: "VARCHAR(29) PRIMARY KEY"  # cat_ prefix
      - tenant_id: "VARCHAR(29) NOT NULL"
      - name: "VARCHAR(255) NOT NULL"
      - slug: "VARCHAR(255) NOT NULL"
      - parent_id: "VARCHAR(29)"  # 階層構造
      - sort_order: "INT DEFAULT 0"
      - image_url: "TEXT"
    indexes:
      - "UNIQUE(tenant_id, slug)"
      - "INDEX(parent_id)"
```

### フェーズ2: ショッピングカート

```yaml
cart:
  domain:
    cart:
      fields:
        - id: "VARCHAR(29) PRIMARY KEY"  # crt_ prefix
        - tenant_id: "VARCHAR(29) NOT NULL"
        - user_id: "VARCHAR(29)"  # NULL = ゲストカート
        - session_id: "VARCHAR(64)"  # ゲスト識別用
        - status: "ENUM('active', 'merged', 'converted', 'abandoned')"
        - expires_at: "DATETIME"
      behavior:
        - ユーザーログイン時にゲストカートをマージ
        - 一定時間後に自動期限切れ（24h）
        - カート→注文変換時にステータスをconvertedに

    cart_item:
      fields:
        - id: "VARCHAR(29) PRIMARY KEY"
        - cart_id: "VARCHAR(29) NOT NULL"
        - product_variant_id: "VARCHAR(29) NOT NULL"
        - quantity: "INT NOT NULL"
        - unit_price_nanodollar: "BIGINT NOT NULL"
      validation:
        - 在庫数を超える数量は追加不可
        - 同一バリアントは数量を加算

  usecases:
    - AddToCart: カートに商品追加
    - UpdateCartItemQuantity: カート内商品数量変更
    - RemoveFromCart: カートから商品削除
    - GetCart: カート内容取得
    - MergeCart: ゲストカート→ユーザーカートのマージ
    - ConvertCartToOrder: カートから注文を作成
```

### フェーズ3: 在庫管理

```yaml
inventory:
  domain:
    stock:
      table: product_stocks
      fields:
        - id: "VARCHAR(29) PRIMARY KEY"
        - product_variant_id: "VARCHAR(29) NOT NULL UNIQUE"
        - quantity_on_hand: "INT NOT NULL DEFAULT 0"
        - quantity_reserved: "INT NOT NULL DEFAULT 0"
        - low_stock_threshold: "INT DEFAULT 5"
      computed:
        available: "quantity_on_hand - quantity_reserved"
      behavior:
        - カート追加時に在庫チェック（引当はしない）
        - 注文確定時に引当（reserved += quantity）
        - 出荷完了時に引当解除＆在庫減算
        - 注文キャンセル時に引当解除

    stock_movement:
      table: stock_movements
      fields:
        - id: "VARCHAR(29) PRIMARY KEY"
        - product_variant_id: "VARCHAR(29) NOT NULL"
        - movement_type: "ENUM('receive', 'reserve', 'ship', 'cancel', 'adjust')"
        - quantity: "INT NOT NULL"
        - reference_id: "VARCHAR(29)"  # 注文ID等
        - note: "TEXT"
        - created_at: "DATETIME NOT NULL"

  usecases:
    - CheckStock: 在庫確認
    - ReserveStock: 在庫引当（注文確定時）
    - ReleaseReservation: 引当解除（キャンセル時）
    - ShipStock: 出荷による在庫減算
    - ReceiveStock: 入荷による在庫増加
    - AdjustStock: 棚卸し等の手動調整
```

### フェーズ4: 消費者向けチェックアウト

```yaml
checkout:
  flow:
    1_cart_review: "カート内容確認・数量調整"
    2_shipping_info: "配送先入力（既存ShippingDestination活用）"
    3_payment: "Stripe Checkout Session作成→決済"
    4_order_confirm: "注文確定・在庫引当・確認メール"
    5_fulfillment: "出荷→追跡番号通知"

  usecases:
    - CreateConsumerOrder:
        description: "カートから直接注文を作成（Quote不要）"
        steps:
          - カートの検証（在庫チェック、価格最新化）
          - 配送先の検証
          - 配送料計算
          - Stripe Checkout Session作成
          - 仮注文作成（pending状態）
        input:
          - cart_id
          - shipping_destination_id
          - payment_method  # stripe_checkout
        output:
          - order_id
          - checkout_url  # Stripe決済ページURL

    - ConfirmConsumerOrder:
        description: "Stripe Webhook受信後に注文確定"
        trigger: "stripe.checkout.session.completed"
        steps:
          - 注文ステータスをconfirmedに更新
          - 在庫引当実行
          - カートステータスをconvertedに更新
          - 確認メール送信（将来）
```

### フェーズ5: 消費者向けAPI（REST）

```yaml
rest_endpoints:
  # 商品ブラウジング
  - GET /v1/storefront/products:
      description: "商品一覧（公開商品のみ）"
      query_params: [category, search, sort, page, limit]
  - GET /v1/storefront/products/:id:
      description: "商品詳細"
  - GET /v1/storefront/categories:
      description: "カテゴリ一覧（ツリー構造）"

  # カート
  - POST /v1/storefront/cart:
      description: "カート作成"
  - GET /v1/storefront/cart:
      description: "カート取得"
  - POST /v1/storefront/cart/items:
      description: "商品追加"
  - PUT /v1/storefront/cart/items/:item_id:
      description: "数量変更"
  - DELETE /v1/storefront/cart/items/:item_id:
      description: "商品削除"

  # チェックアウト
  - POST /v1/storefront/checkout:
      description: "チェックアウト開始→Stripe URLを返す"
  - POST /v1/storefront/checkout/confirm:
      description: "Stripe Webhook受信→注文確定"

  # 注文
  - GET /v1/storefront/orders:
      description: "注文履歴"
  - GET /v1/storefront/orders/:id:
      description: "注文詳細（配送追跡含む）"

  # 在庫（管理者向け）
  - GET /v1/admin/inventory:
      description: "在庫一覧"
  - POST /v1/admin/inventory/:variant_id/receive:
      description: "入荷登録"
  - POST /v1/admin/inventory/:variant_id/adjust:
      description: "在庫調整"
```

### コンテキスト別の責務

```yaml
contexts:
  catalog:
    description: "商品カタログ管理"
    new_responsibilities:
      - 商品カテゴリ管理
      - 公開/非公開の制御
      - 商品検索・フィルタリング
      - 物販向け商品属性（重量、画像等）

  cart:
    description: "ショッピングカート（新規コンテキスト）"
    location: "packages/cart/"
    responsibilities:
      - カートのライフサイクル管理
      - カートアイテムの追加・変更・削除
      - ゲスト/ユーザーカートのマージ
      - カート→注文変換

  inventory:
    description: "在庫管理（新規コンテキスト）"
    location: "packages/inventory/"
    responsibilities:
      - 在庫数の管理
      - 在庫引当・解除
      - 入出荷記録
      - 低在庫アラート

  order:
    description: "注文管理（既存拡張）"
    new_responsibilities:
      - 消費者向け注文作成（Quote不要パス）
      - 注文ステータス管理の拡充
      - 注文履歴の消費者向けAPI

  payment:
    description: "決済処理（既存拡張）"
    new_responsibilities:
      - カートベースのStripe Checkout
      - Webhook経由の注文確定

  delivery:
    description: "配送管理（既存活用）"
    existing_features_to_reuse:
      - ShippingDestination
      - ShippingOrder / ShippedInfo
      - 追跡番号管理
```

### 非機能要件

- **パフォーマンス**: 商品一覧APIは100ms以内、カート操作は200ms以内
- **同時実行性**: 在庫引当は楽観的ロック + リトライで整合性を担保
- **スケーラビリティ**: カートはTiDB上で水平スケール可能な設計
- **セキュリティ**: ゲストカートはセッションIDで、ユーザーカートは認証で保護

## 実装方針

### アーキテクチャ設計

- Clean Architecture に従い、各コンテキスト（cart, inventory）をpackagesとして分離
- 既存のcatalog/order/payment/deliveryを活用・拡張
- REST APIは `/v1/storefront/` プレフィックスで消費者向けエンドポイントを分離
- 管理者向けは既存の `/v1/` エンドポイントを拡張

### 技術選定

- **バックエンド**: Rust (axum / sqlx) — 既存スタックを踏襲
- **DB**: TiDB (MySQL互換) — 既存インフラ活用
- **決済**: Stripe Checkout — 既存統合を拡張
- **ID生成**: ULID (`def_id!` マクロ)
- **認証**: 既存のMulti-tenancy + Policy系を活用

## タスク分解

### フェーズ1: 商品カタログ拡張 🔄
- [x] `product_categories` テーブル作成（マイグレーション）
- [x] `products` テーブルにEC向けカラム追加（category_id, weight_grams）
- [x] ProductCategory ドメインエンティティ実装
- [x] Product構造体にcategory_id, weight_grams追加
- [x] ProductCategoryRepository (SqlxProductCategoryRepository) 実装
- [x] find_storefront_products リポジトリメソッド実装（ACTIVE + PUBLIC フィルタ）
- [x] CatalogAppService にストアフロント用メソッド追加
- [x] REST API: `GET /v1/storefront/:tenant_id/products` 実装
- [x] REST API: `GET /v1/storefront/:tenant_id/products/:product_id` 実装
- [x] REST API: `GET /v1/storefront/:tenant_id/categories` 実装
- [x] SQLxキャッシュ更新・コンパイル確認（library-api除く全パッケージOK）
- [ ] カテゴリCRUD Usecase実装（管理者向け: 作成・更新・削除）
- [ ] シナリオテスト作成

### フェーズ2: ショッピングカート ✅
- [x] `carts`, `cart_items` テーブル作成
- [x] Cart / CartItem ドメインエンティティ実装（CartId "crt_", CartItemId "ci_"）
- [x] CartRepository (SqlxCartRepository) 実装
- [x] CatalogAppService にカート操作メソッド追加
- [x] REST API: POST/GET/PUT/DELETE /v1/storefront/:tenant_id/cart
- [x] DI更新（tachyon-api）
- [x] SQLxキャッシュ更新・コンパイル確認

### フェーズ3: 在庫管理 ✅
- [x] `product_stocks`, `stock_movements` テーブル作成
- [x] ProductStock / StockMovement ドメインエンティティ実装（StockId "stk_", StockMovementId "smv_"）
- [x] StockRepository (SqlxStockRepository) 実装
- [x] CatalogAppService に在庫操作メソッド追加（get_stock, receive_stock, adjust_stock, list_stock_movements）
- [x] REST API: GET/POST /v1/storefront/:tenant_id/products/:product_id/stock/*
- [x] DI更新（tachyon-api）

### フェーズ4: 消費者向けチェックアウト ✅
- [x] `consumer_orders`, `consumer_order_items` テーブル作成
- [x] ConsumerOrder / ConsumerOrderItem ドメインエンティティ実装（ConsumerOrderId "co_", ConsumerOrderItemId "oi_"）
- [x] ConsumerOrderRepository (SqlxConsumerOrderRepository) 実装
- [x] CatalogAppService にチェックアウト操作メソッド追加（checkout, confirm_order, cancel_order, get/list_consumer_orders）
- [x] REST API: POST /v1/storefront/:tenant_id/checkout, confirm, orders
- [x] DI更新（tachyon-api）
- [ ] Stripe Checkout Session連携（後続タスク）

### フェーズ5: 統合テスト・シナリオテスト ✅
- [x] マイグレーション全テーブル実行成功
- [x] コンパイル確認（catalog, tachyon-api, order パッケージ — library-api既存エラー除く）
- [x] シナリオテスト作成（storefront_rest.yaml: 商品一覧/カテゴリ/カートCRUD/注文一覧 6ステップ全パス）
- [x] curl による全APIの手動動作確認完了（商品/カテゴリ/カート/在庫/チェックアウト/注文確定/注文一覧）
- [ ] チェックアウトフロー（カート→決済→注文確定）のE2Eシナリオテスト追加
- [ ] 在庫引当・解除の整合性テスト追加

## Playwright MCPによる動作確認

### 動作確認チェックリスト

#### 商品ブラウジング
- [ ] 商品一覧APIのレスポンス確認
- [ ] カテゴリ別フィルタリングの動作
- [ ] 商品検索の動作
- [ ] 商品詳細の取得

#### カート操作
- [ ] カート作成
- [ ] 商品のカート追加
- [ ] 数量変更
- [ ] 商品削除
- [ ] カート内容取得

#### チェックアウトフロー
- [ ] チェックアウト開始→Stripe URL取得
- [ ] 決済完了後の注文確定
- [ ] 注文履歴への反映
- [ ] 在庫の引当反映

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 在庫の同時更新による整合性問題 | 高 | 楽観的ロック + DB行ロック（SELECT FOR UPDATE）で対応 |
| 既存Quoteフローとの競合 | 中 | 消費者向けは別パス（/storefront/）で分離、既存フロー非破壊 |
| TiDBのDDL制約（マイグレーション） | 中 | `create-migration` スキルを必ず使用 |
| Stripe Webhookの信頼性 | 中 | 冪等性を担保した注文確定処理、リトライ対応 |
| カートの大量レコード蓄積 | 低 | TTLベースのクリーンアップジョブを後続タスクで実装 |

## 参考資料

- 既存のQuote→Orderフロー: `packages/order/src/`
- 既存のStripe連携: `packages/payment/src/`
- 配送管理: `packages/delivery/src/`
- 商品カタログ: `packages/catalog/src/`
- Clean Architecture参考: 既存Usecaseパターン（`packages/auth/src/usecase/`）

## 完了条件

- [ ] 商品カタログが公開/非公開・カテゴリ付きで管理できる
- [ ] ショッピングカート機能が動作する（追加・変更・削除・取得）
- [ ] 在庫管理が動作する（入荷・引当・出荷・調整）
- [ ] カートからStripe決済→注文確定のフローが動作する
- [ ] 注文履歴が取得できる
- [ ] シナリオテストがすべてパスする
- [ ] コードレビューが完了

### バージョン番号の決定基準

- [x] 新機能の追加 → **マイナーバージョンアップ**

## 備考

- フロントエンド（Storefront UI）は本タスクのスコープ外。API実装を優先し、UI は後続タスクで対応する。
- メール通知（注文確認、出荷通知）は後続タスクで対応。
- クーポン/プロモーション機能は後続タスクで対応。
- レビュー・評価機能は後続タスクで対応。
