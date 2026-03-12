---
title: "期限切れCognitoトークンがAPIに送信される問題の修正"
type: bug
emoji: "🔐"
topics:
  - Authentication
  - Cognito
  - NextAuth
  - Token Refresh
published: true
targetFiles:
  - packages/auth/src/framework_driver/axum_request/executor.rs
  - apps/tachyon/src/app/cognito.ts
  - apps/tachyon/src/lib/tachyon-api.ts
  - apps/tachyon/src/lib/agent-api.ts
github: https://github.com/quantum-box/tachyon-apps
---

# 期限切れCognitoトークンがAPIに送信される問題の修正

## 概要

Cognitoのアクセストークンが期限切れになった際、リフレッシュに失敗しても古いトークンがそのままAPIに送信され続け、バックエンドで大量のERRORログが発生する問題を修正する。

## 背景・目的

### 発生していた問題

tachyon-apiのログに以下のERRORが大量に出力されていた:

```
ERROR auth::framework_driver::axum_request::executor: middleware error: UnauthorizedError: verify token failed error on idp: UnauthorizedError: token verify failed
```

### 原因分析

1. ユーザーがCognitoでログイン → NextAuthセッションにCognitoのアクセストークンJWTが保存される
2. トークンが期限切れになる → `cognitoRefreshAccessToken` が呼ばれる
3. **リフレッシュが失敗した場合**: `error: 'RefreshAccessTokenError'` をセットするが、`...token` のスプレッドにより**古い `accessToken` がそのまま残る**
4. その期限切れトークンが `session.accessToken` としてフロントに渡される
5. フロントがその期限切れトークンでAPIを叩く → バックエンドCognito検証失敗 → ERRORログ

### 副次的問題

- フロントエンドに `dummy-token` フォールバック機構が存在し、本番では使えない開発用コードが混在していた
- バックエンドのログレベルがクライアント認証失敗に対して `ERROR` と過剰だった

## 詳細仕様

### 機能要件

1. トークンリフレッシュ失敗時に期限切れトークンをクリアする
2. フロントエンドからdummy-tokenフォールバックを完全に除去する
3. トークンがない場合は明確なエラーを投げ、再ログインを促す

### 非機能要件

- バックエンドのクライアント認証失敗ログはWARNレベルに変更（ERRORはサーバー起因の問題に限定）

## 実装方針

3箇所の修正でトークンライフサイクルを正しくする:

1. **バックエンド**: ログレベルの是正（ERROR → WARN）
2. **NextAuthコールバック**: リフレッシュ失敗時にaccessTokenをクリア
3. **フロントAPI層**: dummy-tokenフォールバックの除去、`getAuthContextOrThrow()` への統一

## タスク分解

### フェーズ1: 調査 ✅ (2026-02-01 完了)

- [x] ERRORログの発生箇所特定（`executor.rs:143`）
- [x] IdPの特定（Keycloakではなく**Cognito**であることを確認）
- [x] `AuthProvider` トレイトの実装確認（`packages/providers/cognito` が唯一の実装）
- [x] フロントのトークン送信フロー調査
  - `resolveAccessToken` → token があればそのまま返す
  - NextAuth JWT callback → `account.access_token`（Cognito JWT）をセッションに保存
  - `cognitoRefreshAccessToken` → 失敗時に `...token` スプレッドで古いaccessTokenが残る
- [x] `dummy-token` フォールバック箇所の特定
  - `tachyon-api.ts`: `DUMMY_ACCESS_TOKEN` / `shouldUseDevToken` / `NEXT_PUBLIC_FORCE_DUMMY_TOKEN`
  - `agent-api.ts`: `|| 'dummy-token'` が4箇所、`|| 'tn_01hjryxysgey07h5jz5wagqj0m'` が4箇所

### フェーズ2: 修正実装 ✅ (2026-02-01 完了)

- [x] `executor.rs:143`: `tracing::error!` → `tracing::warn!`
- [x] `cognito.ts`: リフレッシュ失敗時の2箇所で `accessToken: undefined` を明示セット
- [x] `tachyon-api.ts`: `DUMMY_ACCESS_TOKEN` / `shouldUseDevToken` / `NEXT_PUBLIC_FORCE_DUMMY_TOKEN` のフォールバック機構を削除
- [x] `agent-api.ts`: `|| 'dummy-token'` の4箇所を `getAuthContextOrThrow()` に統一、`tenantId` のハードコードフォールバックも除去

### フェーズ3: テスト・検証 📝

- [ ] ローカルでCognitoログイン → トークン期限切れ → 再ログイン誘導の確認
- [ ] `agent-api.ts` の各関数が `getAuthContextOrThrow()` で正しく動作することの確認
- [ ] ERRORログがWARNに変わっていることの確認
- [ ] CIパス

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `packages/auth/src/framework_driver/axum_request/executor.rs` | `tracing::error!` → `tracing::warn!` |
| `apps/tachyon/src/app/cognito.ts` | リフレッシュ失敗時に `accessToken: undefined` を明示セット（2箇所） |
| `apps/tachyon/src/lib/tachyon-api.ts` | `DUMMY_ACCESS_TOKEN` / `shouldUseDevToken` / `NEXT_PUBLIC_FORCE_DUMMY_TOKEN` 削除 |
| `apps/tachyon/src/lib/agent-api.ts` | `|| 'dummy-token'` → `getAuthContextOrThrow()`、tenantIdフォールバック除去 |

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| `NEXT_PUBLIC_FORCE_DUMMY_TOKEN` に依存していた開発フローの破壊 | 低 | 開発環境でもCognitoログインを使用する運用に統一。バックエンド側の `dummy-token` 許可（`executor.rs`）は残っているため、REST API直叩きでの開発は引き続き可能 |
| `agent-api.ts` のフォールバック除去で未認証時にエラーが投げられる | 中 | `getAuthContextOrThrow()` で明確なエラーメッセージを返し、呼び出し元でハンドリング |

## 完了条件

- [x] 期限切れトークンがAPIに送信されなくなる
- [x] フロントエンドからdummy-tokenフォールバックが除去されている
- [x] バックエンドの認証失敗ログがWARNレベルになっている
- [ ] テスト・CI通過
- [ ] コードレビュー完了
