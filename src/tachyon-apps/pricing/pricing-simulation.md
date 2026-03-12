# 価格シミュレーション

## 概要

価格シミュレーションは、既存の Pricing Policy を選択し、マークアップ率の変更が
サービス価格と収益影響に与える結果を**即時に試算**する機能。
実際の価格を更新するのではなく、意思決定のための「試算」を提供する。

## 対象ユーザー

- Pricing / Sales / 事業企画担当
- 価格改定や収益影響の検討を行うオペレーター

## 主なユースケース

- 既存ポリシーのマークアップ率を変更した場合の**差分確認**
- 価格差分・差分率をテーブルで比較
- 直近の試算結果を復元して再検討

## 画面と操作フロー

- 画面: `/v1beta/[tenant_id]/pricing/analysis`
- 操作:
  1. Pricing Policy を選択
  2. マークアップ率を入力（数値入力 + スライダー）
  3. 「シミュレーション実行」を押下
  4. サマリーカードと価格差分テーブルを確認

## 機能仕様

### 入力

- `policyId`: テナント内の Pricing Policy
- `newMarkupRate`: 新しいマークアップ率（小数）

### 表示

- **サマリー**:
  - 元のマークアップ率
  - シミュレーション後マークアップ率
  - 推定収益インパクト（USD）
- **テーブル**:
  - リソース別の現行価格 / 新価格 / 差分額 / 差分率
  - USD 表示 + NanoDollar 表示（Tooltip）

### バリデーション

- `newMarkupRate` はポリシーの `minMarkupRate` 〜 `maxMarkupRate` の範囲に制限
- 範囲外の場合はエラー表示し、API を呼ばない

### 永続化

- 直近の実行パラメータと結果を `localStorage` に保存
- ページ再訪時に復元（ポリシー・マークアップ値・結果）

### エラーハンドリング

- GraphQL エラー発生時はエラーパネルを表示
- 「再試行」ボタンで再実行可能

## データフロー（GraphQL）

### 1. ポリシー一覧取得

- Query: `pricingPolicies(tenantId)`

### 2. シミュレーション実行

- Query: `pricingSimulation(tenantId, policyId, newMarkupRate)`
- 返却:
  - `originalMarkupRate`
  - `simulatedMarkupRate`
  - `estimatedRevenueImpact`
  - `priceChanges[]`

## 依存コンポーネント

- **Catalog コンテキスト**
  - `simulate_price_change` の提供
  - Decimal → USD 変換
- **Frontend（tachyon）**
  - PriceAnalysis UI
  - localStorage の保存・復元

## 制約・注意事項

- 価格が未設定のサービスは差分 0 になる
- 価格の実際の更新は別画面（サービス価格マッピング）で行う

## 関連画面・ドキュメント

- [価格設定機能 overview](./overview.md)
- [APIサービス管理](./api-services-management.md)
- [APIサービス価格マッピング UI 改修](./api-service-price-mapping-clarity.md)
