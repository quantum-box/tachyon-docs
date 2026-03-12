---
title: "ドメイン固有IaCマニフェストの拡張"
type: tech
emoji: "📦"
topics:
  - iac
  - manifest
  - catalog
  - domain-driven
published: true
targetFiles:
  - packages/iac/src/domain/
  - packages/iac/src/service/
  - packages/iac/src/usecase/apply_manifest.rs
  - packages/catalog/
github: https://github.com/quantum-box/tachyon-apps
---

# ドメイン固有IaCマニフェストの拡張

## 概要

汎用的な `SeedData` マニフェスト（テーブル直接投入）に加えて、
ドメイン固有のマニフェスト種別（`CatalogProduct`, `ProductVariant` 等）を追加し、
型安全性とビジネスロジック適用を実現する。

## 背景・目的

- 現在の `SeedData` マニフェストは汎用的なテーブル直接投入
  - スキーマ検証は実行時のみ
  - ドメインロジック（価格計算、バリデーション等）が適用されない
- ドメイン固有マニフェストにより：
  - コンパイル時の型検証が可能
  - ドメインモデル経由でビジネスルールを適用
  - より宣言的で理解しやすいYAML形式
  - IDEの補完やバリデーションが効く

## 現状分析

### 既存の `V1AlphaManifest` 構成

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind")]
pub enum V1AlphaManifest {
    ProjectConfig(ProjectConfigManifest),  // プロバイダー設定
    ServiceAccount(ServiceAccountManifest), // サービスアカウント
    SeedData(SeedDataManifest),             // 汎用シードデータ
}
```

### マニフェスト共通構造

```rust
struct XxxManifest {
    api_version: ApiVersion,      // "apps.tachy.one/v1alpha"
    metadata: ManifestMetadata,   // tenantId, name
    spec: XxxManifestSpec,        // ドメイン固有の仕様
}
```

### `SeedData` vs ドメイン固有マニフェスト

| 観点 | SeedData | ドメイン固有 |
|------|----------|-------------|
| 投入方式 | テーブル直接INSERT | ドメインモデル→Repository |
| 型安全性 | 実行時のみ | コンパイル時 |
| バリデーション | SQLレベル | ドメインルール適用 |
| 可読性 | テーブル構造依存 | ドメイン言語 |
| 拡張性 | 汎用的 | 特化型 |

## 詳細仕様

### 機能要件

1. `CatalogProduct` マニフェストを新規追加
2. 既存の `V1AlphaManifest` enumにバリアントを追加
3. `ApplyManifest` usecaseで適用ロジックを実装
4. Applierサービスで `ProductRepository` 経由の永続化

### 非機能要件

- 既存の `SeedData` との共存（段階的移行）
- 冪等性の保証（同一マニフェストの再適用）
- 監査ログへの記録

### CatalogProductマニフェスト形式（案）

```yaml
apiVersion: apps.tachy.one/v1alpha
kind: CatalogProduct
metadata:
  tenantId: tn_01hjryxysgey07h5jz5wagqj0m
  name: basic-plan
spec:
  # Product識別（ID指定時は更新、未指定時は生成）
  id: pd_01xxx  # optional

  # 基本情報
  name: "Basic Plan"
  description: "月額基本プラン"
  status: ACTIVE  # DRAFT | ACTIVE | ARCHIVED

  # 商品種別・課金
  kind: PLAN  # PLAN | PRODUCT | OPTION | SOFTWARE | API_SERVICE
  billingCycle: MONTHLY  # MONTHLY | YEARLY | ONE_TIME
  listPrice: 1000  # 円

  # 商品コード（optional）
  skuCode: "BP-001"
  janCode: "4912345678901"
  upcCode: "012345678901"

  # 公開設定
  publicationStatus: PUBLIC  # PUBLIC | PRIVATE | PUBLIC_USE_DEFAULT
  publicationName: "ベーシックプラン"
  publicationDescription: "月額1,000円の基本プラン"
```

### コンテキスト別の責務

```yaml
contexts:
  iac:
    description: "マニフェストのパース・適用制御"
    responsibilities:
      - CatalogProductManifest のパース
      - ApplyManifest での適用フロー制御
      - 適用ログの記録

  catalog:
    description: "商品ドメインロジック"
    responsibilities:
      - Product ドメインモデル
      - ProductRepository による永続化
      - ビジネスルール検証
```

## 実装方針

### アーキテクチャ設計

```
V1AlphaManifest::CatalogProduct
    │
    ▼
ApplyManifest usecase
    │
    ▼
CatalogProductApplier service
    │
    ▼
ProductRepository (catalog context)
    │
    ▼
Database
```

### 新規追加ファイル

```
packages/iac/src/domain/
├── catalog_product_manifest.rs  # CatalogProductManifest 定義
└── mod.rs                       # re-export追加

packages/iac/src/service/
├── catalog_product_applier.rs   # Applierサービス
└── mod.rs                       # re-export追加
```

### 既存ファイルの変更

```
packages/iac/src/domain/manifest_factory.rs
  - V1AlphaManifest に CatalogProduct バリアント追加
  - V1AlphaManifests に catalog_products() メソッド追加

packages/iac/src/usecase/apply_manifest.rs
  - apply_catalog_product() メソッド追加
  - OutputData に catalog_products 結果追加

packages/iac/src/lib.rs
  - CatalogProductApplier の DI
```

## タスク分解

### Phase 1: CatalogProductManifest 基盤 🔄

- [ ] `CatalogProductManifest` ドメインモデル定義
- [ ] `CatalogProductManifestSpec` 定義
- [ ] `V1AlphaManifest::CatalogProduct` バリアント追加
- [ ] パーサーテスト

### Phase 2: Applier実装

- [ ] `CatalogProductApplier` サービス実装
- [ ] `ProductRepository` 連携
- [ ] upsert/skipロジック
- [ ] 単体テスト

### Phase 3: UseCase統合

- [ ] `ApplyManifest` への統合
- [ ] GraphQL出力型の拡張
- [ ] 監査ログ対応
- [ ] シナリオテスト

### Phase 4: 拡張（将来）

- [ ] `ProductVariant` マニフェスト
- [ ] `ProcurementItem` マニフェスト
- [ ] 依存関係の解決（Product → Variant）

## Playwright MCPによる動作確認

バックエンドのみの変更のため、ブラウザ動作確認は対象外。
GraphQL/シナリオテストで検証する。

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 既存SeedDataとの重複管理 | 中 | 移行ガイド作成、段階的移行 |
| ProductRepositoryへの依存 | 中 | DIでモック可能に設計 |
| スキーマ変更への追従 | 中 | Productドメインとの同期を維持 |

## 参考資料

- `docs/src/tasks/completed/v0.36.0/seed-data-iac-management/task.md`
- `packages/iac/src/domain/seed_data_manifest.rs`
- `packages/iac/src/service/seed_data_applier.rs`
- `packages/catalog/src/product/mod.rs`

## 完了条件

- [ ] CatalogProductマニフェストの保存・適用が動作
- [ ] シナリオテストがパス
- [ ] 既存のSeedDataマニフェストに影響がない
- [ ] ドキュメント更新

### バージョン番号の決定基準

**マイナーバージョン（x.X.x）を上げる場合:**
- [x] 新機能の追加（CatalogProductマニフェスト）
- [x] 新しいAPIエンドポイントの追加（GraphQL mutation拡張）

## 備考

- ServiceAccountManifest の実装パターンを参考にする
- 将来的に `ProductVariant`, `ContractRule` なども同様のパターンで追加可能
