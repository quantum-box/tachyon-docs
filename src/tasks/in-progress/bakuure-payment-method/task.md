# bakuure checkout: fulfillment_method / payment_method 追加

## 概要
bakuure のチェックアウトに支払い方式選択（IN_STORE/ONLINE）と受け取り方式（pickup/delivery）を追加する。

## ブランチ
`feat/bakuure-payment-method-v2`

## 背景
- MVP では in_store + pickup がメイン（店舗決済 = EC 上は予約注文、受け取り完了で売上確定）
- バックエンド（domain / repository / REST / GraphQL Rust 型）は実装済み
- schema.graphql が未更新、フロントエンドが未対応

## 要件
- checkout API に fulfillment_method (pickup/delivery) と payment_method (in_store/online) を追加
- pickup → 注文ステータス Placed で開始
- delivery → 注文ステータス Pending で開始
- デフォルト値: fulfillment_method=pickup, payment_method=in_store
- bakuure-ui のチェックアウト画面に支払い方式選択 UI を追加

## 実装計画

### 1. schema.graphql 更新
- [x] CheckoutInput に fulfillmentMethod / paymentMethod 追加
- [x] GqlConsumerOrder に fulfillmentMethod / paymentMethod / pickupDeadline / readyAt / pickedUpAt 追加

### 2. フロントエンド codegen
- [x] yarn codegen --filter=bakuure-ui で TypeScript 型を再生成

### 3. チェックアウト UI 更新
- [x] checkout.graphql に fulfillmentMethod / paymentMethod を追加
- [x] checkout-form.tsx に受け取り方法・支払い方法セレクタを追加
- [x] page.tsx の handleCheckout で新フィールドを GraphQL に渡す
- [x] pickup 選択時は配送先情報を非表示にする

### 4. 品質チェック・コミット
- [ ] mise run fmt && mise run check
- [ ] コミット・プッシュ
- [ ] gh pr create

## 技術メモ
- バックエンドの Rust コード（CheckoutInput, GqlConsumerOrder）は既に対応済み
- schema.graphql は code-first（async-graphql）で自動生成されるが、今回は手動で追記して codegen を回す
