# 階層型テナント価格設定システム（Pricing Context）Phase 1 & 2

## 概要

Tachyonのテナント階層（Host → Platform → Operator）において、各層が独自のマージンを設定して下流に販売する流通チェーン型の価格モデルを実装する。

## ステータス: 完了

## Phase 1: Pricing Context 基盤構築 ✅

- ドメインモデル（SKU, RateCard, PriceAdjustment, ResolvedPrice）
- SQLxリポジトリ実装（3テーブル: pricing_skus, pricing_rate_cards, pricing_adjustments）
- DBマイグレーション
- PricingApp SDKトレイト
- PriceResolver usecase（再帰的価格解決）
- 管理usecase（CRUD）
- 単体テスト22件パス

### 主要ファイル

| ファイル | 内容 |
|---------|------|
| `packages/pricing/domain/src/sku.rs` | SKUエンティティ |
| `packages/pricing/domain/src/rate_card.rs` | RateCard + PricingStrategy |
| `packages/pricing/domain/src/price_adjustment.rs` | PriceAdjustment + AdjustmentType |
| `packages/pricing/domain/src/resolved_price.rs` | ResolvedPrice（値オブジェクト） |
| `packages/pricing/domain/src/repository.rs` | リポジトリトレイト |
| `packages/pricing/src/usecase/resolve_price.rs` | 価格解決ロジック |
| `packages/pricing/src/usecase/manage_sku.rs` | SKU CRUD |
| `packages/pricing/src/usecase/manage_rate_card.rs` | RateCard CRUD |
| `packages/pricing/src/usecase/manage_adjustment.rs` | Adjustment CRUD |
| `packages/pricing/src/adapter/gateway/` | SQLxリポジトリ実装 |

## Phase 2: REST API + シナリオテスト + GraphQL + フロントエンド ✅

### Step 1: Usecaseに認可チェック追加 ✅

各管理usecaseに `executor`/`multi_tenancy` + `auth_app.check_policy()` を追加。
アクション名: `pricing:CreateSku`, `pricing:UpdateSku`, `pricing:ListSkus`, `pricing:DeleteSku` 等13件。

### Step 2: Auth Policy Seeds ✅

`scripts/seeds/n1-seed/008-auth-policies.yaml` に13アクション、PricingFullAccessPolicy、PricingReadOnlyPolicy を追加。AdminPolicyにも全アクション紐付け。

### Step 3: AppBuilder拡張 ✅

`PricingApp` 構造体に管理usecaseを追加し、`auth_app` を注入して構築。

### Step 4: REST エンドポイント (16個) ✅

| Method | Path | Handler |
|--------|------|---------|
| POST | `/v1/pricing/skus` | create_sku |
| GET | `/v1/pricing/skus` | list_skus |
| GET | `/v1/pricing/skus/:sku_id` | get_sku |
| PUT | `/v1/pricing/skus/:sku_id` | update_sku |
| DELETE | `/v1/pricing/skus/:sku_id` | delete_sku |
| POST | `/v1/pricing/rate-cards` | create_rate_card |
| GET | `/v1/pricing/rate-cards` | list_rate_cards |
| GET | `/v1/pricing/rate-cards/:id` | get_rate_card |
| PUT | `/v1/pricing/rate-cards/:id` | update_rate_card |
| DELETE | `/v1/pricing/rate-cards/:id` | delete_rate_card |
| POST | `/v1/pricing/adjustments` | create_adjustment |
| GET | `/v1/pricing/adjustments` | list_adjustments |
| GET | `/v1/pricing/adjustments/:id` | get_adjustment |
| PUT | `/v1/pricing/adjustments/:id` | update_adjustment |
| DELETE | `/v1/pricing/adjustments/:id` | delete_adjustment |
| POST | `/v1/pricing/resolve` | resolve_price |

主要ファイル:
- `packages/pricing/src/adapter/axum/mod.rs`
- `packages/pricing/src/adapter/axum/models.rs`

### Step 5: DI配線 ✅

- `apps/tachyon-api/src/di.rs`: `ProcurementCostBridge` 構造体、`pricing_db` 初期化、`pricing_app` 追加
- `apps/tachyon-api/src/router.rs`: `.merge(pricing::axum_adapter::create_router())`
- `apps/tachyon-api/src/main.rs`: `.data(deps.pricing_app.clone())`

### Step 6: シナリオテスト ✅

`apps/tachyon-api/tests/scenarios/pricing_rest.scenario.md` を作成。
全15ステップ（SKU CRUD 4 + RateCard CRUD 4 + Adjustment CRUD 4 + クリーンアップ 3）が成功。

#### 実装時の注意点

- PricingStrategy の serde: `#[serde(tag = "type")]` + lowercase rename
  - `markup`, `fixed`, `markup_plus_fixed`, `passthrough`, `free`
- AdjustmentType の serde: 同様
  - `discount_rate`, `fixed_discount`, `price_override`, `free_override`
- SKU enum (SkuCategory, UnitType, SkuStatus): CamelCase（`LlmInputToken`, `Token`, `Active`）

### Step 7: GraphQL リゾルバー ✅

- `packages/pricing/src/adapter/graphql/mod.rs`: PricingSkuQuery + PricingSkuMutation
- `packages/pricing/src/adapter/graphql/types.rs`: GqlSku, GqlRateCard 等
- `apps/tachyon-api/src/graphql/resolver.rs` に登録済み

### Step 8: フロントエンド管理画面 ✅

`apps/tachyon/src/app/v1beta/[tenant_id]/pricing/` 配下にSKU管理、料金表管理、価格調整管理、価格解決ツールのページが実装済み。

## Post-Phase 2: コード品質リファクタリング

Phase 2 の REST API 実装後に行ったコード品質改善。ブランチ: `feat/pricing-phase2-api`

### ドメインフィールドのカプセル化 ✅

- SKU, RateCard, PriceAdjustment の全フィールドを `private` に変更
- `Text` 値オブジェクト（`value_object::Text`）を `code`, `display_name`, `name` フィールドに適用
- 各エンティティに getter メソッドを追加（`pub fn code(&self) -> &str` 等）
- `reconstruct()` コンストラクタでDB復元用のパスを確保

### Entity setter 廃止 → `update(Params)` メソッド ✅

- SKU: `SkuUpdateParams { display_name, category, unit_type, description, status, metadata }` (全 Optional)
- RateCard: `RateCardUpdateParams { strategy, floor_price, ceiling_price, effective_from, effective_until, description }`
- PriceAdjustment: `AdjustmentUpdateParams { name, adjustment_type, priority, conditions, status, effective_from, effective_until }`
- `update()` メソッドで `updated_at = Utc::now()` を自動バンプ

### sqlx マクロ変換 ✅

- 全リポジトリクエリを `sqlx::query!` / `sqlx::query_as!` マクロに変換
- `.sqlx/` ルートにオフラインキャッシュ（15ファイル）を生成
- `packages/pricing/.sqlx/` は削除（**ルートの `.sqlx/` のみ**に統一）

### Usecase 分割（1 usecase = 1 file = 1 public method）✅

合計16個のusecaseを個別ファイルに分割。**フラット構造**で `usecase/` 直下に配置:

```
packages/pricing/src/usecase/
├── create_sku.rs          ├── list_skus.rs
├── get_sku.rs             ├── update_sku.rs
├── delete_sku.rs          ├── create_rate_card.rs
├── list_rate_cards.rs     ├── get_rate_card.rs
├── update_rate_card.rs    ├── delete_rate_card.rs
├── create_adjustment.rs   ├── list_adjustments.rs
├── get_adjustment.rs      ├── update_adjustment.rs
├── delete_adjustment.rs   └── resolve_price.rs
```

各 usecase は `InputPort` トレイト + `InputData` 構造体 + `execute()` メソッドのパターンで統一。

### Axum ハンドラ分割 ✅

`adapter/axum/mod.rs` にあった全ハンドラを、ドメインごとに分離:

| ファイル | 内容 |
|---------|------|
| `adapter/axum/sku_handler.rs` | SKU 系 5 エンドポイント |
| `adapter/axum/rate_card_handler.rs` | RateCard 系 5 エンドポイント |
| `adapter/axum/adjustment_handler.rs` | Adjustment 系 5 エンドポイント |
| `adapter/axum/resolve_handler.rs` | 価格解決 1 エンドポイント |
| `adapter/axum/mod.rs` | ルーター定義 + モジュール宣言のみ |

### main ブランチとのマージコンフリクト解消 ✅

main で `storage_app` が追加されたことによるコンフリクト。5ファイルで解消:
- `apps/tachyon-api/src/di.rs` — `pricing_app` + `storage_app` 両方保持
- `apps/tachyon-api/src/router.rs` — 両方のルーターを merge
- `apps/tachyon-api/src/main.rs` — 両方を `.data()` で注入
- `apps/tachyon-api/bin/lambda.rs` — 同上
- `apps/tachyon-api/tests/util.rs` — 同上

### SQLx DateTime 型マッピング問題の修正 ✅

**問題:** ローカル Docker MySQL と CI の MySQL で `DATETIME(6)` カラムの型メタデータが異なる。

| 環境 | 報告される type | SQLx マッピング先 |
|------|----------------|-------------------|
| ローカル Docker MySQL | `Timestamp` | `DateTime<Utc>` |
| CI fresh MySQL | `Datetime` | `NaiveDateTime` |

**修正内容:**

1. **`.sqlx` キャッシュファイル（9ファイル）**: `"type": "Timestamp"` → `"type": "Datetime"` に変更
   - `"TIMESTAMP"` / `"ON_UPDATE_NOW"` フラグも除去
2. **ゲートウェイ Row ストラクト（3ファイル）**: `DateTime<Utc>` → `NaiveDateTime` に変更
3. **TryFrom 変換**: `.and_utc()` で `NaiveDateTime` → `DateTime<Utc>` に変換
4. **bind パラメータ**: `.naive_utc()` で `DateTime<Utc>` → `NaiveDateTime` に変換

対象ファイル:
- `packages/pricing/src/adapter/gateway/sqlx_sku_repository.rs`
- `packages/pricing/src/adapter/gateway/sqlx_rate_card_repository.rs`
- `packages/pricing/src/adapter/gateway/sqlx_adjustment_repository.rs`

### `packages/pricing/.env` 追加 ✅

`sqlx-prepare` が pricing パッケージの `DATABASE_URL` を見つけられずエラーになる問題を修正。
`.env.sample` → `.env` にコピー（`.gitignore` 済み）。

### 確立された規約

| 規約 | 内容 |
|------|------|
| Usecase ファイル構造 | `usecase/create_sku.rs` のようにフラット構造。ネストしない |
| `.sqlx` キャッシュ | ルートの `.sqlx/` のみ。`packages/pricing/.sqlx/` は作らない |
| Entity setter | 禁止。getter はOK。更新は `update(Params)` メソッドで一括 |
| Handler ファイル | `sku_handler.rs`, `rate_card_handler.rs` 等ドメインごとに分離 |
| DateTime 型 | Row ストラクトは `NaiveDateTime`、ドメインは `DateTime<Utc>` |

## 今後の作業（別タスク）

- **Phase 3**: 既存システムとの接続（SKUシードデータ、ServiceCostCalculator切り替え、機能フラグ）
- **Phase 4**: データ移行 + 旧コード削除（ServicePriceMapping → RateCard等）
