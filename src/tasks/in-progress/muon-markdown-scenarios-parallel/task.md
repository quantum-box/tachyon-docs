# Muon: Markdown Scenario Migration & CI Parallel Execution

## Overview

Muon scenario tests を全て Markdown (`.scenario.md`) 形式に統一し、Muon 側のドキュメント・テストを充実させる。
併せて CI ワークフローを改善し、関係のないシナリオを並列実行できるようにする。

## Background

### Current State

| API | YAML files | Markdown files | Total |
|-----|-----------|---------------|-------|
| tachyon-api | 43 | 7 | 50 |
| library-api | 11 | 0 | 11 |
| bakuure-api | 5 | 0 | 5 |
| **Total** | **59** | **7** | **66** |

- Muon は既に `.scenario.md` パーサーを実装済み (`markdown_parser.rs`, 611 LOC)
- 7 ファイルが既に Markdown 形式に移行済み（tachyon-api のみ）
- CI は 3 サービス間は並列だが、サービス内は逐次実行

### Pain Points

1. YAML形式は可読性が低く、テストの意図（なぜこのステップが必要か）が伝わりにくい
2. Muon の Markdown ドキュメントが README に1行しかない
3. Muon の Markdown パーサーのテストは十分だが、integration test に Markdown シナリオがない
4. tachyon-api の 43 YAML テストが逐次実行 → CI 時間のボトルネック

## Goals

1. **全 59 YAML シナリオを `.scenario.md` に変換**
2. **Muon のドキュメントを充実**（Markdown 形式のガイド、ベストプラクティス）
3. **Muon のテストを強化**（Markdown integration test 追加）
4. **CI ワークフローの並列化**（独立したシナリオグループを並列実行）

## Implementation Plan

### Phase 1: Muon Documentation & Tests (muon submodule)

#### 1-1. README.md にMarkdown形式のドキュメント追加

現在の README には YAML の例しかない。Markdown 形式のセクションを追加:

```markdown
## Markdown scenario format

Scenarios can be written as `.scenario.md` files, combining
documentation and test definitions in a single file.

### Structure

1. YAML front matter (`---`) for metadata and config
2. Markdown headings and text for documentation
3. `yaml scenario` fenced code blocks for test steps

### Example

(full example with explanation)
```

#### 1-2. Markdown integration test の追加

`muon/tests/` に Markdown 形式の integration test を追加:
- `tests/fixtures/sample.scenario.md` — 基本的な Markdown シナリオ
- `tests/integration.rs` に Markdown シナリオの実行テスト追加

#### 1-3. Markdown ベストプラクティスドキュメント

`muon/docs/markdown-guide.md`:
- フォーマット仕様の詳細
- YAML → Markdown 変換のガイドライン
- ステップ間の説明文の書き方
- 変数の使い方の例

### Phase 2: YAML → Markdown 変換 (tachyon-apps)

#### 変換ルール

YAML:
```yaml
name: API Test
description: Test description
config:
  headers:
    Authorization: Bearer dummy-token
steps:
  - id: step1
    name: Create resource
    request:
      method: POST
      url: /v1/resources
      body:
        name: test
    expect:
      status: 201
    save:
      resource_id: id
```

→ Markdown:
```markdown
---
name: API Test
description: Test description
config:
  headers:
    Authorization: Bearer dummy-token
---

# API Test

Test description

## Step 1: Create resource

Create a new resource to verify the POST endpoint works correctly.

```yaml scenario
steps:
  - id: step1
    name: Create resource
    request:
      method: POST
      url: /v1/resources
      body:
        name: test
    expect:
      status: 201
    save:
      resource_id: id
```
```

#### 変換対象ファイル一覧

**tachyon-api (43 files):**

| Category | Files |
|----------|-------|
| Agent/AI | agent_api_test, agent_verification_loop_test, agent_sub_agent_test, agent_sub_agent_async_test, agent_client_tool_call_test, agent_client_tool_result, agent_idempotency_test, agent_tool_job_callback_test, agent_attempt_completion_test, agent_protocol_crud, agent_models_list, agent_api_variant_usage, message_retry_rollback |
| Auth/Policy | policy_lifecycle, user_policy_management, tenant_scoped_user_policy, enforce_tenant_scoped_user_policies, auth_rest, invite_user |
| Feature Flags | feature_flag_crud, feature_flag_context_controls, feature_flag_inheritance, feature_flag_values_batch, feature_flag_platform_override_create, feature_flag_host_platform_alignment |
| Catalog/Commerce | catalog_service_cost, catalog_service_price_mapping, catalog_service_price_mapping_create, catalog_product_variant_crud, pricing_product_sku_mapping_crud |
| Chatroom | chatroom, chatroom_metadata |
| Infrastructure | api_key_rest, credit_balance_lifecycle, delivery_rest, integration_rest, storage_rest, scenario_report_rest, service_account_api_key, service_account_chatroom_creation, payment_service_cost_check |
| Platform | multi_tenancy_access, operator_lifecycle, platform_profit_summary, signup_onboarding_agent_flow |
| Misc | seed_data_apply, github_webhook_test, image_generation_rest, library_repo_iam_policy, mcp_config_validation, mock_provider_coexistence, tool_search_rest |

**library-api (11 files):**
- library_organization_lifecycle, library_org_member_role, library_repo_member_permission, library_repo_lifecycle, library_source_and_api_key, library_property_data_lifecycle, inbound_sync_webhook_lifecycle, rest_library_endpoints, library_repo_iam_policy, library_property_update, library_repo_visibility

**bakuure-api (5 files):**
- health_check, product_crud, quote_lifecycle, deal_automation_crud, self_service_order

#### 変換の進め方

1. カテゴリごとにバッチ変換（agent → auth → feature_flag → ...）
2. 各バッチ変換後にシナリオテスト実行で動作確認
3. 各ステップに日本語の説明コメントを追加（テストの意図を明確にする）

### Phase 3: CI ワークフロー並列化

#### 現状の問題

```
scenario-test (tachyon-api):
  [agent_api_test] → [chatroom] → [catalog_*] → ... → [integration_rest]
  ~~~~~~~~~~~~~~~~~~~~~~~~~ 7-8分 逐次実行 ~~~~~~~~~~~~~~~~~~~~~~~~~
```

#### 並列化の設計

**方針**: tachyon-api のシナリオを独立したグループに分割し、matrix strategy で並列実行。

```yaml
# .github/workflows/rust.yaml
scenario-test:
  strategy:
    fail-fast: false
    matrix:
      group:
        - name: agent
          filter: "agent_"
        - name: auth-policy
          filter: "policy_|user_policy|tenant_scoped|enforce_|auth_rest|invite_"
        - name: feature-flags
          filter: "feature_flag_"
        - name: commerce
          filter: "catalog_|pricing_|commerce_|payment_|credit_|delivery_"
        - name: platform-infra
          filter: "operator_|multi_tenancy|signup_|platform_|seed_data"
        - name: rest-misc
          filter: "api_key_|storage_|scenario_report_|service_account_|integration_|chatroom|mcp_|mock_|github_|image_|tool_|library_repo_iam"
```

#### 実装方法

1. **Muon にフィルター機能の強化**: 既存の `filter` パラメータを正規表現対応に
2. **テストランナーの `filter` 対応**: `run_tests.rs` で `TEST_SCENARIO_FILTER` が正規表現をサポート
3. **CI matrix の設定**: 各グループを別ジョブとして並列起動
4. **DB の独立性確保**: 各ジョブが独立した DB state で動くことを確認

#### 期待される効果

- 現在: ~8分 (逐次)
- 並列化後: ~3分 (最長グループの実行時間)
- 削減率: ~60%

### Phase 4: テストランナーの改善

#### 4-1. `run_tests.rs` の `.scenario.md` 対応確認

現在のテストランナーが `.yaml` のみをロードしている場合、`.scenario.md` もロードするよう修正。

#### 4-2. Muon の config.rs 確認

`load_scenarios_from_directory()` が `.scenario.md` を正しく検出・ロードすることを確認。

## File Changes

### Muon (submodule)
| File | Change |
|------|--------|
| `README.md` | Markdown format documentation 追加 |
| `docs/markdown-guide.md` | 新規: Markdown scenario ガイド |
| `tests/fixtures/sample.scenario.md` | 新規: Markdown integration test fixture |
| `tests/integration.rs` | Markdown scenario 実行テスト追加 |

### tachyon-apps
| File | Change |
|------|--------|
| `apps/tachyon-api/tests/scenarios/*.yaml` | → `*.scenario.md` (43 files) |
| `apps/library-api/tests/scenarios/*.yaml` | → `*.scenario.md` (11 files) |
| `apps/bakuure-api/tests/scenarios/*.yaml` | → `*.scenario.md` (5 files) |
| `.github/workflows/rust.yaml` | scenario-test ジョブの並列化 |
| `apps/*/tests/run_tests.rs` | `.scenario.md` ロード対応確認 |

## Progress

- [x] Phase 1: Muon Documentation & Tests
  - [x] 1-1. README.md にMarkdown形式ドキュメント追加
  - [x] 1-2. Markdown integration test 追加 (3 tests: json_match, multi_step, status_mismatch)
  - [x] 1-3. Markdown ベストプラクティスドキュメント (muon/docs/markdown-guide.md)
- [x] Phase 2: YAML → Markdown 変換 (全67ファイル一括変換完了)
  - [x] tachyon-api (51 files → .scenario.md, YAML削除済み)
  - [x] library-api (11 files → .scenario.md, YAML削除済み)
  - [x] bakuure-api (5 files → .scenario.md, YAML削除済み)
  - 最終状態: tachyon-api 59, library-api 11, bakuure-api 5 = 75 .scenario.md files
- [x] Phase 3: CI ワークフロー並列化
  - [x] TestScenario に tags フィールド追加 (muon/src/model.rs)
  - [x] Markdown parser で tags を front matter から渡すよう修正
  - [x] run_tests.rs に TEST_SCENARIO_TAGS 環境変数フィルタリング追加
  - [x] 全59シナリオにタグ付与 (agent/auth/feature-flag/commerce/platform/infra/chatroom/misc)
  - [x] CI matrix 設定 (6並列グループ: agent, auth, feature-flag, commerce, platform, infra-misc)
- [x] Phase 4: テストランナー改善
  - [x] `.scenario.md` ロード対応確認 (TestConfigManager が自動検出、変更不要)
  - [x] cargo check -p tachyon-api --test run_tests でビルド確認
