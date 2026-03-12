# bakuure: Expired Order Auto-Cancel Batch Endpoint

## Overview
READY状態の注文がpickup_deadline（受け取り期限）を過ぎたら自動的にCANCELEDに遷移するバッチ処理エンドポイント。

## Requirements
- READY状態の注文がpickup_deadlineを過ぎたら自動的にCANCELEDに遷移
- キャンセル時に在庫を戻す（stock restoration via release_reservation）
- bakuure-api REST: `POST /v1/bakuure/orders/batch/cancel-expired`
- bakuure-api GraphQL: `cancelExpiredOrders` mutation（キャンセル件数を返す）
- 外部スケジューラ（CronJob等）から呼ばれる想定

## Implementation Status

### Already Implemented (in main)
- ✅ `CommerceApp.cancel_expired_pickup_orders()` (packages/commerce/src/app.rs:1160-1188)
- ✅ `CommerceApp.find_expired_pickup_orders()` (packages/commerce/src/app.rs:1151-1158)
- ✅ `ConsumerOrderRepository.find_expired_pickup_orders()` (sqlx query)
- ✅ `cancel_order()` with stock restoration via `release_reservation()` (app.rs:843-890)
- ✅ tachyon-api REST: `POST /v1/commerce/orders/batch/cancel-expired`
- ✅ `CommerceClient.cancel_expired_orders()` (bakuure-api REST client)
- ✅ GraphQL mutation: `cancelExpiredOrders` in CommerceMutation (commerce_mutation.rs:287-294)
- ✅ `pickup_deadline` column on consumer_orders table
- ✅ Index: `idx_consumer_orders_pickup` on (tenant_id, status, pickup_deadline)

### To Implement
- 📝 bakuure-api REST endpoint: `POST /v1/bakuure/orders/batch/cancel-expired`

## Architecture
```
CronJob → POST /v1/bakuure/orders/batch/cancel-expired (bakuure-api)
       → CommerceClient.cancel_expired_orders()
       → POST /v1/commerce/orders/batch/cancel-expired (tachyon-api)
       → CommerceApp.cancel_expired_pickup_orders()
       → find expired READY orders → cancel each → release stock
```

## Files to Modify
1. `apps/bakuure-api/src/handler/rest.rs` - Add cancel-expired REST handler
2. `apps/bakuure-api/src/router.rs` - Register the new route

## Progress
- ✅ Codebase exploration complete
- 📝 Implementing REST endpoint
