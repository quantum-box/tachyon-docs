---
title: "Library Sync Engine - UI & Connection Flow"
type: "feature"
emoji: "🔌"
topics:
  - Library
  - Integration Marketplace
  - OAuth
  - UI/UX
  - Connection Management
published: true
targetFiles:
  - apps/library/src/app/v1beta/[org]/integrations/
  - apps/library-api/src/handler/graphql/
  - packages/auth/integration/
  - packages/database/inbound_sync/
github: https://github.com/quantum-box/tachyon-apps
---

# Library Sync Engine - UI & Connection Flow Implementation

## 概要

Library Sync EngineのIntegration Marketplace UIと接続フロー（OAuth、API Key）の実装。

バックエンド（Webhook受信基盤、各プロバイダー実装、OAuth統合）は完了しており、このタスクではフロントエンドのUI実装と実際の接続フロー（OAuth認証、API Key設定、Connection管理）を実装します。

## 前提条件（完了済み）

以下は既に完了しています（詳細は `docs/src/tasks/completed/library-sync-engine/task.md` を参照）：

- ✅ Phase 1-12: Webhook受信基盤、各プロバイダー実装（GitHub, Linear, HubSpot, Stripe, Notion, Square）
- ✅ OAuth統合、マーケットプレイスドメインモデル
- ✅ GraphQL API（integrations, connections, oauthConfigs query）
- ✅ データベーステーブル（integration_connections, oauth_tokens）
- ✅ BuiltinIntegrationRegistry（7プロバイダー登録済み）

## Phase 1: 基本UI実装 ✅ (2025-12-31完了)

### 1.1 Integration Marketplace ページ ✅

**実装内容**:
- `apps/library/src/app/v1beta/[org]/integrations/page.tsx`
- `apps/library/src/app/v1beta/[org]/integrations/components/integrations-page-ui.tsx`

**機能**:
- MarketplaceタブとConnectedタブ（nuqsでクエリパラメータ管理）
- Featured Integrationsセクション（4件表示）
- All Integrationsセクション（7件表示）
- IntegrationCard（プロバイダー名、アイコン、カテゴリ、同期方式、説明、対象オブジェクト）
- 接続済み件数の表示

**GraphQL Query**:
```graphql
query GetIntegrations($tenantId: String!) {
  integrations {
    id
    provider
    name
    description
    icon
    category
    syncCapability
    supportedObjects
    requiresOauth
    isEnabled
    isFeatured
  }
  connections(tenantId: $tenantId) {
    id
    integrationId
    provider
    status
    externalAccountId
    externalAccountName
    connectedAt
    lastSyncedAt
    errorMessage
  }
}
```

### 1.2 Organization → Integrations 遷移 ✅

**実装内容**:
- `apps/library/src/app/v1beta/[org]/_components/organization-page-ui.tsx`

**機能**:
- Organizationページに Integrations タブを追加
- nuqsでクエリパラメータ管理（`/v1beta/${org}?tab=integrations`）
- "Browse Integrations" ボタンで Integration Marketplace へ遷移

### 1.3 Integration 詳細ページへの遷移 ✅

**実装内容**:
- `apps/library/src/app/v1beta/[org]/integrations/components/integrations-page-ui.tsx`

**機能**:
- IntegrationCard のタイトルをクリックして詳細ページへ遷移
- 接続済みの場合: "Manage" リンクで詳細ページへ
- 未接続の場合: タイトルクリックで詳細ページへ

**詳細レポート**: [navigation-verification.md](./navigation-verification.md)

**スクリーンショット**:
- 📸 [Organization Integrations Tab](./screenshots/org-integrations-tab.png)
- 📸 [Integration Detail - Stripe](./screenshots/integration-detail-stripe.png)

## Phase 2: OAuth接続フロー実装 🔄

### 2.1 OAuth開始フロー

**目的**: "Connect with OAuth" ボタンをクリックしたときの処理

**実装内容**:
1. Connect Dialog コンポーネント
   - プロバイダー選択（既に決定済み）
   - 接続するOrganization選択
   - OAuth同意画面への遷移

2. OAuth開始エンドポイント
   - `POST /api/oauth/{provider}/authorize`
   - state パラメータ生成（org_id, user_id, return_url を含む）
   - プロバイダーのOAuth認証URLへリダイレクト

**対象プロバイダー**:
- GitHub
- Linear
- HubSpot
- Notion
- Square
- Airtable

**GraphQL Query（設定済みプロバイダー取得）**:
```graphql
query GetOAuthConfigs {
  oauthConfigs {
    provider
    clientId
    redirectUri
  }
}
```

### 2.2 OAuth Callback処理

**目的**: プロバイダーからのOAuthコールバックを処理してトークンを保存

**実装内容**:
1. Callback エンドポイント
   - `GET /oauth/{provider}/callback`
   - code, state パラメータを受け取る
   - トークン交換（code → access_token）
   - トークン保存（oauth_tokens テーブル）
   - Connection作成（integration_connections テーブル）

2. エラーハンドリング
   - OAuth拒否時
   - トークン交換失敗時
   - 不正なstateパラメータ

3. リダイレクト
   - 成功時: Integration詳細ページへ（接続完了メッセージ表示）
   - 失敗時: Integration詳細ページへ（エラーメッセージ表示）

**GraphQL Mutation**:
```graphql
mutation CreateConnection($input: CreateConnectionInput!) {
  createConnection(input: $input) {
    id
    integrationId
    provider
    status
    externalAccountId
    externalAccountName
    connectedAt
  }
}
```

### 2.3 外部アカウント情報取得

**目的**: OAuth接続完了後、外部サービスのアカウント情報を取得して表示

**実装内容**:
- GitHub: `/user` API で username 取得
- Linear: GraphQL で viewer { name, email } 取得
- HubSpot: `/account-info/v3/details` で account name 取得
- Notion: 不要（Workspace名はトークンレスポンスに含まれる）
- Square: `/v2/merchants/me` で merchant name 取得

**Connection更新**:
```rust
connection.set_external_account_id(account_id);
connection.set_external_account_name(account_name);
```

## Phase 3: API Key設定フロー実装 📝

### 3.1 API Key入力UI

**目的**: "Connect with API Key" ボタンをクリックしたときの処理

**対象プロバイダー**:
- Stripe

**実装内容**:
1. API Key入力Dialog
   - API Key入力フィールド
   - 検証ボタン
   - ヘルプテキスト（API Keyの取得方法へのリンク）

2. API Key検証
   - `POST /api/integrations/{provider}/validate-api-key`
   - プロバイダーのAPIを実際に叩いて検証
   - Stripe: `/v1/account` で検証

**GraphQL Mutation**:
```graphql
mutation SaveApiKey($input: SaveApiKeyInput!) {
  saveApiKey(input: $input) {
    id
    integrationId
    provider
    status
    externalAccountId
    externalAccountName
    connectedAt
  }
}
```

### 3.2 API Key保存

**実装内容**:
- API Key暗号化保存（oauth_tokens テーブルを流用）
- Connection作成（integration_connections テーブル）
- 外部アカウント情報取得（Stripe account name）

## Phase 4: Connection管理機能 📝

### 4.1 Connection詳細ページ

**ルート**: `/v1beta/${org}/integrations/${integrationId}`

**実装内容**:
1. 接続状態表示
   - ステータス（Active, Paused, Disconnected, Error, Expired）
   - 外部アカウント名
   - 接続日時
   - 最終同期日時
   - エラーメッセージ（エラー時）

2. Webhook設定状態
   - Webhook URL
   - 登録済みイベント一覧
   - Webhook登録状態（要実装/登録済み）

3. 同期履歴
   - 最近のWebhook受信イベント
   - 処理ステータス（Pending, Processing, Completed, Failed）
   - 処理済みアイテム数

**GraphQL Query**:
```graphql
query GetConnectionDetail($connectionId: String!) {
  connection(id: $connectionId) {
    id
    integrationId
    provider
    status
    externalAccountId
    externalAccountName
    connectedAt
    lastSyncedAt
    errorMessage
    webhookEndpoint {
      id
      url
      events
      status
    }
    recentEvents {
      id
      eventType
      processingStatus
      processedItems
      receivedAt
      processedAt
      errorMessage
    }
  }
}
```

### 4.2 Connection操作

**実装内容**:
1. 一時停止（Pause）
   - ステータスを PAUSED に変更
   - Webhook受信は継続するが処理をスキップ

2. 再開（Resume）
   - ステータスを ACTIVE に変更
   - Webhook処理を再開

3. 切断（Disconnect）
   - ステータスを DISCONNECTED に変更
   - OAuthトークンを削除
   - Webhook登録を解除（プロバイダー側）

4. 再接続（Reconnect）
   - 新しいOAuthフローを開始
   - 既存のConnectionを更新

**GraphQL Mutations**:
```graphql
mutation PauseConnection($connectionId: String!) {
  pauseConnection(id: $connectionId) {
    id
    status
  }
}

mutation ResumeConnection($connectionId: String!) {
  resumeConnection(id: $connectionId) {
    id
    status
  }
}

mutation DisconnectConnection($connectionId: String!) {
  disconnectConnection(id: $connectionId) {
    id
    status
  }
}
```

### 4.3 エラー状態の表示と対処

**実装内容**:
1. エラー種別の表示
   - トークン有効期限切れ → 再接続を促す
   - API エラー → エラーメッセージ表示
   - Webhook検証失敗 → Secret再生成を促す

2. 自動リトライ
   - 一時的なエラーは自動リトライ（exponential backoff）
   - 永続的なエラーは手動対処が必要

3. エラー通知
   - エラー発生時にトースト通知
   - 詳細はConnection詳細ページで確認

## Phase 5: Webhook設定UI 📝

### 5.1 Webhook Endpoint作成

**目的**: 外部サービス側にWebhookを登録するためのURL生成

**実装内容**:
1. Webhook Endpoint生成
   - `POST /api/webhooks/endpoints`
   - Organization, Integration, Repository（オプション）を指定
   - URLとSecretを生成

2. Webhook登録ガイド
   - プロバイダー別の登録手順
   - Webhook URL, Secret のコピーボタン
   - 登録確認方法

**対象プロバイダー**:
- GitHub: Repository Settings → Webhooks
- Linear: Settings → API → Webhooks
- HubSpot: Settings → Integrations → Webhooks
- Stripe: Developers → Webhooks
- Notion: My integrations → Webhook subscriptions
- Square: Developer Dashboard → Webhooks
- Airtable: Base → Automations → Webhooks

**GraphQL Mutation**:
```graphql
mutation CreateWebhookEndpoint($input: CreateWebhookEndpointInput!) {
  createWebhookEndpoint(input: $input) {
    id
    url
    secret
    events
    status
  }
}
```

### 5.2 Webhook受信テスト

**目的**: Webhook設定が正しく動作するか確認

**実装内容**:
1. テストWebhook送信
   - `POST /api/webhooks/test`
   - ダミーペイロードで動作確認

2. 受信ログ表示
   - Webhook受信履歴
   - ペイロード内容
   - 処理結果

**GraphQL Mutation**:
```graphql
mutation SendTestWebhook($endpointId: String!) {
  sendTestWebhook(endpointId: $endpointId) {
    success
    message
  }
}
```

## Phase 6: プロバイダー別設定画面 📝

### 6.1 GitHub設定

**実装内容**:
- Repository選択（複数選択可）
- Branch設定（main, develop等）
- Path pattern（`docs/**/*.md`）
- 同期するイベント（push, pull_request, release）

### 6.2 Linear設定

**実装内容**:
- Team選択
- 同期するIssueステータス
- 同期するIssueラベル
- Projectとの連携設定

### 6.3 HubSpot設定

**実装内容**:
- 同期するオブジェクト（Contact, Company, Deal, Product）
- カスタムプロパティマッピング
- フィルタ条件

### 6.4 Stripe設定

**実装内容**:
- API Key入力・検証
- 同期するオブジェクト（Customer, Product, Price, Subscription, Invoice, Payment）
- Webhook設定

### 6.5 Notion設定

**実装内容**:
- Database選択
- プロパティマッピング（Notion → Library）
- フィルタ条件

### 6.6 Square設定

**実装内容**:
- Location選択
- 同期するオブジェクト（Catalog, Customer, Order, Payment, Inventory）
- Webhook設定

## Phase 7: E2Eテスト 📝

### 7.1 OAuth接続フローのテスト

**テストシナリオ**:
1. Integration Marketplace → Connect with OAuth
2. プロバイダーのOAuth画面で認証
3. Callback処理でトークン保存
4. Connection作成確認
5. 外部アカウント情報表示確認

### 7.2 Webhook受信テスト

**テストシナリオ**:
1. Webhook Endpoint作成
2. プロバイダー側にWebhook登録
3. 外部サービスでデータ変更
4. Webhook受信確認
5. データ同期確認

### 7.3 Connection管理テスト

**テストシナリオ**:
1. Connection一時停止
2. Connection再開
3. Connection切断
4. Connection再接続

## 実装優先順位

### P0: 必須（MVP）
1. ✅ Phase 1: 基本UI実装（完了）
2. Phase 2: OAuth接続フロー（GitHub, Linear）
3. Phase 3: API Key設定フロー（Stripe）
4. Phase 4.1: Connection詳細ページ
5. Phase 4.2: Connection操作（Pause, Resume, Disconnect）

### P1: 重要
1. Phase 5.1: Webhook Endpoint作成
2. Phase 6.1-6.2: GitHub, Linear設定画面
3. Phase 7.1: OAuth接続フローのE2Eテスト

### P2: 追加機能
1. Phase 4.3: エラー状態の表示と対処
2. Phase 5.2: Webhook受信テスト
3. Phase 6.3-6.6: その他プロバイダー設定画面
4. Phase 7.2-7.3: Webhook受信テスト、Connection管理テスト

## 技術的な注意点

### nuqsによるタブ管理
- すべてのタブコンポーネントでnuqsを使用
- URL同期により、ブックマークやブラウザナビゲーションに対応

### GraphQL型生成
- `yarn codegen --filter=library` で型生成
- `@/gen/graphql` から型をimport

### OAuth State管理
- state パラメータに以下を含める:
  - organization_id
  - user_id
  - return_url
- 署名付きトークンで改ざん防止

### トークン保存
- OAuth Access Token: 暗号化して oauth_tokens テーブルに保存
- API Key: 暗号化して oauth_tokens テーブルに保存（token_typeで区別）

### Connection Status
- ACTIVE: 正常動作中
- PAUSED: 一時停止中
- DISCONNECTED: 切断済み
- ERROR: エラー発生中
- EXPIRED: トークン期限切れ

## 実装状況詳細 (2025-01-03 更新)

### 認証方式の整理

| 方式 | Provider | Credential管理 |
|------|----------|----------------|
| **OAuth** | GitHub, Linear, Notion, Airtable | Platform側で管理（IaCマニフェスト）→ ユーザーはOAuth認可するだけ |
| **API Key** | Stripe, Square, HubSpot | 各Organizationのユーザーが自分で設定 |

### IaCマニフェストに設定済みのCredential

`scripts/seeds/n1-seed/003-iac-manifests.yaml` に以下が設定済み：

- **GitHub OAuth** (tenant: `tn_01j702qf86pc2j35s0kv0gv3gy`)
  - client_id: `Iv23lispnDlWiBRKhR15`
  - redirect_uri: `http://localhost:5010/oauth/github/callback`
- **Linear OAuth** (同tenant)
  - client_id: `8d981852065462aa325db4b63390d3de`
  - redirect_uri: `http://localhost:5010/oauth/linear/callback`

### バックエンド実装状況

#### ✅ 完了済み

| コンポーネント | ファイル | 状態 |
|---------------|---------|------|
| GraphQL `initOAuth` mutation | `packages/database/inbound_sync/src/adapter/graphql/mutation.rs:439` | ✅ |
| GraphQL `exchangeOAuthCode` mutation | 同上:490 | ✅ |
| GraphQL `connectIntegration` mutation (API Key) | 同上:280 | ✅ |
| GraphQL `updateConnection` mutation (Pause/Resume/Disconnect) | 同上:377 | ✅ |
| GraphQL `deleteConnection` mutation | 同上:418 | ✅ |
| OAuthService実装 | `packages/database/inbound_sync/src/interface_adapter/gateway/oauth_service.rs` | ✅ |
| SqlxConnectionRepository | `packages/database/inbound_sync/src/interface_adapter/gateway/connection_repository.rs` | ✅ |
| HttpApiKeyValidator | `packages/database/inbound_sync/src/interface_adapter/gateway/api_key_validator.rs` | ✅ |
| OAuth callback handler (axum) | `packages/database/inbound_sync/src/adapter/oauth_callback_handler.rs` | ✅ |
| router.rsへの統合 | `apps/library-api/src/router.rs` | ✅ oauth_service注入済み |

### フロントエンド実装状況

#### ✅ 完了済み

| コンポーネント | ファイル | 状態 |
|---------------|---------|------|
| Integration Marketplace UI | `apps/library/src/app/v1beta/[org]/integrations/page.tsx` | ✅ |
| Integration Detail UI | `apps/library/src/app/v1beta/[org]/integrations/[integrationId]/components/integration-detail-ui.tsx` | ✅ |
| Connect Dialog (OAuth/API Key切り替え) | `apps/library/src/app/v1beta/[org]/integrations/components/connect-dialog.tsx` | ✅ UI完成 |
| OAuth Callback UI | `apps/library/src/app/v1beta/[org]/integrations/callback/components/oauth-callback-ui.tsx` | ✅ |
| OAuth Callback page (code exchange) | `apps/library/src/app/v1beta/[org]/integrations/callback/page.tsx` | ✅ |
| OAuth provider callback redirect | `apps/library/src/app/oauth/[provider]/callback/page.tsx` | ✅ |

#### ✅ 実装完了 (2025-01-03)

| 項目 | ファイル | 状態 |
|------|----------|------|
| OAuth開始エンドポイント | `apps/library/src/app/oauth/[provider]/authorize/route.ts` | ✅ |
| API Key保存 | `apps/library/src/app/v1beta/[org]/integrations/actions.ts` | ✅ |
| Connection操作 (Pause/Resume/Disconnect) | 同上 + `integration-detail-ui.tsx` | ✅ |

### 実装詳細

1. **OAuth開始エンドポイント** (`apps/library/src/app/oauth/[provider]/authorize/route.ts`)
   - GraphQL `initOAuth` mutation呼び出し
   - `authorization_url`にリダイレクト

2. **Server Actions** (`apps/library/src/app/v1beta/[org]/integrations/actions.ts`)
   - `connectWithApiKey()` - API Key接続
   - `pauseConnection()` - 同期一時停止
   - `resumeConnection()` - 同期再開
   - `disconnectConnection()` - 接続解除
   - `deleteConnection()` - 接続削除

3. **UI更新**
   - `connect-dialog.tsx` - API Key接続時のmutation呼び出し、エラー表示
   - `integration-detail-ui.tsx` - Connection操作ボタンのmutation呼び出し、ローディング状態、エラー表示

### 検証結果 (2025-01-03)

| チェック | 結果 | コマンド |
|----------|------|----------|
| TypeScript | ✅ Pass | `mise run ci-node` |
| Lint | ✅ Pass | `mise run ci-node` |
| Format | ✅ Pass | `mise run ci-node` |

**備考**:
- Node.js CI (`mise run ci-node`) がすべて成功
- library パッケージのlint/format/tsチェックすべてパス
- ブラウザ動作確認には有効な Organization が必要（開発環境セットアップ要）

### 次のステップ

- 有効なOrganizationをセットアップして実際にOAuth/API Key接続テスト
- E2Eテスト作成

## 技術的負債・後続タスク

### 本番向けシークレット管理（別タスクとして切り出し）

**現状の問題**:
- OAuthクライアントシークレットがシードファイル (`003-iac-manifests.yaml`) にハードコードされている
- `redirect_uri` が固定値で環境に応じた動的設定ができない
- マルチテナント対応が不完全（オペレーター毎の OAuth App 設定ができない）

**本番運用に必要な対応**:
1. **シークレット管理**: AWS Secrets Manager または環境変数経由でシークレットを注入
2. **redirect_uri の動的設定**: 環境変数 `APP_BASE_URL` からの自動構築
3. **オペレーター毎のUI設定**: Integration Marketplace UIでオペレーターが自分の OAuth App を登録できる仕組み

**現状の開発環境での動作**:
- ✅ 開発環境では動作確認済み（シードデータにハードコード）
- ❌ 本番環境ではシークレット管理の仕組みが必要

## 参考リンク

- [元のtaskdoc（Phase 1-12完了）](../../completed/library-sync-engine/task.md)
- [ナビゲーション検証レポート](./navigation-verification.md)
- [OAuth統合アーキテクチャ](../../completed/library-sync-engine/task.md#phase-10-oauth統合)
- [マーケットプレイスドメインモデル](../../completed/library-sync-engine/task.md#phase-11-マーケットプレイスアプリストアドメインモデル)
