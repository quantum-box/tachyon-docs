---
title: "Tachyon 共通認証基盤 (Auth Platform)"
type: feature
emoji: "🔐"
topics: ["authentication", "oauth2", "multi-tenancy", "platform", "client-credentials"]
published: true
targetFiles:
  - packages/auth/domain/src/
  - packages/auth/src/
  - packages/auth/migrations/
  - apps/tachyon-api/src/
  - apps/tachyon/src/app/v1beta/[tenant_id]/settings/auth-platform/
github: ""
---

# Tachyon 共通認証基盤 (Auth Platform)

## 概要

Tachyon を共通認証基盤（Auth Platform）として利用できるようにする。外部アプリケーションがTachyonに対してOAuth2 Client ID / Client Secret を発行し、テナント単位で認証連携を行える仕組みを構築する。Tachyonのユーザープールを使うかどうかは外部アプリ側が選択でき、Platformへのアクセス権限はユーザーがログイン時にオプトインする形式とする。

## 背景・目的

- **現状の課題**: 現在、Tachyonの認証はKeycloak + NextAuth によるセッションベースの仕組みで、外部アプリケーションからTachyonの認証基盤を利用する手段がない
- **解決したい課題**:
  - 外部アプリケーションがTachyonのユーザー認証・認可基盤を活用したい
  - テナント（Operator）ごとにOAuth2クライアントを発行し、アクセス制御を分離したい
  - ユーザーがどのPlatformにアクセス権限を与えるかを自分で制御したい（オプトイン）
- **期待される成果**:
  - OAuth2/OIDC準拠の認証基盤としてTachyonを外部公開できる
  - テナントごとにクライアント管理が可能
  - ユーザーの同意に基づくPlatformアクセス権限管理

## 詳細仕様

### 機能要件

#### 1. OAuth2 Client管理

- テナント（Operator）ごとにOAuth2 Client（Client ID / Client Secret）を発行できる
- 1テナントにつき複数のClientを発行可能
- Clientごとに許可するスコープ（scope）を設定可能
- Client Secretのローテーション（再生成）が可能
- Clientの有効/無効の切り替え

```yaml
oauth2_client:
  id: "oc_01xxx..."  # ULID with oc_ prefix
  tenant_id: "tn_01hjryxysgey07h5jz5wagqj0m"  # 発行元テナント
  name: "My External App"
  client_id: "tachyon_oc_01xxx..."  # 一意のクライアントID
  client_secret_hash: "sha256:..."  # ハッシュ化されたシークレット
  redirect_uris:
    - "https://myapp.example.com/callback"
    - "http://localhost:3000/callback"  # 開発用
  allowed_scopes:
    - "openid"
    - "profile"
    - "email"
    - "operator:read"
  grant_types:
    - "authorization_code"
    - "refresh_token"
  use_tachyon_user_pool: true  # Tachyonユーザープールを使うか
  status: "active"  # active / inactive / revoked
  created_at: "2026-03-10T00:00:00Z"
  updated_at: "2026-03-10T00:00:00Z"
```

#### 2. ユーザープール選択

外部アプリは、Tachyonのユーザープールを使うかどうかを選択できる:

- **Tachyonユーザープール利用（`use_tachyon_user_pool: true`）**:
  - ユーザーはTachyonのログイン画面で認証される
  - Tachyonに登録済みのユーザー情報（profile, email等）がIDトークンに含まれる
  - SSO的な体験を提供

- **独自ユーザープール（`use_tachyon_user_pool: false`）**:
  - Clientは認証のみをTachyonに委任し、ユーザー管理は自前で行う
  - Tachyonは認可サーバーとしてのみ機能（トークン発行・検証）
  - Machine-to-Machine（M2M）認証のユースケースにも対応

#### 3. Platformアクセス権限のオプトイン

- ユーザーがOAuth2認可フローでログインする際、対象Platformへのアクセス権限を付与するかどうかの同意画面を表示
- ユーザーが明示的に同意した場合のみ、そのPlatformへのアクセストークンが発行される
- 一度同意した権限は後から取り消し可能（設定画面から管理）
- 同意情報はユーザー×Platform×スコープの粒度で管理

```yaml
user_platform_consent:
  id: "upc_01xxx..."
  user_id: "us_01hs2yepy5hw4rz8pdq2wywnwt"
  platform_id: "tn_01hjryxysgey07h5jz5wagqj0m"  # OAuth2 Clientの所属テナント
  client_id: "oc_01xxx..."
  granted_scopes:
    - "openid"
    - "profile"
    - "email"
  consented_at: "2026-03-10T00:00:00Z"
  revoked_at: null  # 取り消し時にタイムスタンプが入る
```

#### 4. OAuth2/OIDC エンドポイント

```yaml
endpoints:
  # Authorization Server Metadata (RFC 8414)
  well_known: "GET /.well-known/openid-configuration"

  # Authorization Endpoint
  authorize: "GET /oauth2/authorize"
  # params: response_type, client_id, redirect_uri, scope, state, nonce

  # Token Endpoint
  token: "POST /oauth2/token"
  # grant_type: authorization_code | refresh_token | client_credentials

  # UserInfo Endpoint (OIDC)
  userinfo: "GET /oauth2/userinfo"

  # Token Revocation (RFC 7009)
  revoke: "POST /oauth2/revoke"

  # JSON Web Key Set
  jwks: "GET /oauth2/jwks"

  # Token Introspection (RFC 7662)
  introspect: "POST /oauth2/introspect"
```

#### 5. 管理UI

- テナント管理者がClient一覧を閲覧・管理できる画面
  - `apps/tachyon/src/app/v1beta/[tenant_id]/settings/auth-platform/`
- Client作成ウィザード（名前、リダイレクトURI、スコープ選択、ユーザープール選択）
- Secret再生成の確認ダイアログ
- ユーザー側: 自分が同意したPlatform一覧と権限の管理画面

### 非機能要件

- **セキュリティ**:
  - Client Secretはハッシュ化して保存（SHA-256 + salt）
  - PKCE（Proof Key for Code Exchange）必須
  - state パラメータによるCSRF対策
  - トークンの有効期限管理（アクセストークン: 1時間、リフレッシュトークン: 30日）
  - Rate limiting（認可エンドポイント）
- **パフォーマンス**:
  - トークン検証はJWKSキャッシュを利用して高速化
  - 同意情報はキャッシュ可能
- **拡張性**:
  - 将来的にSAML対応も視野に入れた設計
  - カスタムスコープの追加が容易な構造

### コンテキスト別の責務

```yaml
contexts:
  auth:
    description: "認証・認可の中核"
    responsibilities:
      - OAuth2 Client管理（CRUD）
      - 認可コードフローの処理
      - トークン発行・検証・失効
      - JWKS管理
      - ユーザー同意（consent）管理
      - PKCE検証

  auth_platform (new):
    description: "認証基盤としての外部公開機能"
    responsibilities:
      - OAuth2/OIDCエンドポイントの提供
      - OpenID Connect Discovery
      - UserInfoエンドポイント
      - 同意画面のレンダリング

  iam:
    description: "既存のポリシーベース認可"
    responsibilities:
      - Platformアクセス権限のポリシーチェック
      - スコープとアクション/ポリシーのマッピング
```

## 実装方針

### アーキテクチャ設計

```
外部アプリ
    │
    ▼
┌──────────────────────────────────┐
│  OAuth2/OIDC Endpoints          │
│  (axum Router)                  │
│  /oauth2/authorize              │
│  /oauth2/token                  │
│  /oauth2/userinfo               │
│  /.well-known/openid-config     │
├──────────────────────────────────┤
│  Auth Platform Usecase          │
│  - AuthorizeClient              │
│  - ExchangeAuthorizationCode    │
│  - IssueToken                   │
│  - RevokeToken                  │
│  - ManageConsent                │
├──────────────────────────────────┤
│  Auth Domain                    │
│  - OAuth2Client (entity)        │
│  - AuthorizationCode (VO)       │
│  - UserPlatformConsent (entity) │
│  - Scope (VO)                   │
│  - PKCE (VO)                    │
├──────────────────────────────────┤
│  Infrastructure                 │
│  - SqlxOAuth2ClientRepository   │
│  - JwtTokenService              │
│  - JwksProvider                 │
└──────────────────────────────────┘
```

### 既存モデルとの関係

- `Executor` に `OAuthClient` バリアントを追加し、OAuth2経由のアクセスを既存の認可チェックに統合
- `ServiceAccount` とは別概念: ServiceAccountは内部API用、OAuth2 Clientは外部連携用
- `PublicApiKey` とも別概念: PublicApiKeyは公開API用の簡易認証、OAuth2 Clientは完全なOAuth2フロー
- 既存の `OAuthToken` / `StoredOAuthToken` は外部プロバイダー（GitHub, HubSpot等）への接続用であり、本機能はTachyon自身がOAuthプロバイダーになる点で逆方向

### 技術選定

- **JWT署名**: RS256（RSA + SHA-256）、鍵ペアはSecretsContextで管理
- **JWKS**: 自前実装（jsonwebtoken crate活用）
- **認可コード**: ULID + 暗号学的ランダム値、有効期限5分
- **PKCE**: S256メソッド必須
- **DB**: 既存のSQLx + TiDBパターンに準拠

## タスク分解

### Phase 1: ドメインモデル・DB設計 📝

- [ ] OAuth2Client エンティティの実装
- [ ] AuthorizationCode 値オブジェクトの実装
- [ ] UserPlatformConsent エンティティの実装
- [ ] Scope 値オブジェクトの実装（OIDC標準スコープ + カスタムスコープ）
- [ ] DBマイグレーション作成（`create-migration` スキル使用）
  - `oauth2_clients` テーブル
  - `authorization_codes` テーブル
  - `user_platform_consents` テーブル
  - `oauth2_refresh_tokens` テーブル
- [ ] Repository trait定義

### Phase 2: OAuth2コアフロー 📝

- [ ] Authorization Code Grant フロー実装
  - `AuthorizeClient` usecase
  - `ExchangeAuthorizationCode` usecase
  - PKCE検証ロジック
- [ ] Token発行・検証
  - JWT生成（ID Token / Access Token）
  - JWKS エンドポイント
  - Token Introspection
- [ ] Refresh Token フロー
- [ ] Token Revocation

### Phase 3: Client管理API 📝

- [ ] Client CRUD usecase
  - `RegisterOAuth2Client`
  - `ListOAuth2Clients`
  - `UpdateOAuth2Client`
  - `RevokeOAuth2Client`
  - `RotateClientSecret`
- [ ] GraphQL resolver / REST endpoint
- [ ] ポリシー定義（`auth_platform:CreateClient` 等）

### Phase 4: 同意管理・ユーザープール選択 📝

- [ ] 同意（Consent）フローの実装
  - 同意画面の設計
  - `GrantConsent` / `RevokeConsent` usecase
  - 同意情報の永続化
- [ ] ユーザープール選択ロジック
  - Tachyonユーザープール利用時のログインフロー
  - 独自ユーザープール時のM2Mフロー
- [ ] UserInfo エンドポイント

### Phase 5: 管理UI 📝

- [ ] テナント管理者向けClient管理画面
  - Client一覧テーブル
  - Client作成フォーム
  - Secret再生成ダイアログ
- [ ] ユーザー向け同意管理画面
  - 同意済みPlatform一覧
  - 権限取り消し機能

### Phase 6: OpenID Connect Discovery・統合テスト 📝

- [ ] `/.well-known/openid-configuration` 実装
- [ ] シナリオテスト作成（認可コードフロー E2E）
- [ ] セキュリティレビュー
- [ ] ドキュメント作成

## Playwright MCPによる動作確認

### 動作確認チェックリスト

#### Client管理画面
- [ ] Client一覧画面の表示
- [ ] Client新規作成フォーム（名前、リダイレクトURI、スコープ選択）
- [ ] Client Secret表示（作成時のみ表示、以後マスク）
- [ ] Client Secret再生成の確認ダイアログ
- [ ] Clientの有効/無効切り替え

#### OAuth2認可フロー
- [ ] 認可エンドポイントへのリダイレクト
- [ ] Tachyonログイン画面でのユーザー認証
- [ ] 同意画面の表示（スコープ一覧）
- [ ] 同意後のコールバックリダイレクト
- [ ] トークン取得の確認

#### 同意管理画面
- [ ] 同意済みPlatform一覧の表示
- [ ] 権限取り消し操作
- [ ] 取り消し後のアクセス拒否確認

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| OAuth2仕様の準拠漏れ | 高 | RFC 6749/7636/7009/8414 を参照しながら実装。既存のOSSライブラリ（oxide-auth等）の採用も検討 |
| セキュリティ脆弱性（トークン漏洩等） | 高 | PKCE必須、state検証、Secret のハッシュ保存、短いトークン有効期限 |
| 既存認証フローとの競合 | 中 | Keycloak/NextAuth とは別パスで動作。既存のBearer token認証には影響しない |
| TiDBマイグレーション互換性 | 中 | `create-migration` スキルを使用してTiDB互換のDDLを生成 |
| パフォーマンス（JWKSキャッシュ） | 低 | Redis/インメモリキャッシュでJWKSを管理 |

## 参考資料

- [RFC 6749 - The OAuth 2.0 Authorization Framework](https://www.rfc-editor.org/rfc/rfc6749)
- [RFC 7636 - PKCE](https://www.rfc-editor.org/rfc/rfc7636)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)
- [RFC 8414 - OAuth 2.0 Authorization Server Metadata](https://www.rfc-editor.org/rfc/rfc8414)
- 既存コード: `packages/auth/domain/src/oauth.rs`（外部プロバイダー向けOAuth）
- 既存コード: `packages/auth/domain/src/public_api_key.rs`（PublicApiKey参考）
- 既存コード: `packages/auth/domain/src/service_account.rs`（ServiceAccount参考）
- マルチテナンシー仕様: `docs/src/tachyon-apps/authentication/multi-tenancy.md`

## 完了条件

- [ ] OAuth2 Authorization Code Grant（PKCE必須）が動作する
- [ ] テナントごとにClient ID / Client Secretを発行・管理できる
- [ ] ユーザープール利用有無を選択できる
- [ ] ログイン時にPlatformアクセス権限のオプトイン同意画面が表示される
- [ ] 同意した権限の取り消しが可能
- [ ] OpenID Connect Discovery が正しく応答する
- [ ] シナリオテストが通る
- [ ] 管理UI（Client管理・同意管理）が動作する
- [ ] セキュリティレビュー完了
- [ ] 正式な仕様ドキュメントを作成済み
- [ ] タスクディレクトリを completed/ に移動済み

### バージョン番号の決定基準

**マイナーバージョン（x.X.x）を上げる**:
- [x] 新機能の追加（OAuth2/OIDC認証基盤）
- [x] 新しいAPIエンドポイントの追加（/oauth2/*）
- [x] 新しい画面の追加（Client管理・同意管理）

## 備考

- 本機能はTachyon自身がOAuth2プロバイダー（Authorization Server）になるもの。既存の `oauth.rs` は外部プロバイダーへの接続（Tachyon→GitHub等）であり、方向が逆。
- 将来的にはSAML 2.0対応や、SCIM（ユーザープロビジョニング）対応も視野に入れる。
- Keycloakとの棲み分け: Keycloakは社内向けIdP（従業員ログイン）、Auth Platformは外部アプリ向け認可サーバーとして位置づける。
