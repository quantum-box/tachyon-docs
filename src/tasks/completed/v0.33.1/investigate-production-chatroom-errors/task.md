# 本番環境Chatroom生成エラー調査

## 概要

2026-01-21に本番環境でchatroom関連のエラーが発生している問題を調査した。

## 発見された問題

### 問題1: DBに未登録のアクション（深刻度: 中）

**症状:**
```
NotFoundError: Action 'llms:AutoGenerateChatroomName' not found
NotFoundError: Action 'llms:GetDeletedMessages' not found
```

**影響:**
- chatroom名の自動生成が失敗する
- 削除済みメッセージの取得ができない

**原因:**
- シードファイル `scripts/seeds/n1-seed/008-auth-policies.yaml` にはアクションが定義されている
- しかし、本番DBにはこれらのアクションが反映されていない
- 最新のマイグレーションまたはシード適用が本番環境に対して実行されていない

**該当アクション:**
| アクション名 | ID | 説明 |
|-------------|-----|------|
| `llms:AutoGenerateChatroomName` | `act_01hjryxysgey07h5jz5w00079` | 会話に基づくchatroom名の自動生成 |
| `llms:GetDeletedMessages` | `act_01hjryxysgey07h5jz5w00077` | chatroom内のソフト削除されたメッセージの取得 |

**対応:**
- [ ] 本番DBにシードを再適用する（または不足しているアクションを手動で追加）

---

### 問題2: GraphQL認証エラー（深刻度: 高）

**症状:**
```
UnauthorizedError: verify token failed error on idp: UnauthorizedError: token verify failed
```

**発生時刻:** 2026-01-21 01:19:14 〜 01:19:59 (約45秒間、4秒間隔でリトライ)

**影響:**
- GraphQL API (`POST /v1/graphql`) へのアクセスが認証エラーで失敗
- chatroom作成などのGraphQL mutationが実行できない

**原因分析:**

```
エラー発生フロー:
1. クライアントが Authorization: Bearer <token> でリクエスト
2. axum middleware (packages/auth/src/framework_driver/axum_request/executor.rs:145) でトークン検証
3. VerifyToken usecase (packages/auth/src/usecase/verify_token.rs:48) がIDPにトークン検証を依頼
4. Cognito verify (packages/providers/cognito/src/verify.rs:96-99) でJWTデコードが失敗
5. "token verify failed" エラーを返却
```

**可能性のある原因:**

| 原因 | 可能性 | 根拠 |
|-----|--------|------|
| トークン期限切れ | 高 | 4秒間隔でリトライしている（同じ期限切れトークンを使い続けている可能性） |
| トークンリフレッシュ失敗 | 高 | フロントエンドがトークンをリフレッシュできず、古いトークンで再試行 |
| Cognito JWKの取得失敗 | 低 | 同時刻に他のリクエストは成功している |
| フロントエンド側のバグ | 中 | セッション管理の問題の可能性 |

**成功しているリクエストとの比較:**
- 成功: ServiceAccount認証（`pk_`プレフィックスのAPIキー）
- 成功: ユーザー認証（01:24:40頃、testユーザーで成功している）
- 失敗: 01:19:14〜01:19:59の期間に特定クライアントから連続失敗

**追加調査が必要な項目:**
- [ ] フロントエンドのトークンリフレッシュロジックの確認
- [ ] 失敗しているリクエストの送信元（特定ユーザーか、特定デバイスか）
- [ ] Cognito User Poolのセッション設定

---

### 問題3（軽微）: OpenTelemetryエクスポートタイムアウト

**症状:**
```
OpenTelemetry trace error occurred. Exporter otlp encountered the following error(s):
the grpc server returns error (The operation was cancelled): , detailed error message: Timeout expired
```

**影響:** テレメトリデータの一部が失われる（機能に影響なし）

**原因:** OTLPコレクターへのgRPC接続タイムアウト

**対応:** 低優先度。コレクターの設定またはネットワーク設定を確認。

---

## 成功しているオペレーション

以下のオペレーションは正常に動作している：

1. **chatroom内でのagent実行:**
   - `ch_01kfezaj158r05knr846sw9pda` (ServiceAccount経由) - 成功
   - `ch_01kff2c1egzz8sk2b1n69ds16g` (User: test経由) - 成功

2. **LLMプロバイダー選択と課金:**
   - Anthropic Claude Haiku 4.5/Sonnet 4.5 で正常に実行・課金されている

---

## ログ詳細

### 正常なリクエストの例（01:24:40頃）

```json
{
  "timestamp": "2026-01-21T01:24:40.988129Z",
  "message": "Successfully selected provider: anthropic for model: claude-sonnet-4.5",
  "path": "/v1/llms/chatrooms/:chatroom_id/agent/execute",
  "executor": "User(us_01hs2yepy5hw4rz8pdq2wywnwt)"
}
```

### 認証失敗リクエストの例（01:19:14頃）

```json
{
  "timestamp": "2026-01-21T01:19:14.139596Z",
  "message": "middleware error: UnauthorizedError: verify token failed error on idp: UnauthorizedError: token verify failed",
  "path": "/v1/graphql",
  "request_id": "5184a846-92a3-4b0d-87d4-7eb917457fb3"
}
```

### アクション未登録エラーの例

```json
{
  "timestamp": "2026-01-21T00:30:04.281813Z",
  "message": "Failed to auto-generate chatroom name",
  "chatroom_id": "ch_01kfezaj158r05knr846sw9pda",
  "error": "NotFoundError: Action 'llms:AutoGenerateChatroomName' not found"
}
```

---

## 対応方針

### 優先度: 高

1. **本番DBへのシード適用**
   - `llms:AutoGenerateChatroomName` と `llms:GetDeletedMessages` アクションを追加
   - `yaml-seeder` または手動SQLで適用

### 優先度: 中

2. **認証エラーの継続調査**
   - フロントエンドのトークンリフレッシュロジック確認
   - Cognitoセッション設定の確認
   - エラーが特定ユーザー/デバイスに限定されているか調査

### 優先度: 低

3. **OpenTelemetryタイムアウト**
   - OTLPコレクター設定の確認

---

## 解決済み

### mise.toml の修正

`mise run seeding prod` が本番DBに接続しない問題を修正した。

**問題:**
- `mise run seeding prod` はローカルのDocker内DBにシードを実行していた
- `prod` 引数は「本番向け設定のシードデータ」を使う意味であり、「本番DBに接続する」意味ではなかった

**修正内容:**
- `ENVIRONMENT=prod` の場合、`PROD_DATABASE_URL` 環境変数を使って直接 `yaml-seeder` を実行するように変更
- `PROD_DATABASE_URL` が未設定の場合はエラーで終了
- 本番実行時は黄色の警告メッセージを表示

**修正ファイル:** `mise.toml` ([tasks.seeding])

### 本番DBへのシード適用

`mise run seeding prod` を実行し、不足していたアクションを本番DBに反映した。

- ✅ `llms:AutoGenerateChatroomName`
- ✅ `llms:GetDeletedMessages`

---

## 関連ファイル

- `mise.toml` - シーディングタスク定義（**修正済み**）
- `packages/auth/src/framework_driver/axum_request/executor.rs` - 認証ミドルウェア
- `packages/auth/src/usecase/verify_token.rs` - トークン検証ユースケース
- `packages/providers/cognito/src/verify.rs` - Cognito JWT検証
- `packages/llms/src/usecase/auto_generate_chatroom_name.rs` - chatroom名自動生成
- `scripts/seeds/n1-seed/008-auth-policies.yaml` - アクション定義シード
