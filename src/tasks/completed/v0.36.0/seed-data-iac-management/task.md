---
title: "Seed Data IaC管理の統合"
type: tech
emoji: "🧱"
topics:
  - iac
  - seed-data
  - platform
published: true
targetFiles:
  - scripts/seeds/n1-seed/
  - scripts/init/init.sql
  - packages/iac/
  - apps/tachyon-api/
  - docs/src/
github: https://github.com/quantum-box/tachyon-apps
---

# Seed Data IaC管理の統合

## 概要

シードデータや初期データをIaCマニフェストで一元管理できるようにし、
起動後にAPI経由で登録・適用できる冪等なフローを整備する。

## 背景・目的

- 現状は `scripts/seeds/` やSQLでデータ投入が分散し、適用手順が複雑化している
- IaCマニフェストで管理すれば、環境差分を減らし運用を標準化できる
- API経由での適用に統一し、起動後でも安全に再適用できる冪等性が必要

## 現状の課題

- seed投入は `yaml-seeder` / SQLなど複数経路が存在する
- 起動後の差分適用や再実行が手動で、失敗時の復旧が難しい
- データ定義と適用フローがIaCの文脈に統一されていない

## 対象範囲

- `scripts/seeds/n1-seed/` のYAMLシード
- `scripts/*.sql` で投入している初期データ
- `tachyon_apps_iac.manifests` とIaC適用API周辺

## 対象外

- 実データ移行や運用中の大量データ移行
- IaC以外の管理経路を完全廃止する作業（移行完了後に別途）

## 既存実装の調査メモ

- IaC保存は `SaveManifest` があり、`iac:SaveManifest` 権限で保存する
  - `packages/iac/src/usecase/save_manifest.rs`
  - `packages/auth/src/interface_adapter/controller/mutation.rs` の `save_manifest`
- manifest保存は `tenant_id + kind + name` をキーに Upsert
  - `packages/iac/src/adapter/gateway/sqlx_manifest_repository.rs`
- 適用ユースケース `ApplyManifest` はあるが、現状はServiceAccountのみ対応
  - `packages/iac/src/usecase/apply_manifest.rs`
- GraphQLに適用用Mutationは未公開（saveのみ公開）

## シード投入の棚卸し（暫定）

### YAMLシード（scripts/seeds/n1-seed）

| 順序 | ファイル | 想定対象 |
|------|----------|----------|
| 001 | scripts/seeds/n1-seed/001-auth-tenants.yaml | auth.tenants / users / _tenant_to_user / accounts |
| 002 | scripts/seeds/n1-seed/002-auth-service-accounts.yaml | auth.service_accounts / public_api_keys |
| 003 | scripts/seeds/n1-seed/003-iac-manifests.yaml | iac.manifests / manifest_templates |
| 004 | scripts/seeds/n1-seed/004-crm-mappings.yaml | crm.provider_tenant_mappings / provider_object_mappings |
| 005 | scripts/seeds/n1-seed/005-order-products.yaml | order.products / service_price_mappings / product_usage_pricing |
| 006 | scripts/seeds/n1-seed/006-payment-stripe.yaml | payment.stripe_customers |
| 007 | scripts/seeds/n1-seed/007-procurement-suppliers.yaml | procurement.suppliers / supply_contracts / procurement_prices |
| 008 | scripts/seeds/n1-seed/008-auth-policies.yaml | auth.actions / policies / policy_actions / policy_action_patterns / user_policies / service_account_policies |
| 009 | scripts/seeds/n1-seed/009-auth-policy-statements.yaml | auth.policy_statements |
| 009 | scripts/seeds/n1-seed/009-feature-flags.yaml | feature_flag.feature_flags |
| 010 | scripts/seeds/n1-seed/010-order-service-price-mappings.yaml | order.service_price_mappings |
| 011 | scripts/seeds/n1-seed/011-order-product-variants.yaml | order.product_variants / variant_procurement_links |
| 012 | scripts/seeds/n1-seed/012-auth-service-account-policies.yaml | auth.service_account_policies |

### SQLシード

| ファイル | 想定対象 |
|----------|----------|
| scripts/init/init.sql | 初期DB作成・基盤設定 |
| scripts/bakuure-seed.sql | bakuure系データ |

### 手動/その他

- 追加調査: SQL以外の手動投入があるか確認
- 追加調査: order.service_price_mappings が重複定義されている可能性

## 詳細仕様

### 機能要件

1. 既存のシードデータをIaCマニフェストで表現できる形式に整理する
2. 起動後にAPI経由でマニフェストを登録・適用できるフローを定義する
3. IaC適用は冪等性を保証し、同一マニフェストの再適用で差分のみ反映する
4. 既存の `yaml-seeder` と共存または置換する移行パスを用意する
5. 適用結果（成功/失敗/差分）を記録し、監査可能にする

### 非機能要件

- 既存環境への適用が安全であること（冪等性と差分適用）
- 大量データの投入でも運用手順が単純であること
- 監査・レビューが容易であること（Git差分で追える）
- 再実行時に副作用が発生しないこと（重複作成・不整合の防止）

### コンテキスト別の責務

```yaml
contexts:
  iac:
    description: "IaCマニフェストの保存と適用"
    responsibilities:
      - マニフェストの保存形式とバリデーション
      - 反映フローと権限制御
  seed:
    description: "初期データの定義と整合性"
    responsibilities:
      - 既存シードデータの整理
      - IaCへのマッピング設計
  api:
    description: "IaCマニフェストの登録・適用"
    responsibilities:
      - 起動後のマニフェスト登録API
      - 適用結果の記録と公開
```

### 仕様のYAML定義

```yaml
# 例: IaCマニフェストでのシードデータ管理
manifests:
  - name: "bootstrap-auth-policies"
    type: "seed-data"
    version: "2026-01-24"
    apply_policy:
      mode: "upsert" # upsert | replace | skip
      dedupe_key: "name"
    resources:
      - table: "auth.actions"
        source: "scripts/seeds/n1-seed/008-auth-policies.yaml"
        primary_keys: ["id"]
        mode: "upsert"
```

### APIフロー（案）

1. 起動後にAPIへマニフェストを登録
2. サーバー側でバリデーションと冪等性チェック（名前+version+hash）
3. 適用処理で差分をUpsert/Insert
4. 適用結果をログ/履歴に記録

### API形態（案）

- GraphQL:
  - `saveManifest(manifest: String!)` は既存
  - `applyManifest(manifestName: String, manifestKind: String)` を追加
  - もしくは `saveManifestAndApply` を追加
- REST:
  - `/v1/iac/manifests` で保存
  - `/v1/iac/manifests/:name/apply?kind=<kind>` で適用

### 権限制御（案）

- `iac:SaveManifest` は既存のまま
- `iac:ApplyManifest` を必須（適用系は保存と分離）
- replaceはさらに強い権限（例: `iac:ApplyManifestReplace`）を追加検討

#### シードへの反映（案）

- `scripts/seeds/n1-seed/008-auth-policies.yaml` に
  `iac:ApplyManifestReplace` の追加
- `policy_actions` に `ApplyManifestReplace` を紐付け

### API入力/出力（案）

```yaml
# 保存
saveManifestInput:
  manifest: string

saveManifestOutput:
  manifest_id: string
  hash: string
  status: "saved"

# 適用
applyManifestInput:
  manifest_name: string
  manifest_kind: string
  manifest_version: string?
  dry_run: boolean
  apply_mode: "upsert" | "replace"
  scope: "manifest" | "resource"
  resource_filter:
    tables: ["auth.actions", "auth.policies"]

applyManifestOutput:
  applied: boolean
  manifest_name: string
  manifest_hash: string
  summary:
    created: number
    updated: number
    skipped: number
  diff:
    resources:
      - table: string
        created: number
        updated: number
        skipped: number
```

## 実装方針

### アーキテクチャ設計

- 既存の `tachyon_apps_iac.manifests` を起点にマニフェストを管理
- データ投入はIaC適用フェーズに集約し、起動後にAPI経由でマニフェスト登録を行う
- 冪等性はマニフェストの識別子と適用履歴（hash/etag）を基準に差分反映する
- 既存の `yaml-seeder` は移行完了まで補助的に扱う

### 冪等性設計（案）

- マニフェストID: `name` + `version` + `hash`
- 適用結果テーブルで `applied_at` と `hash` を記録し、同一hashはスキップ
- リソース単位で `upsert` を基本とし、重複を防止
- 例外的に `replace` が必要な場合は明示指定

#### 冪等性の粒度

- マニフェスト単位: 既存保存はUpsert（name, kind, tenant_id）
- リソース単位: primary key / dedupe key を指定し差分反映
- 適用結果: `apply_id` と `manifest_hash` を記録し再適用を抑止

#### 適用ルール（案）

- apply_mode=upsert:
  - primary key が一致する場合は更新
  - 不存在の場合は作成
  - 余剰データは削除しない
- apply_mode=replace:
  - 対象テーブルを論理的に置換
  - 事前にスナップショットを保存
  - replace対象はresource単位の明示指定のみ許可

#### 冪等性の保証範囲

- 同一マニフェストの再適用: no-op
- 異なるversionの再適用: 差分のみ更新
- replace指定: 対象テーブルの既存データをリプレース

### replace許可対象（案）

- auth.policy_statements
- auth.policy_actions
- auth.policy_action_patterns
- feature_flag.feature_flags

### resource_filterの粒度（案）

- table単位（複数指定）
- テーブル内の主キー範囲指定（将来拡張）

#### ハッシュ算出（案）

- 文字列化済みmanifest(JSON/YAML)を正規化しSHA256
- secretsは`$secret_ref`に正規化後の内容で算出
- hashは保存時に生成し、apply時に比較

#### 追加で検討するデータ

- `iac_manifest_apply_logs` (案)
  - `id`, `tenant_id`, `manifest_name`, `manifest_hash`, `applied_at`, `status`, `summary`
- 適用差分のサマリ（created/updated/skipped 件数）

### Applyログスキーマ（案）

```yaml
table: tachyon_apps_iac.manifest_apply_logs
columns:
  - id: ulid
  - tenant_id: string
  - manifest_name: string
  - manifest_hash: string
  - manifest_version: string
  - status: "applied" | "failed" | "skipped"
  - dry_run: boolean
  - summary:
      created: number
      updated: number
      skipped: number
  - error_message: string?
  - applied_at: timestamp
  - created_at: timestamp
  - updated_at: timestamp
```

### Applyログの保存場所（案）

- IaC DBに保存（`tachyon_apps_iac`）
- 集計・監査向けにLog/Tracingでも追加出力

## API追加先（案）

- GraphQL: `packages/auth/src/interface_adapter/controller/mutation.rs`
  - `apply_manifest` を追加し `iac::usecase::ApplyManifest` を呼び出す
- REST: `packages/iac` のaxum router追加
- 優先: 既存のGraphQL経路に合わせる

### 技術選定

- 既存のYAMLシード形式を活用し、IaCマニフェストから参照できる設計とする
- 移行フェーズで必要なツールは `yaml-seeder` と `mise run` を活用
- API経由の適用は既存IaC APIの拡張を前提とする（未確定）

## 運用フロー（案）

1. マニフェスト定義をGitに追加
2. 起動後にIaC APIでマニフェスト登録
3. 適用結果を監視し、失敗時はロールバック手順に従う
4. 成功後は既存seed投入手順を段階的に廃止

### エラーハンドリング方針（案）

- applyはトランザクション単位で実行
- 失敗時はapplyログに`status=failed`と原因を記録
- `dry_run`で差分のみ算出して本適用を防止

### dry_runの評価範囲（案）

- 差分計算のみ実行し、DB更新は行わない
- upsert時: 作成/更新/スキップ件数を算出
- replace時: 対象テーブルの置換対象件数を算出

### ロールバック方針（案）

- replace適用時は適用前のスナップショットを保存
- upsert適用時は差分履歴のみ記録し、手動復旧を許容

#### スナップショット候補

- YAML/JSONとして別テーブルに保存
- s3等の外部ストレージにアーカイブ

## 移行計画

### フェーズ0: 現状把握 ✅

#### シード投入の一覧化（完了: 2026-01-25）

| # | ファイル | 対象テーブル |
|---|---------|-------------|
| 001 | `001-auth-tenants.yaml` | auth.tenants / users / _tenant_to_user / accounts |
| 002 | `002-auth-service-accounts.yaml` | auth.service_accounts / public_api_keys |
| 003 | `003-iac-manifests.yaml` | iac.manifests（LLM・CRMプロバイダー等） |
| 004 | `004-crm-mappings.yaml` | crm.provider_tenant_mappings / provider_object_mappings |
| 005 | `005-order-products.yaml` | order.products |
| 006 | `006-payment-stripe.yaml` | payment.stripe_customers |
| 007 | `007-procurement-suppliers.yaml` | procurement.suppliers / supply_contracts / procurement_prices |
| 008 | `008-auth-policies.yaml` | auth.actions |
| 009a | `009-auth-policy-statements.yaml` | auth.policy_statements |
| 009b | `009-feature-flags.yaml` | feature_flag.feature_flags |
| 010 | `010-order-service-price-mappings.yaml` | order.service_price_mappings |
| 011 | `011-order-product-variants.yaml` | order.product_variants / variant_procurement_links |
| 012 | `012-auth-service-account-policies.yaml` | auth.service_account_policies |

**SQLシード**: `scripts/bakuure-seed.sql`（バクうれ用Workspace/Products/Currencies/DealAutomations）

#### 依存順序（確定）

```
001-auth-tenants (前提: なし)
  └─ tenants, users, accounts
        ↓
002-auth-service-accounts
  └─ service_accounts, public_api_keys
        ↓
003-iac-manifests
  └─ LLM/CRM/Paymentプロバイダー設定 ($secret_ref)
        ↓
004〜007 (コンテキスト独立)
  ├─ crm-mappings
  ├─ order-products
  ├─ payment-stripe
  └─ procurement-suppliers
        ↓
008〜012 (権限・機能)
  ├─ auth.actions
  ├─ policy_statements
  ├─ feature_flags
  ├─ service_price_mappings
  ├─ product_variants
  └─ service_account_policies
```

#### IaC API利用範囲と権限整理（完了: 2026-01-25）

| ユースケース | 実装状況 | 権限 | 備考 |
|------------|---------|------|------|
| SaveManifest | ✅ 完了 | `iac:SaveManifest` | シークレット抽出・$secret_ref置換対応 |
| ApplyManifest | ✅ 完了 | `iac:ApplyManifest` | ServiceAccount, ProjectConfig, SeedData対応 |
| GetManifest | ✅ 完了 | - | tenant_id + kind + name で取得 |

**ApplyManifestの実装状況** (2026-01-26時点):
- ✅ ServiceAccountマニフェスト対応
- ✅ ProjectConfig（Providers）適用対応
- ✅ SeedDataマニフェスト対応（upsert/replace/skip）
- ✅ App層統合済み（GraphQL mutation公開）
- ✅ AuditLogger連携（SimpleAuditLoggerでログ出力）
- ✅ dry_run機能（差分確認のみ、DB変更なし）
- ✅ manifest_apply_logsテーブルで適用履歴記録

### フェーズ1: ApplyManifest基盤実装 ✅ (2026-01-25完了)
- [x] ApplyManifestのApp層統合（GraphQL mutation追加）
- [x] ProjectConfig（Providers）の適用ロジック実装
- [x] AuditLogger連携（適用ログ記録）
- [ ] 冪等性の検証（同一マニフェストの再適用）- フェーズ2で継続

#### 実装内容

**変更ファイル:**
- `packages/iac/src/lib.rs` - App層にApplyManifest統合
- `packages/iac/src/usecase/apply_manifest.rs` - AuditLogger連携、ProjectConfig適用追加
- `packages/auth/src/interface_adapter/controller/mutation.rs` - GraphQL mutation追加
- `packages/auth/src/interface_adapter/controller/model/input.rs` - 入出力型定義

**GraphQL API:**
```graphql
mutation ApplyManifest($input: ApplyManifestInput!) {
  applyManifest(input: $input) {
    success
    serviceAccountsCreated
    serviceAccountsModified
    createdServiceAccountIds
    modifiedServiceAccountIds
    providersApplied
  }
}
```

**制限事項:**
- 現時点ではServiceAccountとProjectConfig(Providers)のみ対応
- AuditLoggerはSimpleAuditLogger（開発用・ログ出力のみ）
- SeedDataマニフェスト形式は未対応（フェーズ2）

### フェーズ2: SeedData種別拡張 ✅ (完了: 2026-01-26)
- [x] SeedDataマニフェスト形式の設計（type/keys/mode）
- [x] manifest_apply_logsテーブル追加（DBマイグレーション）
- [x] dry_run機能実装
- [x] SeedDataApplierサービス実装（upsert/replace/skip）
- [x] ApplyManifestへのSeedData統合
- [x] auth.actionsサンプルマニフェスト作成
- [x] yaml-seederとの共存フロードキュメント作成
- [x] シナリオテスト追加・修正 (2026-01-26)

#### フェーズ2 実装済み内容 (2026-01-25〜26)

**マイグレーション:**
- `packages/iac/migrations/20260125154132_manifest_apply_logs.up.sql`
- `packages/iac/migrations/20260125154132_manifest_apply_logs.down.sql`

**ドメインモデル:**
- `packages/iac/src/domain/manifest_apply_log.rs`
  - `ManifestApplyLogId` (ID型: `mal_` プレフィックス)
  - `ManifestApplyStatus` enum (`Applied`, `Failed`, `Skipped`, `DryRun`)
  - `ManifestApplySummary` (適用結果サマリー)
  - `ManifestApplyLog` エンティティ
  - `ManifestApplyLogRepository` トレイト

**リポジトリ:**
- `packages/iac/src/adapter/gateway/sqlx_manifest_apply_log_repository.rs`
  - `SqlxManifestApplyLogRepository` 実装
  - save/find_by_tenant_and_manifest/find_latest/was_applied

**App層統合:**
- `packages/iac/src/lib.rs` にリポジトリ統合
- `ApplyManifest` usecase でログ保存

**GraphQL API更新:**
- `ApplyManifestInput` に `dry_run` フィールド追加（デフォルト: false）
- dry_run=true の場合、実際の変更は行わず差分のみ計算

**SeedDataマニフェスト実装 (2026-01-25):**
- `packages/iac/src/domain/seed_data_manifest.rs`
  - `SeedApplyMode` enum (`Upsert`, `Replace`, `Skip`)
  - `SeedTableSpec` (テーブル定義: name, mode, primary_keys, rows)
  - `SeedDataManifest` エンティティ
- `packages/iac/src/domain/manifest_factory.rs`
  - `V1AlphaManifest::SeedData` バリアント追加
  - `V1AlphaManifests::seed_data()` メソッド追加
- `packages/iac/src/service/seed_data_applier.rs`
  - `SeedDataApplier` サービス
  - `TableApplyResult`, `SeedDataApplyResult` 適用結果
  - upsert: INSERT ... ON DUPLICATE KEY UPDATE
  - replace: DELETE + INSERT（トランザクション保証）
  - skip: 既存データチェック後スキップ
  - SQLインジェクション対策: `validate_table_name()`, `validate_column_name()`
  - トランザクション安全性: replace操作はトランザクション内で実行
- `packages/iac/src/usecase/apply_manifest.rs`
  - `apply_seed_data()` メソッド追加
  - `ApplyManifestOutputData.seed_data_tables` 追加
  - ログ・監査証跡にSeedData結果反映
- `apps/tachyon-api/tests/scenarios/seed_data_apply.yaml`
  - SeedDataマニフェストの保存・適用シナリオテスト
  - dry_run モードでの適用検証
- `docs/src/tachyon-apps/iac/seed-data-management.md`
  - SeedDataマニフェストのフォーマット・使用方法
  - yaml-seederとの共存フロー
  - 移行ガイド
- `scripts/seeds/n1-seed/003-iac-manifests.yaml`
  - SeedDataマニフェストのサンプル追加（auth-actions-sample）

**シナリオテスト修正 (2026-01-26):**
- `apps/tachyon-api/tests/scenarios/seed_data_apply.yaml`
  - GraphQLフィールド名修正: `tenantId` → `operatorId` (ManifestMetadata型に合わせる)
- `packages/iac/migrations/20260126120000_fix_manifest_apply_logs_id_length.up.sql`
  - `manifest_apply_logs.id` カラム長を VARCHAR(29) → VARCHAR(30) に修正
  - 原因: `mal_` (4文字) + ULID (26文字) = 30文字
- `apps/tachyon-api/tests/run_tests.rs`
  - IaCマイグレーションをテストランナーに追加

#### フェーズ2設計案

**SeedDataマニフェスト形式:**
```yaml
apiVersion: apps.tachy.one/v1alpha
kind: SeedData
metadata:
  name: auth-actions
  tenantId: tn_01jcjtqxah6mhyw4e5mahg02nd
spec:
  tables:
    - name: tachyon_apps_auth.actions
      mode: upsert  # upsert | replace | skip
      primary_keys: [id]
      rows:
        - id: act_01xxx
          context: auth
          name: UpdatePolicy
          description: Update policy configuration
```

**manifest_apply_logsテーブル:**
```sql
CREATE TABLE tachyon_apps_iac.manifest_apply_logs (
  id VARCHAR(30) PRIMARY KEY,  -- mal_ + 26文字ULID
  tenant_id VARCHAR(29) NOT NULL,
  manifest_name VARCHAR(255) NOT NULL,
  manifest_kind VARCHAR(64) NOT NULL,
  manifest_hash VARCHAR(64) NOT NULL,
  status ENUM('applied', 'failed', 'skipped', 'dry_run') NOT NULL,
  dry_run BOOLEAN NOT NULL DEFAULT FALSE,
  summary JSON,
  error_message TEXT,
  applied_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tenant_manifest (tenant_id, manifest_name, manifest_kind),
  INDEX idx_applied_at (applied_at)
);
```

**実装優先度:**
1. manifest_apply_logsテーブル（監査ログ永続化）
2. dry_run機能（安全な差分確認）
3. SeedDataマニフェスト形式（新規種別）
4. yaml-seederとの統合

### フェーズ3: 移行完了 📝
- [ ] 全シードをIaCマニフェストに移行
- [ ] yaml-seeder使用範囲の縮小
- [ ] 運用ドキュメント更新

## タスク分解

### フェーズ1タスク（優先） ✅
- [x] 既存シードデータの棚卸しと依存関係整理
- [x] IaC APIの利用範囲と権限整理
- [x] ApplyManifestをApp層に統合 (2026-01-25)
- [x] GraphQL mutation `applyManifest` 追加 (2026-01-25)
- [x] AuditLoggerとの連携実装 (2026-01-25) - SimpleAuditLoggerでログ出力
- [x] ProjectConfig適用ロジック（Providers）の実装 (2026-01-25)

### フェーズ2タスク
- [x] SeedDataマニフェスト仕様設計（upsert/replace/mode）(2026-01-25)
- [x] manifest_apply_logsテーブル追加 (2026-01-25)
- [x] dry_run機能実装 (2026-01-25)
- [x] SeedDataApplier実装 (2026-01-25)
- [ ] 主要シード（auth.actions等）のIaC化

### フェーズ3タスク
- [ ] 全シードのIaC移行
- [ ] yaml-seeder依存の段階的削減
- [ ] バックアウト手順の作成
- [ ] 運用ドキュメント更新

## Playwright MCPによる動作確認

IaC/シード管理のタスクのため、ブラウザ動作確認は対象外。

## スケジュール

スコープ確定後に記載する。

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 既存データとIaCの二重管理 | 中 | 移行期間を定義し重複投入を避ける |
| IaC適用の失敗による環境破損 | 高 | ステージングで検証しバックアップを取得 |
| マニフェストの粒度が粗い | 中 | リソース単位の分割を検討 |
| API経由の適用がボトルネック化 | 中 | バッチ適用と非同期処理を検討 |

## 参考資料

- docs/src/tasks/template.md
- scripts/seeds/n1-seed/003-iac-manifests.yaml
- docs/src/tachyon-apps/authentication/multi-tenancy.md

## 完了条件

- [ ] すべての機能要件を満たしている
- [ ] コードレビューが完了
- [ ] 動作確認レポートが完成している
- [ ] 正式な仕様ドキュメントを作成済み
- [ ] タスクディレクトリを completed/[新バージョン]/ に移動済み

### バージョン番号の決定基準

**パッチバージョン（x.x.X）を上げる場合:**
- [ ] バグ修正
- [ ] 小さな改善（UIの微調整、メッセージの変更など）
- [ ] ドキュメント更新
- [ ] パフォーマンス改善
- [ ] 既存機能の微調整

**マイナーバージョン（x.X.x）を上げる場合:**
- [ ] 新機能の追加
- [ ] 新しい画面の追加
- [ ] 新しいAPIエンドポイントの追加
- [ ] 新しいコンポーネントの追加
- [ ] 既存機能の大幅な改善
- [ ] 新しい統合やサービスの追加

**メジャーバージョン（X.x.x）を上げる場合:**
- [ ] 破壊的変更（既存APIの変更）
- [ ] データ構造の大幅な変更
- [ ] アーキテクチャの変更
- [ ] 下位互換性のない変更

## 備考

IACマニフェストの適用スコープと更新フローは、実装前に関係者と合意する。
