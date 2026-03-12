# Error Handlingアーキテクチャ

## 概要

`packages/errors` クレートは Tachyon / Bakuure 系バックエンドで共通的に利用するエラー変換レイヤーです。2025年9月20日時点の再編では、HTTP ステータスに対応した 8 種のバリアントへ統合し、axum / async-graphql への変換分岐を最小化しました。本ドキュメントでは新構成と利用時のガイドラインをまとめます。

## Error列挙体の構成

`Error` 列挙体は以下のバリアントのみを公開し、すべて `message` と `Backtrace` を保持します。

| バリアント | HTTPステータス | 想定ユースケース |
| --- | --- | --- |
| `InternalServerError` | 500 | 予期しない失敗、データ不整合、外部例外の一般的なフォールバック |
| `BadRequest` | 400 | バリデーション違反、リクエスト形式不備、ドメイン整合性違反 |
| `Unauthorized` | 401 | 認証情報不足、トークン無効 |
| `Forbidden` | 403 | 認可不足、権限外操作 |
| `NotFound` | 404 | エンティティ未検出、参照切れ |
| `Conflict` | 409 | 楽観ロック失敗、重複登録、状態競合 |
| `PaymentRequired` | 402 | クレジット残高不足、課金制限 |
| `ServiceUnavailable` | 503 | 外部サービス障害、依存リソースの一時停止 |

### メッセージ命名規約

- `Error::format_message` により `<VariantName>: <詳細メッセージ>` 形式へ正規化されます。
- 互換性維持のため `business_logic!` 等の従来マクロは `BadRequest` に変換され、冒頭に旧識別子（`BusinessLogicError` など）が自動付加されます。
- 追加バリアントが必要な場合は HTTP ステータスの調整理由を必ず AGENTS.md に追記してください。

## 互換 API（Deprecated Wrapper）

- `Error::business_logic`, `Error::application_logic_error`, `Error::permission_denied` などのヘルパーは `BadRequest` / `Forbidden` へのラッパーとして残存し、`#[deprecated]` ではなくメッセージ整形で互換性を担保しています。
- マクロレベルでの互換（`business_logic!`, `permission_denied!`, `parse_error!` 等）はそのまま利用可能ですが、新規コードでは直接的に `Error::bad_request` などを呼び出してください。

## axum / async-graphql 連携

- `packages/errors/src/axum.rs` では `IntoResponse` 実装が新バリアントのみに依存し、`match` の分岐は 8 件です。レスポンスボディは `{"error": <message>}` 形式を維持しています。
- `packages/errors/src/async_graphql.rs` でも同様に `ErrorExtensions` 実装を簡潔化し、`"code"` 拡張フィールドにバリアント名を設定します。
- 追加バリアントを導入する際は両ファイルの分岐を同時に更新してください。

## 運用フロー

1. ドメイン層で `errors::Error` を返却し、アプリケーション層では各バリアントに合わせた復旧ロジックを記述します。
2. HTTP ハンドラでは axum の `IntoResponse` に委譲し、GraphQL では `ErrorExtensions` によるコード出力を利用します。
3. 例外的に異なる HTTP ステータスを要求する場合でも、新規バリアントを乱立させずステータスの再検討を先に行います。

## バージョン情報

- **導入バージョン**: Tachyon v0.11.0 / apps/tachyon `package.json` 0.11.0
- **適用範囲**: `packages/errors` を依存するすべての Rust クレート
- **関連タスク**: `docs/src/tasks/completed/v0.11.0/align-errors-crate-http-status/`

## 今後の検討事項

- `errors::Error` にメタデータ（`ErrorKind`, 追加フィールド等）を持たせる構想は別タスクで管理しています。現在はメッセージ文字列とバックトレースのみを保持します。
- GraphQL クライアント向けにコード値を列挙体化する場合は、`async_graphql::Error` での `extensions["reason"]` など追加項目を検討してください。
