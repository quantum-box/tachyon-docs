---
title: "サービスアカウント対応チャットルームオーナー"
type: "improvement"
emoji: "🤖"
topics:
  - "llms"
  - "auth"
  - "rust"
published: false
targetFiles:
  - "packages/llms/domain/src/chat_room.rs"
  - "packages/llms/src/usecase/boundary/mod.rs"
  - "packages/llms/src/usecase/chatroom_interactor.rs"
  - "packages/llms/src/adapter/gateway/sqlx_chatroom_repository.rs"
  - "packages/llms/src/adapter/graphql/model/chatroom.rs"
  - "packages/llms/src/adapter/axum/post_chatroom_handler.rs"
  - "packages/value_object/src/lib.rs"
github: ""
---

# サービスアカウント対応チャットルームオーナー

## 概要

サービスアカウントがチャットルーム作成 API を実行した場合でも、チャットルームの `owner` として妥当な ID を保存できるように、オーナー ID の表現を拡張する。

## 背景・目的

- 現状は `executor.get_user_id()` が `UserId` 前提のため、サービスアカウントがチャットルームを作成すると ID 解析に失敗する。
- `owner` が `UserId` 固定であることから、サービスアカウント実行時にオーナー情報を欠損させる手段がない。
- `owner` を `Option<String>` にすると整合性が崩れるため、`UserId` と `ServiceAccountId` の双方を型レベルで扱えるようにしたい。

## 詳細仕様

### 機能要件

1. チャットルーム / メッセージの所有者を `ActorId`（`UserId` または `ServiceAccountId`）として表現する。
2. 既存の API・GraphQL レスポンスでは従来どおり文字列 ID を返却する。
3. サービスアカウントからのチャットルーム作成でも例外が発生しないこと。

### 非機能要件

- ドメイン層のバリデーション（ID プレフィックスチェック）を維持する。
- 既存のチャットルーム検索・フィルタリングロジックに副作用を与えない。

### コンテキスト別の責務

```yaml
contexts:
  llms:
    description: "チャットルームとメッセージの所有者 ID を ActorId へ移行"
    responsibilities:
      - ChatRoom/ChatMessage ドメインモデルのフィールド型を置換
      - Usecase 入力 DTO の型更新
      - Axum/GraphQL/Repository 層の追従
  auth:
    description: "Executor 由来の ID 表現の拡張"
    responsibilities:
      - ServiceAccountId を ActorId に取り込むための値オブジェクト追加
```

## 実装方針

### アーキテクチャ設計

- `value_object` クレートに `ActorId`（`enum`）を追加し、`FromStr`/`Display` 実装で `us_` / `sa_` を許容する。
- `ChatRoom`, `ChatMessage`, `CreateChatRoomInputDto` など `owner` を扱う箇所を `ActorId` に置換。
- Repository・API ハンドラは `ActorId` を `String` へ変換して入出力する。

### 技術選定

- 既存の `def_id!` マクロでは enum を表現できないため、標準の `FromStr` 実装を手書きする。
- 追加ライブラリは不要。

### タスク分解

- 📝 ActorId 値オブジェクトの追加とテスト
- 📝 ドメインモデル（ChatRoom/ChatMessage）のフィールド型更新
- 📝 Usecase 層・リポジトリ層・GraphQL/HTTP レイヤーの追従
- 📝 影響範囲のテスト整備（必要に応じて）

## テスト計画

- `packages/llms` の既存ユニットテストを実行しリグレッションを検知。
- 可能であればサービスアカウントでのチャットルーム作成を再現する結合テストを追加検討。

## リスクと対策

- `ActorId` への置換漏れ ⇒ コンパイラエラーで検知しやすいが、GraphQL スキーマや生成コードの再出力を忘れない。
- 既存データとの互換性 ⇒ すべて文字列として保存されているため後方互換。

## スケジュール

- 実装・テスト: 0.5 日想定。

## 完了条件

- サービスアカウント実行時にチャットルーム作成 API が成功する。
- 影響範囲のビルド・テストが通過する。
- 本タスクドキュメントと検証レポートを更新済み。
