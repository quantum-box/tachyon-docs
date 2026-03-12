# Storybookテストランナー安定化

## 概要
`yarn test-storybook --filter=tachyon` 実行時に発生していたストーリーロード失敗（MissingStoryAfterHmrError）を解消し、フロントエンドのStorybookインタラクションテストを安定稼働させるための修正内容と運用フローをまとめる。

## 背景
- 既存フローでは `test-storybook` がソースコードを直接解釈しつつ、ローカルで未ビルドの Storybook を動的に参照していたため、App Router ベースの構成とHMR判定が噛み合わず 82 件の MissingStory エラーが発生していた。
- Apollo Client や SWR を利用するストーリーでは、GraphQL/RESTモックが不足しておりテストランナー上でネットワークアクセスが発生 → Apollo の `message 58` エラーやコンボボックスの `disabled` 状態が発生していた。

## 実装内容
### 1. Storybookテスト専用ランナーの整備
- `apps/tachyon/scripts/run-storybook-tests.js` を追加し、以下を自動化。
  1. Storybook の静的ビルド生成 (`storybook build --output-dir storybook-test-static`).
  2. Nodeプロセス経由で `http-server` を起動し、静的ビルドを `http://127.0.0.1:6106` で公開。
  3. `test-storybook --url http://127.0.0.1:6106` を実行し、レンダリング済みの `index.json` に対してテストを実施。
- 依存バイナリは `require.resolve` で解決し、OS差分を吸収。
- 終了時に静的ビルドディレクトリをクリーンアップし、同時実行でも後片付けされるようにしている。

### 2. Frontend Story Mock の補強
- `ModelSelector` ストーリー: `SWRConfig` の `fallback` に `unstable_serialize` を用いたプリロードを設定し、`supported_features` を含むダミーデータでロード完了状態を再現。`revalidateOnMount: false` で初回にフェッチが走らないよう制御。
- `PriceAnalysis` ストーリー: `MockedProvider` と GraphQL モックをシナリオ別に定義し、`PricingSimulation` クエリに対するエラーを排除。読み込み・空・エラー・シミュレーション結果などユースケースごとに `apolloMocks` を差し替え可能な構成へ整理。

## 利用手順
```bash
# フロントエンド Storybook テスト
yarn test-storybook --filter=tachyon
```
- テストコマンドは Turbo 経由で `node ./scripts/run-storybook-tests.js` をコールする。
- `STORYBOOK_TEST_PORT` / `STORYBOOK_TEST_HOST` を環境変数指定することでポート競合を回避可能（デフォルト: 6106 / 127.0.0.1）。

## 運用上の注意
- Storybook ビルド時に大きなバンドルが警告されるが、今回の修正では機能影響なし。将来的なパフォーマンス改善タスクで対応を検討。
- GraphQLやSWRを利用する新規ストーリーを追加する際は、本ドキュメントのモックパターンを参考に `MockedProvider` / `SWRConfig` へフェイクデータを渡すこと。

## 関連ファイル
- `apps/tachyon/scripts/run-storybook-tests.js`
- `apps/tachyon/package.json` (`test-storybook` スクリプト)
- `apps/tachyon/src/components/agent/ModelSelector.stories.tsx`
- `apps/tachyon/src/app/v1beta/[tenant_id]/pricing/analysis/components/PriceAnalysis.stories.tsx`
- タスク記録: `docs/src/tasks/completed/v0.15.0/fix-tachyon-storybook-tests/`
