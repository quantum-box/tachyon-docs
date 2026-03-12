---
title: "USD移行 実装ガイドライン"
type: "guide"
emoji: "📐"
---

# USD移行 実装ガイドライン

## 実装時の重要な注意事項

### 1. 価格設定の修正

**⚠️ 重要**: ハードコードされている価格は実際のAPI価格と一致していなければなりません。

現在のドキュメントには、実際のAPI価格に対して以下のような**誤った価格**が記載されています：
- Claude Opus 4: 実際の13倍の価格
- GPT-4.1: 実際の7.5倍の価格
- その他のモデル: 様々な倍率

**正しいアプローチ**：
```rust
// ✅ 正しい実装
let api_price = pricing_provider.get_model_token_pricing("claude-4-sonnet").await?;
let nanodollars = NanoDollar::from_usd(api_price.input_token_cost);

// ❌ 避けるべき実装
let hardcoded_price = 0.02; // これは実際のAPI価格の13倍
```

マークアップが必要な場合は、設定値として動的に適用してください。

### 2. 型安全性の確保

```rust
// ❌ 避けるべき実装
let price_nanodollars = usd_amount * 1000000000;

// ✅ 推奨実装
let price = NanoDollar::from_usd(usd_amount);
```

常に値オブジェクトを使用し、生の数値計算を避けてください。

### 3. オーバーフロー対策

```rust
impl NanoDollar {
    pub fn from_usd(usd: Decimal) -> Result<Self, Error> {
        let nanodollars = usd * Decimal::from(Self::CONVERSION_FACTOR);
        
        // i64の範囲チェック
        if nanodollars > Decimal::from(i64::MAX) {
            return Err(Error::Overflow("Amount too large"));
        }
        
        Ok(Self(nanodollars.round().to_i64().unwrap_or(0)))
    }
}
```

### 4. Feature Flag実装

```rust
// settings.toml
[features]
usd_pricing = false  # 本番ではfalseから開始

// コード内での使用
pub struct FeatureFlags {
    usd_pricing: bool,
}

impl FeatureFlags {
    pub fn is_usd_pricing_enabled(&self) -> bool {
        self.usd_pricing && !cfg!(test) // テスト時は常に旧システム
    }
}
```

### 5. データ移行の安全性

```sql
-- トランザクション内で実行
BEGIN;

-- バックアップテーブルの作成
CREATE TABLE credit_balances_backup AS SELECT * FROM credit_balances;

-- 移行実行
ALTER TABLE credit_balances RENAME TO usd_balances;
-- その他の移行処理...

-- 検証クエリ
SELECT 
    COUNT(*) as total,
    SUM(CASE WHEN current_balance < 0 THEN 1 ELSE 0 END) as negative_values
FROM usd_balances;

-- 問題があればROLLBACK、なければCOMMIT
COMMIT;
```

### 6. API後方互換性

```graphql
type BalanceResponse {
    # 移行期間中は両方のフィールドを提供
    currentBalance: Float @deprecated(reason: "Use currentBalanceUsd")
    currentBalanceUsd: Float!
    
    # デバッグ用（開発環境のみ）
    _debug: DebugInfo
}

type DebugInfo {
    nanodollars: String
    conversionRate: Float
}
```

### 7. ログとモニタリング

```rust
// 重要な変換処理にはログを追加
fn convert_credit_to_nanodollars(credits: i64) -> i64 {
    let nanodollars = credits * 1_000_000;
    
    info!(
        "Credit conversion: {} credits -> {} nanodollars",
        credits, nanodollars
    );
    
    // メトリクスも記録
    metrics::counter!("credit_conversion_total").increment(1);
    
    nanodollars
}
```

### 8. エラーハンドリング

```rust
// 変換エラーは明確に
#[derive(Debug, thiserror::Error)]
pub enum ConversionError {
    #[error("Value overflow: {0} exceeds maximum")]
    Overflow(Decimal),
    
    #[error("Negative value not allowed: {0}")]
    NegativeValue(Decimal),
    
    #[error("Precision loss: {0} cannot be represented exactly")]
    PrecisionLoss(Decimal),
}
```

## 曖昧な部分の明確化

### Q1: Stripeの負の値はどう扱う？
**A**: 移行後はStripeネイティブの正の値（cents）を使用します。負の値は使用しません。

### Q2: 小数点以下の丸め方は？
**A**: 
- ユーザー表示: 小数点第2位まで表示（$12.34）
- 内部計算: 常にnanodollars（整数）で計算
- Stripe請求: cents単位で切り上げ（ユーザー有利にならないように）

### Q3: 移行期間中のデータ整合性は？
**A**: 
- 読み取り: 両システムから読み取り、Feature Flagで切り替え
- 書き込み: 旧システムのみに書き込み
- 同期: バッチ処理で定期的に新システムに同期

### Q4: テストデータはどうする？
**A**: 
```rust
#[cfg(test)]
mod test_helpers {
    pub fn create_test_balance() -> UsdBalance {
        UsdBalance {
            tenant_id: "test_tenant".into(),
            balance_nanodollars: 10_000_000_000, // $10.00
        }
    }
}
```

## チェックリスト

実装前に確認：
- [ ] ビジネスチームと価格戦略を確認
- [ ] Feature Flag環境を準備
- [ ] データベースバックアップ手順を確認
- [ ] ロールバック手順を文書化
- [ ] モニタリングダッシュボードを準備

実装中に確認：
- [ ] すべての変換に値オブジェクトを使用
- [ ] 重要な処理にログを追加
- [ ] エラーケースのテストを作成
- [ ] API後方互換性を維持

実装後に確認：
- [ ] パフォーマンステストを実施
- [ ] 移行スクリプトをdry-runで検証
- [ ] ドキュメントを最新化
- [ ] チームにデモを実施