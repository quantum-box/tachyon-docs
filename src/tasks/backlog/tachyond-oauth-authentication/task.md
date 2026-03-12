# tachyond Worker の OAuth 認証対応

## 概要

tachyond Worker が Cognito OAuth (client_credentials flow) で tachyon-api に認証できるようにする。
現在は `dummy-token`（開発専用）または `pk_` Public API Key で認証しているが、本番環境では OAuth トークンによる認証も選択可能にする。

## 背景

- tachyon-api の Executor ミドルウェアは既に OAuth JWT 検証に対応している
- Worker 側がトークン取得・リフレッシュに対応していないだけ
- API 側の変更は基本不要（既存の JWT 検証パスで処理される）

## 現在の認証方式

| 方式 | トークン形式 | 対応環境 | 備考 |
|------|------------|---------|------|
| dummy-token | `Bearer dummy-token` | development/test のみ | `ENVIRONMENT` 環境変数で制御 |
| Public API Key | `Bearer pk_xxx` | 全環境 | Service Account に紐づく |
| OAuth JWT | `Bearer eyJ...` | 全環境 | Cognito client_credentials |

## 実装方針

### 1. tachyond に OAuth トークン取得機能を追加

```rust
// WorkerArgs に認証方式の選択肢を追加
#[arg(long, env = "AUTH_METHOD", default_value = "token")]
pub auth_method: AuthMethod, // "token" | "oauth"

// OAuth 用パラメータ
#[arg(long, env = "COGNITO_CLIENT_ID")]
pub cognito_client_id: Option<String>,

#[arg(long, env = "COGNITO_CLIENT_SECRET")]
pub cognito_client_secret: Option<String>,

#[arg(long, env = "COGNITO_TOKEN_ENDPOINT")]
pub cognito_token_endpoint: Option<String>,
```

### 2. トークンプロバイダー抽象化

```rust
trait TokenProvider: Send + Sync {
    async fn get_token(&self) -> Result<String>;
}

// Static token (dummy-token, pk_ key)
struct StaticTokenProvider { token: String }

// OAuth client_credentials flow
struct OAuthTokenProvider {
    client_id: String,
    client_secret: String,
    token_endpoint: String,
    cached_token: RwLock<Option<CachedToken>>,
}
```

### 3. トークンリフレッシュ

- OAuth トークンには有効期限がある（通常 1 時間）
- heartbeat ループ内、またはリクエスト前にトークンの有効期限をチェック
- 期限切れ 5 分前に自動リフレッシュ

### 4. Worker 側の User/ServiceAccount マッピング

OAuth の場合、Cognito の `sub` claim から User を解決する。
Worker 用の Cognito ユーザー（Machine-to-Machine）を作成し、適切なポリシー（`ToolJobWorkerPolicy`）を紐づける必要がある。

## タスク

- [ ] `TokenProvider` トレイトと `StaticTokenProvider` 実装
- [ ] `OAuthTokenProvider` 実装（client_credentials flow）
- [ ] トークンキャッシュ & 自動リフレッシュ機構
- [ ] `WorkerArgs` に認証方式選択（`--auth-method`）追加
- [ ] `run_worker` 内で `TokenProvider` を初期化し各関数に渡す
- [ ] Cognito に Worker 用 Machine-to-Machine ユーザー作成手順を文書化
- [ ] 動作確認（ローカル Keycloak または n1 Cognito）

## 関連ファイル

| ファイル | 説明 |
|---------|------|
| `apps/tachyond/src/worker.rs` | Worker 実装（現在 `auth_token: String` で静的トークンを渡している） |
| `packages/auth/src/framework_driver/axum_request/executor.rs` | API 側トークン判定ロジック（JWT 検証パス既存） |
| `packages/auth/src/usecase/verify_token.rs` | JWT 検証 usecase |
| `packages/providers/cognito/src/` | Cognito OAuth 実装（verify, jwks, client） |
| `apps/tachyon-api/src/main.rs` | Cognito 初期化 |

## 備考

- Public API Key 方式でも本番運用は可能。OAuth 対応は追加の選択肢として提供する位置づけ。
- API 側の変更は不要。既存の Executor ミドルウェアが JWT を自動検証する。
