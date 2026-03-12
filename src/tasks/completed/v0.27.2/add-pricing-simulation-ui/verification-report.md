# Verification Report

## 実行したテスト
- [x] `mise run docker-nextest -- -p catalog test_price_simulation`
- [x] `mise run docker-scenario-test`
- [x] `mise run docker-ci-node`
- [ ] `cargo test -p catalog`
- [x] `yarn lint --filter=tachyon` (docker-ci-node内で実行)
- [x] `yarn ts --filter=tachyon` (docker-ci-node内で実行)
- [x] Playwright MCP シナリオ

## メモ
- `PricingService::simulate_price_change` が既存価格との差分を計算できることをユニットテストで確認（スタブリポジトリで検証）。
- `mise run docker-scenario-test` は全シナリオ成功。途中で OpenTelemetry のDNS解決エラーや ParseError ログが出たが、テスト結果は成功扱い。
- `pricing_simulation.yaml` を追加し、`createPricingPolicy` → `pricingSimulation` のユースケース検証を実施。
- GraphQLエンドポイント `http://localhost:50054/v1/graphql` に対して `createPricingPolicy` (tenant=`tn_01hjryxysgey07h5jz5wagqj0m`) を実行し、シミュレーション用ドラフトポリシー `Standard Simulation Policy` を登録（curlコマンド使用）。
- Playwrightで `/pricing/analysis` を開き、マークアップを 40% に設定して「シミュレーションを実行」を押下。既存 30% → 40% の概要カードが描画され、推定収益インパクトは `$0.00`（現状サービス価格が未設定のため差分なし）。
- 取得スクリーンショット:
  - デスクトップ幅: `docs/src/tasks/completed/v0.27.2/add-pricing-simulation-ui/screenshots/pricing-analysis-desktop.png`
  - モバイル幅: `docs/src/tasks/completed/v0.27.2/add-pricing-simulation-ui/screenshots/pricing-analysis-mobile.png`
- 補足: 既存UIの `createPricingPolicy` ミューテーションは入力オブジェクトを期待しているためダイアログ経由の作成操作はスキーマ不整合で失敗（既知の差異）。暫定的にGraphQL直接実行でポリシーを用意して動作確認した。
- `docker compose run --rm --no-deps tachyon yarn format:write --filter=tachyon` で `PriceAnalysis.tsx` のフォーマットを修正し、`mise run docker-ci-node` が成功。
