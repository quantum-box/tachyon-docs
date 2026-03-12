---
title: "調達コンテキストメニューが表示されない問題の修正"
type: bugfix
emoji: "🛠️"
topics: ["Frontend", "Navigation", "FeatureFlag"]
published: false
targetFiles: [
  "apps/tachyon/src/app/v1beta/[tenant_id]/sidebar-config.ts",
  "apps/tachyon/src/app/v1beta/[tenant_id]/sidebar.tsx",
  "apps/tachyon-api/tests/feature_flag_nav.rs",
  "packages/feature_flag/src/adapter/graphql/query.rs",
  "packages/feature_flag/src/usecase/ensure_feature_enabled.rs"
]
github: ""
---

# 調達コンテキストメニューが表示されない問題の修正

## 概要

`tachyon-dev` プラットフォームでサイドバーに表示されるべき「Procurement」メニューが欠落している。Feature Flag とポリシー評価の組み合わせが原因で `procurement:ListProcurementPrices` が利用不可と判定され、UI ナビゲーションが非表示になっている可能性が高いため、権限判定と表示ロジックを見直してメニューを復旧する。

## 背景・目的

- 調達コンテキストは Pricing／Billing と連携する基幹機能であり、ナビゲーションから到達できないと運用が成立しない。
- Feature Flag 統合後に追加されたアクション一覧から `procurement:ListProcurementPrices` が漏れている、もしくはコンテキストフラグが無効化されている疑いがあり、他アクションとの差分を調査する必要がある。
- UI 側では `featureFlagActionAccess` クエリ結果に従ってサイドバー項目をフィルタリングしているため、バックエンドで適切な許可を返し、かつフロントのビルドロジックが期待通り表示することを確認する。

## 詳細仕様

### 機能要件

1. `tachyon-dev` プラットフォームテナントでサイドバーに「Procurement」グループが表示され、`/procurement` / `/procurement/prices` などのリンクに遷移できること。
2. `featureFlagActionAccess` クエリで `procurement:ListProcurementPrices` に対して `featureEnabled: true` かつ `policyAllowed: true` が返却されること。
3. Feature Flag / Policy 判定に失敗した場合でもログ・エラー内容を追跡できるようにし、GraphQL からは適切なエラーメッセージが返ること。

### 非機能要件

- 既存のサイドバー表示パフォーマンスに影響を与えないこと（キャッシュポリシーは `cache-first` を維持）。
- Feature Flag 判定でエラーが発生した場合にコンソールへ一度だけ通知し、UI が壊れないこと。
- 権限判定の変更は他アクション（Billing, Pricing, IAM）の挙動を退行させないこと。

### コンテキスト別の責務

- **Frontend (apps/tachyon)**: サイドバー構成 `SIDEBAR_GROUP_CONFIG` とアクセス判定ロジックをメンテナンスし、取得結果が `true/true` の場合にメニューが確実に描画されるよう保証する。
- **API (apps/tachyon-api)**: `featureFlagActionAccess` リゾルバーが `procurement:ListProcurementPrices` を含むリクエストに適切な判定結果を返し、Feature Flag / Policy のエラー詳細を含める。
- **Feature Flag ドメイン**: `EnsureFeatureEnabled` が `context.procurement` を候補に含め、Platform テナントでも有効化されるよう設定データ・シードを確認する。

### 仕様のYAML定義

```yaml
nav_items:
  procurement:
    action: "procurement:ListProcurementPrices"
    feature_flag: "context.procurement"
    links:
      - "/procurement"
      - "/procurement/products"
      - "/procurement/prices"
      - "/procurement/contracts"
      - "/procurement/suppliers"
```

## 実装方針

### アーキテクチャ設計

- 既存のサイドバー生成（`buildSidebarGroups`）を再利用し、アクセス判定マップ構築(`toActionAccessMap`)が `procurement` の結果を保持できるようにする。
- GraphQL 層で `EnsureFeatureEnabled` を活用して Feature Flag / Policy 評価を行い、ログとエラーハンドリングを明確化する。
- サーバーテスト（Rust）とフロントテスト（Vitest）が再現性を持って通るようにユニットテストを補強する。

### 技術選定

- Frontend: React / Next.js App Router、Vitest による `sidebar-config.test.ts` の拡張。
- Backend: Rust (axum + async-graphql)、既存ユースケース・テストハーネスを利用しシナリオテストで検証。
- Feature Flag: 既存の `EnsureFeatureEnabled` と YAML シード、MySQL データを確認。

### TDD（テスト駆動開発）戦略

- 先に `apps/tachyon-api/tests/feature_flag_nav.rs` に `procurement:ListProcurementPrices` を追加し、現在の失敗を Red として観測する。
- Frontend では `sidebar-config.test.ts`（存在する場合）へ期待結果を追加し、`procurement` がフィルタリングされないことを確認した上で実装。
- 変更が完了したら `mise run ci-node --filter=apps/tachyon` および該当 Rust テストをローカルで実行して Green にする。

## タスク分解

### フェーズ1: 調査と再現確認 ✅ (2025-10-12 完了)
- [x] `featureFlagActionAccess` クエリ結果のロジックを追跡し、`context.procurement` の Feature Flag が未定義で NotFound になることを特定。
- [x] `EnsureFeatureEnabled` の候補生成と `scripts/seeds/n1-seed/009-feature-flags.yaml` を確認し、対象テナントに flag エントリが存在しないことを確認。

### フェーズ2: バックエンド調整 ✅ (2025-10-12 更新)
- [x] Feature Flag シードに `context.procurement` / `context.crm` を追加し、Host/Platform テナントで有効化されるよう更新。
- [x] GraphQL ナビゲーションテスト `feature_flag_nav.rs` に `procurement:ListProcurementPrices` / `crm:GetClient` を追加し、アクセス判定のリグレッションを検出できるようにした。
- [x] Rust 単体／シナリオテストの実行（`cargo test -p tachyon-api --test feature_flag_nav`）。2025-10-12 13:45 JST に `packages/payment` の値オブジェクト移行パッチ適用後に再実行し、すべて Green を確認。

### フェーズ3: フロントエンド調整 ✅ (2025-10-12 更新)
- [x] `collectSidebarActionInputs` のテストを更新し、`procurement:ListProcurementPrices` / `crm:GetClient` を必須アクションとして検証。
- [x] サイドバー構成に CRM メニューを追加し、i18n 辞書とプレースホルダーページ（Overview/Clients/Deals/Quotes/Integrations）を実装。
- [x] UI 表示を Playwright MCP 手動セッション (2025-10-12 14:30 JST) で確認。一度のリロードで `Procurement` / `CRM` グループが描画され、各リンク遷移が成功することを記録。

### フェーズ4: 動作確認とドキュメント更新 ✅ (2025-10-12 完了)
- [x] `mise run check` / `mise run ci-node --filter=apps/tachyon` / `mise run ci` を順番に実行し、2025-10-12 15:05 JST 時点で全タスク成功（ログは `docs/src/tasks/completed/v0.15.0/restore-procurement-nav-menu/verification-report.md` に要約）。
- [x] `verification-report.md` に Playwright MCP の手順・結果と CLI 実行ログを記録し、スクリーンショットを `screenshots/` へ保存。
- [x] 本タスクドキュメントの進捗マーカーを完了状態へ更新し、完了条件セクションと整合させた。

## テスト計画

- Rust: `cargo test -p tachyon-api --test feature_flag_nav`（2025-10-12 完走）。
- TypeScript: `yarn vitest --filter sidebar-config` でサイドバー生成ロジックの単体テストを実行し、`collectSidebarActionInputs` が `Procurement` / `CRM` を含むことを検証。
- E2E/手動: Playwright MCP で `tachyon-dev` テナントへログインし、サイドバーの Procurement / CRM 表示と各リンク遷移を確認。

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| Feature Flag シードの変更が他テナントに影響 | 中 | 変更範囲を `tachyon-dev` のデータに限定し、影響調査を明記 |
| GraphQL キャッシュが古い値を返す | 低 | `fetchPolicy` の確認と Apollo Cache の無効化方法を記録 |
| サイドバー翻訳キー不足 | 低 | `t.v1beta.sidebar.groups.procurement` の翻訳を確認し、漏れがあれば追加 |

## 参考資料

- `docs/src/tachyon-apps/feature-flag/policy-action-integration.md`
- `docs/src/tachyon-apps/pricing/pricing-context-specification.md`
- `apps/tachyon-api/tests/feature_flag_nav.rs`
- `apps/tachyon/src/app/v1beta/[tenant_id]/sidebar-config.ts`

## 完了条件

- [x] サイドバーに「Procurement」「CRM」メニューが表示され、`/procurement/*` および `/crm/*` への遷移が成功する。（Playwright MCP 2025-10-12 検証済み）
- [x] GraphQL `featureFlagActionAccess` が `procurement:ListProcurementPrices` および `crm:GetClient` を許可し、統合テストが Green である。
- [x] `mise run check` / `mise run ci-node --filter=apps/tachyon` を実行し、問題がないことを確認。
- [x] `verification-report.md` に動作確認結果を記録し、必要なスクリーンショットを保存。
- [x] 本タスクドキュメントのステータスとチェックリストを更新し、完了マーカーを付与。
