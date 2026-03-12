---
title: "errors::Error列挙体を整理してHTTPレスポンスに揃える"
type: refactor
emoji: "🧭"
topics:
  - Rust
  - ErrorHandling
  - HTTP
published: true
targetFiles:
  - packages/errors/src/lib.rs
  - packages/errors/src/axum.rs
  - packages/errors/src/async_graphql.rs
github: https://github.com/quantum-box/tachyon-apps/tree/main/packages/errors
---

# errors::Error列挙体を整理してHTTPレスポンスに揃える

## 概要

`packages/errors` の `Error` 列挙体を見直し、似通ったバリアントを統合・削除することで、HTTP ステータスコードと整合する最小限の構成に整理する。これによって API レイヤーでのレスポンス制御を単純化し、重複メンテナンスをなくす。

## 背景・目的

- 現状は `BusinessLogicError` と `ApplicationLogicError` のように意味が重複するバリアントが多数存在し、使用箇所での判断が曖昧になっている。
- `internal_server_error!` マクロが `PermissionDenied` を返すなど、バリアント乱立による実装バグが散見される。
- axum / GraphQL 変換で同様の if/else が並び、ステータスコードの変更が二重管理になっている。
- HTTP レスポンスとして必要なステータス種別を中心に据えてシンプルな列挙体へ整理することで、以後のエラーハンドリング改善を進めやすくする。

## 詳細仕様

### 機能要件

1. `Error` 列挙体を HTTP レスポンスで必要な代表バリアント（例: `InternalServerError`, `BadRequest`, `Unauthorized`, `Forbidden`, `NotFound`, `Conflict`, `PaymentRequired`, `ServiceUnavailable`）程度に再定義する。
2. 上記以外のバリアントは統合または削除し、必要に応じて `BadRequest` などにメッセージで吸収する。
3. マクロ／コンストラクタ（例: `business_logic!`, `permission_denied!`）は新しいバリアントに対応させるか `#[deprecated]` 付きで段階的に廃止する。
4. axum の `IntoResponse` と GraphQL の `ErrorExtensions` は新バリアントに対応するシンプルな match のみに縮約する。
5. SQLx など他クレートからの変換は、最終的に整理後のどれかのバリアントへ収束させる（例: 500 に統一）。

### 非機能要件

- バリアント削減後も既存コードがコンパイルエラーにならないよう、まずは内部移行（`todo!` 禁止）を行い、削除するバリアントは段階的に `#[deprecated]` を付けたうえで変換を提供する。
- `axum.rs` / `async_graphql.rs` の分岐は 1 箇所に集約し、レスポンス本文は従来通り文字列で返す。
- ログ出力は `tracing::error!` を維持するが、`event` 名や構造は変えない。
- `mise run check` / `mise run ci` を通す。

### コンテキスト別の責務

```yaml
contexts:
  shared_errors:
    responsibilities:
      - Error列挙体の再定義と旧バリアントの移行窓口
      - HTTP/GraphQL 変換の簡素化
  application_services:
    responsibilities:
      - 新しいバリアントを使って意味を明確化
      - 不要になったバリアントを利用しないよう修正
  interfaces:
    responsibilities:
      - axum / GraphQL におけるレスポンスステータスの一貫性を確認
```

### 仕様のYAML定義

```yaml
# 想定する最終的なErrorバリアント一覧
error_variants:
  - name: InternalServerError
    status: 500
  - name: BadRequest
    status: 400
  - name: Unauthorized
    status: 401
  - name: Forbidden
    status: 403
  - name: NotFound
    status: 404
  - name: Conflict
    status: 409
  - name: PaymentRequired
    status: 402
  - name: ServiceUnavailable
    status: 503
```

```yaml
# 旧バリアントとの対応表（例）
legacy_mapping:
  InternalServerErrorFromSqlx: InternalServerError
  BusinessLogicError: BadRequest
  ApplicationLogicError: BadRequest
  HttpResponseError: BadRequest
  ProviderError: ServiceUnavailable
  TypeError: BadRequest
  ParseError*: BadRequest
  PermissionDenied: Forbidden
  NotSupported: BadRequest
  OtherError: InternalServerError
```

## 実装方針

- `Error` 列挙体の再定義を行い、旧バリアントは `#[deprecated]` を付けたうえで `impl From<OldVariant> for Error` のように集約する。
- コンストラクタ／マクロで新バリアントを返すよう修正し、旧名称は `#[deprecated]` で alias を残す。
- axum / GraphQL の match 文を新バリアントのみになるよう書き換え、共通化できる部分は helper 関数に切り出す。
- 影響範囲の大きいアプリケーション（`tachyon-api`, `bakuure-api` 等）について簡易的に `rg` で旧バリアントの利用状況を確認し、編集中に置き換える。

## タスク分解

### フェーズ1: 現状棚卸し ✅ (2025-09-20 完了)
- [x] `Error` バリアントの利用箇所を `rg "Error::"` で洗い出す
- [x] マクロ利用（`business_logic!` など）を一覧化

実装メモ: `rg "errors::Error::" -g "*.rs"` とマクロ名ベースの検索で利用状況を棚卸しし、新バリアントに集約できる箇所を洗い出した。

### フェーズ2: 列挙体再定義 ✅ (2025-09-20 完了)
- [x] `Error` 列挙体を新バリアントに再構成
- [x] 旧バリアントに `#[deprecated]` を付け、内部で新バリアントへ変換
- [x] コンストラクタ／マクロを更新

実装メモ: `packages/errors/src/lib.rs` の列挙体を HTTP ステータス対応の8種類に整理し、既存APIが利用するファクトリメソッド／マクロは内部的に新バリアントへフォールバックするよう調整した。

### フェーズ3: トランスポート整理 ✅ (2025-09-20 完了)
- [x] `axum::IntoResponse` を新バリアントに合わせて単純化
- [x] `async_graphql::ErrorExtensions` を同様に整理

実装メモ: HTTP と GraphQL 変換を 1 箇所の match に集約し、レスポンス本文／拡張フィールドが新バリアント命名をそのまま引き継ぐように調整済み。

### フェーズ4: 動作確認 ✅ (2025-09-20 完了)
- [x] `rg` で旧バリアントが残っていないか確認
- [x] `mise run check` を実行しビルド確認（2025-09-20 `cargo check --examples --tests` 成功）
- [x] 主要API（例: `tachyon-api`）のレスポンスで代表的なエラーが期待ステータスになるか簡単に手動確認

## テスト計画

- 単体テスト: 新バリアントの `IntoResponse` / `ErrorExtensions` が想定ステータス・メッセージになること。
- リグレッションテスト: `business_logic!` 等のマクロが `BadRequest` に変換されることを確認するテストを追加。
- 主要APIでのハッピーパス / エラー応答を `cargo nextest` で確認（既存テストがカバーしている想定）。

## スケジュール

- 列挙体整理とマクロ更新: 0.5 日
- トランスポート整理とビルド確認: 0.5 日

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 旧バリアント参照の取りこぼし | 中 | `rg` と `cargo check` を繰り返し、`#[deprecated]` で警告を出す |
| HTTP ステータスの不整合 | 中 | 代表的な API ハンドラで手動確認し、必要なら簡単なテストを追加 |
| GraphQL クライアントの期待コード差異 | 低 | 既存コードは文字列メッセージのみのため影響軽微、必要になれば後日コード導入 |

## 参考資料

- `packages/errors/src/lib.rs` 現行の `Error` 列挙体とマクロ実装
- `packages/errors/src/axum.rs` / `async_graphql.rs` のレスポンス変換

## 完了条件

- [x] `Error` 列挙体が最小限のバリアント構成になっている
- [x] 旧バリアント利用が `deprecated` 警告のみに減っている
- [x] `axum` / `async-graphql` 変換が整理されている
- [x] `mise run check` が成功
- [x] ドキュメント（本タスク）の更新内容がレビュー済み

## 備考

- 詳細なエラーメタデータ導入は別タスクで検討し、本件ではシンプルな統廃合に留める。
