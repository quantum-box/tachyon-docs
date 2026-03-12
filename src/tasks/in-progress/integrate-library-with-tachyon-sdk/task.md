---
title: "Library を tachyon-sdk submodule に統合する"
type: refactor
emoji: "🔗"
topics: ["library-api", "tachyon-sdk", "sdk-integration", "rust", "typescript"]
published: true
targetFiles:
  - apps/library-api/src/sdk_auth.rs
  - apps/library-api/Cargo.toml
  - apps/library/src/lib/apiClient.ts
  - apps/library/package.json
  - sdk/
github: ""
---

# Library を tachyon-sdk submodule に統合する

## 概要

Library API（Rust）の `SdkAuthApp` が tachyon-api を呼ぶ際、現在は reqwest で直接 HTTP コールしている。これを tachyon-sdk（Rust SDK）に置き換え、SDK を「本命」として育てていく基盤を作る。

Library フロントエンド（TypeScript）については、呼んでいるのは Library API 固有のエンドポイント（`/v1beta/repos/*` 等）であり tachyon-sdk の対象外のため、今回のスコープ外とする。

## 背景・目的

- tachyon-sdk submodule は OpenAPI spec から自動生成される TypeScript/Rust/Python クライアント SDK
- 現在 Bakuure API だけが tachyon-sdk（Rust）を正しく使っている
- Library API は SdkAuthApp (~2,100行) で reqwest を直接叩いており、SDK と二重管理になっている
- SDK を統一的に使うことで、型安全性・保守性・一貫性が向上する
- SDK を育てるにはまず利用者を増やす必要がある

## 詳細仕様

### 現状分析

SdkAuthApp が呼ぶエンドポイント（~25種）のうち、96% が tachyon-sdk Rust API でカバー済み：

| カテゴリ | エンドポイント例 | SDK API |
|---------|----------------|---------|
| Auth認証 | `POST /auth/v1beta/verify` | `auth_verify_api` |
| Policy管理 | `POST /v1/auth/policies/check` | `auth_policies_api` |
| ユーザー管理 | `GET /v1/auth/users/{id}` | `auth_users_api` |
| OAuth | `GET /v1/auth/oauth-tokens` | `oauth_api` |
| サービスアカウント | `POST /v1/auth/service-accounts` | `auth_service_accounts_api` |
| APIキー | `POST /v1/auth/api-keys/verify` | `auth_api_keys_api` |
| IaC | `GET /v1/iac/oauth-providers` | ⚠️ 要確認 |

### スコープ

**IN**:
- Library API の SdkAuthApp を tachyon-sdk (Rust) に移行
- 不足エンドポイントがあれば tachyon-api 側に utoipa 追加 → SDK 再生成
- Bakuure API の使用パターンを参考にする

**OUT**:
- Library フロントエンドの Aspida クライアント（Library API 固有エンドポイントのため対象外）
- tachyon-sdk 自体の大規模リファクタリング

## 実装方針

### 参考実装: Bakuure API

`apps/bakuure-api/src/sdk_client.rs` が tachyon-sdk の使い方の良い参考例：
- `Configuration` を per-request で構築（auth ヘッダー転送）
- `tachyon_sdk::apis::Error` → アプリ固有エラーへのマッピング

### 移行戦略

メソッド単位で段階的に移行する。各メソッドを reqwest 直呼びから tachyon-sdk API コールに置き換え、既存のテスト・シナリオテストで動作を保証する。

## タスク分解

### Phase 1: SDK 依存追加とインフラ整備 ✅
- [x] `apps/library-api/Cargo.toml` に `tachyon-sdk` 依存を追加
- [x] SDK の `Configuration` ヘルパーを SdkAuthApp に追加（`sdk_config()`, `sdk_config_with_context()`）
- [x] エラーマッピング層の実装（`sdk_api_err()` - HTTP ステータス別変換）
- [x] SDK モデル → ドメインモデル変換関数（`user_from_sdk_model()`, `user_from_sdk_user_response()`, `service_account_from_sdk()`, `api_key_from_sdk()`）

### Phase 2: SDK カバレッジのあるメソッドの移行 ✅
- [x] `verify_token` → `auth_verify_api::verify`
- [x] `sign_in_with_platform` → `auth_verify_api::sign_in_with_platform`
- [x] `check_policy` → `auth_policies_api::evaluate_policies_batch`
- [x] `evaluate_policies_batch` → `auth_policies_api::evaluate_policies_batch`
- [x] `get_user_by_id` (AuthApp trait) → `auth_users_api::get_user`
- [x] `find_users_by_tenant` → `auth_users_api::list_users`
- [x] `get_policy_by_id` → `auth_policies_api::get_policy`
- [x] `create_service_account` → `auth_service_accounts_api::create_service_account`
- [x] `get_service_account_by_name` → `auth_service_accounts_api::list_service_accounts` + filter
- [x] `delete_service_account` → `auth_service_accounts_api::delete_service_account`
- [x] `create_public_api_key` → `auth_api_keys_api::create_api_key`
- [x] `find_all_public_api_key` → `auth_api_keys_api::list_api_keys`

実装メモ: SDK の `SignInWithPlatformResponse.user` は `Box<User>` 型（tenants なし）。`UserResponse`（tenants あり）とは異なるため注意。

### Phase 3: SDK 未カバーのメソッド（raw reqwest 維持）📝
以下は SDK に対応 API がないため、`sdk_config_with_context()` で Configuration を作り、`config.client` 経由で reqwest 呼び出しする形に統一：
- [x] Operator CRUD（get_operator_by_id, create_operator, find_operators_by_user, get_operator_by_alias）
- [x] OAuth トークン CRUD（oauth_tokens, get/save/delete_oauth_token）
- [x] User Policy attach/detach（with/without scope）
- [x] check_policy_for_resource
- [x] add_user_to_tenant
- [x] SdkOAuthTokenRepository（inbound_sync 用）

### Phase 4: SDK エンドポイント拡充（今後の課題）📝
以下のエンドポイントを tachyon-api に utoipa 追加 → SDK 再生成すると完全移行可能：
- [ ] `/v1/auth/operators` (CRUD + by-alias + by-user)
- [ ] `/v1/auth/oauth-tokens` (CRUD)
- [ ] `/v1/auth/user-policies/attach`, `/detach`, `/attach-with-scope`, `/detach-with-scope`
- [ ] `/v1/auth/user-policy-mappings`
- [ ] `/v1/auth/policies/check-for-resource`
- [ ] `/v1/auth/api-keys/verify`
- [ ] `/v1/auth/users/invite`, `/v1/auth/users/{id}/role`, `/v1/auth/users/search/by-username`
- [ ] `/v1/auth/users/{id}/tenants`
- [ ] `/v1/iac/oauth-providers`

### Phase 5: クリーンアップ（SDK 拡充後）📝
- [ ] 全メソッドの reqwest 直呼びコード削除
- [ ] 不要な REST DTO 削除
- [ ] シナリオテストで全機能の動作確認

## テスト計画

- 既存のシナリオテスト（`apps/library-api/tests/scenarios/` 等）で回帰確認
- `mise run tachyon-api-scenario-test` で API 動作確認
- Library の E2E が壊れていないことの確認

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| SDK と SdkAuthApp のリクエスト/レスポンス型の不一致 | 中 | 1メソッドずつ移行して動作確認 |
| SDK に不足するエンドポイント | 低 | utoipa 追加で対応可能 |
| 認証ヘッダーの転送方式の違い | 中 | Bakuure の Configuration パターンを踏襲 |

## 完了条件

- [ ] SdkAuthApp の全メソッドが tachyon-sdk 経由に移行済み
- [ ] reqwest 直呼びコードが sdk_auth.rs から除去されている
- [ ] シナリオテストが全パス
- [ ] CI が通る
