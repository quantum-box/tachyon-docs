# Storybook テスト検証レポート

- 実行日: 2025-10-14 17:06:08 JST
- 実行コマンド: `yarn test-storybook --filter=tachyon`
- 結果: ✅ 467 件成功 / 0 件失敗 / 0 件スキップ

## 主な確認ポイント
- Storybook テスト実行時にローカルで静的ビルドを生成しテストランナーへ供給できることを確認。
- `Agent/ModelSelector` ストーリーで SWR モックが機能し、コンボボックスが有効状態で描画されることを確認。
- `Pricing/PriceAnalysis` ストーリーで GraphQL クエリを `MockedProvider` でモックし、Apollo のネットワークエラーが発生しないことを確認。

## 追加観察
- Storybook ビルド時にアセットサイズ警告が出力されたが、今回の修正範囲外のため現状維持。
