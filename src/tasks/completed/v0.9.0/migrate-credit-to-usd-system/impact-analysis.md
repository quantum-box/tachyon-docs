---
title: "クレジット→USD移行 影響分析詳細"
type: "analysis"
emoji: "🔍"
---

# クレジット→USD移行 影響分析詳細

## 影響度評価基準

- **高**: 破壊的変更、ユーザー影響大、即座の対応必要
- **中**: 内部変更、間接的影響、段階的対応可能
- **低**: 表示のみ、コメント、設定値

## カテゴリ別影響分析

### 1. データベース層

#### 高影響度テーブル
| テーブル名 | カラム | 現在の単位 | 移行後 | 備考 |
|-----------|--------|-----------|--------|------|
| credit_balances → usd_balances | current_balance | クレジット×10 | nanodollars | テーブル名変更 |
| credit_balances → usd_balances | reserved_credits → reserved_amount | クレジット×10 | nanodollars | カラム名も変更 |
| credit_transactions → usd_transactions | amount | クレジット×10 | nanodollars | テーブル名変更 |
| credit_packages → usd_packages | credits → amount | クレジット×10 | nanodollars | テーブル&カラム名変更 |
| service_price_mappings | fixed_price | クレジット×1000 | nanodollars | 1内部単位=10,000n$ |
| product_usage_pricing | rate_per_unit | クレジット×1000 | nanodollars | |

#### 中影響度テーブル
| テーブル名 | カラム | 現在の単位 | 移行後 | 備考 |
|-----------|--------|-----------|--------|------|
| agent_execution_costs | total_cost | クレジット×10 | nanodollars | |
| billing_policies | free_trial_credits → free_trial_amount | クレジット×10 | nanodollars | カラム名変更 |
| billing_policies | monthly_credit_limit → monthly_limit_amount | クレジット×10 | nanodollars | カラム名変更 |

### 2. API層

#### GraphQL スキーマ変更

**現在のスキーマ**
```graphql
type CreditBalance {
  tenantId: ID!
  currentBalance: Float! # クレジット
  reservedCredits: Float! # クレジット
  currency: Currency!
}

type CreditTransaction {
  amount: Float! # クレジット
  description: String!
}

type CreditPackage {
  id: ID!
  name: String!
  credits: Int! # クレジット数
  price: Int! # 円またはセント
}
```

**移行後のスキーマ**
```graphql
type UsdBalance {
  tenantId: ID!
  currentBalance: Float! # USD
  reservedAmount: Float! # USD
  currency: Currency! # 常にUSD
}

type UsdTransaction {
  amount: Float! # USD
  description: String!
}

type UsdPackage {
  id: ID!
  name: String!
  amount: Float! # USD
  price: Int! # 円またはセント（変更なし）
}
```

### 3. フロントエンド影響

#### 表示変更が必要な箇所

**高優先度**
- 残高表示: "10,000 クレジット" → "$100.00"
- 購入オプション: "1,000 クレジット" → "$10.00"
- 料金表: "0.02 クレジット/トークン" → "$0.0002/トークン"
- エラーメッセージ: "クレジットが不足" → "残高が不足"
- ボタンテキスト: "クレジットを購入" → "チャージする"

**中優先度**
- 取引履歴の金額表示
- 統計グラフの単位
- CSVエクスポートのヘッダー

### 4. 計算ロジックの変更

#### 現在の計算フロー
```
API価格($) → クレジット(×100) → 内部単位(×10 or ×1000) → DB保存
```

#### 移行後の計算フロー
```
API価格($) → nanodollars(×1,000,000,000) → DB保存
```

#### 具体例
```
Claude Sonnet 4 Input料金:
現在: $0.000003 → 0.0003クレジット → 0.3内部単位 → DB: 0 (精度不足!)
     正しくは: → 0.3内部単位 → 3(×10) → DB: 3
移行後: $0.000003 → 3,000 nanodollars → DB: 3000

Gemini Flash-Lite Input料金:
移行後: $0.0000001 → 100 nanodollars → DB: 100

10万トークンの計算:
現在: 100,000 × 0.0003クレジット = 30クレジット → DB: 300（クレジット×10）
移行後: 100,000 × 3,000 nanodollars = 300,000,000 nanodollars = $0.30
      DB値の変換: 300 × 1,000,000 = 300,000,000 nanodollars ✓
```

### 5. 移行時の変換式

#### データベース値の変換
```sql
-- テーブル名の変更
ALTER TABLE credit_balances RENAME TO usd_balances;
ALTER TABLE credit_transactions RENAME TO usd_transactions;
ALTER TABLE credit_packages RENAME TO usd_packages;

-- カラム名の変更
ALTER TABLE usd_balances RENAME COLUMN reserved_credits TO reserved_amount;
ALTER TABLE usd_packages RENAME COLUMN credits TO amount;
ALTER TABLE billing_policies RENAME COLUMN free_trial_credits TO free_trial_amount;
ALTER TABLE billing_policies RENAME COLUMN monthly_credit_limit TO monthly_limit_amount;

-- 値の変換
-- usd_balances (クレジット×10 → nanodollars)
-- 1単位 = 0.1クレジット = $0.001 = 1,000,000 nanodollars
-- したがって、クレジット×10の値に1,000,000を掛ける
UPDATE usd_balances 
SET current_balance = current_balance * 1000000,
    reserved_amount = reserved_amount * 1000000;

-- service_price_mappings (内部単位 → nanodollars)
-- 現在: 1内部単位 = 0.001クレジット = $0.00001 = 10,000 nanodollars
UPDATE service_price_mappings 
SET fixed_price = fixed_price * 10000;

-- 具体例:
-- Claude Sonnet 4 Input: 現在5(0.005クレジット) → 50,000 nanodollars
-- Claude Sonnet 4 Output: 現在25(0.025クレジット) → 250,000 nanodollars
-- Gemini Flash-Lite Input: → 100 nanodollars
```

### 6. リスク分析

#### 技術的リスク
1. **精度損失**: 小数点演算での丸め誤差
2. **オーバーフロー**: 大きな値での整数オーバーフロー
3. **並行処理**: 移行中の新規取引との整合性

#### ビジネスリスク
1. **ユーザー混乱**: 単位変更による理解困難
2. **請求誤り**: 変換ミスによる課金エラー
3. **外部連携**: Stripe APIとの不整合

#### Stripe統合の対応
```rust
// Stripeは最小単位がcent（$0.01）
// nanodollar → cent変換時の丸め処理
fn nanodollars_to_cents(nanodollars: i64) -> i64 {
    // 1 cent = 10,000,000 nanodollars
    // 切り上げ処理（ユーザーに不利にならないように）
    (nanodollars + 9_999_999) / 10_000_000
}

// 例: 15,000,000 nanodollars = 1.5 cents → 2 cents（切り上げ）
```

### 7. 段階的移行プラン

#### Phase 1: 準備（1週間）
- [ ] 新しい値オブジェクト作成
- [ ] 並行稼働用のFeature Flag実装
- [ ] テストケースの準備

#### Phase 2: 並行稼働（2週間）
- [ ] 読み取りは両方対応
- [ ] 書き込みは旧システム
- [ ] 監視とログ収集

#### Phase 3: 切り替え（1週間）
- [ ] 書き込みを新システムに
- [ ] データ移行バッチ実行
- [ ] 動作確認

#### Phase 4: クリーンアップ（1週間）
- [ ] 旧コード削除
- [ ] ドキュメント更新
- [ ] 最終確認

### 8. テスト重点項目

1. **境界値テスト**
   - 最小単位: $0.000000001 (1 nanodollar)
   - 最大値: 約$9,200,000,000 (i64制限: 9,223,372,036,854,775,807 nanodollars)
   - ゼロ値処理
   - 負の値のハンドリング（エラーとする）

2. **変換精度テスト**
   - 1000クレジット（削除前） = $10.00 = 10,000,000,000 nanodollars
   - 0.001クレジット（削除前） = $0.00001 = 10,000 nanodollars
   - Claude Sonnet 4: 1トークン = 3,000 nanodollars (input)
   - Gemini Flash-Lite: 1トークン = 100 nanodollars (input)
   - 丸め処理の確認

3. **後方互換性テスト**
   - 既存APIの動作確認
   - 移行期間中の並行動作

### 9. 監視項目

- エラー率の変化
- 処理時間の変化
- Stripe APIのレスポンス
- ユーザーからの問い合わせ数

### 10. ロールバック計画

1. Feature Flagで即座に旧システムに戻す
2. データベースのバックアップから復元
3. 変換処理を逆実行するスクリプト準備