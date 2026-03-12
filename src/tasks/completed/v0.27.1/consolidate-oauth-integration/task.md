---
title: OAuth/Integrationパッケージの整理統合
type: refactor
emoji: "🔧"
topics:
  - OAuth
  - Integration
  - Clean Architecture
  - Refactoring
published: true
targetFiles:
  - packages/auth/domain/src/oauth.rs
  - packages/auth/integration/
  - packages/integration/
  - packages/database/inbound_sync/
  - packages/database/outbound_sync/
github: https://github.com/quantum-box/tachyon-apps
---

# OAuth/Integrationパッケージの整理統合

## 概要

PR Walkthrough中に発見された、OAuth関連コードの重複とパッケージ構成の問題を解消するリファクタリング。

## 背景・目的

### 発見された問題

1. **OAuthコードの重複**
   - 既存: `packages/auth/domain/src/oauth.rs` に `OAuthToken`
   - 新規: `packages/auth/integration/domain/src/oauth.rs` に `StoredOAuthToken`
   - 同じテーブル `oauth_tokens` を対象としたマイグレーションが両方に存在

2. **パッケージ構成の不整合**
   - `packages/auth/integration/` が新規追加されたが、既存のauth OAuth機能を考慮せずに作成された
   - Integration/Connectionはsync以外でも使用される汎用的な概念

### 解決策（D案採用）

```
変更前:
packages/auth/
├── domain/src/oauth.rs          ← 既存OAuth（OAuthToken）
└── integration/                 ← 新規追加（StoredOAuthToken + Integration/Connection）

変更後:
packages/auth/
└── domain/src/oauth.rs          ← OAuth機能を統合（OAuthProvider, StoredOAuthToken等）

packages/integration/            ← 独立パッケージとして移動
└── domain/src/
    ├── integration.rs           ← Integration（カタログ）
    └── connection.rs            ← Connection（接続状態）
```

## 詳細仕様

### 機能要件

1. **OAuth統合（auth）**
   - `OAuthProvider` enum を auth に追加
   - 既存 `OAuthToken` を `StoredOAuthToken` の機能で拡張または置換
   - `OAuthService` trait を auth に追加
   - 既存の6つのOAuth usecaseを新ドメインモデルで動作させる

2. **Integrationパッケージ分離**
   - `packages/auth/integration/` → `packages/integration/` に移動
   - OAuth関連コードを削除（authを参照）
   - Integration/Connection ドメインのみを保持

3. **依存関係の更新**
   - `inbound_sync` / `outbound_sync` の参照を新構造に更新
   - `library-api` の参照を更新

### 非機能要件

- 既存のテストが引き続きパスすること
- マイグレーションが正しく動作すること
- ビルドエラーがないこと

### コンテキスト別の責務

```yaml
contexts:
  auth:
    description: "認証・認可・OAuthトークン管理"
    responsibilities:
      - ユーザー認証
      - ポリシーベースの認可
      - OAuthトークンの保存・取得・更新・削除
      - OAuth認可フローの実行

  integration:
    description: "外部サービス統合管理"
    responsibilities:
      - 統合カタログの管理（Integration）
      - テナント接続状態の管理（Connection）
      - 統合のカテゴリ・機能定義

  inbound_sync:
    description: "外部→内部の同期処理"
    responsibilities:
      - Webhook受信・処理
      - 外部データの取り込み
      - Integration/Connectionの利用（参照のみ）

  outbound_sync:
    description: "内部→外部の同期処理"
    responsibilities:
      - データの外部送信
      - Integration/Connectionの利用（参照のみ）
```

## 実装方針

### アーキテクチャ設計

```
┌─────────────────────────────────────────────────────┐
│                    library-api                       │
├─────────────────────────────────────────────────────┤
│  inbound_sync  │  outbound_sync  │  auth  │  etc.  │
├────────────────┴─────────────────┴────────┴────────┤
│                   integration                        │
│            (Integration, Connection)                 │
├─────────────────────────────────────────────────────┤
│                      auth                            │
│         (OAuth, Users, Policies, Tenants)           │
└─────────────────────────────────────────────────────┘
```

### 依存関係

- `integration` → `auth` (OAuth types)
- `inbound_sync` → `integration`, `auth`
- `outbound_sync` → `integration`, `auth`
- `library-api` → all above

## タスク分解

### Phase 1: OAuthをauthに統合 📝

- [ ] `packages/auth/domain/src/oauth.rs` を拡張
  - [ ] `OAuthProvider` enum 追加
  - [ ] `StoredOAuthToken` 構造体追加（または既存`OAuthToken`を拡張）
  - [ ] `OAuthClientCredentials`, `OAuthTokenResponse` 追加
  - [ ] `InitOAuthInput`, `InitOAuthOutput`, `ExchangeOAuthCodeInput` 追加
  - [ ] `OAuthService` trait 追加
- [ ] 既存OAuth usecaseの更新
  - [ ] `exchange_oauth_token.rs`
  - [ ] `get_oauth_authorization_url.rs`
  - [ ] `save_oauth_token.rs`
  - [ ] `delete_oauth_token.rs`
  - [ ] `find_all_oauth_tokens.rs`
  - [ ] `get_connected_oauth_providers.rs`

### Phase 2: integrationパッケージの移動 📝

- [ ] `packages/integration/` ディレクトリ作成
- [ ] `packages/auth/integration/domain/src/marketplace.rs` → `packages/integration/domain/src/`
- [ ] `packages/auth/integration/domain/src/repository.rs` → `packages/integration/domain/src/`
- [ ] `packages/auth/integration/src/repository/connection.rs` → `packages/integration/src/`
- [ ] OAuth関連コードを削除（authを参照するように変更）
- [ ] Cargo.toml の設定

### Phase 3: 依存関係の更新 📝

- [ ] `inbound_sync` の参照更新
  - [ ] `Cargo.toml` の依存関係
  - [ ] `domain/src/lib.rs` の re-export
  - [ ] `src/interface_adapter/gateway/mod.rs` の re-export
- [ ] `outbound_sync` の参照更新
- [ ] `library-api` の参照更新
- [ ] `auth/src/interface_adapter/controller/resolver.rs` の参照更新

### Phase 4: マイグレーションの整理 📝

- [ ] 重複マイグレーションの確認と整理
- [ ] `oauth_tokens` テーブルのスキーマ確認
- [ ] `integration_connections` テーブルの確認

### Phase 5: 品質確認 📝

- [ ] `mise run docker-check` でビルド確認
- [ ] `mise run docker-ci` で全体CI確認
- [ ] 既存テストのパス確認

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| マイグレーション互換性 | 高 | 既存DBスキーマとの整合性を確認、必要なら互換マイグレーション追加 |
| 依存関係の循環 | 中 | パッケージ分離時に依存方向を厳密に管理 |
| 既存機能の破損 | 高 | 既存テストの維持、段階的なリファクタリング |

## 参考資料

- PR Walkthrough での議論
- 既存コード:
  - `packages/auth/domain/src/oauth.rs`
  - `packages/auth/integration/domain/src/oauth.rs`
  - `packages/auth/integration/domain/src/marketplace.rs`

## 完了条件

- [ ] OAuthコードがauthに統合されている
- [ ] integrationパッケージが独立している
- [ ] 重複コードが解消されている
- [ ] `mise run docker-ci` がパスする
- [ ] 既存のシナリオテストがパスする

### バージョン番号の決定基準

**パッチバージョン（x.x.X）を上げる:**
- [x] リファクタリング（機能変更なし）
- [x] コード整理
