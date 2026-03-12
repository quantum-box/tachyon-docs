# Library API シナリオテスト仕様

## 概要
Library API の主要ユースケース（Org/Repo/Property/Data/Source/API Key）の GraphQL & REST シナリオテスト仕様をまとめる。`mise run library-api-scenario-test` でローカル／CI ともに同一結果となるよう設計する。

## カバレッジ
- Organization / Repository ライフサイクル（作成・更新・ユーザー名変更・削除）
- Repository ポリシー変更（Owner/Writer/Reader）※ GraphQL の actions/policy クエリ未提供のため暫定ヘルスチェックのみ
- Property ライフサイクル（STRING / SELECT / MULTI_SELECT meta を含む）
- Data CRUD + 検索（プロパティ値の更新、ページネーション）
- Source 管理（作成→取得→更新→削除）
- API Key 生成・一覧・重複名バリデーション
- REST エンドポイント網羅（Org/Repo/Property/Data/Source）

## 実行方法
- コマンド: `mise run library-api-scenario-test`
- ベースURL: `http://127.0.0.1:50063`（`tests/config/default.yaml` で上書き可）
- 共通ヘッダー: `Authorization: Bearer dummy-token`, `Content-Type: application/json`, `x-platform-id`, `x-user-id`（`x-operator-id` は不要）
- シード: `scripts/seeds/n1-seed`（yaml-seeder）で初期化済みを前提。追加データはシナリオ内で生成し、後続ステップでクリーンアップ。

## メモ / 未対応
- IAM 詳細検証は library-api の GraphQL スキーマ拡充待ち。公開後に `actions` / `policy` クエリでポリシー整合性を確認するシナリオを再追加する。
- マルチテナンシー境界のネガティブケースは platform 固定設計のため暫定スキップ。Operator 分離が可能になればテストを追加する。

## 更新履歴
- 2025-11-30: library-v1.3.0 タスク「Library API シナリオテスト拡充」完了に伴い作成。
