# Slack OAuth Integration & Integration Marketplace

## 概要
- Slack App OAuth フローで Incoming Webhook URL を取得し、テナントごとに保存
- Integration Marketplace UI でサービス連携を管理（接続/切断/一覧）
- デプロイイベント通知を Marketplace の Connection から動的に Webhook URL を解決

## Phase 一覧

| Phase | 内容 | 状態 |
|-------|------|------|
| 1 | Integration Marketplace バックエンド | ✅ |
| 2 | Slack OAuth プロバイダー | ✅ |
| 3 | Marketplace UI | ✅ |
| 4 | デプロイイベント Webhook 連携 | ✅ |

## Phase 1: Integration Marketplace バックエンド

### 1-1. マイグレーション
- [x] `integration_catalog` テーブル作成
- [x] `integration_connections` に `metadata` JSON カラム追加

### 1-2. SqlxIntegrationRepository 実装
- [x] `packages/integration/src/repository/integration.rs`

### 1-3. Connection に metadata 対応追加
- [x] ドメインモデルに metadata フィールド追加
- [x] SqlxConnectionRepository の metadata 対応

### 1-4. Usecase 実装
- [x] ListIntegrations
- [x] GetIntegration
- [x] ListConnections
- [x] ConnectIntegration (OAuth開始)
- [x] HandleOAuthCallback (OAuth コールバック処理)
- [x] DisconnectIntegration

### 1-5. REST エンドポイント
- [x] `GET /v1/integrations`
- [x] `GET /v1/integrations/:id`
- [x] `GET /v1/integrations/connections`
- [x] `POST /v1/integrations/:id/connect`
- [x] `GET /v1/integrations/callback/:provider`
- [x] `DELETE /v1/integrations/connections/:id`

### 1-6. tachyon-api 統合
- [x] di.rs に Integration App の DI 登録
- [x] router.rs に Integration ルーター merge
- [x] main.rs と lambda.rs の router 呼び出し更新

### 1-7. Auth ポリシー & シードデータ
- [x] 008-auth-policies.yaml に5アクション追加 (ListIntegrations, GetIntegration, ListConnections, ConnectIntegration, DisconnectIntegration)
- [x] AdminPolicy に integration アクション紐付け
- [x] 010-integration-catalog.yaml シードデータ (Slack, Discord, GitHub)

## Phase 2: Slack OAuth プロバイダー

- [x] `OAuthProvider` に `Slack`, `Discord` 追加
- [x] callback_handler.rs で Slack OAuth V2 コード交換実装
- [x] Incoming Webhook URL を Connection.metadata に保存
- [x] inbound_sync_domain / inbound_sync graphql types の OAuthProvider 網羅性修正

## Phase 3: Marketplace UI

- [x] sidebar-config.ts に Integrations メニュー追加 (Puzzle アイコン)
- [x] `integrations/page.tsx` — マーケットプレイス一覧
- [x] `integrations/integrations-client.tsx` — カタログカードUI、Connect ボタン
- [x] `integrations/connections/page.tsx` — 接続管理一覧
- [x] `integrations/connections/connections-client.tsx` — テーブル形式、切断ダイアログ

## Phase 4: デプロイイベント Webhook 連携

- [x] `WebhookDispatcher` に `ConnectionRepository` 対応追加
- [x] `with_connections()` コンストラクタで Connection から Webhook URL を動的解決
- [x] DI で `noop()` → `with_connections(connection_repo)` に変更
- [x] operator_id → TenantId → Slack Connection → metadata.webhook_url の解決チェーン

## 変更ファイル一覧

### マイグレーション
- `packages/auth/migrations/20260222100000_create_integration_catalog.up.sql` (NEW)
- `packages/auth/migrations/20260222100001_add_metadata_to_integration_connections.up.sql` (NEW)

### Rust バックエンド
- `packages/integration/domain/src/marketplace.rs` — Communication カテゴリ追加、metadata 対応
- `packages/integration/domain/Cargo.toml` — serde_json 依存追加
- `packages/integration/src/repository/integration.rs` (NEW) — SqlxIntegrationRepository
- `packages/integration/src/repository/connection.rs` — metadata カラム対応
- `packages/integration/src/usecase/` (NEW) — 6 usecase
- `packages/integration/src/adapter/axum/` (NEW) — 6 REST ハンドラー
- `packages/integration/src/lib.rs` — App struct rewrite
- `packages/integration/Cargo.toml` — auth, tachyon_apps, axum, reqwest 依存追加
- `packages/auth/domain/src/oauth.rs` — Slack, Discord 追加
- `packages/deployment_event/src/usecase/webhook_dispatcher.rs` — ConnectionAware 対応
- `packages/deployment_event/Cargo.toml` — integration_domain 依存追加
- `apps/tachyon-api/Cargo.toml` — integration 依存追加
- `apps/tachyon-api/src/di.rs` — Integration DI、WebhookDispatcher with_connections
- `apps/tachyon-api/src/router.rs` — Integration ルーター merge
- `apps/tachyon-api/src/main.rs` — integration_app パラメータ追加
- `apps/tachyon-api/bin/lambda.rs` — integration_app パラメータ追加
- `apps/library-api/packages/inbound_sync/domain/src/provider.rs` — Slack/Discord 網羅性修正
- `apps/library-api/packages/inbound_sync/src/interface_adapter/gateway/oauth_service.rs` — Slack URL 追加
- `apps/library-api/packages/inbound_sync/src/adapter/graphql/types.rs` — 網羅性修正

### シード
- `scripts/seeds/n1-seed/008-auth-policies.yaml` — 5 integration アクション追加
- `scripts/seeds/n1-seed/010-integration-catalog.yaml` (NEW) — Slack, Discord, GitHub

### フロントエンド
- `apps/tachyon/src/app/v1beta/[tenant_id]/sidebar-config.ts` — Puzzle import, Integrations メニュー
- `apps/tachyon/src/app/v1beta/[tenant_id]/integrations/page.tsx` (NEW)
- `apps/tachyon/src/app/v1beta/[tenant_id]/integrations/integrations-client.tsx` (NEW)
- `apps/tachyon/src/app/v1beta/[tenant_id]/integrations/connections/page.tsx` (NEW)
- `apps/tachyon/src/app/v1beta/[tenant_id]/integrations/connections/connections-client.tsx` (NEW)
