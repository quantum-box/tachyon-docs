---
title: Linearからリポジトリへのインポート機能
type: feature
emoji: "📥"
topics:
  - Library
  - Linear
  - Import
published: false
targetVersion: library-v1.11.0
---

# Linearからリポジトリへのインポート機能

## 概要

Linear IssuesをLibraryリポジトリとして一括インポートする機能を実装。既存の「GitHubからインポート」と同様に、組織ページから「Linearからインポート」ボタンでLinear Projectまたは選択したIssuesをリポジトリ化する。

## Sync機能との関係

- **Importは導入フロー**（新規リポジトリ作成まで）。
- **Syncは運用フロー**（作成後の継続同期・設定・履歴）。
- インポート完了後は **Settings > Extensions** に誘導し、  
  Linear同期の詳細設定・運用を行う。

> syncの詳細は `docs/src/tasks/in-progress/integrate-linear-sync-with-extension/task.md` を参照。

## 背景・目的

### 現状
- ✅ Linear OAuth認証が動作
- ✅ Linear API Pull機能実装済み（InitialSync、OnDemandPull）
- ✅ ext_linearプロパティ自動生成
- ✅ LinearインポートUI/Server Actionのベース実装（Team選択 + repo作成 + webhook作成 + initial sync）
- ❌ Issues選択 / Project選択 / Property Mapping / 進捗UIが未実装
- ❌ **バックエンドがNoOp実装のままで、実データがLibraryに保存されない**

### 期待される成果
- ✅ **「Linearからインポート」ボタン1つでリポジトリ作成＋Issues同期**
- ✅ Linear Project/Team単位でインポート
- ✅ 選択したIssuesだけをインポート
- ✅ GitHubインポートと同様のUX

## 詳細仕様

### 機能要件

#### 1. Linearからインポートボタン

組織ページ（`/v1beta/[org]`）のリポジトリセクション：
```
┌─────────────────────────────────────────┐
│ リポジトリ                    [検索]     │
│ [GitHubからインポート] [Linearからインポート] [新規作成] │
└─────────────────────────────────────────┘
```

#### 2. インポートダイアログのステップ

**Step 1: Team/Project選択**
- Linear接続状態確認（未接続なら「Connect Linear」表示）
- Team一覧表示（Linear API: `teams` query）
- Project一覧表示（オプション、Team選択後）
- 「すべてのIssues」または「Project内のIssues」選択

**Step 2: Issues選択**
- 選択したTeam/ProjectのIssues一覧表示
- チェックボックスで複数選択
- プレビュー表示（identifier、title、status、assignee）
- 全選択/全解除ボタン

**Step 3: リポジトリ設定**
- リポジトリ名（デフォルト: Team名またはProject名）
- 説明（デフォルト: Project description）
- プロパティマッピング設定
  - Linear issue → Library property
  - 自動検出されたフィールドから選択

**Step 4: インポート実行**
- リポジトリ作成
- Webhook Endpoint作成
- Initial Sync実行（選択したIssuesのみ）
- 進捗表示
- 完了後、リポジトリページにリダイレクト

#### 3. プロパティマッピング

**デフォルトマッピング**:
```yaml
linear_mappings:
  - source: identifier
    target: identifier
    type: text
  - source: title
    target: title
    type: text
  - source: description
    target: description
    type: markdown
  - source: state.name
    target: status
    type: select
  - source: assignee.name
    target: assigned_to
    type: text
  - source: priority
    target: priority
    type: number
  - source: labels
    target: tags
    type: tags
```

#### 4. ext_linearプロパティ自動設定

インポート時に各データアイテムに自動設定：
```json
{
  "issue_id": "abc-123",
  "issue_url": "https://linear.app/...",
  "identifier": "ENG-42",
  "sync_enabled": true,
  "last_synced_at": "2026-01-08T...",
  "version_external": "2026-01-08T..."
}
```

### 非機能要件

- **パフォーマンス**: 100 issues/分以上
- **UX**: GitHubインポートと統一されたUI/UX
- **エラーハンドリング**: 部分失敗を許容

## 実装方針

### アーキテクチャ

**既存資産の活用**:
- ✅ LinearApiPullProcessor（完成済み）
- ✅ InitialSync usecase
- ✅ ext_linear プロパティ生成ロジック
- ✅ GitHubImportDialogのUIパターン

**新規実装**:
- LinearImportDialog コンポーネント
- Linear Teams/Projects取得API
- リポジトリ作成＋Initial Sync統合処理

### データフロー

```
User: "Linearからインポート"ボタンクリック
  ↓
Step 1: Team/Project選択
  ├─ Linear接続確認
  ├─ Linear API: teams query
  └─ Linear API: projects query
  ↓
Step 2: Issues選択
  └─ Linear API: list_issues(team_id, project_id)
  ↓
Step 3: リポジトリ設定
  ├─ リポジトリ名入力
  ├─ プロパティマッピング設定
  └─ 確認
  ↓
Step 4: インポート実行
  ├─ Repository作成（GraphQL mutation）
  ├─ Webhook Endpoint作成（createWebhookEndpoint mutation）
  ├─ Initial Sync実行（startInitialSync mutation）
  └─ 選択したIssuesのみ同期（triggerSync mutation / external_ids指定）
  ↓
完了: リポジトリページにリダイレクト ✅
```

## タスク分解

### Phase 1: Linear Import Dialog UI
- [x] LinearImportDialog コンポーネント作成
- [x] Step 1: Team選択UI（Linear Teams取得）
- [x] Step 1: Project選択UI
- [x] Step 2: Issues選択UI
- [x] Step 3: リポジトリ設定UI（名称入力のみ）
- [x] Step 3: プロパティマッピング設定
- [x] Step 4: 進捗表示UI

### Phase 2: Server Actions
- [x] listLinearTeams() - Team一覧取得（linearListTeams query）
- [x] listLinearProjects() - Project一覧取得
- [x] listLinearIssues() - Issues一覧取得
- [x] createLinearRepository() - リポジトリ作成
- [x] createLinearWebhookEndpoint() - Webhook作成 + Mapping保存
- [x] startLinearSync() - Issue同期（triggerSync / startInitialSync）

### Phase 3: 統合
- [x] 組織ページに「Linearからインポート」ボタン追加
- [x] GitHubインポートボタンと並べて配置

### Phase 4: テスト
- [x] Playwright MCPで動作確認
- [x] Team選択 → インポート実行

### Phase 5: 実データ取り込み（バックエンド連携）
- [x] LibraryDataRepository 実装（repo_id → database_id 解決、property自動追加、data作成/更新/削除）
- [x] OAuthLinearClient 実装（AuthAppTokenProviderでアクセストークン取得）
- [x] router で Linear の client/data handler を実装に切り替え
- [x] Playwright MCPで再確認（プロパティ/データが生成されること）

### 実装状況メモ
#### 2026-01-12
- Playwrightで再確認したが、LinearのIntegration詳細で「Last Synced: Never」を確認
- `linear-import-check-20260111-3` のデータ一覧で `content` が全件「-」のまま（実データ未取り込み）
- スクリーンショット: `docs/src/tasks/completed/library-v1.11.0/linear-import-to-repository/screenshots/playwright-linear-integration-status.png`, `docs/src/tasks/completed/library-v1.11.0/linear-import-to-repository/screenshots/playwright-linear-import-data-empty-content.png`
- Linear importを実行し、`linear-import-check-20260112-1` / `linear-import-check-20260112-2` のリポジトリが作成された（各2件のデータあり）
- `linear-import-check-20260112-2` の data1 詳細では properties が `id(System)` のみで、本文が `write here` のプレースホルダーのまま（Linearの内容が反映されていない）
- スクリーンショット: `docs/src/tasks/completed/library-v1.11.0/linear-import-to-repository/screenshots/playwright-linear-import-20260112-data1.png`
- 「Select specific issues」ONでIssues一覧（100件）が表示されることを再確認
- スクリーンショット: `docs/src/tasks/completed/library-v1.11.0/linear-import-to-repository/screenshots/linear-import-issues-list-20260112.png`
- codegen後もIssues一覧（100件）が表示されることを再確認
- スクリーンショット: `docs/src/tasks/completed/library-v1.11.0/linear-import-to-repository/screenshots/linear-import-issues-list-20260112-codegen.png`
- Linearインポートダイアログの文言をi18n化（en/ja追加）し、未翻訳文言を解消
- Linear全件インポートを実行し、リポジトリ `linear-import-all-20260112` を作成（Issue数: 100件選択）
- 取り込み完了後のデータ数: 102件（ページ数: 6）
- スクリーンショット: `docs/src/tasks/completed/library-v1.11.0/linear-import-to-repository/screenshots/linear-import-all-20260112-content.png`
- 同期履歴のOn-demand Pullで `+0 ~100` を確認（同期履歴UIは更新待ちの可能性あり）
- スクリーンショット: `docs/src/tasks/completed/library-v1.11.0/linear-import-to-repository/screenshots/linear-import-all-20260112-integrations.png`
- 権限付与後の再確認でも「Select specific issues」ONでIssues一覧（100件）が表示されることを確認
- スクリーンショット: `docs/src/tasks/completed/library-v1.11.0/linear-import-to-repository/screenshots/linear-issues-100-20260112.png`
- `sync_states.data_id` の長さ不足を解消後、`linear-import-check-20260112-all-4` を作成して全件インポートを再実行
  - Sync Historyで On-demand Pull が Completed（+0 / ~100 / -）になったことを確認
  - Contents 画面で「全 102 件のデータを管理しています。」を確認
  - スクリーンショット: `docs/src/tasks/in-progress/integrate-linear-sync-with-extension/screenshots/linear-import-check-20260112-all-4-sync-history.png`, `docs/src/tasks/in-progress/integrate-linear-sync-with-extension/screenshots/linear-import-check-20260112-all-4-content.png`

#### 2026-01-09
- ダイアログは「チーム選択 + リポジトリ名入力」の簡易フロー
- Issues選択 / Project選択 / Mapping / 進捗表示は未実装
- インポートは repo作成 → Linear webhook endpoint作成 → initial sync を実行

#### 2026-01-10
- Team/Project選択とIssue選択UIを追加（ステップフロー化）
- linearListIssues GraphQLを追加しIssue一覧取得を実装
- Issue選択時は triggerSync（external_ids）で同期、未選択時は startInitialSync を利用
- tenantId（operatorId）を明示的に渡すよう統一
- Linear Import Dialog のStorybookを追加
- プロパティマッピングUIとWebhook mapping送信を追加
- インポート進捗UIを段階表示に更新

#### 2026-01-12
- Playwright動作確認時、Issues取得でエラー発生
  - エラー: `Failed to parse Linear response`（issues一覧が0件扱い）
  - 「Select specific issues」ONでNextすると取得失敗ログが出る
  - Team/Projectのドロップダウン表示と選択自体は問題なし
- Linearレスポンスのパース処理を改善後、Issues一覧（100件）が表示されることを確認

## 参考資料

### 既存実装
- `apps/library/src/app/v1beta/[org]/_components/github-import-dialog.tsx` - GitHubインポートUI
- `packages/database/inbound_sync/src/providers/linear/api_pull_processor.rs` - Linear API Pull処理
- `packages/database/inbound_sync/src/usecase/initial_sync.rs` - Initial Sync usecase

### Linear API
- Teams query
- Projects query
- Issues query

## 完了条件

- [x] 「Linearからインポート」ボタンが表示される
- [x] Linear接続がある場合、Team選択画面が表示される
- [x] Project選択画面が表示される
- [x] Issues一覧が表示され、選択できる
- [ ] リポジトリ名、プロパティマッピング設定ができる
- [x] インポート実行でリポジトリが作成される
- [x] ext_linearプロパティが設定される
- [x] Playwright MCPで動作確認完了
