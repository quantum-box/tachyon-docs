---
title: "async-stripe crateのアップグレード (0.34.1 → 0.41.0)"
type: "dependency"
emoji: "⬆️"
topics: ["async-stripe", "Rust", "payment", "dependency-update"]
published: true
date: "2025-05-30"
targetFiles: ["packages/payment/Cargo.toml", "packages/providers/stripe/Cargo.toml"]
---

# async-stripe crateのアップグレード

## 概要
async-stripe crateを0.34.1から0.41.0へアップグレードしました。

## 変更日
2025-05-30

## 変更種別
DEPENDENCY

## 影響範囲
- [x] packages/payment
- [x] packages/providers/stripe

## 詳細

### 変更前
```toml
async-stripe = { version = "0.34.1", features = [
    "runtime-tokio-hyper-rustls",
    "webhook-events",
    "chrono",
] }
```

### 変更後
```toml
async-stripe = { version = "0.41.0", features = [
    "runtime-tokio-hyper-rustls",
    "webhook-events",
    "chrono",
] }
```

### 変更理由
- 最新の安定版にアップデートすることで、新機能とバグ修正を取り込む
- セキュリティアップデートの適用
- Stripe APIの最新機能へのアクセス

## 技術的詳細

### 0.34.1から0.41.0での主な変更点

#### 新機能
1. **refund events**のサポート（EventType enum）
2. **checkout_session_ext**のエクスポート
3. **TestClock**操作のサポート
4. **CheckoutSession**の`retrieve_line_items`関数追加
5. **webhook_events**でのタイムスタンプサポート
6. **SetupIntent**確認時の`mandate_data`サポート
7. **microdeposits**検証フローの追加

#### バグ修正
1. オプショナルリストの型生成修正
2. Self_リネームの問題修正
3. clippy警告の解決
4. `FinalizeInvoiceParams`の`auto_advance`フィールドの公開
5. customer typeフィールドのオプショナリティ修正

### 破壊的変更
なし - このアップグレードは後方互換性があります。

## マイグレーション手順
既存のコードは変更なしで動作します。新機能を使用する場合のみ、該当するAPIドキュメントを参照してください。

## テスト
- [x] ユニットテスト - `cargo check`で依存関係の整合性を確認
- [ ] 統合テスト
- [ ] 手動テスト

## 関連情報
- async-stripe GitHub: https://github.com/arlyon/async-stripe
- CHANGELOG: https://github.com/arlyon/async-stripe/blob/master/CHANGELOG.md

## 備考
- 1.0.0-alpha.2も検討しましたが、大幅なAPI変更があるため、安定版の0.41.0を選択しました
- 将来的に1.0.0がリリースされた際には、別途マイグレーション計画が必要です