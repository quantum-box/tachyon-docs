# サービスアカウント対応チャットルームオーナー（v0.19.3）

## 概要

サービスアカウントによるチャットルーム/メッセージ作成時にも一貫したオーナー情報を保持するため、LLMSコンテキストの所有者ID表現を`ActorId`に統一した。`ActorId`は従来の`UserId`に加えて`ServiceAccountId`を型安全に保持し、アプリケーション全層で双方向変換を提供する。

## 目的

- サービスアカウントがチャットルーム作成APIを呼び出した際に`executor.get_id()`が返すIDを正しく保存する。
- ドメイン層のバリデーションを維持しつつ、`us_`/`sa_`プリフィックスを自動判別する。
- GraphQL/RESTの入出力互換性（文字列ID）を維持し、既存クライアントの変更を不要にする。

## 主要変更点

### 値オブジェクト

- `packages/value_object/src/actor_id.rs`に`ActorId` enumを追加。
  - `ActorId::User(UserId)`と`ActorId::ServiceAccount(ServiceAccountId)`の二分岐。
  - `FromStr`で文字列を解析し、未対応プリフィックスは`errors::parse_error`で拒否。
  - `Display`/`Serialize`/`Deserialize`で文字列表現を透過的に扱い、既存シリアライザと互換。
  - `is_user`/`is_service_account`/`as_user`/`as_service_account`で判定・参照ヘルパを提供。

### ドメインモデル

- `ChatRoom.owner`および`ChatMessage.owner`を`ActorId`型へ置換し、生成時に`Into<ActorId>`を受け付けるようにした。
- 所有者判定ロジック（`ChatRoom::is_owner`など）は`ActorId`比較へ更新。

### ユースケースとアダプタ

- `chatroom_interactor`、`command_stack`、Axum/GraphQLハンドラで`executor.get_id()`結果を`ActorId`へパースするよう追従。
- SQLxリポジトリ層では従来通り文字列で永続化しつつ、取得時に`ActorId`へ変換。既存スキーマ変更は不要。
- GraphQLスキーマの`ownerId`/`userId`などは型自体は`String`のまま保持し、サーバー内部で`ActorId`変換を行う。

### その他

- Webhook/シナリオテスト補助コードを含む共有ヘルパーで`ActorId`を利用するよう調整。
- 既存の`UserId`のみを想定した補助関数には`ActorId::from(user_id)`のシンタックスシュガーで後方互換を確保。

## 動作確認

- 2025-10-27 `cargo check -p llms`
- 2025-10-27 `mise run check`
- 2025-10-27 `mise run tachyon-api-scenario-test`

上記チェックでサービスアカウント経由のチャットルーム作成を含む回帰テストが通過している。

## 影響範囲

- **API/GraphQL**: レスポンスは文字列ID互換のためクライアント変更不要。ただし内部`ActorId`変換により未対応プレフィックスは400/422として明示的に拒否される。
- **データ移行**: 保存形式は文字列IDで変わらないため追加マイグレーション不要。
- **拡張性**: `ActorId`経由で将来的なBotなど新しいアクター種別を追加しやすい構造となった。

## 運用・実装メモ

- サービスアカウントIDを付与する際は`sa_`プレフィックスを維持すること。`ActorId::from_str`はプレフィックスで判定するため、命名規約を破ると即時にエラーとなる。
- 既存テストで`UserId`固定だったケースは`ActorId`ヘルパを用いて更新済み。新規テストでは`ActorId`を直接利用すること。

## 関連ドキュメント

- [タスクドキュメント](../../tasks/completed/v0.19.3/support-service-account-chatroom-owner/task.md)
- [検証レポート](../../tasks/completed/v0.19.3/support-service-account-chatroom-owner/verification-report.md)
