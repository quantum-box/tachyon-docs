# bakuure Commerce MVP: クーポンシステム + チェックアウト統合

## 概要
bakuure汎用コマース基盤にクーポンシステムと還元レポート機能を追加する。

## 要件
- 要件詳細: `~/knowledge/projects/powson-ec.md`
- 1注文1クーポン制約
- 割引タイプ: PERCENTAGE / FIXED
- 通貨: JPY（NanoDollar単位で保存）
- 端数処理: 切り捨て（floor）
- 還元レポート: クーポン適用注文の集計（期間指定、CSV出力）

## アーキテクチャ
- ドメイン/リポジトリ: `packages/commerce/src/coupon/`
- マイグレーション: `packages/order/migrations/`
- REST API: `packages/commerce/src/adapter/axum/stripe_storefront/`
- GraphQL: `apps/bakuure-api/src/handler/graphql/`
- 金額: NanoDollar (i64) で統一管理

## PR計画

### PR1: DB migration + Domain model ✅
- [x] coupons テーブル migration
- [x] order_coupon テーブル migration
- [x] Coupon entity
- [x] CouponDiscount value object
- [x] CouponRepository trait + SQLx実装

### PR2: Coupon CRUD REST + GraphQL ✅
- [x] CreateCoupon REST + GraphQL
- [x] UpdateCoupon REST + GraphQL
- [x] ListCoupons REST + GraphQL
- [x] GetCoupon REST + GraphQL
- [x] DisableCoupon REST + GraphQL
- [x] ValidateCoupon REST (rate-limited)

### PR3: Checkout coupon integration ✅
- [x] checkout mutation にクーポンコード追加
- [x] サーバ側割引再計算
- [x] order_coupon 保存
- [x] 1注文1クーポン制約
- [x] bakuure-ui チェックアウト画面にクーポン入力UI

### PR4: Payout report (後続)
- [ ] payout_reports, payout_report_items migration
- [ ] GeneratePayoutReport usecase
- [ ] GET /v1/storefront/reports/payout (JSON)
- [ ] GET /v1/storefront/reports/payout.csv

## 進捗ログ
- 2026-03-03: タスク開始、コードベース調査完了
- 2026-03-03: PR1-3 クーポンシステム + チェックアウト統合実装
