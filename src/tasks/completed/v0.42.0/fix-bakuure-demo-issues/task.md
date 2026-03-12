---
title: "バクうれ Phase 1 デモで発見された不具合・技術的負債の解消"
type: bug
emoji: "🔧"
topics: ["bakuure", "order", "crm", "delivery", "self-service"]
published: true
targetFiles:
  - packages/crm/src/domain/quotes.rs
  - packages/crm/src/domain/line_item.rs
  - packages/order/src/usecase/self_service_order.rs
  - packages/order/src/handler/mutation.rs
  - packages/delivery/src/domain/shipping_destination.rs
  - apps/bakuure-ui/src/app/order/[view]/[quoteId]/components/
github: ""
---

# バクうれ Phase 1 デモで発見された不具合・技術的負債の解消

## 概要

Phase 1 デモシナリオ（商品登録→HubSpot 同期→セルフサービス注文→Stripe 決済→CRM 更新）の動作確認で、デモを通すために応急処置した箇所と、未修正のバグを整理し、本質的な修正を行う。

## 背景・目的

Phase 1 動作確認タスク（`docs/src/tasks/in-progress/bakuure-value-visualization/`）で一気通貫デモが動く状態になったが、以下の問題が残っている：

1. **Quote の金額計算バグ** — subtotal/total が不正な値（二重乗算＋ `-0.0` 表示）
2. **配送先のダミー値ハードコード** — デモ通過のために住所・電話番号にプレースホルダーを埋め込んだ
3. **GraphQL API の設計不足** — mutation に address パラメータがなく、UI からの住所指定が不可能
4. **配送判定ロジックの曖昧さ** — `deliver` フラグと `shipping_destination_id` の関係が不明確
5. **サービスアカウントでの delivery スキップ** — 応急処置として warn ログで迂回

これらを放置すると、Phase 2・3 の実装や本番利用に支障をきたすため、デモ完了直後に対処する。

## 詳細仕様

### Issue 1: Quote subtotal 二重乗算バグ 🔴 高

**現状のコード:**

```rust
// packages/crm/src/domain/line_item.rs:39-41
pub fn amount(&self) -> f32 {
    self.quantity as f32 * self.unit_price  // quantity × unit_price
}

// packages/crm/src/domain/quotes.rs:165-171
pub fn calculate_subtotal(&mut self) {
    self.subtotal = self
        .line_items
        .iter()
        .map(|item| item.amount() * *item.quantity() as f32)  // (quantity × unit_price) × quantity
        .sum();
}
```

**問題:**
- `item.amount()` が既に `quantity × unit_price` を返す
- `calculate_subtotal()` が更に `* quantity` しているため **quantity² × unit_price** になる
- quantity=1 のとき偶然正しくなるが、quantity>1 のとき金額が過大になる
- `calculate_total()` 未呼び出し時は初期値 `0.0` のまま、浮動小数点演算で `-0.0` になり得る

**修正方針:**
- `calculate_subtotal()` を `item.amount()` の合計に修正（`* quantity` を除去）
- または `amount()` を `unit_price` のみ返すように変更して `calculate_subtotal()` 側で `* quantity` する
- **推奨**: `amount()` = `unit_price * quantity`（行項目の小計）として `calculate_subtotal()` = `sum(amount())` にする

```rust
// 修正後
pub fn calculate_subtotal(&mut self) {
    self.subtotal = self
        .line_items
        .iter()
        .map(|item| item.amount())
        .sum();
}
```

### Issue 2: GraphQL mutation に address パラメータがない 🔴 高

**現状:**
- `packages/order/src/handler/mutation.rs` の `SelfServiceOrderInput` に `address` フィールドがない
- 2 箇所（quote_id ルート L509、product_id ルート L546）で `address: None` がハードコード

**修正方針:**
- `SelfServiceOrderInput` に `address` フィールド（Option）を追加
- `mutation.rs` で入力値を `SelfServiceOrderOptions.address` に渡す
- bakuure-ui のフロントエンドで住所入力がある場合は GraphQL mutation に address を含める

### Issue 3: 配送先のデフォルト値ハードコード 🟡 中

**現状（`packages/order/src/usecase/self_service_order.rs`）:**
- L567-576: デフォルト住所 `"000-0000"`, `"東京都"`, `"千代田区"`, `"（住所未設定）"`
- L590: ダミー電話番号 `"000-0000-0000"`

**問題:**
- `delivery::domain::ShippingDestination::can_ship_physically()` が `address.is_some() && phone_number.is_some()` を要求
- ダミー値でこのチェックを迂回している
- 多言語対応や本番利用に不適

**修正方針:**
- Issue 2 で address を GraphQL から受け取れるようになれば、デフォルト値は不要になる
- セルフサービス注文フローで住所入力ステップを追加するか、`can_ship_physically()` の条件を見直す
- 暫定的に、デフォルト値を使う場合はログで明示的に記録する

### Issue 4: needs_shipping_setup の論理が曖昧 🟡 中

**現状（`self_service_order.rs:527-531`）:**
```rust
let needs_shipping_setup = input.options.deliver
    || quote.line_items().iter().any(|item| item.shipping_destination_id().is_none());
```

**問題:**
- `deliver=true` かつ全行アイテムに既存の `shipping_destination_id` がある場合でも、再登録が走る
- デジタルプロダクト（`deliver=false`）でも `shipping_destination_id` が None なら配送先を作成してしまう

**修正方針:**
- 物理配送が必要なプロダクトかどうかを `Product.is_physical()` で判定し、必要な行アイテムのみに配送先を登録する
- `deliver` フラグは「このセルフサービス注文で納品処理を実行するか」の意味に限定する

### Issue 5: サービスアカウントで delivery をスキップ 🟢 低

**現状（`self_service_order.rs:630-636`）:**
```rust
if !input.executor.is_user() {
    tracing::warn!("skipping delivery: executor is not a user ...");
} else if let Some(delivery_app) = &self.delivery_app {
    // delivery 処理
}
```

**問題:**
- デモではサービスアカウント経由で注文するため、delivery（ワークスペースプロビジョニング）がスキップされる
- bakuure-ui が認証済みユーザーコンテキストを使えるようになれば解消する

**修正方針:**
- 短期: 現状の warn スキップを維持（デモシナリオでは問題なし）
- 中期: bakuure-ui に認証機能を統合し、実ユーザーの `x-user-id` を GraphQL ヘッダーに渡す

### Issue 6: GraphQL クエリで subtotal/total を未取得 🟢 低

**現状（`self-service-order-confirm.graphql`）:**
- `subtotal` / `total` フィールドを要求していない
- フロント側で `lineItems.reduce(...)` で手動計算

**修正方針:**
- GraphQL クエリに `subtotal` `total` `tax` を追加
- Issue 1 修正後にサーバー側の計算値を使うように統一

## 実装方針

### 修正優先順位

| 順序 | Issue | 理由 |
|------|-------|------|
| 1 | Issue 1（二重乗算） | データ不整合を引き起こすバグ。quantity>1 で金額が壊れる |
| 2 | Issue 6（GraphQL クエリ） | Issue 1 修正後、正しい値をフロントに渡す |
| 3 | Issue 2（address パラメータ） | API 設計の不足。後続フェーズで必要 |
| 4 | Issue 4（shipping 論理） | ロジックの明確化。物理/デジタル判定を正しく行う |
| 5 | Issue 3（デフォルト値） | Issue 2/4 解消後に不要になる可能性 |
| 6 | Issue 5（SA スキップ） | 中期課題。bakuure-ui の認証統合が前提 |

### 影響範囲

```yaml
contexts:
  crm:
    files:
      - packages/crm/src/domain/quotes.rs
      - packages/crm/src/domain/line_item.rs
    impact: "subtotal/total の計算修正。全 Quote を参照する箇所に影響"

  order:
    files:
      - packages/order/src/usecase/self_service_order.rs
      - packages/order/src/handler/mutation.rs
      - packages/order/src/handler/model.rs
    impact: "GraphQL API の入力型変更。セルフサービス注文の配送ロジック修正"

  delivery:
    files:
      - packages/delivery/src/domain/shipping_destination.rs
    impact: "can_ship_physically() の条件見直し（必要に応じて）"

  bakuure-ui:
    files:
      - apps/bakuure-ui/src/app/order/[view]/[quoteId]/components/self-service-order-confirm.graphql
      - apps/bakuure-ui/src/app/order/[view]/[quoteId]/components/self-service-order-confirm.tsx
    impact: "GraphQL クエリの修正、表示ロジックの変更"
```

## タスク分解

### Phase A: 金額計算バグ修正 ✅ (2026-02-12 完了)

- [x] `quotes.rs` の `calculate_subtotal()` から二重乗算を除去
  - `item.amount() * quantity` → `item.amount()` に修正（`amount()` が既に `quantity * unit_price`）
- [x] `calculate_subtotal()` / `calculate_total()` の単体テスト追加（5件）
  - qty=1, qty=3, 複数アイテム, 税込計算, 空リストの `-0.0` チェック
- [x] `self-service-order-confirm.graphql` に `subtotal` `total` `tax` を追加
- [x] フロントの手動計算をサーバー値に置換（`toLocaleString()` で整形表示）
- [x] コードゲン実行完了

### Phase B: GraphQL address パラメータ追加 ✅ (2026-02-12 完了)

- [x] `SelfServiceOrderInput` に `address: Option<AddressInput>` フィールドを追加
- [x] `mutation.rs` の 2 箇所で `input.address.map(|a| a.try_into()).transpose()?` に変更
- [x] bakuure-ui コードゲン実行完了

### Phase C: 配送ロジック整理 ✅ (2026-02-12 完了)

- [x] `needs_shipping_setup` の条件を明確化
  - `has_missing_destination || input.options.address.is_some()` に変更
  - `deliver` フラグを条件から分離（delivery はユースケース後段で判定）
- [x] デフォルト住所・電話番号は維持するが、ログで明示化
  - 住所未指定時: `info!("no address provided; using placeholder ...")`
  - 電話番号: コメントで `can_ship_physically()` 要件を説明
- [ ] `can_ship_physically()` の phone_number 必須要件は今回見送り（後続タスク）

## テスト計画

- `packages/crm` の既存テストを拡張（`calculate_subtotal` / `calculate_total` に quantity>1 ケース）
- `packages/order` のシナリオテスト（`selfServiceOrder` mutation で address 付き）
- bakuure-ui のフロント表示確認（Playwright MCP で金額表示の動作確認）

## 動作確認チェックリスト

- [ ] quantity=1 の見積で subtotal/total が正しい
- [ ] quantity>1 の見積で subtotal/total が正しい（二重乗算が解消）
- [ ] `-0.0` が GraphQL レスポンスに含まれない
- [ ] bakuure-ui の注文確認画面で正しい金額が表示される
- [ ] address 付きの `selfServiceOrder` mutation が成功する
- [ ] address なしの `selfServiceOrder` mutation でもデフォルト値で動作する

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| `calculate_subtotal` 修正で既存の Quote データと乖離 | 高 | DB 上の subtotal/total は `calculate_total()` 呼び出し時に再計算されるため、保存済みデータの修正は不要。ただし表示時に再計算が走るか確認 |
| `amount()` の意味変更で他の呼び出し箇所に影響 | 中 | `amount()` 自体は変えず `calculate_subtotal()` 側のみ修正する方針で影響を最小化 |
| GraphQL スキーマ変更でフロントが壊れる | 低 | Optional フィールド追加のみ。後方互換性あり |

## 参考資料

- [Phase 1 デモシナリオ taskdoc](../../in-progress/bakuure-value-visualization/task.md)
- [Phase 1 修正済み不具合一覧](../../in-progress/bakuure-value-visualization/task.md#phase-1-で修正した不具合一覧)

## 完了条件

- [x] Issue 1〜4 が修正されている
- [ ] 既存テスト＋追加テストが全て通る（CI確認待ち）
- [ ] デモシナリオが引き続き動作する（リグレッションなし）
- [ ] bakuure-ui で正しい金額が表示される

### バージョン番号の決定基準

**パッチバージョン（x.x.X）を上げる:**
- [x] バグ修正（二重乗算、`-0.0`）
- [x] 小さな改善（GraphQL フィールド追加、ロジック明確化）
