---
title: "library-api を Tachyon SDK 経由に移行し、Library 固有パッケージを統合"
type: refactor
emoji: "📦"
topics: ["library-api", "sdk", "dependency-reduction", "service-boundary"]
published: true
targetFiles:
  - apps/library-api/
  - packages/database/inbound_sync/
  - packages/database/outbound_sync/
  - packages/providers/github/
  - sdk/rust/
github: ""
---

# library-api を Tachyon SDK 経由に移行し、Library 固有パッケージを統合

## 概要

library-api が `auth` パッケージに直接依存している構造を Tachyon SDK (REST) 経由に切り替え、Library 固有のパッケージ（`inbound_sync`, `outbound_sync` 等）を library-api 内に統合する。これにより library-api を独立したサービスとして明確に分離する。

## 背景・目的

- **現状**: library-api は `auth` クレートに直接依存しており、コンパイル時に auth の全依存ツリーを引き込む。また Library 固有のパッケージが `packages/` 配下に散在している
- **Library ≒ database-manager**: library-api の中核機能は database-manager そのものであり、これらは同じサービス境界に属する
- **問題**:
  - `auth` 直接依存によるコンパイル時間増加とサービス境界の曖昧さ
  - Library 固有パッケージが `packages/` に置かれているため、tachyon-api と共有しているように見える
- **目標**:
  - `auth` → Tachyon SDK 経由に切り替え
  - Library 固有パッケージを library-api 内に移動・統合
  - library-api を独立サービスとして確立
- **効果**: コンパイル時間短縮、サービス境界の明確化、コードの所在の明瞭化

## 前提条件

- ✅ tachyon-api に Auth REST エンドポイント追加済み（Phase 2）
- ✅ tachyon-sdk に Rust SDK 生成済み
- bakuure-api の SDK 移行（`migrate-bakuure-api-to-sdk`）と並行可能

## Phase A: 調査結果 ✅

### パッケージの移動可否

| パッケージ | 状態 | 方針 |
|-----------|------|------|
| `inbound_sync` | Library 専用 | 📦 移動可能 |
| `inbound_sync_domain` | Library 専用 | 📦 移動可能 |
| `outbound_sync` | Library 専用 | 📦 移動可能 |
| `github_provider` | Library 専用 | 📦 移動可能 |
| `database-manager` | 共有（source_explore, projects が依存） | 🔒 移動不可 |
| `csv_importer` | 共有（source_explore が依存） | 🔒 移動不可 |
| `projects` | 孤立パッケージ（どのアプリも未使用） | 将来削除候補 |
| `source_explore` | 共有（bakuure-api, tachyon-api が使用） | 移動対象外 |

### SDK Auth API ギャップ分析

| library-api の auth 操作 | SDK エンドポイント | 状態 |
|--------------------------|-------------------|------|
| `check_policy` | `POST /v1/auth/policies/check` | ✅ あり |
| `evaluate_policies_batch` | `POST /v1/auth/policies/check` | ✅ あり |
| `verify_token` | `POST /auth/v1beta/verify` | ✅ あり |
| `get_user` / `get_user_by_id` | `GET /v1/auth/users/:id` | ✅ あり |
| `list_users` / `find_users_by_tenant` | `GET /v1/auth/users` | ✅ あり |
| `sign_in_with_platform` | `POST /auth/v1beta/sign-in-with-platform` | ✅ あり |
| Service account CRUD | 各 REST エンドポイント | ✅ あり |
| API key 管理 | 各 REST エンドポイント | ✅ あり |
| `check_policy_for_resource` | なし | ❌ **追加必要** |
| `verify_public_api_key` | なし | ❌ **追加必要** |
| `attach/detach_user_policy` | なし | ❌ **追加必要** |
| `attach/detach_user_policy_with_scope` | なし | ❌ **追加必要** |
| `user_repo.get_by_id` (直接) | `GET /v1/auth/users/:id`（近い） | ⚠️ 変換必要 |
| `user_policy_mapping_repo` (直接) | なし | ❌ **追加必要** |
| `user_query` (直接) | なし | ❌ **追加必要** |
| OAuth token 管理 | なし | ❌ **追加必要** |

### library-api の auth 利用詳細

- **30+ usecase** が `check_policy()` を使用
- **6 usecase** が `check_policy_for_resource()` を使用
- **LibraryExecutor** が `auth::App` に直接アクセス（`verify_token`, `verify_public_api_key`, `user_repo.get_by_id`）
- `auth::Executor::SystemUser` を内部処理で使用
- `auth.user_policy_mapping_repo` と `auth.user_query` への直接アクセスあり

## 詳細仕様

### library-api の現在の依存パッケージと方針

| パッケージ | 現状 | 方針 |
|-----------|------|------|
| **`auth`** | 認証・ポリシーチェック | 🔄 **SDK 経由に切り替え** |
| **`notification`** | `auth::App::new()` の引数 | 🔄 auth と一緒に削除 |
| **`cognito`** | `auth::App::new()` の引数 | 🔄 auth と一緒に削除 |
| **`auth_provider`** | OAuth プロバイダー抽象 | 🔄 auth と一緒に削除 |
| **`iac`** | IAC マニフェスト読み込み | 🔄 auth 初期化で使用 → SDK 化で不要に |
| **`aws`** | AWS SDK（notification 用） | 🔄 notification と一緒に削除 |
| **`inbound_sync`** | Webhook 受信（Library 専用） | 📦 **library-api 内に移動** |
| **`inbound_sync_domain`** | ドメイントレイト（Library 専用） | 📦 **library-api 内に移動** |
| **`outbound_sync`** | データ同期（Library 専用） | 📦 **library-api 内に移動** |
| **`github_provider`** | GitHub 連携（Library 専用） | 📦 **library-api 内に移動** |
| `database-manager` | Library のコア機能 | 🔒 維持（source_explore 共有） |
| `csv_importer` | CSV インポート | 🔒 維持（source_explore 共有） |
| `persistence` | DB 接続 | 🔒 維持 |
| `value_object` | 共有値オブジェクト | 🔒 維持 |
| `util` | ユーティリティ | 🔒 維持 |
| `errors` | エラーハンドリング | 🔒 維持 |
| `telemetry` | Observability | 🔒 維持 |
| `tachyon_apps` | SDK トレイト | 🔒 維持 |

### Auth SDK 化のアーキテクチャ

#### SdkAuthApp: AuthApp トレイトの SDK 実装

```rust
/// AuthApp トレイトを SDK REST 呼び出しで実装
pub struct SdkAuthApp {
    configuration: tachyon_sdk::apis::configuration::Configuration,
}

#[async_trait::async_trait]
impl AuthApp for SdkAuthApp {
    async fn check_policy<'a>(&self, input: &CheckPolicyInput<'a>) -> errors::Result<()> {
        // POST /v1/auth/policies/check に委譲
        // ヘッダーに executor/multi_tenancy 情報を設定
    }
    // ... 各メソッドを SDK 呼び出しで実装
}
```

#### LibraryExecutor の変更

```rust
// Before: auth::App に直接アクセス
let Extension(auth) = parts.extract::<Extension<Arc<auth::App>>>().await?;
let user = auth.verify_token().execute(&input).await?;

// After: SDK 経由
let Extension(sdk_config) = parts.extract::<Extension<Arc<Configuration>>>().await?;
let resp = auth_verify_api::verify(&sdk_config, verify_request).await?;
```

## タスク分解

### Phase A: 調査・準備 ✅
- [x] `source_explore`, `projects` パッケージが Library 固有かを確認
- [x] tachyon-sdk に Auth 関連エンドポイントが揃っているか確認
- [x] 不足している REST エンドポイントの特定
- [x] library-api の全 usecase で auth がどのように使われているかマッピング

### Phase B: auth REST エンドポイント追加 ✅
auth クレートの axum handler に library-api が必要とするエンドポイントを追加:
- [x] `operator_handler.rs` — CRUD + find_by_user + get_by_alias
- [x] `user_handler.rs` — invite_user, update_user_role 追加
- [x] `user_policy_handler.rs` — attach/detach/find_by_resource_scope
- [x] `api_key_handler.rs` — verify, get_by_id
- [x] `oauth_token_handler.rs` — save/get/delete
- [x] `policy_handler.rs` — check, check_for_resource, evaluate_batch
- [x] `mod.rs` にルートとOpenAPI登録

### Phase C: Library 固有パッケージの移動 ✅ (前セッションで完了)
- [x] `inbound_sync` を `apps/library-api/packages/inbound_sync/` に移動
- [x] `inbound_sync_domain` を `apps/library-api/packages/inbound_sync_domain/` に移動
- [x] `outbound_sync` を `apps/library-api/packages/outbound_sync/` に移動
- [x] `github_provider` を `apps/library-api/packages/github_provider/` に移動
- [x] Cargo workspace members の更新
- [x] 各パッケージの依存パス更新
- [x] コンパイル確認

### Phase D: Auth を SDK 経由に切り替え ✅
- [x] `SdkAuthApp` 実装（AuthApp トレイトを reqwest REST 呼び出しで実装）
- [x] `LibraryExecutor` を SdkAuthApp 経由に変更（verify_token, verify_api_key）
- [x] GraphQL resolver/mutation を SdkAuthApp 経由に変更
- [x] `invite_org_member` / `change_org_member_role` を SdkAuthApp 経由に書き換え
- [x] `delete_data` / `update_property` から不要な auth::App 引数を削除
- [x] `sign_in` usecase を SdkAuthApp 経由に変更
- [x] router を Arc<SdkAuthApp> ベースに変更
- [x] main.rs で SdkAuthApp 生成（TACHYON_API_URL 環境変数）
- [x] lambda.rs で SdkAuthApp 生成
- [x] テストインフラ更新（auth REST サーバーを起動して SdkAuthApp を接続）
- [x] コンパイル確認

**実装メモ**:
- tachyon-sdk (OpenAPI 生成) は使わず、reqwest で直接 REST 呼び出しする方式を採用（シンプルかつ柔軟）
- Phase E で IAC 初期化を tachyon-api 委譲に完了。main.rs は ~160 行 → ~60 行に簡素化

### Phase E: IAC/auth 初期化を tachyon-api に委譲 ✅
- [x] Executor / MultiTenancy を auth_domain に移動
- [x] tachyon-api に OAuth 設定取得エンドポイント (`GET /v1/iac/oauth-providers`) 追加
- [x] SdkAuthApp に `fetch_oauth_config()` メソッド追加
- [x] REST-backed `SdkOAuthTokenRepository` 作成
- [x] main.rs / lambda.rs を簡素化（auth::App / iac::App 初期化を削除）
- [x] auth OpenAPI router を library-api から削除
- [x] `auth::` インポートを `tachyon_apps::auth::` 経由に変更
- [x] `OAuthConfig` / `OAuthProvider` / `OAuthToken` を github_provider に移動
- [x] Cargo.toml から `notification`, `cognito`, `aws`, `auth_provider`, `iac` 依存削除
- [x] `auth` は axum extractor (`FromRequestParts`) 用に維持（`[dependencies]`）
- [x] テスト用は `cognito`, `notification`, `aws`, `auth_provider` を `[dev-dependencies]` に移動
- [x] コンパイル確認 + フォーマット確認

**実装メモ**:
- `auth` crate を完全に削除できなかった理由: `Executor` / `MultiTenancy` の `FromRequestParts` 実装が `auth/framework_driver/axum_request/` にあり、handler の axum extractor として必須
- `OAuthConfig` / `OAuthProvider` trait / `OAuthToken` は `github_provider` にインラインで定義し、`auth_provider` 依存を解消

### Phase F: 残クリーンアップ ✅
- [x] Docker Compose の起動順序に library-api → tachyon-api 依存を追加
- [x] `TACHYON_API_URL=http://tachyon-api:50054` 環境変数を追加
- [x] SdkAuthApp にデフォルト `x-operator-id` ヘッダーを追加（auth REST extractor 対応）
- [x] サービスアカウント / API キー系 SDK メソッドを REST 実装に切り替え
- [x] 既存テストの通過確認（614 tests: 610 passed, 4 skipped）
- [ ] コンパイル時間の計測（before/after）
- [ ] シナリオテストの確認（あれば）

**実装メモ**:
- `SdkAuthApp::new()` に `default_operator_id` パラメータを追加。`request()` ヘルパーがすべてのリクエストに `x-operator-id` を自動付与し、auth REST の `Executor` エクストラクタが `dummy-token` モードで動作可能に
- `get_service_account_by_name` は `GET /v1/auth/service-accounts` で一覧取得し名前フィルタをクライアント側で実行
- `create_public_api_key` は `POST /v1/auth/service-accounts/{sa_id}/api-keys` に委譲
- `PublicApiKeyId`, `PublicApiKeyValue` を `tachyon_apps::auth` から re-export 追加

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| Auth SDK にエンドポイント不足 | 高 | Phase B で事前に追加 |
| database-manager の他パッケージ依存 | - | 調査済み → 移動不可（source_explore 共有） |
| ネットワーク越しの auth 遅延 | 中 | Docker 内通信で最小限 |
| LibraryExecutor の直接 auth::App アクセス | 高 | SDK verify/get_user で代替 |
| サービス起動順序の依存 | 低 | Docker Compose depends_on + healthcheck |
| パッケージ移動時の import パス変更 | 低 | workspace members のパス更新のみ |

## 完了条件

- [x] Library 固有パッケージ（inbound_sync, outbound_sync, github_provider）が library-api 内に移動
- [x] usecases/handlers 層の auth 操作が SdkAuthApp (REST) 経由で動作
- [x] Docker 内でコンパイルが通る（warning なし）
- [x] main.rs/lambda.rs の IAC 初期化を tachyon-api に委譲
- [x] 5つの直接依存（notification, cognito, aws, auth_provider, iac）を削除
- [x] 既存テストがパス
- [ ] コンパイル時間の改善が確認できる（計測結果を記録）

## 参考資料

- bakuure-api SDK 移行: `docs/src/tasks/in-progress/migrate-bakuure-api-to-sdk/task.md`
- tachyon-sdk: https://github.com/quantum-box/tachyon-sdk
- Phase 1-4 taskdoc: `docs/src/tasks/in-progress/tachyon-rest-sdk/task.md`
- library-api Cargo.toml: `apps/library-api/Cargo.toml`
- AuthApp トレイト: `packages/tachyon_apps/src/auth/mod.rs`
- LibraryExecutor: `apps/library-api/src/handler/library_executor_extractor.rs`
