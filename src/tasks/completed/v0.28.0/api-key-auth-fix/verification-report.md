# tachyon-api APIキー動作確認レポート

実施日: 2026-01-12
実施者: @opencode

## 環境情報
- 実行環境: ローカルDocker
- API: tachyon-api
- GraphQL: http://localhost:50054/v1/graphql

## 動作確認結果

### ✅ 正常系
- [x] GraphQLでAPIキー発行が成功する（手動確認済み）
- [ ] GraphQLでAPIキー一覧が取得できる（未実施）
- [x] RESTでAPIキー認証が成功する（シナリオ実行済み）

### ❌ 異常系
- [x] 無効なAPIキーで401/403になる（シナリオ実行済み）
- [x] APIキー未指定で401/403になる（シナリオ実行済み）

## 発見した問題

1. 特になし（`tachyon-api-scenario-test` は全シナリオ成功、`UserId` パースエラーも解消）

## 改善提案

- GraphQLでAPIキー一覧取得の手動確認を行う
