# クレジット単位システム

## 概要

Tachyon Appsでは、課金計算において統一された単位システムを使用しています。このドキュメントでは、クレジットの内部表現と外部表現、および各コンポーネントでの扱い方について説明します。

## 単位の定義

### 外部表現（ユーザー向け）
- **1クレジット = 1円**（JPYの場合）
- **1クレジット = $0.01**（USDの場合）
- 最小表示単位: 0.001クレジット

### 内部表現（システム内部）
- **1内部単位 = 0.001クレジット**
- **1000内部単位 = 1クレジット**
- 例:
  - 10クレジット = 10,000内部単位
  - 0.1クレジット = 100内部単位
  - 0.001クレジット = 1内部単位（最小単位）

### Payment側の内部表現
- **1内部単位 = 0.1クレジット**（レガシー）
- **10内部単位 = 1クレジット**
- ⚠️ 注意: Payment側とCatalog側で内部単位が異なります

## データベーステーブルの単位

### service_price_mappings
- `fixed_price`: **内部単位（0.001クレジット = 1）**
- 例:
  - プロンプトトークン: 20 = 0.02クレジット/トークン
  - 完了トークン: 100 = 0.1クレジット/トークン

### product_usage_pricing
- `rate_per_unit`: **内部単位（0.001クレジット = 1）**
- 例:
  - プロンプトトークン: 20 = 0.02クレジット/トークン
  - 完了トークン: 100 = 0.1クレジット/トークン

## 値オブジェクト

### InternalCreditUnit
```rust
use catalog::pricing::InternalCreditUnit;

// クレジットから内部単位へ
let credits = Decimal::from_str("12.345").unwrap();
let internal = InternalCreditUnit::from_credits(credits);
assert_eq!(internal.value(), 12345);

// 内部単位からクレジットへ
let internal = InternalCreditUnit::new(12345);
assert_eq!(internal.to_credits(), Decimal::from_str("12.345").unwrap());
```

### 変換係数
```rust
pub const CONVERSION_FACTOR: i64 = 1000; // 1クレジット = 1000内部単位
```

## コンポーネント間の変換

### CatalogAppService → PaymentApp
```rust
// CatalogAppServiceはクレジット単位で返す
let cost_breakdown = catalog_app.calculate_service_cost(...).await?;
// cost_breakdown.total = 79.32 (クレジット)

// PaymentApp用に内部単位に変換（0.1クレジット = 1）
let payment_internal_units = (cost_breakdown.total * Decimal::from(10))
    .round()
    .to_i64()
    .unwrap_or(0);
// payment_internal_units = 793 (79.3クレジット)
```

## Agent API料金体系

### 基本料金
- 10クレジット/実行

### トークン料金（モデル別）

#### GPT-4.1
- プロンプト: 0.015クレジット/トークン（内部単位: 15）
- 完了: 0.045クレジット/トークン（内部単位: 45）

#### Claude Opus 4
- プロンプト: 0.02クレジット/トークン（内部単位: 20）
- 完了: 0.1クレジット/トークン（内部単位: 100）

#### Claude Sonnet 4
- プロンプト: 0.005クレジット/トークン（内部単位: 5）
- 完了: 0.025クレジット/トークン（内部単位: 25）

#### Gemini 2.5 Pro
- プロンプト: 0.002クレジット/トークン（内部単位: 2）
- 完了: 0.008クレジット/トークン（内部単位: 8）

#### Gemini 2.5 Flash
- プロンプト: 0.001クレジット/トークン（内部単位: 1）
- 完了: 0.002クレジット/トークン（内部単位: 2）

### ツール使用料金
- MCP検索: 50クレジット/回（内部単位: 50,000）
- MCPファイル読み取り: 20クレジット/回（内部単位: 20,000）
- MCPファイル書き込み: 30クレジット/回（内部単位: 30,000）
- MCPコマンド実行: 40クレジット/回（内部単位: 40,000）
- Web検索: 50クレジット/回（内部単位: 50,000）
- コード実行: 30クレジット/回（内部単位: 30,000）
- ファイル操作: 20クレジット/回（内部単位: 20,000）

## 計算例

### 例1: Claude Opus 4で1000トークン生成
```
基本料金: 10クレジット
プロンプト: 500トークン × 0.02 = 10クレジット
完了: 500トークン × 0.1 = 50クレジット
合計: 70クレジット（内部単位: 70,000）
Payment内部単位: 700
```

### 例2: 793.3クレジット問題の原因
```
誤った計算（100で割る）:
- DBの値: 20（プロンプト）、100（完了）
- 20 ÷ 100 = 0.2クレジット/トークン（10倍高い！）
- 100 ÷ 100 = 1.0クレジット/トークン（10倍高い！）

正しい計算（1000で割る）:
- DBの値: 20（プロンプト）、100（完了）
- 20 ÷ 1000 = 0.02クレジット/トークン ✓
- 100 ÷ 1000 = 0.1クレジット/トークン ✓
```

## トラブルシューティング

### 高額な課金が発生する場合
1. `ServiceCostCalculator`で正しい変換係数（1000）が使われているか確認
2. データベースの値が内部単位で保存されているか確認
3. Payment側とCatalog側の単位の違いに注意

### 単位変換のベストプラクティス
1. 常に`InternalCreditUnit`値オブジェクトを使用する
2. 生の数値ではなく、明示的な変換メソッドを使用する
3. テストケースで実際の金額を検証する

## 関連ファイル

- `/packages/catalog/src/pricing/price_unit.rs` - 値オブジェクトの定義
- `/packages/catalog/src/service_pricing/service_cost_calculator.rs` - コスト計算ロジック
- `/packages/llms/src/usecase/command_stack/billing_aware.rs` - Agent API課金実装
- `/scripts/seed-api-services.sql` - 料金設定のシードデータ