# Library API シナリオテスト拡充 動作確認レポート

## 実施日
- 2025-11-30（再実行・REST追加）

## 実行コマンド
- `mise run library-api-scenario-test`

## 結果
- ✅ 成功（全5シナリオがグリーン）

## ログ抜粋 / 共有事項
- Property/Dataシナリオを拡充（STRING/SELECT/MULTI_SELECT追加、Data更新まで確認）。SelectItemのフィールドが `key/name` である点に合わせてクエリを修正。
- Source/API Key シナリオを実装し、作成→取得→更新→削除と API Key 作成/一覧を確認。
- RESTエンドポイント（Org/Repo/Property/Data/Source）を網羅する `rest_library_endpoints.yaml` を追加。REST側でも dummy-token が使えるよう `library_executor_extractor` を test 環境に対応させた。
- IAMシナリオは library-api の GraphQL スキーマに actions/policy クエリが無いため暫定でヘルスチェックのみ。スキーマ拡充後に再度テストを追加予定。
- `add_data.rs` の unwrap を除去し、エラーとして返すように修正。今回の実行ではパニックなし。

## 次のアクション候補
1. library-api 側で IAM クエリ公開後、ポリシー検証シナリオを復活させる。
2. マルチテナンシー境界（異なる platform/operator でのアクセス制御）のネガティブシナリオを追加する。
3. Property削除やData検索/削除など本実装が入った際にシナリオを拡張する。
