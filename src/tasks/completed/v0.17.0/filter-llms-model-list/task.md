---
title: "LLMSモデル一覧とカタログ整合性の確保"
type: bug
emoji: "🐞"
topics:
  - LLMS
  - Catalog
  - Billing
published: true
targetFiles:
  - packages/llms/src/usecase/get_supported_models.rs
  - packages/llms/src/app.rs
  - packages/catalog/src/usecase/find_product_by_name.rs
  - packages/providers/**
github: https://github.com/quantum-box/tachyon-apps
---

# LLMSモデル一覧とカタログ整合性の確保

## 概要

`/v1/llms/models` エンドポイントが、カタログに登録されていないLLMモデル（例: `openai/gpt-5`）を返し、Agent APIの課金対象に紐付かない状態を解消する。カタログに存在しないモデルは UI から選択できないよう除外し、課金ロジックが想定外の商品へフォールバックしないようにする。

## 背景・目的

- Agent API では `CatalogAppService` を介してモデルと商品IDの対応付け、および課金処理を行う。
- 現状、LLMプロバイダーが公開するモデル一覧がカタログより先行し、未登録モデルが `/v1/llms/models` に混入している。
- `FindProductByName::find_by_model` のレガシーフォールバックにより、未登録モデルでも Chat API 用商品 (`pd_01hjn...1234`) に丸め込まれ、想定外の課金経路となる。
- モデル一覧とカタログ情報を同期させ、未登録モデルの選択を防ぐことで課金不能・誤課金を防止する。

## 詳細仕様

### 機能要件

1. `/v1/llms/models` は、カタログの Agent API 用商品および従量課金設定が存在するモデルのみ返却する。
2. カタログに存在しないモデルはレスポンスから除外し、`total_count` も除外後の件数に一致させる。
3. 除外したモデル情報は `tracing::warn` で検知できるログを出力する。
4. カタログに存在しないモデルを `ExecuteAgent` などが指定した場合は、404系のエラー（`errors::not_found`）を返し、フォールバック商品への紐付けは行わない。

### ユーザーストーリー

- オペレーター管理者として、課金設定が存在しないモデルを UI で選択できないようにしたい。→ `/pricing/services` に存在しないモデルが Agent API で選択肢に出なくなる。
- 開発者として、カタログに商品が追加されていない限り課金対象モデルが開放されないことを保証したい。→ カタログ登録を行わないと `/v1/llms/models` に載らない。

### 受け入れ条件

- `/v1/llms/models` のレスポンスから `openai/gpt-5` 系など未登録モデルが消えている。
- Agent UI モデル選択で未登録モデルが表示されない。
- 未登録モデルで `ExecuteAgent` を呼び出すと、明示的な `not_found` エラーで失敗する。

### 非機能要件

- 追加のカタログ照会によるレスポンス遅延は 100ms 以内を目標とし、必要ならキャッシュを導入する余地を残す。
- ロギングは `info` 以上の既存ログに影響しない。除外イベントは `warn`。
- コード変更は Clean Architecture の依存方向（LLMS → Catalog）を維持する。

### コンテキスト別の責務

```yaml
contexts:
  llms:
    description: "エージェントUI向けモデル一覧と実行"
    responsibilities:
      - ChatStreamProviderから取得したモデルをカタログ結果でフィルタ
      - 未登録モデルの除外と警告ロギング
      - Agent実行時に不正モデルを拒否
  catalog:
    description: "商品・従量課金設定のソース"
    responsibilities:
      - モデル名と商品IDの厳密なマッピング
      - Agent API 対応商品の従量課金設定確認
      - 未登録モデルの場合は `not_found` エラーで応答
```

### 仕様のYAML定義

```yaml
agent_api_model_mapping:
  - provider: openai
    model_prefix: gpt-5
    product_id: pd_01jy5ms9f16xpgjk6a4hkp9knn
  - provider: anthropic
    model_prefix: claude-opus-4.1
    product_id: pd_01jy5ms9f6me41pqbkvqs18tq4
  - provider: anthropic
    model_prefix: claude-sonnet-4.5
    product_id: pd_01jy5ms9fe9ka6ht7vhvwanzqr
  - provider: anthropic
    model_prefix: claude-haiku-4.5
    product_id: pd_01k7pap5smcbdhyv4tjaqhv80y
  - provider: google_ai
    model_prefix: gemini-2.5-pro
    product_id: pd_01jy5ms9fmdxcw8q35ct88nhnj
  - provider: google_ai
    model_prefix: gemini-2.5-flash
    product_id: pd_01jy5ms9fssrs1zb0ewgrmd23v

filtering:
  service_type: agent_api
  required_metadata_keys:
    - provider
    - model
```

## 実装方針

### アーキテクチャ設計

- `GetSupportedModels` ユースケースに `CatalogAppService` 依存を追加し、取得したモデルごとにカタログ照会を行う。
- カタログ照会には `CatalogApp` の `find_product_by_model` を拡張し、未マッチ時に `not_found` を返すようにする（フォールバック廃止）。
- フィルタ結果を LLMS ドメインで集約し、UI には整合したリストのみ返却。

### 技術選定

- 既存の Rust クレート (`packages/llms`, `packages/catalog`) を使用し、依存追加は行わない。
- ロギングは `tracing` で統一。

### TDD（テスト駆動開発）戦略

#### 既存動作の保証
- `GetSupportedModels` の既存テストがあれば更新して整合性を確認。
- `FindProductByName` のマッピングテストを更新し、フォールバック除去後も既存モデルが解決できることを検証。

#### テストファーストアプローチ
- 未登録モデルが除外されるユースケーステストを追加（モックカタログで `not_found` を返すケース）。
- Agent 実行時に未登録モデルで `not_found` が返ることをテスト。

#### 継続的検証
- `mise run check`（Rust + TypeScript）と関連ユニットテスト (`cargo test -p llms`, `cargo test -p catalog`) を定期実行。

## タスク分解

1. 📝 `FindProductByName::find_by_model` からレガシーフォールバックを削除し、対応表を明示化。
2. 📝 `CatalogAppService::get_product_id_for_model` を更新し、未登録時は `not_found` を透過させる。
3. 📝 `GetSupportedModels` に `CatalogAppService` 依存を追加し、モデルフィルタリングと警告ログを実装。
4. 📝 `/v1/llms/models` ハンドラーのテストを拡張し、未登録モデルがレスポンスに含まれないことを確認。
5. 📝 Agent API 実行パスのエラーハンドリング（テスト含む）を更新。
6. 📝 カタログシード (`scripts/seeds/n1-seed/005-order-products.yaml` など) を更新し、Agent API 用に gpt-5 / claude-opus-4.1 / claude-sonnet-4.5 / claude-haiku-4.5 を追加し、既存 gpt-4.1 系データを整理。
7. 📝 タスク完了後にドキュメントとテスト結果を `verification-report.md` に整理。

## テスト計画

- ユニットテスト: `packages/llms` と `packages/catalog` の対象モジュールにテスト追加。
- 統合テスト: `/v1/llms/models` を叩く API テスト（必要なら `apps/tachyon/src/lib/agent-api.test.ts` を更新）。
- 手動確認: `mise run dev-backend` + Playwright で `/v1beta/tn_.../pricing/services` と Agent UI のモデル選択が整合することを確認。

## リスクと対策

- **モデル追加運用コスト増**: 新モデル公開時にカタログ登録が必須となる → 手順を README/TASKDOC に追記。
- **既存フォールバック依存コードへの影響**: Chat API などで旧フォールバックを利用している可能性 → 利用箇所を検索し、必要なら別途フォールバック専用メソッドを用意。
- **レスポンス遅延**: フィルタリングでカタログ呼び出しが増加 → 初期は逐次呼び出し、必要ならキャッシュ導入を検討。

## スケジュール

- 2025-10-16: タスクドキュメント作成、実装方針レビュー
- 2025-10-17: 実装・ユニットテスト完了
- 2025-10-18: 動作確認・タスクドキュメント更新

## 完了条件

- `/v1/llms/models` がカタログ整合済みモデルのみ返却するようになり、未登録モデルは除外されている。
- Agent API で未登録モデルを指定した場合に `not_found` エラーが返り、課金処理が走らない。
- 追加テストがすべてパスし、`mise run check` が成功する。
- `verification-report.md` に検証結果と差分スクリーンショット（必要時）を記録。
