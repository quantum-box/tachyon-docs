# Z.AI GLM-5 モデル追加 動作確認レポート

実施日: 2026-02-12
実施者: @openclaw

## 環境情報
- 対象: Rust backend + seed (`packages/providers/zai`, `scripts/seeds/n1-seed/005-order-products.yaml`)
- 実行コマンド: `mise run check`（Docker経由）

## 動作確認結果
- [x] `ai_models.rs` に `glm-5` を追加
- [x] `chat.rs` の `get_supported_models()` に `glm-5` を追加（Agent feature含む）
- [x] `pricing.rs` に `glm-5` 価格を追加
- [x] `provider_info.rs` に `glm-5` モデル情報を追加
- [x] `005-order-products.yaml` に `glm-5` の
  - `product_variants`
  - `variant_procurement_links`
  - `product_usage_pricing`
  を追加
- [x] `mise run check` 成功（Docker）

## 補足
- 以前の `cargo test -p zai` 単体実行はホスト環境で `protoc` 不足により失敗したが、今回の `mise run check`（Docker）では成功。
- まだDBへのseed反映（`mise run docker-seed`）は未実行。
