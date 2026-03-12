---
title: "Stripe 互換 Storefront API の新設"
type: "feature"
emoji: "💳"
topics: ["commerce", "REST API", "Stripe", "axum", "OpenAPI"]
published: true
targetFiles:
  - "packages/commerce/src/adapter/axum/"
  - "packages/commerce/src/app.rs"
  - "apps/tachyon-api/src/router.rs"
  - "apps/tachyon-api/tests/scenarios/storefront_rest.scenario.md"
---

# Stripe 互換 Storefront API の新設

## 概要

既存の Commerce API (`/v1/commerce/...`) はそのまま維持し、Stripe API 設計パターンに準拠した **新しい Storefront API** (`/v1/storefront/...`) を別途新設する。

## 背景・目的

### 方針

- **既存 `/v1/commerce/...`**: `storefront.rs` をそのまま残す。既存クライアント（bakuure-ui 等）はこちらを使い続ける
- **新規 `/v1/storefront/...`**: Stripe 互換レスポンス形式の新 API。将来的に消費者向けフロントエンドはこちらに移行

### 新 API で改善する点

1. **レスポンス形式**: `StripeList<T>` (`{ object: "list", data: [], has_more }`)
2. **ページネーション**: カーソルベース (`starting_after` / `ending_before`)
3. **エラーレスポンス**: Stripe 互換の構造化エラー (`{ error: { type, code, message, param } }`)
4. **`object` フィールド**: 全リソースに `object` と `created` (Unix timestamp) を付与

### ゴール

Stripe API の設計パターンを採用し、フロントエンド開発者にとって馴染みのある一貫性の高い API を提供する。既存 API とは共存させ、段階的に移行する。

## 詳細仕様

### 1. エンドポイント設計

**既存 Commerce API** (`storefront.rs`) はそのまま維持。新規 Storefront API を `/v1/storefront/...` に追加。

#### 新 Storefront API エンドポイント一覧

| Endpoint | Method | 説明 |
|----------|--------|------|
| `/v1/storefront/products` | GET | 商品一覧（カーソルページネーション） |
| `/v1/storefront/products/:id` | GET | 商品詳細 |
| `/v1/storefront/product_categories` | GET | カテゴリ一覧 |
| `/v1/storefront/carts` | POST | カート作成 |
| `/v1/storefront/carts/:id` | GET | カート取得 |
| `/v1/storefront/carts/:id/items` | POST | アイテム追加 |
| `/v1/storefront/carts/:id/items/:item_id` | POST | アイテム更新 |
| `/v1/storefront/carts/:id/items/:item_id` | DELETE | アイテム削除 |
| `/v1/storefront/carts/:id/clear` | POST | カートクリア |
| `/v1/storefront/stocks/:product_id` | GET | 在庫取得 |
| `/v1/storefront/stocks/:product_id/receive` | POST | 入荷 |
| `/v1/storefront/stocks/:product_id/adjust` | POST | 在庫調整 |
| `/v1/storefront/stock_movements` | GET | 在庫移動一覧 |
| `/v1/storefront/checkout_sessions` | POST | チェックアウト |
| `/v1/storefront/checkout_sessions/:id/confirm` | POST | 注文確認 |
| `/v1/storefront/orders` | GET | 注文一覧 |
| `/v1/storefront/orders/:id` | GET | 注文詳細 |
| `/v1/storefront/orders/:id/cancel` | POST | 注文キャンセル |
| `/v1/storefront/orders/:id/ship` | POST | 出荷 |
| `/v1/storefront/orders/:id/deliver` | POST | 配達完了 |

#### テナント解決

- `x-operator-id` ヘッダーから `TenantId` を取得（tachyon-api 標準パターン）
- 認証: `Authorization: Bearer <token>` ヘッダー

### 2. レスポンスエンベロープ (Stripe 互換)

#### 単一リソース

```json
{
  "id": "prod_01jexample",
  "object": "product",
  "created": 1708700000,
  "metadata": {},
  "name": "商品名",
  "description": "説明",
  "active": true,
  "default_price": "price_01jexample",
  "images": [],
  "category_id": "pcat_01jexample",
  "weight_grams": 500
}
```

#### リスト (カーソルベースページネーション)

```json
{
  "object": "list",
  "url": "/v1/commerce/products",
  "has_more": true,
  "data": [
    {
      "id": "prod_01j...",
      "object": "product",
      ...
    }
  ]
}
```

**ページネーションパラメータ:**
- `limit` (1-100, default: 20)
- `starting_after` (カーソル: オブジェクトID)
- `ending_before` (カーソル: オブジェクトID)

#### エラーレスポンス

```json
{
  "error": {
    "type": "invalid_request_error",
    "code": "resource_missing",
    "message": "No such product: 'prod_invalid'",
    "param": "id"
  }
}
```

**エラータイプ:**
| type | HTTP | 説明 |
|------|------|------|
| `invalid_request_error` | 400 | パラメータ不正 |
| `authentication_error` | 401 | 認証失敗 |
| `permission_error` | 403 | 権限不足 |
| `not_found_error` | 404 | リソース未発見 |
| `conflict_error` | 409 | 状態不整合 |
| `api_error` | 500 | 内部エラー |

### 3. object フィールドの定義

| リソース | `object` 値 | ID prefix |
|---------|------------|-----------|
| 商品 | `"product"` | `prod_` (既存 ProductId 流用) |
| 商品カテゴリ | `"product_category"` | `pcat_` (既存 ProductCategoryId 流用) |
| カート | `"cart"` | `crt_` (既存 CartId) |
| カートアイテム | `"cart_item"` | `ci_` (既存 CartItemId) |
| 在庫 | `"stock"` | `stk_` (既存 StockId) |
| 在庫移動 | `"stock_movement"` | `smv_` (既存 StockMovementId) |
| チェックアウトセッション | `"checkout_session"` | `co_` (既存 ConsumerOrderId 流用) |
| 注文 | `"order"` | `co_` (既存 ConsumerOrderId) |
| 注文アイテム | `"order_item"` | `oi_` (既存 ConsumerOrderItemId) |

### 4. 金額フィールド

Stripe は最小通貨単位（USD → cents）を使用するが、tachyon では NanoDollar が標準。
互換性のため **両方** をレスポンスに含める:

```json
{
  "unit_amount": 1500,
  "unit_amount_nanodollar": 15000000000,
  "currency": "usd"
}
```

- `unit_amount`: cents 単位 (nanodollar / 10,000,000)
- `unit_amount_nanodollar`: NanoDollar 単位 (内部表現)
- `currency`: ISO 4217 小文字 3文字

### 5. Idempotency-Key サポート

- `POST` リクエストで `Idempotency-Key` ヘッダーをサポート
- Phase 2 以降で実装（初期リリースではスキップ）

### 6. expand パラメータ

- Phase 2 以降で実装
- 初期リリースでは関連リソースを inline で返す

## 実装方針

### アーキテクチャ

既存 `storefront.rs` はそのまま。新規ファイルを追加:

```
commerce/src/adapter/axum/
├── mod.rs              # 既存 Commerce + 新 Storefront 両方のルーター統合
├── storefront.rs       # 【既存・変更なし】 /v1/commerce/... ハンドラー
├── stripe_storefront/  # 【新規】 /v1/storefront/... Stripe互換ハンドラー
│   ├── mod.rs          # ルーター + OpenAPI
│   ├── common.rs       # extract_tenant_id, CommerceError, CursorPaginationQuery
│   ├── stripe_types.rs # StripeList<T>, StripeErrorResponse, DeletedResponse
│   ├── products.rs     # 商品一覧/詳細
│   ├── product_categories.rs # カテゴリ一覧
│   ├── carts.rs        # カート CRUD + アイテム操作
│   ├── stocks.rs       # 在庫/在庫変動
│   └── orders.rs       # チェックアウト + 注文管理 + 出荷/配達
```

### 共通レスポンス型

```rust
/// Stripe-compatible list response
#[derive(Serialize, ToSchema)]
pub struct StripeList<T: Serialize> {
    pub object: &'static str,  // always "list"
    pub url: String,
    pub has_more: bool,
    pub data: Vec<T>,
}

/// Stripe-compatible error response
#[derive(Serialize, ToSchema)]
pub struct StripeErrorResponse {
    pub error: StripeErrorBody,
}

#[derive(Serialize, ToSchema)]
pub struct StripeErrorBody {
    pub r#type: String,
    pub code: Option<String>,
    pub message: String,
    pub param: Option<String>,
}
```

### テナントID抽出

既存の tachyon-api ミドルウェアを活用して `x-operator-id` から `TenantId` を取得:

```rust
pub async fn list_products(
    Extension(commerce_app): Extension<Arc<dyn CommerceAppService>>,
    Extension(operator_id): Extension<TenantId>,  // from x-operator-id header
    Query(params): Query<ListParams>,
) -> Result<Json<StripeList<ProductResponse>>, StripeErrorResponse> {
    // ...
}
```

### カーソルベースページネーション

```rust
pub struct ListParams {
    pub limit: Option<i64>,           // default 20, max 100
    pub starting_after: Option<String>, // cursor: object ID
    pub ending_before: Option<String>,  // cursor: object ID
}
```

リポジトリ層で `WHERE id > :starting_after ORDER BY id ASC LIMIT :limit + 1` として `has_more` を判定。

## タスク分解

### Phase 1: 共通型 + ハンドラー新設 📝

- [ ] `stripe_storefront/` ディレクトリ作成
- [ ] 共通 Stripe 互換型: `StripeList<T>`, `StripeErrorResponse`, `DeletedResponse`
- [ ] `CommerceError` ラッパー（`errors::Error` → Stripe エラー形式変換）
- [ ] `extract_tenant_id` ヘルパー（`x-operator-id` ヘッダー）
- [ ] 商品ハンドラー: `products.rs` (一覧 + 詳細、`object: "product"`, `created`)
- [ ] カテゴリハンドラー: `product_categories.rs`
- [ ] カートハンドラー: `carts.rs` (CRUD + アイテム操作)
- [ ] 在庫ハンドラー: `stocks.rs` (取得、入荷、調整、移動一覧)
- [ ] 注文ハンドラー: `orders.rs` (チェックアウト、確認、一覧、詳細、キャンセル、**出荷、配達**)
- [ ] ルーター統合: `mod.rs` で `/v1/storefront/...` ルート登録
- [ ] OpenAPI ドキュメント: `/v1/storefront/swagger-ui`

### Phase 2: カーソルベースページネーション 📝

- [ ] リポジトリ層にカーソルベースクエリ追加（`_cursor` メソッド）
  - `ProductRepository`
  - `StockRepository` (stock movements)
  - `ConsumerOrderRepository`
- [ ] 全リストエンドポイントで `starting_after` / `ending_before` サポート
- [ ] `has_more` 判定: `limit + 1` 件取得パターン

### Phase 3: 出荷・配達フロー 📝

- [ ] `CommerceAppService` に `ship_order()`, `deliver_order()` 追加
- [ ] ステータス遷移バリデーション (Confirmed→Shipped→Delivered)
- [ ] 出荷時に `confirm_sale()` で在庫確定

### Phase 4: テスト・ドキュメント 📝

- [ ] シナリオテスト: `storefront_rest.scenario.md` 新規作成（E2E フロー含む）
- [ ] 既存 `commerce_rest.scenario.md` はそのまま維持
- [ ] 全エンドポイントの OpenAPI スキーマ
- [ ] Swagger UI で確認

### Phase 5 (後続): 拡張機能 📝

- [ ] `Idempotency-Key` サポート
- [ ] `expand[]` パラメータ
- [ ] `metadata` フィールドの永続化
- [ ] Webhook イベント通知
- [ ] bakuure-api クライアント（Storefront API 版）

## テスト計画

1. **シナリオテスト**: `commerce_rest.scenario.md` で全エンドポイントを網羅
2. **コンパイル確認**: `SQLX_OFFLINE=true cargo check -p commerce -p tachyon-api`
3. **ページネーションテスト**: `starting_after` / `ending_before` の正常系・境界値
4. **エラーレスポンステスト**: 各エラータイプの JSON 形式を検証
5. **ヘッダー認証テスト**: `x-operator-id` 未指定時の 401 エラー

## リスクと対策

| リスク | 対策 |
|--------|------|
| 既存 API との重複 | 別パス (`/v1/storefront/` vs `/v1/commerce/`) で共存。将来的に旧 API を deprecate |
| カーソルページネーションの実装コスト | Phase 2 で分離し、まず Phase 1 でハンドラーを整える |
| Stripe 完全互換は過剰設計になる | 必要なパターンのみ採用（expand, idempotency は後回し） |
| アプリケーションサービス層の重複 | `CommerceAppService` は共有。ハンドラー（HTTP 変換層）だけが異なる |

## 完了条件

- [ ] 新 Storefront API が `/v1/storefront/` プレフィックスで動作
- [ ] 既存 Commerce API (`/v1/commerce/`) が変更なしで動作
- [ ] レスポンスが Stripe 互換エンベロープ形式
- [ ] カーソルベースページネーションが動作
- [ ] 出荷・配達フローが E2E で動作
- [ ] シナリオテスト通過
- [ ] コンパイルエラーなし

## 進捗

- PR #1219 のレビューで方針変更: 既存 API 置換 → 新 API 新設に変更
- 既存 `storefront.rs` は維持し、新しい `stripe_storefront/` ディレクトリに Stripe 互換ハンドラーを追加する方針に修正
