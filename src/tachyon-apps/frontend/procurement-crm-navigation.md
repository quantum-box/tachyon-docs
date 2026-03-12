# Procurement / CRM ナビゲーション仕様

## 概要

Tachyon のテナント向けサイドバーでは、`Procurement` と `CRM` グループを Feature Flag・ポリシー判定の結果に基づいて動的に表示する。`apps/tachyon/src/app/v1beta/[tenant_id]/sidebar-config.ts` の `SIDEBAR_GROUP_CONFIG` に定義される各メニュー項目は、GraphQL 経由で取得した `featureFlagActionAccess` の判定（`featureEnabled && policyAllowed`）が `true` のときのみ描画される。

- 対象リリース: v0.15.0（`restore-procurement-nav-menu` バグ修正タスク）
- UI 配置: `/v1beta/[tenant_id]` レイアウト配下の共通サイドバー
- 非表示条件: Feature Flag 無効／ポリシー否認／GraphQL エラー時

## メニュー構成

| グループ | アクション | Feature Flag | 主要リンク |
| --- | --- | --- | --- |
| `procurement` | `procurement:ListProcurementPrices` | `context.procurement` | `/procurement`, `/procurement/products`, `/procurement/prices`, `/procurement/contracts`, `/procurement/suppliers` |
| `crm` | `crm:GetClient` | `context.crm` | `/crm`, `/crm/clients`, `/crm/deals`, `/crm/quotes`, `/crm/integrations` |

- 翻訳キーは `t.v1beta.sidebar.groups.procurement` / `t.v1beta.sidebar.groups.crm` に定義し、`sidebar.tsx` 内で辞書適用する。
- `collectSidebarActionInputs` がサイドバーの全アクションを重複なく収集し、GraphQL クエリ変数 `FeatureFlagActionInput[]` を構成する。

## アクセス制御フロー

1. `collectSidebarActionInputs()` が `Procurement` / `CRM` を含むアクション一覧を生成。
2. `apps/tachyon/src/app/v1beta/[tenant_id]/queries/menu-access.graphql`（`GetFeatureFlagActionAccess`）を実行し、`featureFlagActionAccess` を取得。
3. `toActionAccessMap` が `action` をキーとするマップへ整形。
4. `buildSidebarGroups` が `featureEnabled && policyAllowed` を満たす項目のみを残し、サイドバー構造を返す。
5. フェッチ中 (`isCheckingAccess === true`) はサイドバーを空にし、スケルトンのみ表示。エラー発生時は `console.error` を一度だけ出力し、UI は空状態を保つ。

## Feature Flag / ポリシー設定

- Feature Flag シード: `scripts/seeds/n1-seed/009-feature-flags.yaml`
  - Platform (`tn_01hjjn348rn3t49zz6hvmfq67p`) と Host (`tn_01jcjtqxah6mhyw4e5mahg02nd`) へ `context.procurement` / `context.crm` を追加し、有効化済み。
  - `EnsureFeatureEnabled` ユースケースが `context.procurement` / `context.crm` を候補として評価するよう調整済み（`packages/feature_flag/src/usecase/ensure_feature_enabled.rs`）。
- ポリシー許可: `procurement:ListProcurementPrices` と `crm:GetClient` を `AdminPolicy` およびプラットフォーム管理者向けポリシーへ付与済み（`scripts/seeds/n1-seed/008-auth-policies.yaml`）。
  - GraphQL リゾルバーは `featureFlagActionAccess` において Feature Flag と Policy 判定結果を併記し、否認理由を `featureError` / `policyError` に格納する。

## エラーハンドリングとフォールバック

- GraphQL クエリ失敗時は `console.error('Failed to fetch feature flag access', error)` を出力し、サイドバー表示をスキップ。
- 不正な判定結果が返った場合はメニューが表示されないが、クイックアクセスなど他要素には影響しない。
- `featureFlagActionAccess` の `featureError` / `policyError` に値が入った場合は UI から非表示にし、バックエンド側のログで原因調査を行う。

## テストと検証

- 単体テスト: `apps/tachyon/src/app/v1beta/[tenant_id]/sidebar-config.test.ts`
  - `collectSidebarActionInputs` が `procurement:ListProcurementPrices` / `crm:GetClient` を必ず含むことを検証。
  - Feature Flag 否認時にメニューが除外されることを確認。
- GraphQL 統合テスト: `apps/tachyon-api/tests/feature_flag_nav.rs`
  - `procurement:ListProcurementPrices` / `crm:GetClient` を含むアクション配列に対し、`featureEnabled` / `policyAllowed` が `true`であることを検証。
- 動作確認: `v1beta` テナント (`tn_01hjryxysgey07h5jz5wagqj0m`) でサインイン後、サイドバーに `Procurement` と `CRM` グループが表示されることを Playwright MCP の手動セッションで確認（2025-10-12）。

## 関連ドキュメント

- [タスク: restore-procurement-nav-menu](../../tasks/completed/v0.15.0/restore-procurement-nav-menu/task.md)
- [Pricing コンテキスト仕様](../pricing/pricing-context-specification.md)
- [Feature Flag / Policy 統合](../feature-flag/policy-action-integration.md)
