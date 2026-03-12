---
title: "DatabaseコンテキストにMarkdownプロパティ型を追加する"
type: "tech"
emoji: "📝"
topics:
  - Database
  - PropertyType
  - Markdown
published: true
targetFiles:
  - packages/database/domain/src/property/property_type.rs
  - packages/database/domain/src/data/property_data_value.rs
  - packages/database/domain/src/property/mod.rs
  - apps/library-api/src/handler/graphql/model.rs
  - apps/library-api/src/handler/graphql/mutation.rs
github: https://github.com/quantum-box/tachyon-apps
---

# DatabaseコンテキストにMarkdownプロパティ型を追加する

## 概要

データベースコンテキストの `PropertyType` に Markdown 型を新設し、既存の HTML 型を段階的に置き換える設計・実装作業を定義する。既存データやフロントエンドとの互換性を保ちつつ、Markdown を第一級のフォーマットとして扱えるようにする。

## 背景・目的

- HTML 型はリッチテキスト表現として導入されたが、実際には Markdown からの変換結果を保存するケースが増えており、柔軟性・記述性の観点で Markdown を直接扱いたいという要求が高まっている。
- HTML を直接保存する場合、サニタイズやスクリプト混入対策などセキュリティ上の懸念が残る。
- Markdown を公式サポートすることで、エディタや API の統一、将来的な Markdown ベースのレンダリング（フロント・バック問わず）を容易にする。
- 既存の HTML 型を削除する前段として、まず Markdown 型を追加し安全な移行パスを確立する必要がある。

## 詳細仕様

### 機能要件

1. `PropertyType` 列挙体に `Markdown` バリアントを追加する。
2. GraphQL/API 層で Markdown 型を選択・作成・更新できるようにする。
3. データ保存時に Markdown 生テキストを保持し、`PropertyDataValue` に対応する `Markdown` 変換ロジックを追加する。
4. HTML 型で保存されている既存データとの互換性を担保しつつ、Markdown 型への移行を段階的に行えるマイグレーション計画を示す。
5. UI/フロントエンドでは Markdown と HTML を区別して扱い、Markdown 専用コンポーネントに接続できるようにインターフェースを提供する。

### 非機能要件

- 既存 API への後方互換性を維持しつつ、新しい型を追加してもパフォーマンスが劣化しないこと。
- Markdown テキストは最大 64KB を目安とし、長文に対しても安定して保存・取得できること。
- HTML -> Markdown 変換処理が必要な場合は明示的にユースケース層で実装し、暗黙の変換は行わない。

### コンテキスト別の責務

```yaml
contexts:
  database:
    description: "PropertyType 定義と保存形式を管理"
    responsibilities:
      - PropertyType::Markdown の定義とシリアライズ/デシリアライズ
      - PropertyDataValue での Markdown 値の取り扱い
      - HTML → Markdown 移行のためのスキーマ変更とデータマイグレーション

  library-api:
    description: "GraphQL インターフェースでのプロパティ操作"
    responsibilities:
      - GraphQL Schema に Markdown 型を追加
      - 入出力モジュールで Markdown 値を透過的に扱う
      - 型選択 UI/CLI から Markdown を選べるようにする

  frontend:
    description: "アプリケーション UI での表示・編集"
    responsibilities:
      - Markdown エディタ/プレビューの統合
      - HTML 型との差異を吸収する表示ロジック
      - 移行フェーズにおける後方互換表示
```

### 仕様のYAML定義

```yaml
property_types:
  supported:
    - STRING
    - INTEGER
    - MARKDOWN       # 新規追加
    - RELATION
    - SELECT
    - MULTI_SELECT
    - ID
    - LOCATION

markdown:
  storage:
    column_type: TEXT
    max_length: 65535
    encoding: utf8mb4
  validation:
    disallow_null: true
    allow_empty: true
  rendering:
    preferred_pipeline: "markdown-it"
    sanitize_html: true

migration_plan:
  phase_1:
    description: "Markdown 型追加と API 対応"
    requires_downtime: false
  phase_2:
    description: "HTML から Markdown へのデータコピーと検証"
    requires_downtime: optional
  phase_3:
    description: "HTML 型の非推奨化 (deprecation warning)"
    requires_downtime: false
  phase_4:
    description: "HTML 型の削除 (別タスク)"
    requires_downtime: true
```

## 実装方針

- ドメイン層 (`packages/database/domain`) に `Markdown` バリアントおよび関連メタデータを追加する。メタ情報は特に必要としないため `serde_json::Value::Null` を返す実装を想定。
- `PropertyDataValue` に Markdown 用の列挙体ケースを新設し、既存の HTML ケースと同等のシリアライズ/デシリアライズを行うが、フィールド名は `Markdown` にする。
- GraphQL ハンドラで `Html` 分岐を複製し `Markdown` 分岐を追加、Schema 定義ファイルに `MARKDOWN` 列挙値を追記する。
- API リクエストでは Markdown 生文字列をそのまま保存。クライアント責務で HTML へ変換したい場合は別レイヤーで実施する。
- マイグレーションは次段のタスクで扱うため、本タスクではスキーマ変更と API 追加に限定し、移行計画をドキュメント化する。
- モジュール内に `#[cfg(test)]` で Markdown 入出力に関する単体テストを追加して回帰を防ぐ。

## タスク分解

### フェーズ1: ドメイン層の型追加 ✅ (2025-09-22 完了)
- [x] `PropertyType` に `Markdown` を追加
- [x] `PropertyDataValue` と変換ロジックを拡張
- [x] 既存テストを Markdown 対応へ更新

### フェーズ2: API / GraphQL 対応 ✅ (2025-09-22 完了)
- [x] GraphQL Schema に `MARKDOWN` を追加しコード生成を更新
- [x] GraphQL モデル / ミューテーションで Markdown を扱えるよう実装
- [x] REST/CLI 等の呼び出し口で Markdown 選択肢を露出

### フェーズ3: 移行準備とデプレケーション通知 🔄
- [x] HTML 型利用箇所の棚卸しと移行対象リスト化
- [x] API レスポンスに HTML 型の非推奨メッセージを追加
- [x] ドキュメント (`CLAUDE.md` / `docs/`) に移行手順を追記

#### HTML型棚卸しメモ (2025-09-22)
- **ドメイン層**: `packages/database/domain/src/property/property_type.rs` / `.../data/property_data_value.rs` に互換用の `Html` ケースが残り、既存データに対応。
- **アプリケーション層**: `packages/database/src/sdk.rs`, `packages/database/src/interface_adapter/graphql/mod.rs` が HTML を Markdown と同等に扱うが、新規追加は Markdown へ誘導。
- **Library API**: GraphQL 列挙 `PropertyType::Html` に deprecation 属性、REST の `PropertyResponse` は HTML 時に警告メッセージを返却。
- **ユースケース/初期セットアップ**: `apps/library-api/src/usecase/create_repo.rs` 等は Markdown でプロパティ生成。HTML 指定時は警告ログで互換対応。

#### APIレスポンスでの非推奨通知
- REST `PropertyResponse` に `deprecation` フィールドを追加し、HTML 型の際は `"HTML property type is deprecated. Please migrate to MARKDOWN."` を返す。
- GraphQL スキーマでは `PropertyType::Html` に非推奨メッセージを付与し、クライアントに警告を表示。

## テスト計画

- `cargo test -p database -- property_type` : Markdown 追加後のシリアライズ/デシリアライズ検証
- `cargo test -p database -- property_data_value` : Markdown 値変換の単体テスト
- `cargo test -p library-api` : GraphQL ハンドラのリグレッション確認
- API 経由の E2E テスト（Playwright ではなく GraphQL リクエスト）で Markdown 生成/更新/取得を確認
- 後続タスクで HTML → Markdown データ移行テストを追加予定

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 既存 HTML データの損失 | 高 | データ移行は別フェーズで実施し、ダンプ/ロールバック手順を整備 |
| Markdown レンダリング差異 | 中 | クライアントで統一された Markdown ライブラリを使用しプレビュー差異を吸収 |
| GraphQL/コード生成の不整合 | 中 | Schema 変更後に `yarn codegen` を必ず実行し CI で検知 |
| API 後方互換性の破壊 | 低 | HTML 型は当面残し、非推奨フラグのみ追加 |

## スケジュール

- フェーズ1・2: 1.0 人日 (リードタイム 1～2 日)
- フェーズ3: 0.5 人日 (棚卸し・通知のみ)
- HTML 型削除は別タスクで 1+ 人日を想定

## 参考資料

- `packages/database/domain/src/property/property_type.rs`
- `packages/database/domain/src/data/property_data_value.rs`
- `apps/library-api` GraphQL ハンドラ実装
- 社内 Markdown ガイドライン（別紙）

## 完了条件

- [x] ドメイン層に `PropertyType::Markdown` および関連ロジックが実装されている
- [x] GraphQL/API で Markdown 型を作成・更新・取得できる
- [x] HTML 型から Markdown 型への移行方針がタスク内に記載されている
- [x] テスト計画に沿ったユニットテストが追加・更新されている
- [x] 移行フェーズの TODO が整理され次タスクへの引き継ぎができている

### 次タスクへの引き継ぎポイント
- 既存 HTML レコードを Markdown へ変換するマイグレーション処理の設計・実装
- フロントエンドで HTML レンダリングしている箇所を Markdown ベースへ統一
- HTML 型を完全削除する最終フェーズに向けたスケジュールとロールバック手順の策定
