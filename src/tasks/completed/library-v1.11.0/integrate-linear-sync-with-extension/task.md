---
title: Linear同期機能とリポジトリExtensionの統合
type: feature
emoji: "🔄"
topics:
  - Library
  - Linear
  - Inbound Sync
  - Extension
published: false
targetVersion: library-v1.11.0
---

# Linear同期機能とリポジトリExtensionの統合

## 概要

Linear IssuesをLibraryリポジトリと双方向同期し、`ext_linear`プロパティで管理できるようにする。既存の`ext_github`同期機能との統合を図り、統一されたextension frameworkを構築する。

## Import機能との関係

- **Importは導入フロー**（Linearから新規リポジトリ作成まで）。
- **Syncは運用フロー**（作成済みリポジトリに対する継続同期・設定・履歴）。
- 想定ユーザーフロー:
  1. 組織ページで **Linearからインポート** → リポジトリ作成
  2. 作成後は **Settings > Extensions** で同期設定・運用

> importの詳細は `docs/src/tasks/in-progress/linear-import-to-repository/task.md` を参照。

## 背景・目的

### 現状の課題

1. **Linear同期の基盤は実装済みだが、リポジトリと統合されていない**
   - `inbound_sync`パッケージにLinear API Pull機能が実装済み
   - Initial Sync、On-demand Pull、Webhook同期が動作
   - しかし、Libraryのリポジトリ/データアイテムとの結びつきが弱い

2. **既存のext_github同期機能との不統一**
   - GitHub: `ext_github`プロパティ + outbound sync（送信のみ）
   - Linear: webhook + API pull（受信のみ）で、extensionプロパティ未対応

3. **ユーザーがLinear同期を設定する手順が不明確**
   - Integrationsページで接続はできる
   - しかし、リポジトリ設定からLinear同期を有効化する方法がない

### 期待される成果

- ✅ Linear IssuesをLibraryリポジトリのデータとして同期
- ✅ `ext_linear`プロパティで各データアイテムにLinear issue_idを保持
- ✅ リポジトリ設定画面からLinear同期のON/OFF切り替え
- ✅ Initial Sync、On-demand Pull、Webhook自動同期の完全統合
- ✅ Property Mappingで柔軟なフィールドマッピング（Linear status → Libraryプロパティ）

### 決定事項（2026-01-09）

- Webhook endpointはorg単位で1件。Linear側もworkspace単位のためorg設定で発行する。
- Webhook URLはorg側で発行し、Signing Secretはユーザー入力で管理する。
- LibraryのGraphQL/UsecaseはtenantIdではなくorganization usernameで扱う。
- 設定UIは`/v1beta/[org]/setting`配下でよく、見た目は異なっても中身は共通化する。

### 決定事項（2026-01-13）

- Linear OAuth AppにつきWebhook URLは1つのみ登録できるため、Library側は **provider単位のWebhook URL** を採用する。
- Webhook URLは `/{base_url}/webhooks/<provider>`（例: `/webhooks/linear`）に固定。
- endpointはrepo単位で保持し、**organizationId (Linear)** を起点にtenantを解決して該当endpointへルーティングする。
- Secretは最初に作成したendpointのものを共有（以後のendpoint作成ではSecretを再表示しない）。

## 詳細仕様

### 機能要件

#### 1. ext_linear プロパティの自動生成

リポジトリでLinear同期を有効化すると、以下のシステムプロパティが自動生成される：

```yaml
property_definition:
  name: ext_linear
  type: json
  is_system: true
  is_readonly: false
  schema:
    issue_id: string          # Linear issue ID (例: "LIN-123")
    issue_url: string         # Linear issue URL
    identifier: string        # Issue identifier (例: "ENG-42")
    sync_enabled: boolean     # 同期有効/無効
    last_synced_at: datetime  # 最終同期日時
    version_external: string  # External version (競合検出用)
    version_local: string     # Local version (競合検出用)
```

#### 2. リポジトリ設定からのLinear同期有効化

**Settings > Extensions > Linear**
- Linear OAuth接続状態の表示
- 「Connect Linear」ボタン → OAuth認証フロー
- Team/Project選択ドロップダウン
- Property Mapping設定UI
- 「Enable Sync」トグル → Webhook Endpoint作成
- 「Initial Sync」ボタン → 既存Issues全件取り込み

#### 3. データアイテムとLinear Issueの紐付け

**Initial Sync時の動作**:
1. Linear API で全Issue取得（`list_issues`）
2. 各Issueに対して：
   - Library data作成（title, description等）
   - `ext_linear`プロパティ設定（issue_id, issue_url等）
   - `sync_states`レコード作成（Linear issue_id ↔ data_id マッピング）

**Property Mapping適用**:
```json
{
  "static_mappings": [
    { "source_field": "title", "target_property": "title" },
    { "source_field": "description", "target_property": "description" },
    { "source_field": "state.name", "target_property": "status" },
    { "source_field": "assignee.name", "target_property": "assigned_to" },
    { "source_field": "priority", "target_property": "priority" }
  ],
  "defaults": {
    "source": "Linear"
  }
}
```

#### 4. Webhook自動同期

Linear webhookイベント受信時：
1. `webhook_events`テーブルに記録
2. LinearEventProcessor が処理
3. `sync_states`から対応するdata_idを取得
4. Library dataを更新
5. `ext_linear`プロパティを更新（version, last_synced_at）

#### 5. On-demand Pull（手動同期）

データアイテム詳細ページ：
- 「Pull from Linear」ボタン
- OnDemandPull usecase実行 → Linear APIで最新データ取得
- 競合検出（version比較）
- データ更新 + `ext_linear`更新

### 非機能要件

- **パフォーマンス**: Initial Syncは100 issues/分以上
- **Rate Limit対応**: Linear API制限を考慮したバックオフ
- **エラーハンドリング**: 部分失敗を許容（一部Issue取得失敗でも続行）
- **監査**: すべての同期操作を`sync_operations`で追跡

### コンテキスト別の責務

```yaml
contexts:
  inbound_sync:
    description: "外部サービス → Library への同期基盤"
    responsibilities:
      - Webhook受信・署名検証
      - Initial Sync、On-demand Pull実装
      - SyncState・SyncOperation管理
      - Provider固有のAPI Pull処理

  database (library):
    description: "Libraryのリポジトリ・データ管理"
    responsibilities:
      - Repository、Data、Property管理
      - ext_* プロパティのスキーマ定義
      - データCRUD操作

  integration:
    description: "OAuth認証・Connection管理"
    responsibilities:
      - OAuth tokenの取得・保存・更新
      - integration_connections状態管理
      - Linear APIクライアントへのtoken提供
```

## 実装方針

### 方針更新（2026-01-09）
- Webhook endpointはorg単位で1件運用（Linearのworkspace設定に合わせる）
- Linear用Webhook URLはorg単位で発行（repo単位では作らない）
- Signing secretはユーザー入力で登録（Linear側で生成されるため）
- LibraryのGraphQL/UsecaseはtenantIdではなくorg usernameで扱う方針（B）
- 設定ページはorg設定配下に配置（`/v1beta/[org]/setting` 内の任意セクション）

### アーキテクチャ設計

**既存資産の活用**:
- ✅ `inbound_sync`パッケージのLinear実装（完成済み）
- ✅ `SyncState`, `SyncOperation`ドメインモデル
- ✅ `InitialSync`, `OnDemandPull`ユースケース
- ✅ `LinearApiPullProcessor`実装
- ✅ GraphQL API（mutation/query）

**追加実装が必要な箇所**:
1. `ext_linear`プロパティの自動生成ロジック
2. LinearDataHandlerの拡張（ext_linearプロパティ設定）
3. リポジトリ設定UI（Linear統合セクション）
4. データ詳細ページのLinear同期UI

### データフロー

```
┌─────────────────────────────────────────────────────────┐
│ User Action: "Enable Linear Sync"                      │
└─────────────────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 1. Create Webhook Endpoint (webhook_endpoints)         │
│    - provider: LINEAR                                   │
│    - tenant_id, repository_id                           │
│    - config: { team_id, project_id }                    │
│    - mapping: { linear_status → status, ... }           │
└─────────────────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 2. Create ext_linear Property (auto-generated)         │
│    - property_definition: name="ext_linear", type=json  │
│    - is_system=true                                     │
└─────────────────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 3. Initial Sync (InitialSync usecase)                  │
│    ├─ Linear API: list_issues()                        │
│    ├─ For each issue:                                  │
│    │   ├─ Create Library data                          │
│    │   ├─ Set ext_linear property                      │
│    │   └─ Create SyncState record                      │
│    └─ Create SyncOperation record (completed)          │
└─────────────────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 4. Ongoing Webhook Sync (ProcessWebhookEvent)          │
│    ├─ Linear webhook: issue.updated                    │
│    ├─ Find SyncState by external_id                    │
│    ├─ Update Library data                              │
│    └─ Update ext_linear property                       │
└─────────────────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 5. Manual Pull (OnDemandPull usecase)                  │
│    ├─ User clicks "Pull from Linear"                   │
│    ├─ Linear API: get_issue(issue_id)                  │
│    ├─ Update Library data                              │
│    └─ Update ext_linear property                       │
└─────────────────────────────────────────────────────────┘
```

### 技術選定

**バックエンド**:
- ✅ 既存: `inbound_sync`パッケージのLinear実装
- 🆕 LinearDataHandler拡張: ext_linearプロパティ設定ロジック
- 🆕 Repository設定API: Webhook endpoint管理

**フロントエンド**:
- ✅ 既存: `<SyncButton>`, `<SyncHistory>`コンポーネント
- 🆕 Linear設定UI: OAuth接続、Property Mapping設定
- 🆕 データ詳細ページ: ext_linear表示、Pull from Linearボタン

## タスク分解

### Phase 1: LinearDataHandler拡張 ✅
- [x] LinearDataHandler に ext_linear プロパティ設定ロジック追加
- [x] Property定義の自動生成
- [x] SyncState更新ロジック

### Phase 2: リポジトリ設定UI 🔄
- [x] Settings > Extensions ページ作成
- [x] Linear OAuth接続ボタン
- [x] Team/Project選択UI
- [x] Property Mapping設定ダイアログ
- [x] Enable Sync トグル（Webhook Endpoint作成含む）
- [x] Initial Sync ボタン統合






### Phase 3: データアイテムUI統合 📝
- [x] データ詳細ページに ext_linear セクション表示
- [x] Linear issue_id、URLのリンク表示
- [x] 「Pull from Linear」ボタン
- [x] 最終同期時刻表示
- [x] 競合警告UI

### Phase 4: GraphQL API整備 📝
- [x] Repository固有のWebhook Endpoint管理API
- [x] ext_linear Property CRUD
- [x] Linear connection status query

### Phase 5: 動作確認 📝
- [x] OAuth接続テスト
- [x] Initial Sync実行（Linear Issues → Library data）
- [x] Webhook受信テスト（Issue update → Library data update）
- [x] On-demand Pull テスト
- [x] Property Mapping動作確認（保存/反映まで）

### Phase 6: provider単位Webhook ✅
- [x] `/webhooks/<provider>` 受信ルート追加（Linear対応）
- [x] organizationId → tenant → endpointルーティングの実装
- [x] Linearのevent typeフィルタを `Issue/Project/...` に合わせる
- [x] Secret共有ロジック（Linearのendpoint追加時に再生成しない）
- [x] UIのWebhook URL表示をprovider単位に更新

## Playwright MCPによる動作確認

### 動作確認チェックリスト

#### Linear OAuth接続
- [x] Settings > Extensions > Linear セクション表示
- [x] 「Connect Linear」ボタンクリック
- [x] OAuth認証フロー（Linear authorization画面）
- [x] 認証成功後、Connected状態表示
- [ ] Access token有効期限表示

#### Webhook Endpoint設定
- [x] Team選択ドロップダウン表示（OAuth再接続後に表示確認）
- [x] Project選択ドロップダウン表示（OAuth再接続後に表示確認）
- [x] Property Mapping設定ダイアログ
  - Source field選択
  - Target property選択
  - Transform function選択
- [x] 「Enable Sync」トグル → webhook_endpoints作成
- [x] Webhook URL表示（Secret入力済み）

#### Initial Sync実行
- [x] 「Initial Sync」ボタンクリック
- [x] SyncOperation作成確認
- [x] 進捗表示（完了時に "100/100 issues" を確認）
- [x] 同期完了後の統計表示（+0 / ~0 / -100）
- [x] ext_linearプロパティが自動生成されていることを確認（Properties画面）

#### データ同期確認
- [x] Linear Issueがライブラリデータとして表示
- [x] ext_linear プロパティにissue_id、issue_url設定済み
- [x] Property Mappingが適用されている（status, assigned_to等）
- [x] 「Pull from Linear」ボタン表示
- [x] ボタンクリック → 最新データ取得・更新
- [x] 最終同期時刻が更新される（再読み込みで反映）

#### Webhook自動同期
- [x] Linearでissue更新（status変更、assignee変更等）
- [x] Webhook受信ログ（webhook_events）
- [x] Library dataが自動更新されることを確認
- [x] ext_linearのlast_synced_at更新

#### 同期履歴表示
- [x] Settings > Sync History ページ（Integrations内テーブルで確認）
- [x] SyncOperationの一覧表示（type/status/stats/progress）
- [ ] 進行中の同期のリアルタイム更新（2秒ごとポーリング）
- [ ] エラー時のerror_message表示

## 実装済み内容（2026-01-08時点）

### ✅ バックエンド基盤（完成）

**ドメイン層**:
- `SyncOperation` エンティティ（`packages/database/inbound_sync/domain/src/sync_operation.rs`）
- `SyncOperationType`: Webhook/InitialSync/OnDemandPull/ScheduledSync
- `SyncOperationStatus`: Queued/Running/Completed/Failed/Cancelled

**ユースケース層**:
- `InitialSync` - 初回全量同期（`packages/database/inbound_sync/src/usecase/initial_sync.rs`）
- `OnDemandPull` - オンデマンド同期（`packages/database/inbound_sync/src/usecase/on_demand_pull.rs`）
- `ApiPullProcessor` トレイト（`packages/database/inbound_sync/src/usecase/api_pull_processor.rs`）

**Linear実装**:
- `LinearClient::list_issues()`, `list_projects()` - GraphQL API実装（`packages/database/inbound_sync/src/providers/linear/client.rs`）
- `LinearApiPullProcessor` - 完全実装（`packages/database/inbound_sync/src/providers/linear/api_pull_processor.rs`）
- `LinearEventProcessor` - Webhook処理実装
- `LinearDataHandler` - データ変換実装

**GraphQL API**:
- `startInitialSync` mutation（`packages/database/inbound_sync/src/adapter/graphql/mutation.rs:620`）
- `triggerSync` mutation（`packages/database/inbound_sync/src/adapter/graphql/mutation.rs:650`）
- `syncOperations` query（`packages/database/inbound_sync/src/adapter/graphql/query.rs:230`）

**UI Components**:
- `<SyncButton>` - 同期ボタン（`apps/library/src/components/sync/sync-button.tsx`）
- `<SyncHistory>` - 同期履歴（`apps/library/src/components/sync/sync-history.tsx`）

**認証**:
- `inbound_sync:InitialSync` アクション（`scripts/seeds/n1-seed/008-auth-policies.yaml:1078`）
- `inbound_sync:OnDemandPull` アクション（`scripts/seeds/n1-seed/008-auth-policies.yaml:1086`）

**マイグレーション**:
- `webhook_endpoints`, `webhook_events`, `sync_states` テーブル（`apps/library-api/migrations/20251211000000_create_inbound_sync_tables.up.sql`）
- `sync_operations` テーブル（`packages/database/inbound_sync/migrations/20260108000000_add_sync_operations.up.sql`）
- `integration_connections`, `oauth_tokens` テーブル（`apps/library-api/migrations/20260108100000_add_integration_connections.up.sql`）

### ✅ 2026-01-12
- Linear同期の有効化時に `ext_linear` プロパティを自動作成
  - `enableLinearSync` GraphQL mutation を追加
  - Extensions UI の「同期を有効化」で呼び出し
- Playwrightで「同期を有効化」実行後、data詳細のプロパティ一覧に `ext_linear` が表示されないことを確認（引き続き `id(System)` のみ）
  - スクリーンショット: `docs/src/tasks/in-progress/integrate-linear-sync-with-extension/screenshots/linear-ext-linear-missing-20260112.png`
- codegen再実行後も、プロパティ一覧に `ext_linear` が表示されないことを再確認
  - スクリーンショット: `docs/src/tasks/in-progress/integrate-linear-sync-with-extension/screenshots/linear-ext-linear-still-missing-20260112.png`
- codegen後に再度「同期を有効化」を実行しても `ext_linear` が表示されないことを確認
  - スクリーンショット: `docs/src/tasks/in-progress/integrate-linear-sync-with-extension/screenshots/linear-ext-linear-missing-20260112-codegen.png`
- PlaywrightでIntegrations画面のConnected/Enabled/Sync Historyを再確認し、Initial Syncを再実行してCompletedになったことを確認
  - stats: +0 / ~0 / -100、progress: 100/100 issues
  - スクリーンショット: `docs/src/tasks/in-progress/integrate-linear-sync-with-extension/screenshots/linear-integrations-20260112.png`
  - スクリーンショット: `docs/src/tasks/in-progress/integrate-linear-sync-with-extension/screenshots/linear-initial-sync-20260112.png`
- Property Mappingダイアログの表示を確認（保存/適用は未実施）
  - スクリーンショット: `docs/src/tasks/in-progress/integrate-linear-sync-with-extension/screenshots/linear-mapping-dialog-20260112.png`
- Properties画面で `ext_linear` extensionが表示されることを再確認
  - スクリーンショット: `docs/src/tasks/in-progress/integrate-linear-sync-with-extension/screenshots/linear-properties-20260112.png`
- Data一覧で `ext_linear` 列が表示されることを確認（値は `-`、Linear issue同期は未反映）
  - スクリーンショット: `docs/src/tasks/in-progress/integrate-linear-sync-with-extension/screenshots/linear-data-list-20260112.png`
- Data詳細のLinear Syncセクション表示を確認（`ext_linear` 未設定のため Pull は未表示）
  - スクリーンショット: `docs/src/tasks/in-progress/integrate-linear-sync-with-extension/screenshots/linear-data-detail-20260112.png`

### 🚧 未実装（次のステップ）

> ※以下は過去の計画メモ。Phase 2〜4が完了している前提なら、  
> 実施済み内容として整理・削除して問題なし。

## 設計詳細

### ext_linearプロパティ生成ロジック

```rust
// LinearDataHandler::upsert_issue 内

async fn upsert_issue(
    &self,
    endpoint: &WebhookEndpoint,
    issue: &Issue,
    mapping: Option<&PropertyMapping>,
) -> errors::Result<String> {
    // 1. Property mappingを適用してデータ作成
    let properties = apply_mapping(issue, mapping);

    // 2. ext_linear プロパティを追加
    let ext_linear = serde_json::json!({
        "issue_id": issue.id,
        "issue_url": issue.url,
        "identifier": issue.identifier,
        "sync_enabled": true,
        "last_synced_at": chrono::Utc::now(),
        "version_external": issue.updated_at,
    });
    properties.insert("ext_linear", ext_linear);

    // 3. Library data作成/更新
    let data_id = self.data_repository.upsert(properties).await?;

    Ok(data_id)
}
```

### Property Mapping UI

```typescript
// apps/library/src/components/integrations/property-mapping-dialog.tsx

interface PropertyMappingDialogProps {
  endpointId: string;
  provider: 'GITHUB' | 'LINEAR' | 'NOTION';
  currentMapping?: PropertyMapping;
}

export function PropertyMappingDialog({ endpointId, provider, currentMapping }: PropertyMappingDialogProps) {
  const [mappings, setMappings] = useState<FieldMapping[]>(currentMapping?.static_mappings || []);

  // Linear用のソースフィールド
  const linearSourceFields = [
    { value: 'id', label: 'Issue ID' },
    { value: 'identifier', label: 'Identifier (LIN-123)' },
    { value: 'title', label: 'Title' },
    { value: 'description', label: 'Description' },
    { value: 'state.name', label: 'Status' },
    { value: 'assignee.name', label: 'Assignee' },
    { value: 'priority', label: 'Priority' },
    { value: 'estimate', label: 'Estimate' },
    { value: 'due_date', label: 'Due Date' },
  ];

  // Repository properties（動的取得）
  const { data: properties } = useRepositoryProperties(repositoryId);

  return (
    <Dialog>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Property Mapping Configuration</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {mappings.map((mapping, idx) => (
            <div key={idx} className="flex gap-2">
              <Select value={mapping.source_field}>
                {linearSourceFields.map(field => (
                  <SelectItem value={field.value}>{field.label}</SelectItem>
                ))}
              </Select>
              <span>→</span>
              <Select value={mapping.target_property}>
                {properties.map(prop => (
                  <SelectItem value={prop.name}>{prop.display_name}</SelectItem>
                ))}
              </Select>
              <Button variant="ghost" size="sm" onClick={() => removeMapping(idx)}>
                <Trash className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button onClick={addMapping}>+ Add Mapping</Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={handleSave}>Save Mapping</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### リポジトリ設定画面統合

```typescript
// apps/library/src/app/v1beta/[org]/[repo]/settings/extensions/page.tsx

export default async function ExtensionsSettingsPage({ params }: PageProps) {
  const { org, repo } = params;

  // Webhook endpoints取得
  const endpoints = await fetchWebhookEndpoints(org, repo);
  const linearEndpoint = endpoints.find(e => e.provider === 'LINEAR');

  // Linear connection状態取得
  const linearConnection = await fetchLinearConnection(org);

  return (
    <div className="space-y-6">
      <div>
        <h2>GitHub Extension</h2>
        <GitHubExtensionSettings repo={repo} />
      </div>

      <div>
        <h2>Linear Extension</h2>
        {!linearConnection?.isConnected ? (
          <div>
            <p>Connect Linear to sync issues with this repository</p>
            <Button onClick={handleLinearOAuth}>
              <img src="/linear-icon.svg" />
              Connect Linear
            </Button>
          </div>
        ) : (
          <div>
            <LinearExtensionSettings
              repo={repo}
              endpoint={linearEndpoint}
              connection={linearConnection}
            />
          </div>
        )}
      </div>
    </div>
  );
}
```

## 実装ファイル一覧

### 変更ファイル

**バックエンド**:
- `packages/database/inbound_sync/src/providers/linear/data_handler.rs` - ext_linearプロパティ設定ロジック追加
- `apps/library-api/src/router.rs` - DI設定（既に完了）

**フロントエンド**:
- `apps/library/src/app/v1beta/[org]/[repo]/settings/extensions/page.tsx` - 新規作成
- `apps/library/src/components/integrations/linear-extension-settings.tsx` - 新規作成
- `apps/library/src/components/integrations/property-mapping-dialog.tsx` - 新規作成
- `apps/library/src/app/v1beta/[org]/[repo]/data/[dataId]/linear-sync-section.tsx` - 新規作成

### 新規ファイル

- `apps/library/src/app/v1beta/[org]/[repo]/settings/extensions/linear-settings.tsx`
- `apps/library/src/app/v1beta/[org]/[repo]/settings/extensions/actions.ts` - Server Actions

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| Linear API Rate Limit超過 | 中 | バックオフ実装済み、並列制限設定 |
| OAuth token期限切れ | 中 | Token refresh機能、エラー時の再認証フロー |
| Property Mapping設定ミス | 低 | デフォルトマッピング提供、プレビュー機能 |
| 大量Issue同期のタイムアウト | 中 | バックグラウンド処理、進捗表示 |

## 参考資料

### 既存実装
- `docs/src/tasks/completed/library-sync-engine/task.md` - inbound_sync基盤の実装タスク
- `docs/src/tasks/completed/library-v1.4.0/library-data-github-sync/task.md` - GitHub同期実装
- `docs/src/tasks/backlog/inbound-sync-api-pull/task.md` - API Pull機能の設計ドキュメント

### 技術仕様
- Linear GraphQL API: https://developers.linear.app/docs/graphql/working-with-the-graphql-api
- Linear Webhook Events: https://developers.linear.app/docs/graphql/webhooks

### 実装ファイル
- `packages/database/inbound_sync/src/providers/linear/` - Linear provider実装
- `packages/database/inbound_sync/domain/src/sync_operation.rs` - SyncOperation entity
- `apps/library/src/components/sync/` - 同期UIコンポーネント

## 完了条件

- [ ] Linear OAuth接続が動作する
- [ ] Initial Syncで既存IssuesがLibraryに取り込まれる
- [ ] ext_linearプロパティが自動生成される
- [x] Property Mappingが正しく適用される
- [x] Webhook自動同期が動作する（Linear issue更新 → Library data更新）
- [x] On-demand Pullが動作する（ボタンクリックで最新データ取得）
- [x] 同期履歴が表示される（SyncOperation log）
- [ ] コードレビューが完了
- [ ] 動作確認レポートが完成している
- [ ] Playwright MCPでE2Eテスト完了

### バージョン番号

**マイナーバージョン（library-v1.11.0）を上げる**:
- [x] 新機能の追加（Linear同期機能）
- [x] 新しいextension framework統合
- [x] 新しいUI画面追加（Settings > Extensions）

## 備考

### 既存のext_github同期との違い

| 項目 | ext_github | ext_linear |
|------|-----------|-----------|
| **同期方向** | Outbound（送信のみ） | Inbound + Bidirectional（受信 + 双方向） |
| **トリガー** | BulkSync usecase（手動実行） | Webhook + Initial Sync + On-demand Pull |
| **データソース** | GitHub repository files | Linear issues/projects |
| **Property管理** | JSON設定（repo, path, enabled） | JSON設定（issue_id, issue_url, sync_enabled） |
| **競合検出** | なし | version tracking（external_version, local_version） |
| **同期履歴** | なし | SyncOperation、webhook_events |

### 将来の拡張

- ext_hubspot: HubSpot CRM objects同期
- ext_stripe: Stripe products/customers同期
- ext_notion: Notion pages同期
- Bidirectional sync: Library → Linear への逆方向同期

### 進捗記録

- 2026-01-08: taskdoc作成、inbound_sync基盤完成済み確認
- 2026-01-09: Extension設定にTeam/Project選択・Mapping・Enable Sync・Initial Syncを統合
- 2026-01-09: データ詳細にLinear Syncセクション追加（Pull/URL/最終同期表示）
- 2026-01-09: linearListProjects追加、webhookEndpointsにrepositoryIdフィルタ対応
- 2026-01-09: Extensionsページ表示確認（Playwright）。スクリーンショット: `docs/src/tasks/in-progress/integrate-linear-sync-with-extension/screenshots/linear-sync-extensions.png`
- 2026-01-09: Linear OAuthログイン画面へ遷移を確認（Playwright）。スクリーンショット: `docs/src/tasks/in-progress/integrate-linear-sync-with-extension/screenshots/linear-oauth-login.png`
- 2026-01-09: Linear OAuth後のcallback画面で「Connected!」表示を確認（Playwright）。ただし console に `OAuth exchange error: ServiceUnavailable: OAuth token exchange failed` が出ており、Extensions画面は Not Connected のまま。スクリーンショット: `docs/src/tasks/in-progress/integrate-linear-sync-with-extension/screenshots/linear-oauth-callback-connected.png`
- 2026-01-09: OAuth callbackの二重実行を抑止し、orgのoperatorIdでtoken交換するよう修正。ExtensionsでConnected表示を確認。スクリーンショット: `docs/src/tasks/in-progress/integrate-linear-sync-with-extension/screenshots/linear-extensions-connected.png`
- 2026-01-09: Integrations詳細ページを確認したが、Access token有効期限の表示は見当たらず（要フォロー）。
- 2026-01-09: Linear teams/projects取得が `Linear is not connected` で失敗。library-apiのtoken参照先をinbound_sync OAuthTokenRepositoryに寄せる修正を実施（再起動後に再検証予定）。
- 2026-01-11: OAuth tokenをauth DBに永続化（`integration_oauth_tokens`追加・`SqlxStoredOAuthTokenRepository`導入）。マイグレーション後にLinear再接続し、ExtensionsでTeam/Project選択が表示されることを確認。library-api再起動後もConnected状態を維持して選択できることを確認。
- 2026-01-11: Repository Settingsの「連携」タブにLinear拡張設定を統合し、拡張タブは廃止（Playwrightで表示確認）。
- 2026-01-11: Linear拡張設定の文言をi18n化し、多言語表示に対応。
- 2026-01-12: 「同期を有効化」実行後もdata詳細のpropertiesが `id(System)` のみで、ext_linearセクションが表示されないことを確認。スクリーンショット: `docs/src/tasks/in-progress/integrate-linear-sync-with-extension/screenshots/linear-ext-linear-missing-20260112.png`
- 2026-01-12: library-api(50053)のGraphQLで `enableLinearSync` が `Unknown field` となり、`EnableLinearSyncInput` が未定義（実行中のschemaに未反映）であることを確認。ext_linearが作成されない原因候補として記録。
- 2026-01-12: 「同期を有効化」を再実行しても data 詳細のpropertiesは `id(System)` のみで、ext_linear が追加されないことを確認。スクリーンショット: `docs/src/tasks/in-progress/integrate-linear-sync-with-extension/screenshots/linear-ext-linear-missing-20260112-retry.png`
- 2026-01-12: library環境を `mise run up-library` で再起動後、再度「同期を有効化」を実行しても data 詳細のpropertiesは `id(System)` のみ。ext_linear 未表示を確認。スクリーンショット: `docs/src/tasks/in-progress/integrate-linear-sync-with-extension/screenshots/linear-ext-linear-missing-20260112-restart.png`
- 2026-01-12: 再起動後も GraphQL mutation `enableLinearSync` が `Unknown field`、`EnableLinearSyncInput` が未定義のまま（`http://localhost:50053/v1/graphql`）。schema未反映が継続。
- 2026-01-12: `docker compose ps` では `worktree3-library-api-1` の稼働時間が 14h のままで、`mise run up-library` ではコンテナ再作成/再起動されていない可能性がある。明示的な `docker compose restart library-api` も検討。
- 2026-01-12: 「同期を有効化」実行後、プロパティ画面の「システム拡張」に `ext_linear` が表示されることを確認（Playwright）。スクリーンショット: `docs/src/tasks/in-progress/integrate-linear-sync-with-extension/screenshots/linear-properties-ext-linear-20260112.png`
- 2026-01-12: Integrations画面でConnected/EnabledとSync Historyを再確認し、Initial Syncを再実行してCompleted（+0 / ~0 / -100、100/100 issues）を確認。スクリーンショット: `docs/src/tasks/in-progress/integrate-linear-sync-with-extension/screenshots/linear-integrations-20260112.png`, `docs/src/tasks/in-progress/integrate-linear-sync-with-extension/screenshots/linear-initial-sync-20260112.png`
- 2026-01-12: Property Mappingダイアログ表示を確認（保存/適用は未実施）。スクリーンショット: `docs/src/tasks/in-progress/integrate-linear-sync-with-extension/screenshots/linear-mapping-dialog-20260112.png`
- 2026-01-12: Data一覧で `ext_linear` 列を確認（値は `-` のまま）。スクリーンショット: `docs/src/tasks/in-progress/integrate-linear-sync-with-extension/screenshots/linear-data-list-20260112.png`
- 2026-01-12: Data詳細でLinear Syncセクション表示を確認（`ext_linear` 未設定のため Pull は未表示）。スクリーンショット: `docs/src/tasks/in-progress/integrate-linear-sync-with-extension/screenshots/linear-data-detail-20260112.png`
- 2026-01-12: 組織画面の「Linearからインポート」ダイアログで新規リポジトリ `linear-import-check-20260112-4` を作成し、作成後にリポジトリ画面へ遷移することを確認（データ2件）。スクリーンショット: `docs/src/tasks/in-progress/integrate-linear-sync-with-extension/screenshots/linear-import-check-20260112-4.png`
- 2026-01-12: Linearから全件インポート検証（Issues: 100選択）を実施し、`linear-import-check-20260112-all` を作成。
  - IntegrationsのSync Historyで Initial Sync 完了（100/100 issues）を確認（+0 / ~0 / -100）。
  - ただし Contents 画面は「Managing 2 data entries」のままで、100件の取り込み完了は未確認。
  - スクリーンショット: `docs/src/tasks/in-progress/integrate-linear-sync-with-extension/screenshots/linear-import-check-20260112-all-sync-history.png`, `docs/src/tasks/in-progress/integrate-linear-sync-with-extension/screenshots/linear-import-check-20260112-all-contents.png`
- 2026-01-12: Linear初回同期で `Data too long for column 'data_id'` が発生。`sync_states.data_id` が `VARCHAR(30)` だったため、`packages/database/inbound_sync/migrations/20260112010000_expand_sync_states_data_id` で `VARCHAR(64)` に拡張し、`mise run up-library` で適用。
- 2026-01-12: Linearから全件インポート検証を再実施（Issues: 100選択）し、`linear-import-check-20260112-all-4` を作成。
  - Sync Historyで On-demand PullがCompleted（+0 / ~100 / -）になったことを確認。
  - Contents 画面で「全 102 件のデータを管理しています。」を確認（100件 + 既存2件）。
  - スクリーンショット: `docs/src/tasks/in-progress/integrate-linear-sync-with-extension/screenshots/linear-import-check-20260112-all-4-sync-history.png`, `docs/src/tasks/in-progress/integrate-linear-sync-with-extension/screenshots/linear-import-check-20260112-all-4-content.png`
- 2026-01-13: Webhook用に公開URLが必要なため、`LIBRARY_API_BASE_URL` を公開URL（Cloudflare Tunnel）に設定してlibrary-apiを再起動。
- 2026-01-13: provider単位Webhookに向けて以下を実装。
  - `/webhooks/<provider>` 受信ルート追加（Linear）
  - organizationId → tenant → endpoint ルーティング
  - Linearのevent type抽出を `Issue/Project/...` に合わせて調整
  - Linear endpoint作成時のsecret共有（既存secretを再利用）
  - UIでsecret未表示時の案内文を追加
- 2026-01-13: LinearのWebhook Secretをprovider configに保存し、署名検証で使用するよう対応。
- 2026-01-15: Linear Issueタイトル更新（webhook test #4）でWebhook受信を確認。Cloudflare URLがNXDOMAINで到達できず、`webhook_events`は0件のまま。Tunnel URLの再設定が必要。
- 2026-01-15: 固定ホスト `library-webhook-dev.tachy.one` のCloudflare Tunnelを作成し、Linear webhook URLを更新。Issueタイトル更新（webhook test #5）で `webhook_events` に Issue/Attachment が記録され、署名検証も成功（Issueはpending）。
- 2026-01-16: PlaywrightでProperty Mapping保存/反映、On-demand Pull、Webhook更新（Todo変更）を確認。Last syncedはUI再読み込みで反映されることを確認。
- 2026-01-16: Linear Syncセクションに自動リフレッシュ（15秒間隔、編集中は停止）とPull後の追従リフレッシュを追加。
- 2026-01-15: Webhook処理が `sync_states.data_id` 長不足で失敗していたため、library-apiのmigrationsに `20260115000000_expand_sync_states_data_id` を追加しVARCHAR(64)へ拡張。Issue更新（webhook test #6）で `webhook_events` のIssueが completed になり、Webhook処理が通ることを確認。
- 2026-01-15: Playwrightで `linear-sync` のTable表示を確認。Issueタイトルが「webhook test 2026-01-15 #5」のままで、#6の反映を確認できず。スクリーンショット: `docs/src/tasks/in-progress/integrate-linear-sync-with-extension/screenshots/library-linear-sync-table.png`
- 2026-01-15: Linear Issueタイトルを「webhook test 2026-01-15 #7」に更新し、Webhook Issueイベントがcompletedになることを確認。DB上で data_01kf0wxds0k275yr5crgdjzneg が #7 に更新され、PlaywrightでContents一覧に #7 が反映されることを確認。スクリーンショット: `docs/src/tasks/in-progress/integrate-linear-sync-with-extension/screenshots/library-linear-sync-list-20260115-webhook-7.png`
- 2026-01-16: #5 の重複データは `sync_states.data_id` 長不足（Data too long for column 'data_id'）でWebhook処理が失敗→リトライ時に新規dataが作成されたことが原因。migration適用後に正常化し、現在のsync_stateは data_01kf0wxds0k275yr5crgdjzneg のみ。重複は残存（data_01kf0whb65vr5nqh3fmdp5d3ys / data_01kf0wk64g36kyg5peq189gfe7 / data_01kf0wpxm8crz00v8ap7gxeszd）。
- 2026-01-16: sync_state欠損時に ext_linear.issue_id で既存dataを探索するフォールバックを追加し、同一Issueの重複作成を抑止。
- 2026-01-16: Linear Issueタイトルを「webhook test 2026-01-16 #8」に更新し、Webhook Issueイベントがcompletedになることを確認。data件数は増加せず（4件のまま）、data_01kf0wxds0k275yr5crgdjzneg が #8 に更新。
- 2026-01-16: 重複data（data_01kf0whb65vr5nqh3fmdp5d3ys / data_01kf0wk64g36kyg5peq189gfe7 / data_01kf0wpxm8crz00v8ap7gxeszd）を削除し、Issue該当dataは1件に整理。
- 2026-01-16: Linear Issueのステータスを Todo → In Progress に変更し、Webhook処理後のデータ反映を確認。自動リフレッシュ（15秒間隔）は反映せず、手動再読み込みで status / Last synced が更新された。スクリーンショット: `docs/src/tasks/in-progress/integrate-linear-sync-with-extension/screenshots/library-linear-sync-auto-refresh-20260116.png`
- 2026-01-16: On-demand Pull実行後、同期履歴に「Completed On-demand Pull」が追加されることを確認。
- 2026-01-16: DataDetailUiでdata props更新時に `currentDataItem` を同期するuseEffectを追加し、自動リフレッシュでUIへ反映されるように修正。
- 2026-01-16: Linear Issueを Todo → In Progress に変更後、Libraryの自動リフレッシュで status/Last synced が更新されることを確認。スクリーンショット: `docs/src/tasks/in-progress/integrate-linear-sync-with-extension/screenshots/library-linear-sync-auto-refresh-fixed-20260116.png`
- 2026-01-16: 別Issue（CC-394）でも Todo → In Progress の変更が自動リフレッシュで反映されることを確認。スクリーンショット: `docs/src/tasks/in-progress/integrate-linear-sync-with-extension/screenshots/library-linear-sync-auto-refresh-fixed-cc-394-20260116.png`
- codex: codex resume 019ba5af-04df-7383-8e9e-8aee9ed6ea10
