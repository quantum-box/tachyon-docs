---
title: "Catalog/Pricing 責務分離 — 商品管理と調達品目の概念整理"
type: "refactor"
emoji: "🏗️"
topics: ["catalog", "pricing", "clean-architecture", "domain-model"]
published: true
targetFiles:
  - packages/catalog/
  - packages/pricing/
github: ""
---

# Catalog/Pricing 責務分離

## 概要

`packages/catalog`（カタログ商品）と `packages/pricing`（調達品目・価格計算）の責務を明確に分離し、ドメインモデルの概念的な整合性を高める。

## 背景・目的

### 現在の課題

1. **Catalogの責務過多**: `CatalogApp` がプロダクト管理と料金計算の両方を担っている（CLAUDE.mdで技術的負債として認識済み）
2. **概念の混在**: 「テナントが何を売るか（カタログ商品）」と「Tachyonクラウドから何を買えるか（調達品目）」の区別が不明瞭
3. **ProductとSKUの関係が暗黙的**: 直接的な紐付けテーブルがなく、ロジック内でSKUコードを動的生成している

### 目指す姿

```
Tachyonクラウド ──[調達品目(SKU)]──> テナント ──[カタログ商品(Product)]──> エンドユーザー
```

| 概念 | パッケージ | テナント固有 | 責務 |
|------|-----------|:----------:|------|
| **カタログ商品 (Product)** | `catalog` | ✅ | テナントが顧客に何を売るかを定義 |
| **調達品目 (SKU)** | `pricing` | ❌ | Tachyonが提供するサービスメニュー（原価） |
| **価格戦略 (RateCard)** | `pricing` | ✅ | テナントごとのマークアップ・価格設定 |

### 期待される成果

- ドメインモデルの明確化による開発者の認知負荷低減
- Catalogパッケージのシンプル化（プロダクト管理に専念）
- Product → SKU の明示的な紐付けによる価格計算の透明性向上

## 詳細仕様

### 現状のアーキテクチャ

```
packages/catalog/
├── product/             # テナント固有の商品定義
├── product_variant/     # APIモデルのメタデータ
├── product_usage_pricing/  # ← 料金計算の責務が混在
├── service_pricing/     # ← 料金計算の責務が混在
└── app.rs              # CatalogApp（料金計算メソッドも含む）

packages/pricing/
├── domain/
│   ├── sku.rs          # 調達品目マスター（テナント非固有）
│   ├── rate_card.rs    # テナント固有の価格戦略
│   └── price_adjustment.rs
└── app.rs              # PricingApp
```

### 目標アーキテクチャ

```
packages/catalog/          ← プロダクト管理に専念
├── product/
├── product_variant/
└── app.rs                # ProductのCRUDのみ

packages/pricing/          ← 調達品目 + 価格計算を統合
├── domain/
│   ├── sku.rs            # 調達品目マスター
│   ├── rate_card.rs      # テナント価格戦略
│   ├── price_adjustment.rs
│   └── product_sku_mapping.rs  # Product↔SKU紐付け（新規）
├── usecase/
│   ├── resolve_price.rs
│   └── calculate_service_cost.rs  # CatalogAppから移動
└── app.rs
```

### コンテキスト別の責務

```yaml
contexts:
  catalog:
    description: "テナントの商品カタログ管理"
    responsibilities:
      - Product（商品）のCRUD
      - ProductVariant（バリアント）の管理
      - 商品の公開状態管理
      - 商品画像管理
    does_not_own:
      - 料金計算
      - 使用量ベース価格設定
      - サービスコスト計算

  pricing:
    description: "調達品目の管理と価格計算"
    responsibilities:
      - SKU（調達品目）のマスター管理
      - RateCard（テナント価格戦略）の管理
      - PriceAdjustment（割引・追加料金）の適用
      - Product↔SKU紐付けの管理
      - サービスコスト計算（CatalogAppから移管）
      - 階層型価格解決（Host→Platform→Operator）
```

### Product↔SKU 紐付け

現状は `CatalogApp.calculate_service_cost_for_llm_model()` 内でモデル名からSKUコードを動的生成しているが、これを明示的なマッピングに変更する。

```yaml
# product_sku_mappings テーブル（新規）
product_sku_mapping:
  id: psm_<ULID>
  product_id: pd_<ULID>         # catalog.products への参照
  product_variant_id: pv_<ULID> # optional
  sku_id: sku_<ULID>            # pricing.pricing_skus への参照
  quantity_expression: "usage.prompt_tokens"  # 使用量の算出式
  created_at: datetime
  updated_at: datetime
```

## 実装方針

### アーキテクチャ設計

- Clean Architecture を維持（domain → usecase → interface_adapter → handler）
- コンテキスト間はアプリケーションサービス経由の依存（リポジトリ直接共有なし）
- 段階的な移行（一括変更ではなくフェーズ分割）

### 移行戦略

**段階的移行**: 既存のAPIやフロントエンドへの影響を最小限にするため、内部リファクタリングから始めて外部インターフェースは後から変更する。

## タスク分解

### フェーズ1: Product↔SKU マッピング基盤 ✅ (2026-02-20 完了)

- [x] マイグレーション作成（`pricing_product_sku_mappings` テーブル）
- [x] ドメインエンティティ `ProductSkuMapping` 実装（`def_id!(ProductSkuMappingId, "psm_")`、`MappingStatus` enum）
- [x] `ProductSkuMappingRepository` トレイト定義
- [x] `SqlxProductSkuMappingRepository` 実装
- [x] CRUD ユースケース（create/list/delete）実装
- [x] PricingApp struct + AppBuilder への統合
- [x] GraphQL Query/Mutation 追加

実装メモ:
- `product_id` は `String` 型（Catalogドメインへの依存を回避）
- 外部キー制約なし（異なるDBスキーマ間のため、アプリ層で整合性保証）
- `Option<&str>` は mockall の `automock` と非互換 → `Option<String>` に変更

### フェーズ2: PricingApp への料金計算移管 ✅ (2026-02-20 完了)

- [x] SDK トレイト拡張（`calculate_llm_model_cost`, `calculate_image_generation_cost`）
- [x] 型定義追加（`CalculateLlmModelCostInput`, `CalculateImageCostInput`, `ServiceCostResult`, `CostResultItem`）
- [x] `normalize_model_alias()` を `pricing_domain` に移植
- [x] `CalculateLlmModelCost` ユースケース実装（階層型価格解決 + プロバイダフォールバック）
- [x] `CalculateImageCost` ユースケース実装
- [x] `PricingApp::finalize_cost_calculators()` メソッド（循環依存解消のための2段階初期化）
- [x] DI更新（`apps/tachyon-api/src/di.rs`）
- [x] SQLxキャッシュ更新
- [x] `mise run check` コンパイル通過確認

実装メモ:
- `CalculateLlmModelCost` は `Arc<dyn PricingApp>` を必要とするため、`PricingApp` 構築後に `finalize_cost_calculators()` で注入
- `procurement::PricingRegistry` をフラットプロバイダ価格のフォールバック先として使用

### フェーズ3: 消費者側の移行 📝 (後続PRで実施)
- [ ] LLMs・tachyond等の消費者を `CatalogAppService` → `PricingApp` に移行
- [ ] CatalogApp から料金計算メソッドを削除

### フェーズ4: Catalog コンテキストの簡素化 📝 (後続PRで実施)
- [ ] CatalogAppService トレイトから料金計算メソッドを削除
- [ ] ProductUsagePricing / ServicePriceMapping の扱い決定
- [ ] CatalogApp の依存関係簡素化

### フェーズ5: テスト・品質確認 📝 (後続PRで実施)
- [ ] シナリオテストの更新・追加
- [ ] 料金計算の回帰テスト
- [ ] シードデータ: 既存の暗黙的マッピングを `product_sku_mappings` レコードに変換

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 料金計算の回帰バグ | 高 | 移行前に既存の料金計算結果をスナップショットテスト化 |
| CatalogApp の広範な利用箇所 | 中 | 段階的移行、旧メソッドをdeprecated化して並行期間を設ける |
| Product↔SKU マッピングのデータ移行 | 中 | 既存の暗黙的マッピングをシードデータとして自動生成 |
| フロントエンド影響 | 低 | GraphQL スキーマの互換性を維持 |

## 参考資料

- CLAUDE.md 内の Pricing コンテキスト規約
- `docs/src/architecture/nanodollar-system.md` — NanoDollar 仕様
- `docs/src/tachyon-apps/payment/usd-billing-system.md` — USD課金システム仕様
- 既存タスク: `docs/src/tasks/backlog/review-catalog-context-naming/`

## 完了条件

- [ ] CatalogApp が商品管理（CRUD）に専念している
- [ ] 料金計算ロジックが Pricing コンテキストに集約されている
- [ ] Product↔SKU の紐付けが明示的なマッピングで管理されている
- [ ] 既存の料金計算結果に回帰がないことをテストで確認
- [ ] CI が通過している
- [ ] 正式な仕様ドキュメントを作成済み

### バージョン番号

**マイナーバージョン（x.X.x）を上げる**: アーキテクチャの内部改善だが、ドメインモデルの変更を伴うため。

## 備考

- 既存タスク `docs/src/tasks/backlog/review-catalog-context-naming/` との関連あり。命名見直しはこのタスクの一部として扱う可能性がある。
- `procurement` 関連のコードも Pricing 側に整理する候補。
