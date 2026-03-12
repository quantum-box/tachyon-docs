# NanoDollar課金システム

## 概要

NanoDollarシステムは、Tachyon Appsの課金システムにおいて、すべての金額をUSD建ての最小単位（NanoDollar）で統一的に扱うアーキテクチャです。これにより、複雑な単位変換を排除し、高精度な課金計算を実現します。

## システム設計

### 基本単位定義

```yaml
base_unit:
  name: NanoDollar
  symbol: nUSD
  definition: 1 USD = 1,000,000,000 nanodollars
  precision: 1 nanodollar = $0.000000001 (10^-9 USD)
  
data_type:
  storage: BIGINT (i64)
  range: -9,223,372,036,854,775,808 to 9,223,372,036,854,775,807
  max_usd: $9,223,372,036.85 (約9.2兆ドル)
```

### アーキテクチャ原則

1. **単一真実の源泉**: すべての金額はNanoDollar単位で保存
2. **変換の最小化**: 外部システムとの境界でのみ変換を実行
3. **型安全性**: NanoDollar型による厳密な型チェック
4. **精度保証**: 整数演算による丸め誤差の排除

## 実装詳細

### 値オブジェクト

```rust
// packages/llms/domain/src/nano_dollar.rs
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct NanoDollar(i64);

impl NanoDollar {
    pub const CONVERSION_FACTOR: i64 = 1_000_000_000;
    
    /// USDからNanoDollarへ変換
    pub fn from_usd(usd: Decimal) -> Self {
        Self((usd * Decimal::from(Self::CONVERSION_FACTOR))
            .round()
            .to_i64()
            .unwrap_or(0))
    }
    
    /// NanoDollarからUSDへ変換
    pub fn to_usd(&self) -> Decimal {
        Decimal::from(self.0) / Decimal::from(Self::CONVERSION_FACTOR)
    }
    
    /// Stripe cents への変換
    pub fn to_stripe_cents(&self) -> i64 {
        self.0 / 10_000_000
    }
    
    /// 加算
    pub fn add(&self, other: &Self) -> Result<Self, NanoDollarError> {
        self.0.checked_add(other.0)
            .map(Self)
            .ok_or(NanoDollarError::Overflow)
    }
}
```

### データベーススキーマ

```sql
-- USD残高管理テーブル
CREATE TABLE `usd_balances` (
    `tenant_id` VARCHAR(29) NOT NULL,
    `current_balance_nanodollars` BIGINT NOT NULL DEFAULT 0,
    `reserved_nanodollars` BIGINT NOT NULL DEFAULT 0,
    `currency` ENUM('JPY', 'USD') NOT NULL DEFAULT 'JPY',
    `last_updated` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`tenant_id`),
    CHECK (`current_balance_nanodollars` >= 0),
    CHECK (`reserved_nanodollars` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 取引履歴テーブル
CREATE TABLE `usd_transactions` (
    `id` VARCHAR(32) NOT NULL,
    `tenant_id` VARCHAR(29) NOT NULL,
    `amount_nanodollars` BIGINT NOT NULL,
    `transaction_type` ENUM('CHARGE', 'CONSUMPTION', 'REFUND') NOT NULL,
    `description` TEXT,
    `metadata` JSON,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX idx_tenant_created (`tenant_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### GraphQL API

```graphql
type UsdBalance {
  """現在の残高（NanoDollar単位）"""
  currentBalanceNanodollars: BigInt!
  
  """予約済み金額（NanoDollar単位）"""
  reservedNanodollars: BigInt!
  
  """利用可能残高（NanoDollar単位）"""
  availableBalanceNanodollars: BigInt!
  
  """USD表示用の現在残高"""
  currentBalanceUsd: Float!
  
  """通貨"""
  currency: Currency!
}

type ConsumptionRecord {
  """消費ID"""
  id: ID!
  
  """消費金額（NanoDollar単位）"""
  amountNanodollars: BigInt!
  
  """USD表示用の消費金額"""
  amountUsd: Float!
  
  """リソースタイプ"""
  resourceType: String!
  
  """消費日時"""
  consumedAt: DateTime!
}
```

### フロントエンド実装

```typescript
// packages/ui/src/utils/currency.ts
export const formatNanoDollarsToUsd = (nanodollars: bigint): string => {
  const usd = Number(nanodollars) / 1_000_000_000;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 9, // 最大9桁（NanoDollar精度）
  }).format(usd);
};

// コンポーネントでの使用例
const BalanceDisplay: React.FC<{ balance: bigint }> = ({ balance }) => {
  return (
    <div className="text-2xl font-bold">
      {formatNanoDollarsToUsd(balance)}
    </div>
  );
};
```

## 外部システム連携

### Stripe統合

```rust
/// Stripeへの請求作成
pub async fn create_stripe_charge(
    amount_nanodollars: NanoDollar,
    customer_id: &str,
) -> Result<ChargeId> {
    let amount_cents = amount_nanodollars.to_stripe_cents();
    
    // Stripeは最小1セント
    if amount_cents < 1 {
        return Err(PaymentError::AmountTooSmall);
    }
    
    let charge = stripe::Charge::create(
        &stripe_client,
        CreateCharge {
            amount: amount_cents,
            currency: Currency::USD,
            customer: Some(customer_id.to_string()),
            ..Default::default()
        },
    ).await?;
    
    Ok(charge.id)
}
```

### LLMプロバイダー料金

```yaml
# プロバイダー別料金設定（NanoDollar単位）
providers:
  anthropic:
    models:
      claude-3.5-sonnet:
        input_per_token: 3_000      # $0.000003
        output_per_token: 15_000    # $0.000015
      claude-opus-4:
        input_per_token: 15_000     # $0.000015
        output_per_token: 75_000    # $0.000075
        
  openai:
    models:
      gpt-4.1:
        input_per_token: 2_000      # $0.000002
        output_per_token: 8_000     # $0.000008
      gpt-4o-mini:
        input_per_token: 150        # $0.00000015
        output_per_token: 600       # $0.0000006
```

## 移行戦略

### Feature Flagによる段階的移行

```rust
pub struct BillingService {
    feature_flags: Arc<dyn FeatureFlagService>,
}

impl BillingService {
    pub async fn get_balance(&self, tenant_id: &TenantId) -> Result<Balance> {
        if self.feature_flags.is_enabled("usd_pricing", tenant_id).await? {
            // 新システム: NanoDollar使用
            let balance = self.usd_repository.get_balance(tenant_id).await?;
            Ok(Balance::Usd(balance))
        } else {
            // 旧システム: クレジット使用
            let balance = self.credit_repository.get_balance(tenant_id).await?;
            Ok(Balance::Credit(balance))
        }
    }
}
```

### データ移行

```sql
-- クレジットからNanoDollarへの移行スクリプト
INSERT INTO usd_balances (
    tenant_id,
    current_balance_nanodollars,
    reserved_nanodollars,
    currency
)
SELECT 
    tenant_id,
    -- クレジット × 100 = セント、セント × 10,000,000 = NanoDollar
    credit_balance * 1_000_000_000,
    0 as reserved_nanodollars,
    'USD' as currency
FROM credit_balances
WHERE migration_completed = 0;
```

## 運用監視

### メトリクス

```yaml
metrics:
  balance_operations:
    - name: nanodollar_balance_update_duration
      type: histogram
      labels: [operation_type, status]
      
    - name: nanodollar_balance_total
      type: gauge
      labels: [tenant_id]
      
  conversions:
    - name: nanodollar_conversion_errors
      type: counter
      labels: [from_currency, to_currency, error_type]
      
  precision:
    - name: nanodollar_rounding_adjustments
      type: histogram
      description: "変換時の丸め調整額"
```

### アラート設定

```yaml
alerts:
  - name: NanoDollarOverflow
    condition: balance_nanodollars > 9_000_000_000_000_000_000
    severity: critical
    message: "NanoDollar値がオーバーフロー閾値に接近"
    
  - name: NegativeBalance
    condition: current_balance_nanodollars < 0
    severity: critical
    message: "負の残高が検出されました"
    
  - name: LargePrecisionLoss
    condition: rounding_adjustment > 1_000_000  # $0.001以上
    severity: warning
    message: "大きな精度損失が発生"
```

## セキュリティ考慮事項

### 入力検証

```rust
impl NanoDollar {
    pub fn validate_amount(amount: i64) -> Result<(), ValidationError> {
        if amount < 0 {
            return Err(ValidationError::NegativeAmount);
        }
        
        if amount > Self::MAX_SAFE_VALUE {
            return Err(ValidationError::AmountTooLarge);
        }
        
        Ok(())
    }
}
```

### 監査ログ

```rust
#[derive(Serialize)]
struct BalanceAuditLog {
    tenant_id: TenantId,
    operation: BalanceOperation,
    amount_nanodollars: i64,
    balance_before: i64,
    balance_after: i64,
    operator_id: UserId,
    timestamp: DateTime<Utc>,
    request_id: Uuid,
}
```

## パフォーマンス最適化

### インデックス戦略

```sql
-- 残高照会の高速化
CREATE INDEX idx_usd_balances_tenant_currency 
ON usd_balances(tenant_id, currency);

-- 取引履歴の集計最適化
CREATE INDEX idx_usd_transactions_tenant_date_type 
ON usd_transactions(tenant_id, created_at, transaction_type);

-- 月次集計用
CREATE INDEX idx_usd_transactions_monthly 
ON usd_transactions(
    tenant_id, 
    DATE_FORMAT(created_at, '%Y-%m'),
    transaction_type
);
```

### キャッシュ戦略

```rust
pub struct CachedBalanceService {
    cache: Arc<dyn Cache>,
    repository: Arc<dyn UsdBalanceRepository>,
}

impl CachedBalanceService {
    pub async fn get_balance(&self, tenant_id: &TenantId) -> Result<NanoDollar> {
        let cache_key = format!("balance:nanodollar:{}", tenant_id);
        
        // キャッシュチェック
        if let Some(cached) = self.cache.get::<i64>(&cache_key).await? {
            return Ok(NanoDollar(cached));
        }
        
        // DBから取得
        let balance = self.repository.get_balance(tenant_id).await?;
        
        // キャッシュ更新（TTL: 5分）
        self.cache.set(&cache_key, balance.as_i64(), Duration::minutes(5)).await?;
        
        Ok(balance)
    }
}
```

## まとめ

NanoDollarシステムは、以下の利点を提供します：

1. **単純性**: 単一の基準単位による統一的な処理
2. **精度**: 整数演算による正確な計算
3. **拡張性**: 将来の通貨追加や料金体系変更への対応が容易
4. **保守性**: 複雑な変換ロジックの排除によるバグリスクの低減
5. **監査性**: すべての金額が同一単位で記録されるため追跡が容易

このアーキテクチャにより、Tachyon Appsは信頼性の高い課金システムを実現しています。