---
title: "バクうれ: ストアフロント機能の構築（販売管理 + コンシューマーEC）"
type: "feature"
emoji: "📦"
topics: ["bakuure-ui", "bakuure-admin-ui", "bakuure-api", "storefront", "EC", "販売管理", "cart", "inventory"]
published: true
targetFiles:
  - apps/bakuure-ui/
  - apps/bakuure-admin-ui/
  - apps/bakuure-api/
github: ""
---

# バクうれ: ストアフロント機能の構築（販売管理 + コンシューマーEC）

## 概要

tachyon-apiに実装済みのストアフロントREST API（PR #1201）を、バクうれの2つのフロントエンドから活用できるようにする。

- **bakuure-admin-ui（販売管理）**: オペレーター向けの在庫管理・受注管理・カテゴリ管理画面
- **bakuure-ui（コンシューマーEC）**: エンドユーザー向けの商品ブラウジング・カート・チェックアウト画面

共通のbakuure-api SDK連携を基盤とし、管理側とコンシューマー側を並行して構築する。

## 背景・目的

- **現状**: tachyon-apiに18のストアフロントREST APIエンドポイントが実装済みだが、フロントエンドUIが存在しない
- **バクうれの構成**:
  - `bakuure-admin-ui`: 販売管理システム（商品・顧客・見積・注文分析の管理画面）
  - `bakuure-ui`: コンシューマー向けUI（ランディング・商品一覧・見積シミュレーター・注文フロー）
  - `bakuure-api`: 両UIのゲートウェイ（tachyon SDK経由でtachyon-apiと通信）
- **解決したい課題**:
  - 在庫管理・受注管理の管理画面がない
  - 消費者がセルフサービスで商品を購入できるUIがない
  - ショッピングカートのUIがない

## APIアーキテクチャ

```
bakuure-admin-ui (Next.js)  ─┐
                              ├→ bakuure-api (Rust/axum) ──→ tachyon SDK ──→ tachyon-api
bakuure-ui (Next.js)        ─┘        ↑ GraphQL                              ↑ REST API
```

### tachyon-api ストアフロントAPI（実装済み）

| Method | Path | 用途 | 利用側 |
|--------|------|------|--------|
| GET | `/v1/storefront/:tenant_id/products` | 商品一覧 | 管理/EC |
| GET | `/v1/storefront/:tenant_id/products/:product_id` | 商品詳細 | 管理/EC |
| GET | `/v1/storefront/:tenant_id/categories` | カテゴリ一覧 | 管理/EC |
| GET | `/v1/storefront/:tenant_id/products/:product_id/stock` | 在庫確認 | 管理/EC |
| POST | `/v1/storefront/:tenant_id/products/:product_id/stock/receive` | 入荷登録 | 管理のみ |
| POST | `/v1/storefront/:tenant_id/products/:product_id/stock/adjust` | 在庫調整 | 管理のみ |
| GET | `/v1/storefront/:tenant_id/products/:product_id/stock/movements` | 在庫変動履歴 | 管理のみ |
| POST | `/v1/storefront/:tenant_id/cart` | カート作成/取得 | EC |
| GET | `/v1/storefront/:tenant_id/cart/:cart_id` | カート詳細 | EC |
| POST | `/v1/storefront/:tenant_id/cart/:cart_id/items` | 商品追加 | EC |
| PUT | `/v1/storefront/:tenant_id/cart/:cart_id/items/:item_id` | 数量変更 | EC |
| DELETE | `/v1/storefront/:tenant_id/cart/:cart_id/items/:item_id` | 商品削除 | EC |
| POST | `/v1/storefront/:tenant_id/cart/:cart_id/clear` | カートクリア | EC |
| POST | `/v1/storefront/:tenant_id/checkout` | チェックアウト | EC |
| POST | `/v1/storefront/:tenant_id/checkout/confirm` | 注文確定 | EC |
| GET | `/v1/storefront/:tenant_id/orders` | 注文一覧 | 管理/EC |
| GET | `/v1/storefront/:tenant_id/orders/:order_id` | 注文詳細 | 管理/EC |
| POST | `/v1/storefront/:tenant_id/orders/:order_id/cancel` | 注文キャンセル | 管理/EC |

## 実装方針

### API接続

bakuure-api で **tachyon SDK** を使用し、GraphQL で両UIに公開する。

```
bakuure-api
├── sdk_client.rs          # 既存のSDK呼び出しパターンを踏襲
├── GraphQL Schema
│   ├── Query
│   │   ├── storefrontProducts     # 商品一覧
│   │   ├── storefrontCategories   # カテゴリ一覧
│   │   ├── productStock           # 在庫確認
│   │   ├── stockMovements         # 在庫変動履歴
│   │   ├── cart                   # カート取得
│   │   ├── consumerOrders         # 注文一覧
│   │   └── consumerOrder          # 注文詳細
│   └── Mutation
│       ├── receiveStock           # 入荷登録（管理）
│       ├── adjustStock            # 在庫調整（管理）
│       ├── createCart             # カート作成（EC）
│       ├── addCartItem            # カート商品追加（EC）
│       ├── updateCartItem         # 数量変更（EC）
│       ├── removeCartItem         # 商品削除（EC）
│       ├── clearCart              # カートクリア（EC）
│       ├── checkout               # チェックアウト（EC）
│       ├── confirmOrder           # 注文確定（EC）
│       └── cancelOrder            # 注文キャンセル（管理/EC）
```

### ページ構成

#### bakuure-admin-ui（販売管理）

```
src/app/(v1)/[tenant]/
├── inventory/                         # 在庫管理（新規）
│   ├── page.tsx                       # 在庫一覧テーブル
│   └── [product_id]/
│       ├── page.tsx                   # 商品別在庫詳細
│       └── movements/page.tsx         # 在庫変動履歴
├── consumer-orders/                   # 受注管理（新規）
│   ├── page.tsx                       # 受注一覧テーブル
│   └── [order_id]/page.tsx            # 受注詳細
└── library/
    └── categories/page.tsx            # カテゴリ一覧（新規）
```

サイドバーに追加:
- ライブラリ > カテゴリ
- 在庫管理
- 受注管理

#### bakuure-ui（コンシューマーEC）

```
src/app/shop/
├── layout.tsx                         # ストアフロントレイアウト（ヘッダー+カートアイコン）
├── page.tsx                           # 商品一覧（カテゴリフィルタ付きグリッド）
├── [product_id]/page.tsx              # 商品詳細
├── cart/page.tsx                      # カートページ
├── checkout/
│   ├── page.tsx                       # 注文内容確認
│   └── thanks/page.tsx                # 注文完了
└── orders/
    ├── page.tsx                       # 注文履歴
    └── [order_id]/page.tsx            # 注文詳細
```

ナビゲーションに追加: `ショップ 🛒`

## タスク分解

### フェーズ1: bakuure-api SDK連携（共通基盤） 📝

両UIの前提となるGraphQL層をbakuure-apiに追加する。

- [ ] tachyon SDK にストアフロントAPI用クライアントメソッド追加
- [ ] bakuure-api の `sdk_client.rs` にストアフロント呼び出しヘルパー追加
- [ ] GraphQL Schema: 商品・カテゴリ Query 追加
- [ ] GraphQL Schema: 在庫 Query/Mutation 追加（stock, movements, receive, adjust）
- [ ] GraphQL Schema: カート Query/Mutation 追加（create, get, add/update/remove item, clear）
- [ ] GraphQL Schema: 注文 Query/Mutation 追加（list, detail, checkout, confirm, cancel）
- [ ] 両UIの codegen で型生成確認

### フェーズ2: 販売管理 — 在庫管理画面（bakuure-admin-ui） 📝

- [ ] 在庫一覧テーブル（商品名・現在在庫数・ステータス）
- [ ] 在庫詳細ページ（入荷/調整ボタン付き）
- [ ] 入荷登録フォーム（数量・参照番号・メモ）
- [ ] 在庫調整フォーム（増減・理由）
- [ ] 在庫変動履歴テーブル（日時・種別・数量・参照番号）
- [ ] サイドバーに「在庫管理」メニュー追加

### フェーズ3: 販売管理 — 受注管理画面（bakuure-admin-ui） 📝

- [ ] 受注一覧テーブル（注文ID・合計金額・ステータス・日時）
- [ ] ステータスフィルタ（pending / confirmed / cancelled）
- [ ] 受注詳細画面（注文情報 + 注文明細テーブル）
- [ ] キャンセル操作（確認ダイアログ付き）
- [ ] ステータス別サマリーカード
- [ ] サイドバーに「受注管理」メニュー追加
- [ ] カテゴリ一覧ページ（参照のみ）
- [ ] 商品一覧に在庫数・カテゴリカラム追加

### フェーズ4: コンシューマーEC — 商品ブラウジング（bakuure-ui） 📝

- [ ] ストアフロントレイアウト（`shop/layout.tsx`）
- [ ] ナビゲーションに「ショップ」リンク追加
- [ ] 商品一覧（グリッド表示、カテゴリフィルタ、ページネーション）
- [ ] 商品詳細ページ（在庫状態表示、カート追加ボタン）

### フェーズ5: コンシューマーEC — カート & チェックアウト（bakuure-ui） 📝

- [ ] カートID管理（Cookie）
- [ ] カートページ（商品一覧・数量変更・削除・合計表示）
- [ ] ヘッダーカートアイコン + バッジ
- [ ] カート追加時のトースト通知
- [ ] チェックアウトページ（注文確認）
- [ ] 注文完了ページ
- [ ] 注文履歴一覧・詳細・キャンセル

### フェーズ6: 動作確認 & 品質 📝

- [ ] Playwright MCP: bakuure-admin-ui 在庫管理の全画面動作確認
- [ ] Playwright MCP: bakuure-admin-ui 受注管理の全画面動作確認
- [ ] Playwright MCP: bakuure-ui ストアフロントの全画面動作確認
- [ ] レスポンシブ確認（モバイル / タブレット / デスクトップ）
- [ ] エラーハンドリング（在庫切れ、ネットワークエラー、権限エラー）

## Playwright MCPによる動作確認

### bakuure-admin-ui（販売管理）

#### 在庫管理
- [ ] 在庫一覧テーブルの表示
- [ ] 入荷登録フォームの入力と送信
- [ ] 在庫調整フォームの入力と送信
- [ ] 在庫変動履歴テーブルの表示
- [ ] 入荷/調整後に在庫数が更新される

#### 受注管理
- [ ] 受注一覧テーブルの表示
- [ ] ステータスフィルタの動作
- [ ] 受注詳細ページの表示
- [ ] キャンセル操作と確認ダイアログ

### bakuure-ui（コンシューマーEC）

#### 商品ブラウジング
- [ ] 商品グリッドの初期表示
- [ ] カテゴリフィルタで絞り込み
- [ ] 商品詳細ページへの遷移
- [ ] 在庫状態の表示

#### カート & チェックアウト
- [ ] 商品をカートに追加
- [ ] カートアイコンのバッジ更新
- [ ] カートページで数量変更・削除
- [ ] チェックアウト→注文確定→サンクスページ

#### 注文履歴
- [ ] 注文一覧の表示
- [ ] 注文詳細・キャンセル

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| bakuure-apiとtachyon-apiのDocker間通信 | 中 | Docker Compose networkで接続、`TACHYON_API_URL`で設定 |
| SDK側にストアフロントAPIのクライアントがない | 高 | フェーズ1でSDK拡張を最優先で実施 |
| カテゴリCRUD APIが未実装 | 低 | 管理画面では参照のみ。CRUD追加は別タスク |
| カートのCookie永続化 | 低 | HttpOnly Cookie（有効期限7日） |
| 在庫の同時購入競合 | 中 | チェックアウト時にAPI側で在庫再確認 |

## 参考資料

- バックエンドAPI実装: PR #1201 (`feat/consumer-ec-storefront`)
- バクうれDockerセットアップ: `docs/src/tasks/completed/v0.28.1/bakuure-docker-compose-setup/`
- 既存の商品管理画面: `apps/bakuure-admin-ui/src/app/(v1)/[tenant]/library/products/`
- 既存の商品一覧（EC側）: `apps/bakuure-ui/src/app/product/list/page.tsx`
- ストアフロントAPIハンドラ: `packages/catalog/src/adapter/axum/storefront.rs`
- bakuure-api SDKクライアント: `apps/bakuure-api/src/sdk_client.rs`

## 完了条件

- [ ] bakuure-admin-ui で在庫一覧・入荷・調整・変動履歴が操作できる
- [ ] bakuure-admin-ui で受注一覧・詳細・キャンセルが操作できる
- [ ] bakuure-ui で商品ブラウジング（カテゴリフィルタ付き）ができる
- [ ] bakuure-ui でカート操作（追加・変更・削除）ができる
- [ ] bakuure-ui でチェックアウト→注文確定のフローが完了する
- [ ] Playwright MCPで全画面の動作確認が完了
- [ ] 動作確認レポートが完成している
