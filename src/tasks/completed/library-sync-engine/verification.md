# Library Sync Engine - 動作確認手順

## 概要

このドキュメントは、Library Sync Engine（Inbound Webhook同期エンジン）の動作確認手順を記載しています。
特に main ブランチとのマージ後の確認を想定しています。

## 前提条件

- Docker が起動していること
- mise がインストールされていること
- 必要な環境変数が設定されていること

## 1. ビルド確認

```bash
# Rustコードのビルド
mise run check
```

**期待結果**: すべてのパッケージが正常にビルドされること

## 2. テスト実行

### 2.1 inbound_sync関連のテスト

```bash
cargo nextest run -p inbound_sync
cargo nextest run -p inbound_sync_domain
```

**期待結果**:
- inbound_sync: すべてのテストがパス
- inbound_sync_domain: すべてのテストがパス

### 2.2 auth_integration関連のテスト

```bash
cargo nextest run -p auth_integration
cargo nextest run -p auth_integration_domain
```

**期待結果**: すべてのテストがパスすること

### 2.3 library-api統合テスト

```bash
cargo nextest run -p library-api
```

**期待結果**: 統合テストがパスすること

## 3. データベースマイグレーション確認

### 3.1 データベース起動とマイグレーション

```bash
# データベース起動
mise run up

# マイグレーション実行
mise run prepare
```

### 3.2 個別マイグレーション（必要に応じて）

```bash
mise run sqlx-migrate ./apps/library-api
mise run sqlx-migrate ./packages/auth/integration
```

### 3.3 テーブル確認

以下のテーブルが作成されていることを確認:

```sql
-- library データベース
SHOW TABLES FROM library;

-- 確認すべきテーブル
-- - webhook_endpoints
-- - webhook_events
-- - webhook_sync_states
```

```sql
-- tachyon_apps_auth データベース
SHOW TABLES FROM tachyon_apps_auth;

-- 確認すべきテーブル
-- - oauth_tokens
-- - integration_connections
```

## 4. アプリケーション起動確認

### 4.1 Library API起動

```bash
mise run dev-library-api
```

### 4.2 起動確認項目

- [ ] APIが正常に起動すること（デフォルト: http://localhost:50055）
- [ ] WebhookEventWorkerがバックグラウンドで起動していること
- [ ] GraphQLエンドポイントが利用可能なこと（http://localhost:50055/v1/graphql）

### 4.3 起動ログの確認

以下のようなログが出力されることを確認:

```
WebhookEventWorker started with batch_size=10, poll_interval=5s
EventProcessorRegistry: 6 processors registered
  - GitHub
  - Linear
  - HubSpot
  - Stripe
  - Notion
  - Square
```

## 5. GraphQL動作確認

GraphiQL（http://localhost:50055/v1/graphql）にアクセスして以下のクエリを実行:

### 5.1 Webhook Endpoint一覧取得

```graphql
query {
  webhookEndpoints {
    id
    provider
    url
    status
    events
  }
}
```

**期待結果**: 空配列または既存のWebhook Endpointリストが返却される

```json
{
  "data": {
    "webhookEndpoints": []
  }
}
```

### 5.2 Integration一覧取得

```graphql
query {
  integrations {
    id
    name
    provider
    category
    description
  }
}
```

**期待結果**: BuiltinIntegrationRegistryに登録された6つのプロバイダーが返却される

```json
{
  "data": {
    "integrations": [
      {
        "id": "int_github",
        "name": "GitHub",
        "provider": "GITHUB",
        "category": "DEVELOPER_TOOLS",
        "description": "..."
      },
      // ... 他5プロバイダー
    ]
  }
}
```

### 5.3 Connection一覧取得

```graphql
query {
  connections(tenantId: "tn_01j702qf86pc2j35s0kv0gv3gy") {
    id
    integrationId
    status
    createdAt
  }
}
```

**期待結果**: 空配列または既存のConnectionリストが返却される

```json
{
  "data": {
    "connections": []
  }
}
```

### 5.4 Webhook Endpoint登録（オプション）

```graphql
mutation {
  registerWebhookEndpoint(
    input: {
      provider: GITHUB
      events: ["push", "pull_request"]
    }
  ) {
    id
    url
    secret
    status
  }
}
```

**期待結果**: Webhook Endpointが作成され、URLとシークレットが返却される

## 6. コンフリクト解決動作確認

### 6.1 モジュール名の統一確認

```bash
# router.rsでのモジュール使用確認
grep "outbound_sync" apps/library-api/src/router.rs

# テストファイルでのモジュール使用確認
grep "outbound_sync" apps/library-api/tests/api_key.rs
grep "outbound_sync" apps/library-api/tests/graphql_api_key.rs
```

**期待結果**: すべてのファイルで `outbound_sync::SyncDataInputPort` が使用されている

**出力例**:
```
apps/library-api/src/router.rs:    let sync_config_repo: Arc<dyn outbound_sync::SyncConfigRepository> =
apps/library-api/src/router.rs:        outbound_sync::interface_adapter::SqlxSyncConfigRepository::new(
apps/library-api/src/router.rs:    let sync_data: Arc<dyn outbound_sync::SyncDataInputPort> =
...
```

### 6.2 inbound_sync統合確認

```bash
# router.rsでinbound_sync関連のインポートを確認
grep -A 10 "use inbound_sync" apps/library-api/src/router.rs
```

**期待結果**: 以下のインポートが含まれている:

```rust
use inbound_sync::interface_adapter::{
    BuiltinIntegrationRegistry,
    HttpApiKeyValidator,
    NoOpGitHubClient,
    NoOpGitHubDataHandler,
    NoOpHubSpotClient,
    NoOpHubSpotDataHandler,
    NoOpLinearClient,
    NoOpLinearDataHandler,
    NoOpNotionClient,
    NoOpNotionDataHandler,
    NoOpStripeClient,
    NoOpStripeDataHandler,
    SqlxConnectionRepository,
    SqlxSyncStateRepository,
};
use inbound_sync::providers::{
    GitHubEventProcessor,
    HubSpotEventProcessor,
    LinearEventProcessor,
    NotionEventProcessor,
    StripeEventProcessor,
};
use inbound_sync::usecase::{
    EventProcessorRegistry,
    ProcessWebhookEvent,
    WebhookEventWorker,
};
```

## 7. E2Eテスト（オプション）

実際のWebhookを送信してテストする場合:

### 7.1 ローカルAPIの公開

```bash
# ngrokなどでローカルAPIを公開
ngrok http 50055
```

### 7.2 Webhook Endpoint登録

GraphQL mutationでWebhook Endpointを登録:

```graphql
mutation {
  registerWebhookEndpoint(
    input: {
      provider: GITHUB
      events: ["push"]
    }
  ) {
    id
    url
    secret
  }
}
```

### 7.3 外部サービスでWebhook設定

1. GitHub（またはその他のサービス）の設定画面を開く
2. Webhookセクションに移動
3. Payload URL: ngrokで取得したURL + `/webhooks/{provider}`（例: `https://xxx.ngrok.io/webhooks/github`）
4. Content type: `application/json`
5. Secret: GraphQL mutationで取得したsecret
6. Events: 登録したイベント（例: push）

### 7.4 イベント発火とデータ確認

1. 外部サービスでイベントを発火（例: GitHub Push）
2. webhook_eventsテーブルを確認:

```sql
SELECT * FROM library.webhook_events ORDER BY created_at DESC LIMIT 10;
```

3. webhook_sync_statesテーブルを確認:

```sql
SELECT * FROM library.webhook_sync_states ORDER BY last_synced_at DESC LIMIT 10;
```

**期待結果**:
- webhook_eventsにイベントが記録される
- statusが`PROCESSING` → `COMPLETED`に遷移する
- webhook_sync_statesに同期状態が記録される

## 8. トラブルシューティング

### 8.1 ビルドエラーが発生する場合

```bash
# 依存関係の再生成
cargo clean
mise run check

# SQLxクエリキャッシュの再生成
mise run prepare
```

**よくあるエラー**:
- `could not find X in scope`: 依存関係の問題 → `cargo clean` を試す
- `failed to verify checksum`: SQLx関連 → `mise run prepare` を実行

### 8.2 マイグレーションエラーが発生する場合

```bash
# データベースをリセット
mise run down
mise run up
mise run prepare
```

**よくあるエラー**:
- `table already exists`: マイグレーションが重複実行された → DBリセット
- `foreign key constraint fails`: テーブル作成順序の問題 → DBリセット

### 8.3 テストが失敗する場合

```bash
# 個別テストの詳細確認
cargo nextest run -p <package-name> -- --nocapture

# 特定のテストのみ実行
cargo nextest run -p inbound_sync <test_name>

# テスト失敗時のデバッグログ出力
RUST_LOG=debug cargo nextest run -p <package-name>
```

### 8.4 GraphQLエラーが発生する場合

**エラー例**: `Cannot query field "webhookEndpoints" on type "Query"`

**対処法**:
1. GraphQLスキーマが正しく生成されているか確認:
   ```bash
   cargo run --bin library-api -- codegen
   ```
2. APIを再起動

**エラー例**: `integration not found`

**対処法**:
1. BuiltinIntegrationRegistryが正しく初期化されているか確認
2. ログに "6 integrations registered" が出力されているか確認

## 9. 確認完了チェックリスト

### ビルド・テスト
- [ ] すべてのパッケージが正常にビルドされる
- [ ] inbound_sync関連のテストがすべてパスする
- [ ] auth_integration関連のテストがすべてパスする
- [ ] library-api統合テストがパスする

### データベース
- [ ] データベースマイグレーションが正常に完了する
- [ ] webhook_endpointsテーブルが存在する
- [ ] webhook_eventsテーブルが存在する
- [ ] webhook_sync_statesテーブルが存在する
- [ ] oauth_tokensテーブルが存在する
- [ ] integration_connectionsテーブルが存在する

### アプリケーション起動
- [ ] Library APIが正常に起動する
- [ ] WebhookEventWorkerが起動している
- [ ] EventProcessorRegistryに6プロバイダーが登録されている
- [ ] GraphQLエンドポイントにアクセスできる

### GraphQL動作
- [ ] webhookEndpointsクエリが動作する
- [ ] integrationsクエリが動作する（6プロバイダーが返却される）
- [ ] connectionsクエリが動作する
- [ ] registerWebhookEndpoint mutationが動作する（オプション）

### マージ後の統合確認
- [ ] モジュール名が `outbound_sync` に統一されている
- [ ] inbound_sync関連のインポートが正しい
- [ ] router.rsでNoOp実装が使用されている
- [ ] VersionResponseが定義されている

### E2Eテスト（オプション）
- [ ] Webhook Endpointが登録できる
- [ ] 外部サービスからのWebhookを受信できる
- [ ] webhook_eventsに記録される
- [ ] webhook_sync_statesに同期状態が記録される

## 10. UI動作確認（Playwright MCP）

### 10.1 前提条件

- Library フロントエンドが起動していること
- Playwright MCP が利用可能なこと

### 10.2 フロントエンド起動

```bash
# 別ターミナルでフロントエンド起動
cd apps/library
yarn dev
```

デフォルトURL: http://localhost:3000

### 10.3 Playwright MCP での確認項目

#### Webhook設定画面への遷移

1. ブラウザで http://localhost:3000 にアクセス
2. ログイン（必要に応じて）
3. 設定画面に遷移
4. Webhook設定セクションが表示されることを確認

**確認コマンド例**:
```javascript
// Playwright MCPで実行
await page.goto('http://localhost:3000');
await page.click('text=Settings');
await page.click('text=Webhooks');
```

#### Integration一覧の表示確認

1. Integration一覧ページに遷移
2. 6つのプロバイダー（GitHub, Linear, HubSpot, Stripe, Notion, Square）が表示される
3. 各プロバイダーのカード/リストアイテムが正しく表示される

**確認コマンド例**:
```javascript
// Playwright MCPで実行
await page.goto('http://localhost:3000/integrations');
await page.waitForSelector('[data-testid="integration-card"]');
const integrations = await page.$$('[data-testid="integration-card"]');
console.log('表示されているIntegration数:', integrations.length); // 6を期待
```

#### Integration詳細画面の表示確認

各プロバイダーの詳細画面で以下を確認:

1. プロバイダー名が表示される
2. 説明文が表示される
3. カテゴリーが表示される
4. 接続ボタンが表示される

**確認コマンド例**:
```javascript
// GitHub Integrationの詳細確認
await page.goto('http://localhost:3000/integrations/github');
await page.waitForSelector('h1:has-text("GitHub")');
const description = await page.textContent('[data-testid="integration-description"]');
console.log('GitHub説明:', description);
```

#### OAuth接続フローの確認

**注意**: 実際のOAuth認証は外部サービスとの連携が必要なため、UIの表示のみ確認

1. 接続ボタンをクリック
2. OAuth認証画面（または接続確認ダイアログ）が表示される
3. キャンセルボタンが機能する

**確認コマンド例**:
```javascript
// 接続ボタンのクリック確認
await page.goto('http://localhost:3000/integrations/github');
await page.click('[data-testid="connect-button"]');
await page.waitForSelector('[data-testid="oauth-dialog"]');
const dialogVisible = await page.isVisible('[data-testid="oauth-dialog"]');
console.log('OAuth ダイアログ表示:', dialogVisible);
```

#### Connection一覧の表示確認

1. Connection一覧ページに遷移
2. 空の状態または既存のConnectionが表示される
3. ステータス（Connected, Disconnected等）が表示される

**確認コマンド例**:
```javascript
await page.goto('http://localhost:3000/connections');
await page.waitForSelector('[data-testid="connections-list"]');
const connections = await page.$$('[data-testid="connection-item"]');
console.log('Connection数:', connections.length);
```

#### Webhook Endpoint一覧の表示確認

1. Webhook Endpoint設定ページに遷移
2. 登録済みエンドポイントが表示される（または空の状態）
3. 新規登録ボタンが表示される

**確認コマンド例**:
```javascript
await page.goto('http://localhost:3000/webhooks');
await page.waitForSelector('[data-testid="webhook-endpoints-list"]');
const endpoints = await page.$$('[data-testid="webhook-endpoint-item"]');
console.log('Webhook Endpoint数:', endpoints.length);
```

#### Webhook Endpoint登録フローの確認

1. 新規登録ボタンをクリック
2. プロバイダー選択が表示される
3. イベント選択が表示される
4. フォームのバリデーションが機能する

**確認コマンド例**:
```javascript
await page.goto('http://localhost:3000/webhooks');
await page.click('[data-testid="new-webhook-button"]');
await page.waitForSelector('[data-testid="webhook-form"]');

// プロバイダー選択
await page.selectOption('[data-testid="provider-select"]', 'GITHUB');

// イベント選択
await page.check('[data-testid="event-push"]');
await page.check('[data-testid="event-pull_request"]');

// 登録ボタンが有効になることを確認
const submitEnabled = await page.isEnabled('[data-testid="submit-button"]');
console.log('登録ボタン有効:', submitEnabled);
```

#### エラー表示の確認

1. 不正な入力でフォームを送信
2. エラーメッセージが表示される
3. フィールドがハイライトされる

**確認コマンド例**:
```javascript
await page.goto('http://localhost:3000/webhooks/new');
// 必須フィールドを空のまま送信
await page.click('[data-testid="submit-button"]');
await page.waitForSelector('[data-testid="error-message"]');
const errorText = await page.textContent('[data-testid="error-message"]');
console.log('エラーメッセージ:', errorText);
```

### 10.4 UI確認チェックリスト

#### ページ遷移
- [ ] トップページが表示される
- [ ] Integration一覧ページに遷移できる
- [ ] Integration詳細ページに遷移できる
- [ ] Connection一覧ページに遷移できる
- [ ] Webhook設定ページに遷移できる

#### Integration関連
- [ ] 6つのプロバイダーが表示される
- [ ] 各プロバイダーのアイコンが表示される
- [ ] プロバイダーの説明文が表示される
- [ ] カテゴリーが表示される
- [ ] 接続ボタンが表示される

#### Connection関連
- [ ] Connection一覧が表示される（空でもOK）
- [ ] ステータスが表示される
- [ ] 接続日時が表示される
- [ ] 切断ボタンが表示される（接続済みの場合）

#### Webhook Endpoint関連
- [ ] Endpoint一覧が表示される（空でもOK）
- [ ] 新規登録ボタンが表示される
- [ ] 登録フォームが表示される
- [ ] プロバイダー選択ができる
- [ ] イベント選択ができる
- [ ] URLとシークレットが生成される
- [ ] 削除ボタンが機能する

#### エラーハンドリング
- [ ] バリデーションエラーが表示される
- [ ] APIエラーが適切に表示される
- [ ] ローディング状態が表示される

### 10.5 スクリーンショットの保存

重要な画面のスクリーンショットを保存:

```javascript
// Integration一覧
await page.goto('http://localhost:3000/integrations');
await page.screenshot({ path: 'screenshots/integrations-list.png' });

// Webhook設定
await page.goto('http://localhost:3000/webhooks');
await page.screenshot({ path: 'screenshots/webhooks-list.png' });

// 登録フォーム
await page.goto('http://localhost:3000/webhooks/new');
await page.screenshot({ path: 'screenshots/webhook-form.png' });
```

## 11. 次のステップ

すべての確認が完了したら:

1. ドキュメントの更新
2. PRの作成
3. レビュー依頼
4. CI/CDでの最終確認

## 参考情報

- タスクドキュメント: `docs/src/tasks/in-progress/library-sync-engine/task.md`
- GraphQLスキーマ: `apps/library-api/schema.graphql`
- マイグレーション: `apps/library-api/migrations/`
- Playwright MCP ドキュメント: https://github.com/modelcontextprotocol/servers/tree/main/src/playwright
