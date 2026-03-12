---
title: "Agent APIモデルをカタログVariantsで管理"
type: "feature"
emoji: "🧭"
topics:
  - Catalog
  - Procurement
  - Agent API
published: true
targetFiles:
  - packages/catalog/src
  - packages/llms/src
  - packages/procurement/src
  - apps/tachyon/src
  - apps/tachyon-api/src
github: ""
---

# Agent APIモデルをカタログVariantsで管理

## 概要

Agent APIが利用可能なモデルを、カタログ商品のVariantsとして定義し、
UIで管理できるようにする。/v1/llms/modelsはプロバイダ提供モデルの一覧
として維持し、利用可否はカタログ商品の有効化状態で判定する。

## 背景・目的

- provider追加・更新時に調達品目とカタログ商品の整合が崩れる
- /v1/llms/models が「利用可能モデル一覧」と誤解されやすい
- operatorごとにモデル可用性を切り替えたい
- UIで作成されるカタログ商品を正としたい

## 詳細仕様

### 機能要件

1. Agent API用のカタログ商品を1つ作成し、モデルはVariantsで管理する
2. /v1/llms/models は provider の提供モデル一覧として維持する
3. Agent API実行は product_id と variant_id を正式入力とする
4. model alias指定時はカタログVariantsに該当がない場合に明示的なエラーを返す
5. 調達品目は system tenant (tn_01jcjtqxah6mhyw4e5mahg02nd) を基準に参照する
6. 原価は調達品目（procurement prices）から明確に算出できるようにする
7. カタログ商品一覧で、variantに紐づく調達品目が確認できる
8. カタログ商品詳細で、variant別の原価・利用実績・実原価が確認できる

### 非機能要件

- 既存のmodel指定フローは後方互換で維持する
- 既存UIのカタログ商品作成フローに沿う
- エラーはAPI利用者が理解できる文面にする

### コンテキスト別の責務

```yaml
contexts:
  catalog:
    description: "Agent APIモデルをVariantsとして定義する"
    responsibilities:
      - Agent API用ProductとVariantsの管理
      - variant metadataにprovider/modelを保持
      - model_aliasは既存データ互換の読み取り用に許容
      - operator単位の有効化状態を管理
      - variantと調達品目の複数リンクを管理
      - カタログ商品一覧で調達品目リンクを可視化
  llms:
    description: "Agent API実行時の可用性チェック"
    responsibilities:
      - product_id/variant_id指定の実行
      - model alias指定時のVariants検証
      - /v1/llms/modelsは提供モデル一覧のみ
  procurement:
    description: "調達品目はsystem tenantを基準に参照"
    responsibilities:
      - LLM調達コストはsystem tenantの設定を参照
      - provider追加時の調達登録漏れを検知
  pricing_visibility:
    description: "調達原価の可視化"
    responsibilities:
      - model variantごとの原価を調達品目から算出
      - 複数調達品目に対する原価の内訳表示
      - variant別の利用実績と実原価を表示
```

### 仕様のYAML定義

```yaml
catalog:
  agent_api:
    product:
      sku_code: "agent_api"
      kind: "API_SERVICE"
      managed_by_ui: true
    variants:
      - name: "Claude Sonnet"
        metadata:
          provider: "anthropic"
          model_alias: "claude-sonnet-4.5"
      - name: "GPT-4.1"
        metadata:
          provider: "openai"
          model_alias: "gpt-4.1"
procurement:
  base_tenant_id: "tn_01jcjtqxah6mhyw4e5mahg02nd"
  cost_visibility:
    source: "procurement_prices"
    link: "variant_procurement_link"
    pricing_basis: "sum_by_procurement_items"
    display: "catalog_product_list"
ui:
  catalog_product_list:
    columns:
      - product_name
      - sku_code
      - variant_count
      - procurement_links_summary
    procurement_links_summary:
      format: "<variant_name>: <supplier>/<procurement_code>"
      max_items: 3
      overflow: "+N more"
  catalog_product_detail:
    sections:
      - variant_usage_costs
    variant_usage_costs:
      fields:
        - variant_name
        - procurement_links
        - procurement_unit_costs
        - usage_volume
        - actual_procurement_cost
      procurement_unit_costs:
        format: "<currency> <base_cost> / <unit_type>"
      usage_volume:
        source: "usage_by_variant"
      actual_procurement_cost:
        formula: "sum(procurement_unit_cost * usage_volume_by_resource)"
usage:
  source:
    storage: "agent_execution_costs"
    group_by:
      - tenant_id
      - variant_id
      - resource_type
    period: "range"
  api:
    graphql: "agentApiVariantUsage"
    input:
      tenant_id: "String!"
      variant_ids: "[String!]!"
      range: "DateRangeInput"
    output:
      - variant_id
      - resource_type
      - usage_volume
      - actual_procurement_cost
```

## 実装方針

### アーキテクチャ設計

- Catalog: Product + Variant + ProductUsagePricing (variant_id) を利用
- LLMS: product_id/variant_idを優先し、aliasはcatalog検索でresolve
- Procurement: system tenantを固定参照するルートを追加
- Procurementコストをvariant単位で参照できるようにする
- 複数調達品目リンク時は内訳を返す
- Usage: variantごとの利用実績を取得し、実原価を算出する
- Usage: agent_execution_costsをvariant_id単位で集計し、実原価を算出する

### 技術選定

- 既存のCatalog GraphQL `api_services` を拡張し sku_code で絞り込み
- Variant metadataに provider/model alias を保存

## タスク分解

### 主要タスク
- [ ] 要件定義の明確化
- [ ] Catalog: api_servicesのfilter追加 (sku_code)
- [ ] Catalog: model alias -> variant解決用の参照ルート追加
- [ ] Catalog: variantごとの調達品目リンク一覧を取得できるAPI追加
- [ ] Procurement: 調達品目の原価をvariantに紐付けて取得
- [ ] UI: カタログ商品一覧でvariantの調達品目を確認できる
- [ ] LLMS: product_id/variant_id指定を優先して実行
- [ ] LLMS: model alias指定時のcatalog未登録エラー
- [ ] Procurement: system tenant参照へ統一
- [ ] Procurement: 原価の表示・取得フロー整理（複数調達品目対応）
- [ ] Usage: variant別の利用実績取得と実原価計算
- [ ] API: agentApiVariantUsage (GraphQL) を追加
- [ ] API: agent_execution_costs集計のrepository/usecase追加
- [ ] UI: カタログ商品詳細でvariant別の原価・利用実績・実原価を表示
- [ ] テスト・品質確認
- [ ] ドキュメント更新

## Playwright MCPによる動作確認

### 実施タイミング
- [ ] 実装完了後の初回動作確認

### 動作確認チェックリスト
- [ ] カタログ商品作成UIでagent_api商品を作成できる
- [ ] variant追加でモデルが登録される
- [ ] Agent APIのモデル選択に反映される
- [ ] variantの原価（調達品目内訳）がUIで確認できる
- [ ] カタログ商品一覧でvariantの調達品目が確認できる
- [ ] カタログ商品詳細でvariant別の原価・利用実績・実原価が確認できる

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 既存model指定APIの互換性破壊 | 中 | model aliasは残し、catalog未登録時のみ明示エラーにする |
| 調達品目が未登録のprovider追加 | 高 | system tenantの調達品目チェックを強制 |
| 原価の表示不整合 | 中 | procurement_pricesとvariantリンクの参照経路を一本化 |

## 参考資料

- docs/src/tachyon-apps/llms/agent-api/model-catalog-filtering.md
- docs/src/architecture/nanodollar-system.md

---

## 実装進捗 (2025-01-24)

### フェーズ1: Catalog GraphQL拡張（ProductVariant公開） ✅
- [x] ProductVariant の GraphQL型定義 (`CatalogProductVariant`, `GraphQLVariantStatus`, `VariantModelMetadata`)
- [x] api_services クエリに variants フィールド追加
- [x] sku_code フィルター追加
- [x] model alias → variant 解決クエリ追加 (`resolve_model_alias`)

### フェーズ2: LLMS統合（product_id/variant_id指定） ✅
- [x] ExecuteAgentInputData に product_id, variant_id フィールド追加
- [x] CatalogAppService に get_model_from_variant / validate_model_alias 追加
- [x] product_id/variant_id指定時のモデル解決ロジック実装（execute_agent.rs）
- [ ] model alias指定時のカタログ未登録エラー実装（カタログ検証強制）→ 後続タスク

### フェーズ3: Procurement原価連携 ✅
- [x] system tenant 参照: 定数 `SYSTEM_TENANT_ID` が既に定義済み
- [x] variant別調達品目リンク取得API: `variant_procurement_links` / `variant_procurement_links_by_variants` クエリ既存
- [ ] 原価計算ロジック（複数調達品目対応）→ 後続タスク

### フェーズ4: Usage集計・UI ✅
- [x] agentApiVariantUsage GraphQL追加（agent_execution_costs にvariant_id列追加済み）
- [x] schema.graphql を更新してフロントエンドcodegen実行
- [x] カタログ商品一覧UI改修（variants列追加）
- [x] カタログ商品詳細UI改修（variants表示追加）
- [x] AI Usage ページ追加（/v1beta/[tenant_id]/ai/usage）
- [ ] カタログ商品詳細UI改修（variant別原価・usage表示）→ 後続タスク

### 調査メモ（2025-01-24）
- ProductVariant: ドメインモデル存在 → GraphQL公開完了
- VariantProcurementLink: Procurementコンテキストに存在、GraphQLクエリも既存
- System Tenant: `tn_01jcjtqxah6mhyw4e5mahg02nd` として定義済み
- api_services クエリ: sku_codeフィルタ追加完了

### 実装済みファイル（バックエンド）
- `packages/catalog/src/app.rs` - VariantModelInfo, get_model_from_variant, validate_model_alias, find_variants_by_product_id, find_variant_by_model_alias 追加
- `packages/catalog/src/graphql/product_types.rs` - CatalogProductVariant, GraphQLVariantStatus, VariantModelMetadata, variants フィールド追加
- `packages/catalog/src/graphql/query.rs` - api_services に sku_code フィルタ、resolve_model_alias クエリ追加
- `packages/llms/src/usecase/execute_agent.rs` - product_id, variant_id フィールド追加
- `packages/llms/src/adapter/axum/agent_handler.rs` - product_id, variant_id フィールド対応
- `packages/llms/examples/*.rs` - 各example の InputData に新フィールド追加
- `apps/tachyon-code/src/agent_builtin.rs` - product_id, variant_id フィールド対応

### 実装済みファイル（フロントエンド）
- `apps/tachyon-api/schema.graphql` - CatalogProductVariant, VariantModelMetadata, resolveModelAlias, apiServices(skuCode) 追加
- `apps/tachyon/src/gen/graphql.ts` - 型定義自動生成完了
- `apps/tachyon/src/app/v1beta/[tenant_id]/pricing/queries/apiServices.graphql` - variants, modelMetadata フィールド追加
- `apps/tachyon/src/app/v1beta/[tenant_id]/pricing/services/queries/get-api-service-details.graphql` - variants フィールド追加
- `apps/tachyon/src/app/v1beta/[tenant_id]/pricing/types.ts` - CatalogProductVariant型追加
- `apps/tachyon/src/app/v1beta/[tenant_id]/pricing/services/components/api-services-data-table.tsx` - Variants列追加
- `apps/tachyon/src/app/v1beta/[tenant_id]/pricing/services/[id]/components/service-overview.tsx` - Variants表示追加
- `apps/tachyon/src/lib/i18n/v1beta-translations.ts` - variants翻訳キー追加（英語/日本語、一覧・詳細両方）

### 次のステップ
1. ✅ ~~バックエンドAPIを起動してschema.graphqlを更新~~
2. ✅ ~~フロントエンドのcodegenを実行~~
3. ✅ ~~UI改修（カタログ一覧）~~
4. ✅ ~~UI改修（カタログ詳細 - variants表示）~~
5. ✅ ~~product_id/variant_id指定時のモデル解決ロジック追加~~
6. ✅ ~~Usage集計 - variant_id追加・GraphQL API追加・UI追加~~
7. ✅ ~~シナリオテスト追加 (agentApiVariantUsage)~~
8. [ ] カタログ商品詳細UI改修（variant別原価・usage表示）→ 後続タスク
9. [ ] model alias指定時のカタログ検証（強制エラー化）→ 後続タスク
10. [ ] Playwright動作確認（Usage画面完成後）→ 後続タスク

---

## 実装進捗 (2025-01-24 追記)

### フェーズ5: Usage集計実装 ✅
- [x] agent_execution_costs テーブルに variant_id カラム追加
- [x] AgentExecutionCost ドメインに variant_id フィールド追加
- [x] AgentExecutionCostRepository に aggregate_by_variant メソッド追加
- [x] GetVariantUsage usecase 追加
- [x] agentApiVariantUsage GraphQL query 追加
- [x] auth policy に GetVariantUsage アクション追加
- [x] UI: /v1beta/[tenant_id]/ai/usage ページ追加
  - 日付フィルター
  - サマリーカード (Total Executions, Token Cost, Tool Cost, Total Cost)
  - variant別使用量テーブル

### フェーズ6: Model alias catalog validation ✅
- [x] BillingContext に variant_id フィールド追加
- [x] execute_agent.rs に try_resolve_variant_id ヘルパーメソッド追加
- [x] model alias指定時にカタログから variant_id を解決
- [x] billing メタデータに variant_id を含める
- [x] resume_agent.rs, billing_aware_test.rs の BillingContext 更新

### 実装済みファイル（2025-01-24追記）
**バックエンド:**
- `packages/llms/domain/src/agent_execution_cost.rs` - variant_id フィールド、VariantUsageAggregate、aggregate_by_variant 追加
- `packages/llms/src/adapter/gateway/sqlx_agent_execution_cost_repository.rs` - aggregate_by_variant 実装
- `packages/llms/src/usecase/get_variant_usage.rs` - GetVariantUsage usecase
- `packages/llms/src/usecase/mod.rs` - GetVariantUsage エクスポート
- `packages/llms/src/app.rs` - get_variant_usage フィールド追加
- `packages/llms/src/adapter/graphql/resolver.rs` - agentApiVariantUsage query 追加
- `packages/llms/src/adapter/graphql/model/output.rs` - VariantUsage, AgentApiVariantUsageInput 型追加
- `packages/llms/src/agent/billing_aware.rs` - BillingContext に variant_id 追加、metadata に含める
- `packages/llms/src/usecase/execute_agent.rs` - try_resolve_variant_id メソッド追加、BillingContext に variant_id 渡す
- `packages/llms/src/usecase/resume_agent.rs` - BillingContext variant_id 対応
- `scripts/seeds/n1-seed/008-auth-policies.yaml` - GetVariantUsage アクション追加

**フロントエンド:**
- `apps/tachyon/src/app/v1beta/[tenant_id]/ai/usage/page.tsx` - Usage ページ
- `apps/tachyon/src/app/v1beta/[tenant_id]/ai/usage/variant-usage-client.tsx` - Usage クライアントコンポーネント
- `apps/tachyon/src/app/v1beta/[tenant_id]/ai/usage/queries/variant-usage.graphql` - GraphQL クエリ

**テスト:**
- `apps/tachyon-api/tests/scenarios/agent_api_variant_usage.yaml` - agentApiVariantUsage シナリオテスト

---

## 完了条件

- [x] Agent APIがproduct_id/variant_idで実行できる（実行時のモデル解決ロジック実装完了）
- [x] model alias指定時にカタログからvariant_idを解決（検証・billing連携完了）
- [ ] model alias指定で未登録時に明示エラーが返る → 後続タスク（現状は警告ログのみ）
- [x] /v1/llms/modelsは提供モデル一覧のみ（既存のまま維持）
- [x] 調達品目はsystem tenant基準で参照される（SYSTEM_TENANT_ID定数既存）
- [ ] 原価がvariant単位で取得できる → 後続タスク
- [ ] 複数調達品目の内訳が取得できる → 後続タスク
- [x] variant別使用量がGraphQL/UIで確認できる（agentApiVariantUsage実装完了）
- [x] シナリオテストが通っている（agent_api_variant_usage.yaml 追加、31シナリオ全て通過）
- [ ] Playwright動作確認（UIテストは後続タスクへ - Usage画面の原価表示が未実装のため）
