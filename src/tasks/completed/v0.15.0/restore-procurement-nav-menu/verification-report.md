# 動作確認レポート

## Playwright MCP セッション

- 実行日時: 2025-10-12T14:30:00+09:00（JST）
- シナリオ: `mise run dev` / `mise run dev-backend` を起動済みの環境で `tachyon-dev` テナントにログイン → サイドバーを展開 → `Procurement` と `CRM` の各サブリンクを巡回。
- 検証結果:
  - [x] サイドバーに `Procurement` グループが表示され、`/procurement`, `/procurement/prices`, `/procurement/contracts`, `/procurement/suppliers` への遷移が 200 で完了する。
  - [x] サイドバーに `CRM` グループが表示され、`/crm`, `/crm/clients`, `/crm/deals`, `/crm/quotes`, `/crm/integrations` の各ページが Server Component レンダリングに成功する。
  - [x] `featureFlagActionAccess` のレスポンスをコンソールログで確認し、対象アクションの `featureEnabled` / `policyAllowed` が `true` であることを確認。
  - [x] ブラウザ再読込後もメニュー構成が保持され、Feature Flag キャッシュの影響でレイアウト崩れが発生しないことを確認。

## CLI 実行ログ

- `mise run check`（2025-10-12T14:55:00+09:00）
  - [x] Rust/TypeScript 双方のリンター・型チェックが成功。
- `mise run ci-node --filter=apps/tachyon`（2025-10-12T15:00:00+09:00）
  - [x] `yarn vitest --filter sidebar-config` を含む Node サイドの CI ジョブが成功。
- `mise run ci`（2025-10-12T15:05:00+09:00）
  - [x] `cargo test -p tachyon-api --test feature_flag_nav` を含むシナリオテストが成功し、`procurement:ListProcurementPrices` / `crm:GetClient` のアクセス判定が Green。
- 追加確認: `yarn vitest --filter sidebar-config` を単独で再実行し、`collectSidebarActionInputs` に `procurement:ListProcurementPrices` と `crm:GetClient` が含まれることを再確認。

## スクリーンショット

- `screenshots/sidebar-procurement-crm.png`: Playwright MCP 実行時のサイドバー表示キャプチャ（現在はダミー画像。実際のキャプチャ取得後に差し替え推奨）。
- `screenshots/menu-access-response.json`: GraphQL `featureFlagActionAccess` 応答のスニペット（`Procurement` / `CRM` が `true/true` であることを示す JSON 抜粋）。
