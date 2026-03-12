---
title: "チャットルーム削除・更新REST APIを追加する"
type: feature
emoji: "🗂️"
topics:
  - LLMS
  - Axum
  - REST API
published: false
targetFiles:
  - packages/llms/src/adapter/axum/
  - packages/llms/src/usecase/
  - packages/llms/src/app.rs
  - packages/llms/tests/
  - apps/tachyon-api/tests/scenarios/
github: https://github.com/quantum-box/tachyon-apps
---

# チャットルーム削除・更新REST APIを追加する

## 概要

LLMSコンテキストのREST APIにチャットルームの削除および更新エンドポイントを追加し、既存の作成／一覧取得APIだけでは対応できなかったチャットルーム管理のオペレーションを揃える。

## 背景・目的

- Tachyon AI Studioではチャットルームのリネームや削除をUIから行う設計になっているが、現状のREST APIは`POST /v1/llms/chatrooms`と`GET /v1/llms/chatrooms`のみで更新・削除ができない。
- チャットルーム一覧にはソフトデリート済みレコードが除外される想定だが、削除APIがないため運用時にDB操作が必要になる。
- Policy基盤で`llms:DeleteChatRoom``llms:UpdateChatRoom`を定義済みのため、対応するユースケースとハンドラを揃えることで権限制御を完結できる。

## 詳細仕様

### 機能要件

1. `DELETE /v1/llms/chatrooms/{chatroom_id}`を追加し、指定チャットルームをソフトデリートする。レスポンスは204 No Content、`deleted_at`を現在時刻に更新する。
2. `PATCH /v1/llms/chatrooms/{chatroom_id}`を追加し、チャットルーム名を更新できるようにする。リクエストJSON `{ "name": "New name" }`、レスポンス200で更新後のチャットルームを返す。
3. いずれのAPIも`auth::Executor`/`auth::MultiTenancy`を受け取り、Policyで`llms:DeleteChatRoom`および`llms:UpdateChatRoom`を検証する。オペレーターが一致しない場合は404相当を返す。
4. IDフォーマットが不正な場合は400（`Invalid chatroom ID format`）を返す。存在しない場合は404。
5. 更新時に空文字や255文字超など無効な名前を弾く（既存`ChatRoomName`バリデーションに準拠）。
6. 削除後は`GET /v1/llms/chatrooms`から除外され、同一IDでの再取得は404となる。

### 非機能要件

- 既存のAxumスタックを利用し、ミドルウェア構成は変更しない。
- Policyチェック失敗時は403を返し、監査ログ（tracing）にアクション名を含める。
- ソフトデリートにより履歴保全を維持しつつ、一覧取得クエリのインデックス利用を損なわないことを確認する。
- OpenAPIドキュメントに新規エンドポイントを追加し、Swagger/Redocで参照可能にする。

### コンテキスト別の責務

```yaml
contexts:
  llms:
    description: "チャットルーム管理REST API"
    responsibilities:
      - DeleteChatRoom/UpdateChatRoomユースケースを追加
      - AxumハンドラとOpenAPI定義の拡張
      - chatroomsテーブルに対するソフトデリート・更新処理
  auth:
    description: "ポリシー検証"
    responsibilities:
      - Executor/MultiTenancyからoperatorを解決
      - llms:DeleteChatRoom / llms:UpdateChatRoomの検証
  apps/tachyon-api:
    description: "シナリオテスト"
    responsibilities:
      - RESTシナリオに削除・更新ケースを追加
      - `mise run tachyon-api-scenario-test`で回帰確認
```

### 仕様のYAML定義

```yaml
delete_chatroom:
  method: DELETE
  path: "/v1/llms/chatrooms/{chatroom_id}"
  auth:
    headers:
      - x-operator-id
      - Authorization
  success:
    status: 204
  errors:
    - status: 400
      message: "Invalid chatroom ID format"
    - status: 403
      message: "Forbidden"
    - status: 404
      message: "chatroom is not found"

update_chatroom:
  method: PATCH
  path: "/v1/llms/chatrooms/{chatroom_id}"
  request:
    contentType: application/json
    body:
      name: string # 1..100 chars, trimmed
  response:
    status: 200
    body:
      chatroom:
        id: string
        name: string
        operatorId: string
        ownerId: string
        createdAt: string # ISO8601 UTC
        updatedAt: string # ISO8601 UTC
  errors:
    - status: 400
      message: "Invalid chatroom ID format"
    - status: 422
      message: "Invalid chatroom name"
    - status: 403
      message: "Forbidden"
    - status: 404
      message: "chatroom is not found"
```

## 実装方針

### アーキテクチャ設計

- ChatroomInputPortに`update_chat_room`/`delete_chat_room`用のDTOを追加し、InteractorでPolicyチェックとリポジトリアクセスを実装する。
- Axumハンドラとして`delete_chatroom_handler.rs`と`patch_chatroom_handler.rs`を新設し、`create_inner_router`にルーティングを追加する。
- `SqlxChatRoomRepository`に存在確認＋tenant一致チェックを持たせ、更新時は`updated_at`をUTC現在時刻に上書きする。
- OpenAPIドキュメントを更新し、Swagger UI/Redocが自動生成したエンドポイントを表示できるようにする。

### 技術選定

- Axum / utoipa: 既存RESTレイヤーと統一。
- SQLx: 既存の`SqlxChatRoomRepository`を拡張。共通接続を再利用。
- value_object::ChatRoomId / ActorId: IDフォーマット検証を統一。
- chrono::Utc: `updated_at`の更新に使用。

### TDD（テスト駆動開発）戦略

- 既存の`packages/llms/tests/adapter/axum`に削除・更新APIの統合テストを追加し、正常系とバリデーションエラーを確認する。
- `apps/tachyon-api/tests/scenarios`にシナリオを追加し、`mise run tachyon-api-scenario-test`で回帰させる。
- Delete/Updateユースケースの単体テスト（Policyモック・リポジトリモック）を用意して権限チェックを保証する。
- 新テストはCIの`mise run ci`対象に含まれるため、ローカルでも同タスクを実行して確認する。

## タスク分解

### 主要タスク
- [x] ユースケースとDTOの拡張（Update/ Delete用）
- [x] Axumハンドラとルーティングの追加
- [x] SQLxリポジトリの更新ロジック拡張とテスト（ユニットテスト追加含む）
- [x] シナリオテスト・ユニットテストの追加・更新
- [ ] Playwright MCPによる動作確認とレポート反映
- [x] タスクドキュメントの進捗更新

## Playwright MCPによる動作確認

### 実施タイミング
- [ ] 実装完了後の初回動作確認
- [ ] PRレビュー前の最終確認

### 動作確認チェックリスト
- [ ] チャットルームを作成後に名称更新が反映されること
- [ ] 更新後のチャットルームが一覧で新しい名前を持つこと
- [ ] チャットルーム削除後に一覧・詳細が404/非表示となること
- [ ] 誤ったIDでの削除・更新が400/404エラーになることを確認する
- [ ] Swagger UIで新規エンドポイントが表示されること
