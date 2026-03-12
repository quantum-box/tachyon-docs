---
title: "Service Pricing GraphQL Repository Injection Fix"
type: "bugfix"
emoji: "🐛"
topics:
  - "catalog"
  - "graphql"
  - "tachyon-api"
published: false
targetFiles:
  - apps/tachyon-api/src/main.rs
  - apps/tachyon-api/src/di.rs
github: ""
---

# Service Pricing GraphQL Repository Injection Fix

## 概要

`/v1beta/{tenant}/pricing/services` ページの GraphQL 経由データ取得で、`ServicePriceMappingRepository` などの DI が欠落しているため実行時エラーが発生している。GraphQL からリポジトリを直接取得する実装を改め、`CatalogApp` 経由でユースケースを呼び出すよう再構成し、サービス料金表示が再び機能するようにする。

## 背景・目的

- 2025-10-12 時点でページアクセス時に `Data Arc<dyn ServicePriceMappingRepository> does not exist` が発生し UI が壊れている。
- catalog GraphQL リゾルバーがリポジトリを直接参照しており、`Schema` 側で依存注入を忘れると即座に実行時エラーになる構造だった。
- `CatalogApp` にユースケースラッパーを用意し、GraphQL 側はアプリケーションサービスのみを見ることで依存漏れを防ぐ。

## 詳細仕様

### 機能要件

1. `CatalogApp` に price mapping / pricing plan / price history 用のユースケースメソッドを追加する。
2. GraphQL Query / Mutation / Product Type が `ctx.data::<Arc<catalog::CatalogApp>>()?` から依存を取得し、リポジトリへ直接アクセスしないようにする。
3. `/v1beta/{tenant}/pricing/services` でサービス一覧と価格マッピングが取得できることを確認する。

### 非機能要件

- DI 変更はホットリロード後も安定稼働すること。
- 既存の catalog/resolver 実装を変更せず互換性を維持すること。
- 新たな direct repository 参照やショートカットは追加しないこと。

### コンテキスト別の責務

```yaml
contexts:
  tachyon-api:
    description: "GraphQL スキーマを構築し各コンテキストの依存を注入する"
    responsibilities:
      - catalog 用リポジトリの登録
      - 既存 Extension 層との整合性維持
  catalog:
    description: "GraphQL リゾルバーでリポジトリを利用してドメインデータを返す"
    responsibilities:
      - リポジトリ取得失敗時に即時エラーを返す
      - Multi-tenancy 情報を元にドメイン操作を実施
```

### 仕様のYAML定義

該当タスクでは新しい構造化データ定義は不要。

## 実装方針

### アーキテクチャ設計

- `CatalogApp` をアプリケーション境界として必要なユースケースを公開し、GraphQL はそれを利用する。
- `tachyon-api` の DI では `CatalogApp` を Extension に登録し、余計なリポジトリ注入を削除する。

### 技術選定

- 既存の `async-graphql` 構成を継続利用。
- 新規ライブラリ導入は不要。

### TDD（テスト駆動開発）戦略

- 既存の GraphQL エンドポイントに対する自動テストは未整備のため、実装後に `mise run check` で静的検査し、手動で GraphQL クエリとフロントエンド動作を確認する。
- 将来の自動化候補として catalog GraphQL のリグレッションテスト追加を検討メモに残す。

## タスク分解

### フェーズ1: 原因調査 ✅ (2025-10-12 完了)
- [x] エラーログから欠落依存を特定
- [x] GraphQL リゾルバーの依存要件を洗い出し

### フェーズ2: 実装 🔄 (2025-10-12 着手)
- [x] `CatalogApp` にユースケースラッパーを追加しビルダーを拡張 (2025-10-12)
- [x] GraphQL Query/Mutation/Type を `catalog_app` 依存に差し替え (2025-10-12)
- [x] `Schema::build` から不要なリポジトリ注入を削除 (2025-10-12)
- [x] サービス価格マッピング用シナリオテストを追加 (2025-10-12)

### フェーズ3: 動作確認 📝
- [x] `mise run check` (2025-10-12)
- [ ] GraphQL クエリで `catalogServicePriceMappings` を実行
- [x] `mise run tachyon-api-scenario-test` (2025-10-12)
- [ ] フロントエンド `/pricing/services` をブラウザで確認

## テスト計画

- `mise run check` で静的解析と型チェック。
- `curl` もしくは GraphQL Playground で `catalogServicePriceMappings` を手動実行。
- 必要に応じ Playwright MCP で UI 動作確認（今回の修正はバックエンド中心のため最終確認で実施予定）。

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 他 GraphQL リゾルバーでも依存が不足している可能性 | 中 | `ctx.data` 呼び出しを grep し必要なものを全て登録する |
| DI 追加による循環参照 | 低 | すべて `Arc` 共有のため問題なし、ビルドで確認 |

## 参考資料

- `packages/catalog/src/graphql/query.rs`
- `apps/tachyon-api/src/main.rs`
- `apps/tachyon-api/src/di.rs`

## 完了条件

- [ ] GraphQL リゾルバーからリポジトリ参照が排除され `CatalogApp` 経由になっている。
- [ ] `/v1beta/{tenant}/pricing/services` でエラーが発生しない。
- [ ] 動作確認レポートを更新し、Playwright MCP での確認結果を記録。
- [ ] `docs/src/tasks/bugfix/fix-service-price-mapping-di/` のステータスを更新。
