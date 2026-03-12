# APIキー認証の不具合修正

## 概要

APIキー認証でサービスアカウントを利用する際の認証/認可の不整合を修正し、
`x-operator-id` の必須化とActorId処理の安定化を行う。

## 背景

- APIキー経由のリクエストで `x-operator-id` が空でもプラットフォームIDにフォールバックし、
  テナント境界が曖昧になるケースがあった。
- サービスアカウント実行時に `UserId` としてパースされるログが混在していた。
- `/v1/llms/models` のモデル一覧は Catalog の `agent_api` 価格定義に依存しており、
  Anthropic が登録されていない場合は表示されない。

## 仕様

### APIキー認証

- `Authorization: Bearer pk_...` を受け取った場合、`x-operator-id` を必須とする。
- `x-operator-id` が空の場合は 401 を返す。
- サービスアカウントは `ActorId::ServiceAccount` として扱い、`UserId` への変換は行わない。

### モデル一覧

- `/v1/llms/models` は `product_usage_pricing` の `metadata.service_type = "agent_api"` に
  登録されたモデルのみを返す。
- Anthropic モデルを表示するには、`agent_api` 価格定義をシードに追加する。

## 手動確認手順

1. GraphQL で ServiceAccount を作成
2. GraphQL で Public API Key を発行
3. REST で APIキー認証のチャットルーム作成を確認
4. `/v1/llms/models?supported_feature=agent` で Anthropic が表示されることを確認

## 参照

- `docs/src/tasks/completed/v0.28.0/api-key-auth-fix/task.md`
