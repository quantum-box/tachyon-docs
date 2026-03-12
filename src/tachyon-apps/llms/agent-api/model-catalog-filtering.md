# Agent APIモデルカタログ整合性

## 概要

Agent API の `/v1/llms/models` エンドポイントで提供するモデル一覧を、カタログに登録済みかつ課金設定が有効なモデルに限定する仕様を定義する。Catalog コンテキストと LLMS コンテキストの整合性を担保することで、未登録モデルの誤課金や課金不能状態を防ぐ。

## 目的

- カタログに存在しないモデルを UI や API 経由で選択できないようにする。
- Agent API 実行時に、課金対象が未登録のモデルであれば直ちに `not_found` エラーを返す。
- カタログ登録漏れを検知しやすくするためのログ出力を追加する。

## 対象範囲

- `packages/llms::usecase::GetSupportedModels`
- `packages/catalog::usecase::FindProductByName`
- Agent API 経由でのモデル実行（`ExecuteAgent` 系ユースケース）
- `CatalogAppService` によるモデルと商品IDの解決

## 動作仕様

1. `GetSupportedModels` はプロバイダから取得したモデル一覧を逐次確認し、`CatalogAppService::get_product_id_for_model` で対応する商品が存在する場合のみレスポンスに含める。
2. カタログに該当モデルが存在しない場合、当該モデルを一覧から除外し `tracing::warn` で `model_not_registered` ログイベントを残す。
3. `/v1/llms/models` の `total_count` は、除外後の実際に返却する件数と一致させる。
4. `CatalogAppService::get_product_id_for_model` はフォールバック（Chat API 用商品など）を廃止し、未登録時には `errors::not_found` を返す。
5. Agent API 実行系ユースケースは、指定モデルがカタログ未登録の場合 `errors::not_found` をそのまま伝播し、レスポンスボディにはエラーコード `model_not_registered` を含める。

## ログ・モニタリング

- モデル除外時のログ例：
  - `level=warn`、`target=llms::usecase::get_supported_models`
  - フィールド：`provider`, `model`, `reason="catalog_not_registered"`
- ログ集計ダッシュボードでモデル登録漏れを日次確認する。

## エラーハンドリング

| ケース | 応答 | 備考 |
| --- | --- | --- |
| カタログ登録済み | 正常 | 商品IDと課金設定をレスポンスに含める |
| カタログ未登録 | `errors::not_found` | Agent API 実行時は HTTP 404 にマッピングされる |
| カタログ照会失敗 | `errors::temporary_failure` | 内部的に再試行し、最終的に 503 を返す |

## テスト

- `packages/llms` のユニットテストで未登録モデルが除外されることを確認。
- `packages/catalog` のユニットテストでフォールバックが無効化されていることを確認。
- `/v1/llms/models` エンドポイントの API テストでレスポンス件数と `total_count` が一致することを確認。
- Agent API の統合テストで未登録モデル指定時に `not_found` が返ることを確認。

## 運用ガイド

- 新しいモデルを開放する際は、Catalog コンテキストでの商品登録と従量課金設定を完了してから `providers` 側にモデルを追加する。
- カタログ登録後に `mise run codegen` を実行し、生成コードとスキーマを同期する。
- 連携が崩れた場合は `yaml-seeder` を用いたシードの再投入で商品定義を復旧する。

## 関連資料

- [完了タスク: LLMSモデル一覧とカタログ整合性の確保](../../../tasks/completed/v0.17.0/filter-llms-model-list/task.md)
- [NanoDollarシステム仕様](../../../architecture/nanodollar-system.md)
- [Agent API Overview](./overview.md)
