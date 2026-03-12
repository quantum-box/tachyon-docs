# 調達・価格設定システム実装詳細

## 実装済み機能一覧

### 1. バックエンド実装

#### Procurementパッケージ (packages/procurement)

##### ドメイン層
```rust
// エンティティ
- Supplier: サプライヤー情報管理
- SupplyContract: 調達契約管理
- ProcurementPrice: 調達価格（階層価格対応）

// 値オブジェクト
- SupplierId, ContractId, ProcurementPriceId (ULID)
- SupplierType (LLM_PROVIDER, INFRASTRUCTURE, SERVICE)
- SupplierStatus (Active, Inactive, Suspended)
- ContractStatus (DRAFT, ACTIVE, EXPIRED, TERMINATED)
- Currency (JPY, USD)
- UnitType (PerMillionTokens, PerRequest, PerHour)
- TierPrice: 階層価格設定
```

##### リポジトリ実装 (SQLx)
- SqlxSupplierRepository
- SqlxContractRepository
- SqlxPriceRepository

##### ユースケース
- ListProcurementPrices: 調達価格一覧取得
- GetSupplier, ListSuppliers: サプライヤー管理
- GetContract, ListContracts: 契約管理

#### GraphQL API (packages/procurement/src/graphql)

##### Query実装
```rust
// 調達価格取得
async fn procurement_prices_by_tenant(tenant_id: String) -> Vec<ProcurementPriceType>

// 契約取得
async fn supply_contracts_by_tenant(tenant_id: String) -> Vec<SupplyContractType>

// サプライヤー取得（モックデータ）
async fn suppliers_by_tenant(tenant_id: String) -> Vec<SupplierType>
```

##### 型定義
- GraphQL型はsnake_caseからcamelCaseへの自動変換
- `#[graphql(name = "fieldName")]`でフィールド名を明示的に指定

### 2. フロントエンド実装

#### 調達管理画面 (/procurement)

##### 調達原価一覧 (ProcurementPriceList)
- **機能**:
  - リソースタイプ別の調達価格表示
  - 階層価格（Tier Pricing）の可視化
  - フィルタリング: リソースタイプ、サプライヤー
  - 統計情報: 総アイテム数、サプライヤー数、平均価格
  - 価格詳細: 基本価格、階層価格、有効期間
- **GraphQLクエリ**: `procurement/queries/procurementPrices.graphql`

##### サプライヤー一覧 (SupplierList)
- **機能**:
  - サプライヤー情報の一覧表示
  - ステータス別フィルタリング（Active/Inactive）
  - 検索機能（サプライヤー名）
  - 統計カード: 総数、アクティブ数、非アクティブ数
  - 連絡先情報表示（メール、電話、住所）
- **GraphQLクエリ**: `procurement/suppliers/queries/suppliers.graphql`

##### 契約一覧 (SupplyContractList)
- **機能**:
  - 調達契約の一覧表示
  - ステータス別フィルタリング（ACTIVE/DRAFT/EXPIRED）
  - サプライヤー別フィルタリング
  - 統計カード: 総数、アクティブ、ドラフト、期限切れ
  - 契約期間の表示
- **GraphQLクエリ**: `procurement/contracts/queries/supplyContracts.graphql`

#### 価格設定画面 (/pricing)

##### 価格ポリシー一覧 (PricingPolicyList)
- **機能**:
  - ポリシーカードグリッド表示
  - ステータス表示（Active/Draft/Archived）
  - マークアップ率の可視化
  - ポリシー作成・編集ダイアログ
- **GraphQLクエリ**: `pricing/queries/pricingPolicies.graphql`

##### ポリシー詳細・ルール管理 (/pricing/[policyId])
- **機能**:
  - ポリシー詳細情報表示
  - ルール一覧（優先度順）
  - ルール追加・編集（JSONエディタ付き）
  - 価格シミュレーター統合

##### 価格シミュレーター (PriceSimulator)
- **機能**:
  - リアルタイム価格計算
  - 基本価格からの計算過程表示
  - ルール適用の可視化
  - 最終価格の表示

##### 顧客セグメント管理 (/pricing/segments)
- **機能**:
  - セグメント一覧表示
  - セグメント作成・編集
  - 割引率設定

##### 価格分析 (/pricing/analysis)
- **機能**:
  - 収益トレンドチャート
  - マークアップ率分析
  - 最適化提案
  - 空データ時の適切な表示

### 3. データベース設計

#### 調達関連テーブル
```sql
-- サプライヤー
suppliers (id, name, supplier_type, currency, status, contact_*, address)

-- 調達契約
supply_contracts (id, supplier_id, contract_number, contract_name, status, dates)

-- 調達価格
procurement_prices (id, contract_id, resource_type, unit_type, base_cost, tier_pricing)
```

#### 価格設定関連テーブル
```sql
-- 価格ポリシー
pricing_policies (id, tenant_id, policy_name, markup_rates, status)

-- 価格ルール
pricing_rules (id, policy_id, rule_type, conditions, adjustments)

-- 顧客価格
customer_prices (id, tenant_id, resource_type, prices, policy_id, procurement_price_id)

-- 顧客セグメント
customer_segments (id, tenant_id, segment_name, discount_rate)
```

### 4. 技術的な実装詳細

#### GraphQLコード生成
- `.graphql`ファイルからTypeScript型を自動生成
- `yarn codegen --filter=tachyon`で実行
- 生成先: `apps/tachyon/src/gen/graphql.ts`

#### エラーハンドリング
- "missing field `resource_type`"エラー: volume_discountsのJSON構造問題
  - 解決: 空配列`[]`に設定
- Apollo Client SSRエラー: `ssr: false`で解決

#### 認証・マルチテナンシー
- ヘッダー: `x-operator-id`でテナントID指定
- GraphQLクエリにtenantIdパラメータを含める

## 未実装機能

### バックエンド
1. サプライヤーのCRUD操作（現在はモックデータ）
2. 契約の作成・更新・終了処理
3. 価格の登録・更新処理
4. 権限チェック機能
5. 価格変更履歴の記録とAPI

### フロントエンド
1. サプライヤー登録・編集機能
2. 契約登録・編集機能
3. 調達価格の登録・編集機能
4. 価格変更履歴の表示UI
5. 為替レート管理機能
6. 競合価格分析機能

### 運用機能
1. 価格変更通知システム
2. 利益率レポート
3. 自動価格最適化
4. 監査ログ表示

## 設定・環境

### 開発環境
- GraphQLエンドポイント: `http://localhost:50054/graphql`
- テナントID（開発用）: `tn_01hjjn348rn3t49zz6hvmfq67p`
- データベース: `tachyon_apps_procurement`（ポート15000）

### テストデータ
- `scripts/seed-procurement-data.sql`でテストデータ投入
- OpenAI、Anthropicのサンプル価格データ含む

## トラブルシューティング

### よくあるエラー
1. **GraphQL型エラー**: コード生成を再実行（`yarn codegen`）
2. **SSRエラー**: useQueryに`ssr: false`を追加
3. **認証エラー**: x-operator-idヘッダーを確認
4. **データベース接続エラー**: ポート番号（15000）を確認