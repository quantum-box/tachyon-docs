---
title: "Chatroom Model Comparison API"
type: feature
emoji: "🔀"
topics:
  - LLMs
  - Chatroom
  - REST API
  - Model Comparison
published: true
targetFiles:
  - packages/llms/src/
  - apps/tachyon-api/
github: ""
---

# Chatroom Model Comparison API

## 概要

モデル比較機能を実現するため、chatroomに**metadata**フィールドを追加し、比較グループを管理する方式でAPIを改善します。

モデル情報はメッセージレベルで既に保持されているため、chatroomにはmetadataのみを追加します。この設計により、既存のchatroom構造を最大限活用しつつ、比較グループの管理が可能になります。

## 背景・目的

### 現状の問題

#### 問題1: 1つのchatroomに複数モデルのメッセージが混在

現在の実装では、比較モード時に同一chatroom内で複数モデルに対してメッセージを送信しています。

**問題点**:
- 1 chatroom内に複数モデルの応答が混在し、履歴管理が複雑
- どのメッセージがどのモデルからの応答か判別できない
- chatroom切り替え時に比較履歴を復元できない
- モデルごとの削除・編集が困難

#### 問題2: APIとフロントエンドの責任が曖昧

現在の暫定実装では、同一chatroomに複数モデルでメッセージを送信しており：
- リアルタイム時のみフロントエンド側でモデル判別可能
- 履歴ロード時はモデル情報が失われる
- API側でchatroomとmodelの関係が不明確

### 期待される成果

1. **APIサイド**: 比較モードを知らない疎結合設計、metadataのみ追加でシンプル
2. **フロントエンドサイド**: metadata.comparison_group_idで比較グループを管理、一覧APIのmetadataでグルーピング表示
3. **ユーザー体験**: 柔軟なモデル切り替え（同一chatroomで途中変更可能）、完全な履歴比較

## 詳細仕様

### 設計原則

1. **疎結合**: APIは「比較モード」を知らない（metadataで実現）
2. **既存構造の再利用**: chatroomの基本設計を変更しない
3. **スケーラビリティ**: 3モデル以上の比較も容易に対応可能
4. **柔軟性**: 同一chatroomで途中からモデル変更も可能（モデル情報はメッセージレベル）

### 機能要件

#### 1. ChatRoomスキーマの拡張

```yaml
ChatRoom:
  properties:
    id:
      type: string
    name:
      type: string
    metadata:
      type: object
      description: "任意のメタデータ（比較グループIDなど）"
      properties:
        comparison_group_id:
          type: string
          description: "比較グループID（比較モード時のみ）"
        comparison_group_name:
          type: string
          description: "比較グループ名（比較モード時のみ）"
    operator_id:
      type: string
    owner_id:
      type: string
    created_at:
      type: string
      format: date-time
    updated_at:
      type: string
      format: date-time
```

**注**: モデル情報はメッセージレベルで保持されているため、chatroomにmodel_idは不要。

#### 2. 通常/比較chatroomのデータ形式

**通常のchatroom**:
```json
{
  "id": "ch_regular_001",
  "name": "Regular Chat",
  "metadata": {},
  "created_at": "2026-01-16T12:00:00Z",
  "updated_at": "2026-01-16T12:00:00Z"
}
```

**比較モードのchatroom群**:
```json
[
  {
    "id": "ch_sonnet_001",
    "name": "My Chat (Sonnet)",
    "metadata": {
      "comparison_group_id": "cmp_abc123",
      "comparison_group_name": "My Chat"
    }
  },
  {
    "id": "ch_haiku_001",
    "name": "My Chat (Haiku)",
    "metadata": {
      "comparison_group_id": "cmp_abc123",
      "comparison_group_name": "My Chat"
    }
  }
]
```

**注**: 各chatroomで使用されたモデルは、メッセージのmodel_idから判別可能。

#### 3. 変更が必要なエンドポイント

| エンドポイント | メソッド | 変更内容 |
|---------------|---------|---------|
| `/v1/llms/chatrooms` | POST | `metadata`を受け付ける |
| `/v1/llms/chatrooms` | GET | 各chatroomの`metadata`を必ず返す |
| `/v1/llms/chatrooms/{chatroom_id}` | GET | `metadata`を返す |
| `/v1/llms/chatrooms/{chatroom_id}` | PATCH | `metadata`の更新を許可 |

### 非機能要件

- **後方互換性**: 既存のAPIクライアントが動作し続けること
- **パフォーマンス**: metadata取得による一覧APIのレスポンスタイムに大きな影響がないこと
- **拡張性**: 将来的に比較グループ一括操作APIを追加できる構造

### コンテキスト別の責務

```yaml
contexts:
  llms:
    description: "LLMサービスとChatroom管理"
    responsibilities:
      - metadata（比較グループ情報）の永続化
      - メッセージレベルでのmodel_id管理（既存）
```

### DBスキーマ変更

```sql
-- Chatroomsテーブルへのカラム追加
ALTER TABLE chatrooms ADD COLUMN metadata JSON DEFAULT '{}';

-- metadataのcomparison_group_idでインデックス（検索最適化）
CREATE INDEX idx_chatrooms_comparison_group
ON chatrooms ((metadata->>'$.comparison_group_id'));
```

## 実装方針

### アーキテクチャ設計

Clean Architectureに従い、以下のレイヤーで実装：

1. **Domain層**: `Chatroom`エンティティに`metadata`フィールド追加
2. **Usecase層**: 既存のCRUD usecaseを拡張
3. **Interface Adapter層**: REST APIハンドラーの修正
4. **Infrastructure層**: SQLxリポジトリの更新

### 技術選定

- **JSON型**: MySQLのJSON型でmetadataを格納（TiDB互換）
- **インデックス**: JSONパス式でcomparison_group_idにインデックス

### 実装の優先度

#### Phase 1: 必須（即座に実装）
- `ChatRoom`スキーマに`metadata`フィールド追加（JSON型）
- DBスキーマ変更（chatroomsテーブル）
- Chatroom作成API: `metadata`を受け付ける
- Chatroom一覧API: `metadata`を必ず返す
- Chatroom詳細取得API: `metadata`を必ず返す

#### Phase 2: 推奨（余裕があれば）
- 比較グループ一括作成API（`POST /v1/llms/comparison-groups`）
- 比較グループ一括削除API（`DELETE /v1/llms/comparison-groups/{group_id}`）
- metadata検索機能（`GET /v1/llms/chatrooms?comparison_group_id=xxx`）

## タスク分解

### Phase 1: Domain/Infrastructure層 ✅

- [x] Chatroom entityに`metadata`フィールド追加（serde_json::Value）
- [x] DBマイグレーション作成（metadataカラム追加）
- [x] SqlxChatroomRepositoryの更新（metadata対応）

### Phase 2: Usecase層 ✅

- [x] CreateChatroom usecaseに`metadata`パラメータ追加
- [x] UpdateChatroom usecaseに`metadata`更新機能追加
- [x] ListChatrooms usecaseのレスポンスにmetadata含める
- [x] GetChatroom usecaseのレスポンスにmetadata含める

### Phase 3: Interface Adapter層（REST API） ✅

- [x] POST `/v1/llms/chatrooms` - リクエスト/レスポンス更新
- [x] GET `/v1/llms/chatrooms` - レスポンスにmetadata追加
- [x] GET `/v1/llms/chatrooms/{id}` - レスポンスにmetadata追加
- [x] PATCH `/v1/llms/chatrooms/{id}` - metadata更新対応
- [x] GraphQL createChatroom mutation - metadata対応

### Phase 4: テスト・ドキュメント ✅

- [x] SQLxオフラインキャッシュ更新
- [x] cargo checkパス確認
- [x] シナリオテスト追加（比較グループ作成→一覧→詳細の流れ）
- [ ] OpenAPI spec更新（llms.openapi.yaml）- 後続タスク

### Phase 5: Metadata User IDフィルタ機能 📝

metadata内の`user_id`フィールドでChatRoom一覧をフィルタできるようにする。

#### 背景
- ChatRoomを外部システムのユーザーIDと紐付けて管理したい
- `owner`フィールドは内部認証システム用（ActorId）のため、任意のIDを設定できない
- metadataにuser_idを格納し、それでフィルタできれば柔軟に対応可能

#### 実装タスク
- [ ] `ChatRoomFilter`構造体を追加
  ```rust
  pub struct ChatRoomFilter {
      pub metadata_user_id: Option<String>,
  }
  ```
- [ ] `ChatRoomRepository::find_all`シグネチャを拡張（`filter: Option<ChatRoomFilter>`追加）
- [ ] SQLクエリで`JSON_EXTRACT(metadata, '$.user_id')`によるフィルタ実装
- [ ] REST API: `GET /v1/llms/chatrooms?metadata_user_id=xxx`対応
- [ ] GraphQL: `chatrooms`クエリに`metadataUserId`引数追加
- [ ] シナリオテスト追加（user_idでのフィルタ動作確認）

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 既存APIクライアントへの影響 | 低 | metadataはデフォルト空オブジェクト、既存レスポンスに追加するのみ |
| TiDBでのJSON型パフォーマンス | 低 | インデックスを適切に設定、必要に応じてGINインデックス検討 |

## 代替案との比較

### 代替案A: chatroomにmodel_idフィールド追加
- ❌ 同じchatroomで途中からモデル変更ができなくなる
- ❌ メッセージにすでにmodel_id情報があるため冗長

### 代替案B: 1リクエストで複数モデル実行
- ❌ APIがフロントエンドのUI構造に強く依存
- ❌ エラーハンドリングが複雑

### 採用案: Metadata管理のみ
- ✅ APIは「比較」を知らない（疎結合）
- ✅ スケーラブル（N個のモデルに対応）
- ✅ 既存のchatroom構造を最大限活用
- ✅ 柔軟性を維持（途中からモデル変更可能）

## 参考資料

- フロントエンド比較モード実装（Flutter）: 提案書に記載
- OpenAPI Spec: `llms.openapi.yaml`
- 既存Chatroom API: `packages/llms/src/`

## 完了条件

- [x] すべてのPhase 1タスクが完了
- [x] シナリオテストがパス
- [x] 既存のAPIテストがパス（後方互換性）
- [ ] OpenAPI specが更新されている（後続タスク）
- [ ] コードレビューが完了

## 実装サマリー

### 変更ファイル一覧

**Domain層:**
- `packages/llms/domain/src/chat_room.rs` - ChatRoomエンティティにmetadataフィールド追加

**Infrastructure層:**
- `packages/llms/migrations/20260116000000_add_chatroom_metadata.up.sql` - metadataカラム追加マイグレーション
- `packages/llms/migrations/20260116000000_add_chatroom_metadata.down.sql` - ロールバックマイグレーション
- `packages/llms/src/adapter/gateway/sqlx_chatroom_repository.rs` - SQLクエリのmetadata対応

**Usecase層:**
- `packages/llms/src/usecase/boundary/mod.rs` - DTOにmetadataフィールド追加
- `packages/llms/src/usecase/chatroom_interactor.rs` - create/updateでmetadata処理

**Interface Adapter層:**
- `packages/llms/src/adapter/axum/model/mod.rs` - REST APIモデル更新
- `packages/llms/src/adapter/axum/post_chatroom_handler.rs` - POST API更新
- `packages/llms/src/adapter/axum/patch_chatroom_handler.rs` - PATCH API更新
- `packages/llms/src/adapter/graphql/model/chatroom.rs` - GraphQLモデル更新
- `packages/llms/src/adapter/graphql/model/input.rs` - GraphQL入力型更新
- `packages/llms/src/adapter/graphql/mutation.rs` - GraphQL mutation更新

**テスト:**
- `apps/tachyon-api/tests/scenarios/chatroom_metadata.yaml` - metadataのCRUD操作を検証するシナリオテスト

**その他:**
- `apps/tachyon-api/src/webhook_handler.rs` - webhook内のchatroom作成修正
- `.sqlx/` - SQLxオフラインキャッシュ更新

### バージョン番号の決定基準

**マイナーバージョン（x.X.x）を上げる**:
- [x] 新機能の追加（metadataフィールド）
- [x] 新しいAPIエンドポイントの機能拡張

## 備考

- フロントエンド（Flutter）側の実装は別タスクとして管理
- Phase 2の比較グループ一括操作APIは、Phase 1完了後に必要に応じて実装
