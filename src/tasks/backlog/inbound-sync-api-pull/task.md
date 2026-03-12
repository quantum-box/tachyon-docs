# Inbound Sync: API Pull機能の追加

## 概要

現在の `inbound_sync` パッケージはWebhookベースのリアクティブ同期のみをサポートしている。
外部サービスのAPIを使用してデータをプルする機能（Initial Sync、Polling Sync、On-demand Pull）が不足している。

## 背景

### 現状

```
外部サービス → Webhook → inbound_sync → Library DB
                ↓
          [Webhook処理時のみAPIで追加データ取得]
```

- `GitHubClient::get_file_content()` - Webhookイベント処理時にファイル内容を取得
- `GitHubClient::get_pr_files()` - PR関連のWebhook処理時にファイル一覧を取得

### 課題

| シナリオ | 現状 | 問題 |
|----------|------|------|
| 新規接続時 | Webhook登録のみ | 既存データが同期されない |
| Webhook漏れ | 検知不可 | データの不整合が発生 |
| ユーザー操作 | 不可 | 手動で即時同期できない |
| 定期整合性チェック | 不可 | 差分が蓄積する可能性 |

## 要件

### 必須機能

1. **Initial Sync（初期同期）**
   - 新規接続時に既存データを一括取り込み
   - 対象: GitHub (リポジトリ内ファイル)、Linear (Issues)、Notion (Pages) など

2. **On-demand Pull（オンデマンド同期）**
   - ユーザー操作による即時同期
   - UI: 「今すぐ同期」ボタン

### オプション機能

3. **Polling Sync（定期同期）**
   - 設定した間隔でAPIをポーリング
   - Webhook漏れの補完として使用

4. **Diff Sync（差分同期）**
   - 最終同期以降の変更のみを取得
   - `since` パラメータ等を活用

## 設計案

### ドメイン層の拡張

```rust
// packages/database/inbound_sync/domain/src/sync_operation.rs

/// 同期操作の種別
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SyncOperationType {
    /// Webhookによるリアクティブ同期
    Webhook,
    /// 初期同期（全データ取り込み）
    Initial,
    /// オンデマンド同期（ユーザー操作）
    OnDemand,
    /// 定期ポーリング同期
    Scheduled,
}

/// 同期操作のログ
pub struct SyncOperation {
    pub id: SyncOperationId,
    pub endpoint_id: WebhookEndpointId,
    pub operation_type: SyncOperationType,
    pub status: SyncOperationStatus,
    pub stats: SyncStats,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub error_message: Option<String>,
}

/// 同期統計
pub struct SyncStats {
    pub total_items: u64,
    pub created: u64,
    pub updated: u64,
    pub deleted: u64,
    pub skipped: u64,
    pub failed: u64,
}
```

### ユースケース層の追加

```rust
// packages/database/inbound_sync/src/usecase/initial_sync.rs

pub struct InitialSyncInputData {
    pub executor: Executor,
    pub multi_tenancy: MultiTenancyAction,
    pub endpoint_id: WebhookEndpointId,
    pub options: InitialSyncOptions,
}

pub struct InitialSyncOptions {
    /// 同期対象のフィルタ（例: 特定ディレクトリのみ）
    pub filter: Option<SyncFilter>,
    /// ドライラン（実際には書き込まない）
    pub dry_run: bool,
    /// 既存データの上書き許可
    pub allow_overwrite: bool,
}

#[async_trait]
pub trait InitialSyncInputPort: Send + Sync {
    async fn execute(
        &self,
        input: InitialSyncInputData,
    ) -> errors::Result<SyncOperation>;
}
```

### プロバイダークライアントの拡張

```rust
// GitHubClient に追加するメソッド
#[async_trait]
pub trait GitHubClient: Send + Sync {
    // 既存
    async fn get_file_content(...) -> Result<String>;
    async fn get_pr_files(...) -> Result<Vec<PullRequestFile>>;

    // 追加
    /// リポジトリ内のファイル一覧を取得（再帰的）
    async fn list_repository_contents(
        &self,
        tenant_id: &TenantId,
        repo: &str,
        path: &str,
        branch: &str,
    ) -> Result<Vec<RepositoryContent>>;

    /// 指定日時以降のコミット一覧を取得
    async fn list_commits_since(
        &self,
        tenant_id: &TenantId,
        repo: &str,
        branch: &str,
        since: DateTime<Utc>,
    ) -> Result<Vec<Commit>>;
}
```

### GraphQL API

```graphql
type Mutation {
  # 初期同期を開始
  startInitialSync(input: StartInitialSyncInput!): SyncOperation!

  # オンデマンド同期を開始
  triggerSync(input: TriggerSyncInput!): SyncOperation!
}

type Query {
  # 同期操作の状態を取得
  syncOperation(id: ID!): SyncOperation

  # エンドポイントの同期操作履歴
  syncOperations(endpointId: ID!, first: Int): SyncOperationConnection!
}

type SyncOperation {
  id: ID!
  endpointId: ID!
  operationType: SyncOperationType!
  status: SyncOperationStatus!
  stats: SyncStats
  startedAt: DateTime!
  completedAt: DateTime
  errorMessage: String
}
```

## 実装ステップ

### Phase 1: ドメイン・インフラ層
- [ ] `SyncOperation` エンティティの追加
- [ ] `SyncOperationRepository` の実装
- [ ] マイグレーション作成

### Phase 2: プロバイダークライアント拡張
- [ ] `GitHubClient::list_repository_contents` 実装
- [ ] `LinearClient::list_issues` 実装
- [ ] `NotionClient::list_pages` 実装
- [ ] Rate Limit対応（バックオフ、並列数制限）

### Phase 3: ユースケース層
- [ ] `InitialSync` ユースケース実装
- [ ] `TriggerSync` ユースケース実装
- [ ] 進捗通知機能（WebSocket/SSE）

### Phase 4: API・UI層
- [ ] GraphQL mutation/query 追加
- [ ] フロントエンド「今すぐ同期」ボタン
- [ ] 同期進捗表示UI

### Phase 5: 定期同期（オプション）
- [ ] スケジューラー実装
- [ ] cron設定UI

## 考慮事項

### API Rate Limit

| プロバイダー | Rate Limit | 対策 |
|--------------|------------|------|
| GitHub | 5000 req/hour (authenticated) | バックオフ、並列数制限 |
| Linear | 複雑なレート制限 | 要調査 |
| Notion | 3 req/sec | 遅延挿入 |

### 大量データの処理

- ページネーション対応
- バッチ処理（100件ずつなど）
- 進捗表示（WebSocket/SSE）
- タイムアウト対策（長時間操作の非同期化）

### エラーハンドリング

- 部分的な失敗の許容（一部ファイルが取得できなくても続行）
- リトライ戦略
- エラーログと通知

## 優先度

**Medium** - 初期同期がないと新規接続時のUXが悪いが、Webhookベースでも基本的な同期は動作する。

## 関連ドキュメント

- `docs/src/tasks/completed/library-sync-engine/task.md` - 元タスク
- `packages/database/inbound_sync/` - 現在の実装
