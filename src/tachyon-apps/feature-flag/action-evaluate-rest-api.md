# Feature Flagアクション権限REST API

Feature Flagコンテキストが提供するアクション権限判定機能をRESTとして公開するエンドポイントの仕様をまとめる。

## 背景

- GraphQL `featureFlagActionAccess` クエリに依存していたバッチ判定をRESTでも提供し、外部統合や自動テストから利用できるようにする。
- LLMS／Catalog／Paymentコンテキストと同じく Axum + utoipa ベースのOpenAPIドキュメントを整備し、Swagger UI / Redoc / RapiDoc を `/v1/feature-flags` 配下で配信する。
- Multi-tenancy ヘッダーとExecutor情報をそのまま再利用することで、既存の権限チェックとFeature Flag評価を共通化する。

## エンドポイント

### `POST /v1/feature-flags/actions/evaluate`

| 項目 | 内容 |
| ---- | ---- |
| 認証 | `Authorization: Bearer <token>` を `auth::Executor` で解析（開発環境は `dummy-token` 固定） |
| マルチテナンシー | `x-operator-id`（必須）、`x-platform-id`（任意）、`x-user-id`（任意）を `auth::MultiTenancy` で解決 |
| 入力ヘッダー | `Content-Type: application/json`、上記認証・テナント系ヘッダー |
| リクエスト | `EvaluateActionsRequest`（下記参照）。最大100件までアクションを受け付ける。 |
| 成功レスポンス | `200 OK` (`EvaluateActionsResponse`)。各アクションに対して Feature Flag 判定と Policy 判定の結果を返す。 |
| 想定エラー | `400 Bad Request`（配列が101件以上・空文字アクションなど）、`401 Unauthorized`、`403 Forbidden`、`404 Not Found`、`500 Internal Server Error`。いずれも `ErrorResponse { message }` 形式。 |

## リクエスト形式

| フィールド | 型 | 必須 | 説明 |
| ---------- | -- | ---- | ---- |
| `actions` | `ActionEvaluationRequest[]` | 任意（デフォルト空配列） | 判定対象のアクション一覧。空配列の場合は空結果を返す。 |
| `actions[].action` | `string` | 必須 | Policy / Feature Flag に登録済みのアクションID。前後空白は除去され、空文字は400。 |
| `actions[].resourcePattern` | `string` | 任意 | リソーススコープを指定するワイルドカード文字列。`FeatureFlagActionEvaluationInput::with_resource_pattern` に引き渡される。 |

```json
{
  "actions": [
    { "action": "feature_flag:ListFeatureFlags" },
    { "action": "llms:ExecuteAgent", "resourcePattern": "tn_01hjryxysgey07h5jz5wagqj0m/*" }
  ]
}
```

## レスポンス

| フィールド | 型 | 説明 |
| ---------- | -- | ---- |
| `results` | `ActionEvaluationResult[]` | 判定結果の配列。入力順を維持して返す。 |
| `results[].action` | `string` | 判定対象アクションID。 |
| `results[].context` | `string` | 判定に用いたコンテキスト（テナントやユーザー情報を含む文字列表現）。 |
| `results[].featureEnabled` | `boolean` | Feature Flag Service で有効と判定されたか。 |
| `results[].policyAllowed` | `boolean` | Policyチェックで許可されたか。 |
| `results[].featureError` | `string \\| null` | Feature Flag 評価時のエラーメッセージ（例: 未登録／評価失敗）。 |
| `results[].policyError` | `string \\| null` | Policy 評価時のエラーメッセージ。 |

```json
{
  "results": [
    {
      "action": "feature_flag:ListFeatureFlags",
      "context": "tenant=tn_01hj...; user=us_01hs...",
      "featureEnabled": true,
      "policyAllowed": true,
      "featureError": null,
      "policyError": null
    }
  ]
}
```

## バリデーションとエラーハンドリング

- リクエストの `actions` は最大100件。超過時は `ApiError::bad_request("actions must contain 100 entries or fewer")` を返す。
- 各エントリーの `action` は `trim()` 後の空文字を許容せず、インデックス付きメッセージで400を返す。
- Usecase 実行で発生した `errors::Error` は `ApiError` へマッピングされ、HTTPステータスと `message` を統一フォーマットで返却。
- GraphQL と共通のユースケース（`FeatureFlagActionEvaluationInput` / `FeatureFlagActionEvaluationResult`）を利用するため、レスポンス構造とビジネスルールが一致する。

## 認証とマルチテナンシー

- `auth::Executor` Extractor により、セッション／ヘッダーから `ExecutorAction` を復元。User ID が指定されない場合は開発用シードユーザーにフォールバック。
- `auth::MultiTenancy` Extractor が `x-operator-id` を必須項目として解析し、`FeatureFlagApp` のユースケースへテナント情報を渡す。
- `FeatureFlagApp::evaluate_feature_flag_actions` 呼び出し時に `ExecutorAction` / `MultiTenancyAction` トレイト参照を渡し、Policy App と Feature Flag Service 両方で同一コンテキストを使用する。

## OpenAPI とドキュメント配信

- Swagger UI: `/v1/feature-flags/swagger-ui`
- Redoc: `/v1/feature-flags/redoc`
- RapiDoc: `/v1/feature-flags/rapidoc`
- OpenAPI JSON: `/v1/feature-flags/api-docs/openapi.json`
- オフライン定義: `packages/feature_flag/feature_flag.openapi.yaml`
- コード生成: `cargo run -p feature_flag --bin feature_flag_codegen`（`mise run codegen` に統合済み）

## 実装概要

- `packages/feature_flag/src/adapter/axum/evaluate_actions_handler.rs` : Axumハンドラ本体と入力検証、Usecase呼び出し。
- `packages/feature_flag/src/adapter/axum/types.rs` : リクエスト／レスポンスDTOと `utoipa::ToSchema` 定義。
- `packages/feature_flag/src/adapter/axum/error.rs` : `errors::Error` からHTTPレスポンスへ変換する共通エラーラッパー。
- `packages/feature_flag/src/adapter/axum/mod.rs` : `create_router()` で Swagger UI / Redoc / RapiDoc を公開し、`create_inner_router()` でAPIルートを定義。
- `apps/tachyon-api/src/router.rs` : `feature_flag::axum::create_router()` をメインRouterへ `merge` し、他コンテキストと同一のCORS設定で公開。

## テストと検証

- `mise run check` でワークスペース全体の型検査・Lintを走らせる。
- `cargo test -p feature_flag` でユースケース層の既存テストを実行し、Policy連携の回帰を確認する。
- 手動確認: Swagger UI から Example リクエストを送信、または `curl` で以下のように叩き、GraphQL `featureFlagActionAccess` とレスポンス構造が一致することを比較する。

```bash
curl -X POST http://localhost:50054/v1/feature-flags/actions/evaluate \
  -H 'Authorization: Bearer dummy-token' \
  -H 'x-operator-id: tn_01hjryxysgey07h5jz5wagqj0m' \
  -H 'Content-Type: application/json' \
  -d '{"actions":[{"action":"feature_flag:ListFeatureFlags"}]}'
```

## 関連リンク

- タスクドキュメント: `docs/src/tasks/completed/v0.22.0/add-feature-flag-action-endpoint/task.md`
- 動作確認レポート: `docs/src/tasks/completed/v0.22.0/add-feature-flag-action-endpoint/verification-report.md`
- Feature Flag 概要: `./overview.md`
- Policy Action統合: `./policy-action-integration.md`
