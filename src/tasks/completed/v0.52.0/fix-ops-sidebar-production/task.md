# 本番環境 Ops サイドバー非表示の修正

## 概要
本番環境のサイドバーに「Scenario Tests」（System グループ）が表示されていない問題を修正する。

## 原因分析

### サイドバーの表示制御
`apps/tachyon/src/app/v1beta/[tenant_id]/sidebar-config.ts` にて、サイドバー項目は以下の2条件で表示が制御される：
1. **featureEnabled**: フィーチャーフラグが有効か
2. **policyAllowed**: ユーザーが必要なアクション権限を持っているか

両方が `true` でないとサイドバーに表示されない（`sidebar-config.ts` line 482: `if (result.featureEnabled && result.policyAllowed)`）。

### Scenario Tests の設定
```typescript
{
  key: 'scenarioTests',
  title: 'Scenario Tests',
  url: '/ops/scenario-tests',
  icon: TestTube2,
  action: 'scenario_report:ListTestRuns',
}
```

### 問題箇所（2つ）

#### 問題1: AdminPolicy に scenario_report アクションが紐づいていない
`scripts/seeds/n1-seed/008-auth-policies.yaml` にて：
- `ScenarioReportFullAccessPolicy` (`pol_01scenreportfull001`) にはアクションが紐づいている
- **AdminPolicy (`pol_01hjryxysgey07h5jz5w00001`) にはscenario_reportアクションが紐づいていない**
- → `policyAllowed: false`

#### 問題2: context.scenario_report フィーチャーフラグが未登録
`scripts/seeds/n1-seed/009-feature-flags.yaml` にて：
- 他のコンテキスト（`context.llms`, `context.auth`, `context.agents` 等）はすべて3レベル（Host/Platform/Dev）で登録済み
- **`context.scenario_report` が一切登録されていない**
- → `EnsureFeatureEnabled` が `NotFound` エラーを返し、`featureEnabled: false`

## 修正内容

### Step 1: AdminPolicy に scenario_report アクションを追加 ✅
`scripts/seeds/n1-seed/008-auth-policies.yaml` の `policy_actions` に以下を追加：

```yaml
# --- scenario_report actions → AdminPolicy ---
- action_id: act_01scenreportsubmit01 # scenario_report:SubmitTestRun
  effect: allow
  policy_id: pol_01hjryxysgey07h5jz5w00001
- action_id: act_01scenreportget00001 # scenario_report:GetTestRun
  effect: allow
  policy_id: pol_01hjryxysgey07h5jz5w00001
- action_id: act_01scenreportlist0001 # scenario_report:ListTestRuns
  effect: allow
  policy_id: pol_01hjryxysgey07h5jz5w00001
```

### Step 2: context.scenario_report フィーチャーフラグを登録 ✅
`scripts/seeds/n1-seed/009-feature-flags.yaml` に3レベルで追加：

```yaml
# Host baseline
- id: fe_01kj0ccesn8xhqswvnsn5qrrd3
  tenant_id: tn_01jcjtqxah6mhyw4e5mahg02nd  # Host
  key: context.scenario_report
  enabled: 1

# Tachyon Platform (production)
- id: fe_01kj0ccevmsaynncnt3yrd4fy1
  tenant_id: tn_01hjjn348rn3t49zz6hvmfq67p
  key: context.scenario_report
  enabled: 1

# Tachyon Dev
- id: fe_01kj0ccexn9ne5c73ddgrrc0rr
  tenant_id: tn_01hjryxysgey07h5jz5wagqj0m
  key: context.scenario_report
  enabled: 1
```

### Step 3: シード適用 ✅
- 開発環境: `mise run docker-seed` で適用済み
- 本番環境: デプロイ後にシード適用

### Step 4: 動作確認 ✅
- [x] GraphQL API で `featureEnabled: true` / `policyAllowed: true` を確認
- [x] 開発環境でサイドバーに Scenario Tests が表示されること（Playwright で確認）
- [x] テスト結果一覧ページ（19件）が正常に動作すること

## 動作確認スクリーンショット
- `screenshots/sidebar-check.png` - サイドバー全体
- `screenshots/scenario-tests-page.png` - Scenario Tests ページ

## 影響範囲
- AdminPolicy を持つ全ユーザーに scenario_report の権限が付与される
- 既存の ScenarioReportFullAccessPolicy は引き続き独立ポリシーとして機能
- フィーチャーフラグは全テナント（Host/Platform/Dev）で有効化
