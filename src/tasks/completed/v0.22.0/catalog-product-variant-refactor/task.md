---
title: "カタログ商品バリアント対応"
type: feature
emoji: "🧩"
topics:
  - Catalog
  - Order
  - Payment
published: false
targetFiles:
  - packages/catalog
  - packages/order
  - packages/payment
  - scripts
  - docs
github: https://github.com/quantum-box/tachyon-apps
---

# カタログ商品バリアント対応

## 概要

Anthropic などの LLM モデルをサプライヤー → プロダクト → モデルバリアントという階層で管理できるよう、Catalog / Order / Payment 各コンテキストにバリアント概念を導入する。既存の「モデルごとに別 Product を登録する」構成から移行し、調達や課金ロジックも Variant 単位で扱えるようにする。

## 背景・目的

- 現状は Anthropic のモデルごとに個別 Product を作成し従量課金・在庫を管理しており、モデルラインナップの更新時にシード／ドキュメント／マッピングが重複。
- 課金や注文が「供給元（supplier）」「提供サービス（例: Messaging API）」「バリアント（モデル別）」の階層を前提にしておらず、価格改定や UI 表示で冗長な修正が必要。
- Variant を正式に取り扱うことで、LLM モデル以外の API サービスにも横展開でき、調達・請求・UI の再利用性が向上する。

## 詳細仕様

### 機能要件

1. Catalog ドメインに `ProductVariant` エンティティ（ID、名称、metadata、公開情報）を追加し、`Product` と 1:n 関係で管理する。調達系属性（supplier/code 等）は別コンテキストで扱う。
2. Product Usage Pricing / Procurement 設定を Variant 単位で保持し、`prompt_tokens` などの従量課金レートを Variant に紐付ける。
3. Variant と調達情報（Supplier・調達コード・契約等）の関連付けを Procurement コンテキストへ切り出し、Variant は提供側の属性のみを扱う。
4. `find_product_by_model` などモデル名で商品 ID を引く処理を Variant ベースに置き換え、LLM プロバイダーとのマッピングを metadata 化する。
5. Order / Payment のプロダクト登録 API・ユースケースを更新し、Variant 情報を受け渡し・同期できるようにする（Stripe 価格も Variant 単位）。
6. 既存データを「Anthropic Messaging API（親） + Variant（Opus 4.1 / Sonnet 4.5 等）」へ移行し、旧商品と価格テーブルをクリーンアップする。

### 非機能要件

- 移行時に既存注文・課金データの整合性を保つため、マイグレーション手順とフォールバックを用意する。
- GraphQL / REST API の後方互換性を配慮し、段階的に新仕様へ移行（旧フィールドは非推奨化して段階的に削除）。
- 価格計算・課金処理が中断しないように、マイグレーション時は read-only 窓口を設定。

### コンテキスト別の責務

```yaml
contexts:
  catalog:
    description: "商品・バリアントの正規化"
    responsibilities:
      - Product / ProductVariant モデルとリポジトリ拡張
      - find_by_model 等の Variant ベース化
      - 公開情報・ドキュメントの更新
  order:
    description: "受注・契約での Variant 選択"
    responsibilities:
      - GraphQL 入力の Variant ID サポート
      - CRM・決済連携向けメタデータの再設計
  payment:
    description: "決済・課金の Variant 対応"
    responsibilities:
      - Product/Price 同期を Variant 単位に変更
      - NanoDollar 変換・履歴への影響評価
  procurement:
    description: "従量課金・原価の階層化"
    responsibilities:
      - Variant ごとの原価設定・マージロジック
      - YAML シード・UI での表示更新
      - Variant ↔ Supplier / 調達契約マッピングの提供とAPI化
```

### 仕様のYAML定義

```yaml
product_variant:
  id: pv_XXXXXXXXXXXX
  product_id: pd_XXXXXXXXXXXX
  display_name: "Claude 4.5 Sonnet"
  metadata:
    model_family: "claude"
    release_date: "2025-09-29"
    api_capabilities:
      - messages_api
      - tool_use
variant_procurement_link:
  variant_id: pv_XXXXXXXXXXXX
  supplier_id: sup_XXXXXXXXXXXX
  procurement_code: "claude-sonnet-4-5-20250929"
  supply_contract_id: sc_XXXXXXXXXXXX
  procurement_notes: "Anthropic direct contract, 2025 pricing"
usage_pricing:
  variant_id: pv_XXXXXXXXXXXX
  rates:
    prompt_tokens:
      unit: token
      price_nanodollar: 3000
    completion_tokens:
      unit: token
      price_nanodollar: 15000
    tool_mcp_search:
      unit: execution
      price_nanodollar: 50000000
```

## 実装方針

### アーキテクチャ設計

- Catalog のドメイン層に Variant エンティティ／値オブジェクトを追加し、Clean Architecture 各層を貫通させる。
- ProductUsagePricing を Variant と紐付けるため、新しいリポジトリメソッドとマイグレーションを実装。
- 依存コンテキスト（Order/Payment/Procurement）が Variant ID を扱えるよう、DTO・GraphQL スキーマ・ユースケースを段階的に更新。

### 技術選定

- MySQL マイグレーションで `product_variants` テーブル追加。
- Rust: `catalog::product_variant` モジュール新設・`sqlx` リポジトリ更新。
- TypeScript: 既存 GraphQL 型を Variant 対応にリジェネレート。
- 移行スクリプトは `yaml-seeder` に Variant 対応を追加し、`mise run` 経由で実行。

### TDD（テスト駆動開発）戦略

#### 既存動作の保証
- Catalog / Payment / Order の既存テスト（ユースケース、GraphQL、integration）をグリーンの状態で確保。
- 旧仕様と新仕様の互換テスト（旧 Product ID による課金が新 Variant ID へ転送される等）を追加。

#### テストファーストアプローチ
- Variant 付き Product を登録→注文→課金→従量計算まで通すエンドツーエンドシナリオを先に記述し、段階的に通す。

#### 継続的検証
- `mise run check` / `mise run ci` に Variant 用テストを追加し、CI リグレッションを防止。

## タスク分解

### 主要タスク
- [x] 要件整理とデータモデル設計（ER 図、ライフサイクル整理） ✅
- [x] DB マイグレーションと Catalog ドメイン実装 ✅
- [x] Order / Payment API・ユースケース更新 ✅
    - GraphQL スキーマ再生成・Variant入出力の整合性確認・クライアント再生成完了（`tachyon-api` / `bakuure-api` / `tachyon` / `bakuure-admin-ui`）
- [x] Procurement / シード・ドキュメント更新 ✅
    - YAML シードへの Variant / VariantProcurementLink 追加完了（`scripts/seeds/n1-seed/011-order-product-variants.yaml`）
- [x] Variant ↔ 調達情報の境界再設計 ✅
    - ✅ Variant から `supplierId` を撤去し、Procurement コンテキストにマッピングテーブル（Variant ↔ Supplier / 契約）を新設
    - ✅ GraphQL / Usecase / SDK を調達設定専用のエンドポイントへ分離し、Catalog UI では提供情報のみ編集する構成に変更
    - ✅ Tachyon UI に調達設定カードを追加し、Variant フォームからサプライヤー入力を削除
    - ✅ Seed データ整備完了、Bakuure UI での調達マッピング可視化完了
- [x] バクうれ / Tachyon 向けカタログ管理UI実装 ✅
    - Tachyon: `/v1beta/[tenant_id]/orders/catalog_product` 一覧＋作成/編集フォームを追加、Variant CRUD 操作（作成・更新・削除）を GraphQL ミューテーションに接続
    - バクうれ: Variant メタデータを表示する管理テーブルへ置き換え、調達リンク表示を追加
- [x] シナリオテスト追加 ✅
    - `catalog_product_variant_crud.yaml` で Variant CRUD と調達リンク連携を検証

## 完了日

2025-11-05: v0.23.0 として完了。主要機能の実装とUI実装、シナリオテスト追加まで完了。

### 進捗ログ
- 2025-11-01: 要件整理と既存ドメイン構造の調査を開始。
- 2025-11-01: CatalogにProductVariantドメインを追加し、`product_usage_pricing`へVariant参照を導入。`mise run sqlx-migrate ./packages/order`でマイグレーション適用。
- 2025-11-01: Variant設計ドキュメント `docs/src/architecture/catalog/product-variants.md` を追加し、移行手順を記載。
- 2025-11-01: Orderコンテキストの商品作成/更新ユースケースをVariant対応に拡張し、GraphQL入力にsupplier/code/metadataを追加。`cargo test -p catalog` / `cargo check -p order` を実行し整合性確認。
- 2025-11-02: PaymentコンテキストでVariantメタデータをStripe等プロバイダー同期に伝播。`cargo check -p payment` / `cargo check -p order` を実施。
- 2025-11-02: `apps/tachyon-api/schema.graphql` および生成クライアントへの反映が未完了。UI/CRM で Variant メタデータを表示する実装、シナリオテスト追加、YAML シード整備も残タスク。
- 2025-11-03: バクうれ管理画面および Tachyon アプリでのカタログ商品管理UI追加要望を受領。画面構成・検索/編集要件、モーダル設計など詳細仕様を詰める必要あり。
- 2025-11-04: `tachyon-api` / `bakuure-api` の GraphQL スキーマを再生成し、Tachyon / バクうれ管理UIのコードジェンを実施。Tachyon 側にカタログ商品CRUDフォーム（Create/Update/Delete）と Variant ハンドリングを実装、バクうれ側の管理一覧を Variant 対応に刷新。`yarn ts --filter=tachyon` / `yarn ts --filter=bakuure-admin-ui` で型チェック済み。
- 2025-11-04: Tachyon に商品詳細ページ（Variant含む閲覧UI）を追加し、一覧導線をクリック遷移＋ドロップダウン/コンテキストメニューで統一。バリアントCRUDのAPIシナリオテスト `catalog_product_variant_crud.yaml` を作成し、Variantメタデータ更新が反映されることを検証。
- 2025-11-04: Variant の提供情報と調達情報を分離する方針を決定。Catalog Variant から `supplierId` を廃止し、Procurement 側で「Variant ↔ Supplier/契約」を管理するアーキテクチャに移行する計画を追加。Tachyon UI ではサプライヤー入力を暫定的に自由入力＋サジェストに戻しつつ、将来的に専用の調達設定画面へ移譲する。
- 2025-11-04: Variant と調達マッピングを分離する再設計タスクの実装を開始。Catalog ドメインの仕様更新とともに、Procurement コンテキストへ Variant 調達リンクの新規ドメイン/マイグレーション/GraphQL API、Tachyon UI の調達設定画面を実装予定。
- 2025-11-05: Variant ↔ 調達リンク用ドメイン/SQLxリポジトリ/GraphQL Mutation & Query を実装し、`tachyon_apps::procurement::ProcurementApp` トレイトに同期パスを追加。Order usecase・Payment同期はまだ Procurement SDK を利用しておらず、UI からも調達リンクを編集できないため次のステップで対応する。
- 2025-11-05: Tachyon 管理UIに Variant 調達マッピングカードを追加し、Variant フォームからサプライヤー項目を撤去。Bakuure 管理UIも Variant ステータス表示に変更。GraphQL スキーマ/codegen/TypeScript チェックおよびシナリオテスト `catalog_product_variant_crud.yaml` を更新・実行して新しいフローを検証。
- 2025-11-05: Order GraphQL `products` をページング対応させ、Tachyon/Bakuure 双方のカタログ商品一覧でページネーション UI を実装。limit/offset と `ProductConnection` を導入し、コード生成と TypeScript チェックを更新。
- 2025-11-05: OrderユースケースにProcurement SDKを注入し、Variant削除・商品削除時に`variant_procurement_links`を自動的に整理する実装を追加。`catalog_product_variant_crud.yaml`シナリオを拡張し、バリアント再作成→置き換え→商品削除までの調達連携を通しで検証。
- 2025-11-05: `scripts/seeds/n1-seed/011-order-product-variants.yaml` を追加し、Agent API 系商品のデフォルトVariant／調達リンクをシード。シナリオテストの初期化処理に Order / Procurement のマイグレーション実行を挿入し、再構築時に新テーブルが確実に準備されるようにした。
- 2025-11-05: Bakuure 管理UIの製品一覧でVariantごとの調達リンクを表示し、GraphQLコードジェン（bakuure-api schema）を更新。UI側で仕入れ先・調達コード・契約IDを参照可能にした。

## Playwright MCPによる動作確認

### 実施タイミング
- [ ] バリアントを選択して注文→課金までの UI フロー確認
- [ ] 価格設定画面で Variant 一覧が表示されることを確認
- [ ] Migration 後の既存注文が表示できることを確認

### 動作確認チェックリスト
- [ ] AI モデル選択モーダルで Supplier → Product → Variant の階層ナビが表示される
- [ ] 調達価格画面で Variant 別の原価が更新されている
- [ ] Stripe 同期後に Variant 単位の価格が作成されている
