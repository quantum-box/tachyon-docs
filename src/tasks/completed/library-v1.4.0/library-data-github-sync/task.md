---
title: "ライブラリデータをFrontmatter MarkdownとしてGitHub同期"
type: feature
emoji: "📚"
topics:
  - library
  - markdown
  - github
  - sync
published: true
targetFiles:
  - apps/library
  - packages/library
  - scripts/library-sync
ext_github:
  repo: quantum-box/tachyon-apps
  path: docs/src/tasks/feature/library-data-github-sync/task.md
---

# ライブラリデータをFrontmatter MarkdownとしてGitHub同期

## 概要

ライブラリサービスのデータ（コンテンツ・メタデータ）をFrontmatter付きMarkdownへエクスポートし、データ単位で出力先ディレクトリを指定したうえでGitHubへ同期できる仕組みを整える。GitHub上にMarkdownソースを保存することで、バージョン管理・レビュー・配布を容易にする。

## 背景・目的

- ライブラリデータをGitHubで管理し、レビューや変更履歴を透明化したい。
- 現状はデータとストレージが分離しており、編集フローが属人化している。
- Frontmatter付きMarkdownに落とし込むことで、他ツールとの連携（Docs/Site Generator等）を簡便にしたい。
- データごとに保存先ディレクトリを柔軟に選べるようにし、用途別の管理（例: 公開用/内部用）を可能にしたい。

## 詳細仕様

### 機能要件

1. ライブラリデータをFrontmatter付きMarkdownへ変換するエクスポート機能を提供する。
2. 各データに対し、GitHub上の保存ディレクトリを指定可能にする（デフォルトパスと上書き可）。
3. 必須Frontmatterフィールド（例: `id`, `title`, `summary`, `tags`, `source`, `updatedAt`, `directory`）を定義し、欠落時はエラーとする。
4. 変換結果をローカルに生成し、GitHubリポジトリへコミット/プッシュできる同期フローを用意する（手動/自動トリガー選択）。
5. 既存ファイルとの差分検出を行い、不要な変更がコミットされないようにする（idempotentな出力）。
6. データごとのディレクトリ指定が無い場合はカテゴリベースの標準パスへ配置する。
7. フロントマターと本文をテンプレート化し、将来のフィールド追加に対応できるようにする。
8. GitHub同期設定はFrontmatter拡張フィールド`ext_github`で表現する。prefixは`ext_`とし、以下構造を持つ:
   ```yaml
   ext_github:
     repo: quantum-box/tachyon-apps        # GitHubリポジトリ（必須）
     path: docs/src/tasks/feature/library-data-github-sync/task.md  # 対象パス（必須）
   ```
   - 追加の拡張設定も `ext_<name>` プレフィックスで増設し、パース時に拡張領域として扱う。
9. `ext_` プレフィックスは拡張予約語とし、通常プロパティでは使用不可。拡張として許可されたキーのみ受理し、それ以外の `ext_` で始まるフィールドが存在する場合はバリデーションエラーとする。

### 非機能要件

- 同期処理はリポジトリを汚さないこと（dry-run/差分プレビューを提供）。
- 5分以内にエクスポート・差分作成が完了するパフォーマンス。
- 実行ログを保存し、失敗時に原因を特定できること。
- GitHubトークン等の秘匿情報は環境変数で扱い、リポジトリに含めない。
- CI/CDからも実行可能なコマンド/タスク化（`mise run ...` 想定）。

### コンテキスト別の責務

- library（データソース）: データ取得API/モデルの提供、フィールドバリデーション。
- sync/cli（同期レイヤー）: Markdown生成、ディレクトリ解決、差分計算、GitHub push。
- infra/ci: 定期実行や手動トリガーのワークフロー定義。

## 仕様のYAML定義（サンプル）

```yaml
frontmatter:
  required:
    - id
    - title
    - summary
    - tags
    - updatedAt
  optional:
    - source
    - directory
    - category
output:
  default_dir: "content/library"
  per_data_dir: true   # データごとに上書き可能
github:
  repo: "quantum-box/tachyon-apps"
  branch: "main"
  commit_message: "chore(library): sync library data to markdown"
```

## 実装方針

- エクスポート: ライブラリデータ取得用の既存API/DBアクセスをラップしたエクスポータを作成し、FrontmatterテンプレートでMarkdown化する。
- ディレクトリ解決: データが持つ`directory`指定を優先し、無い場合はカテゴリ→デフォルトパスの順に決定するロジックをユーティリティ化。
- 同期: 生成物を一時ディレクトリに出力し、差分比較後にGitHubへコミット。将来のCI対応を見据え、`mise run library-sync` のようなタスクを追加する。
- テンプレート: frontmatterテンプレートと本文テンプレートをファイル化し、将来的な項目追加を容易にする。
- 冪等性: 同一データで再実行しても差分ゼロになるよう、フィールド順と改行規約を固定化する。

## 実装完了状況 (2025-12-04)

### ✅ バックエンド (Rust)
- `apps/library-api/src/handler/data.rs`:
  - `compose_markdown()`: データをFrontmatter付きMarkdownに変換
  - `extract_ext_github()`: `ext_github` プロパティからGitHub設定を抽出
  - `build_frontmatter()`: `ext_` プレフィックスのプロパティをYAML展開
- `apps/library-api/src/handler/graphql/mutation.rs`:
  - `add_data`, `update_data`: データ保存時に `ext_github` があれば自動同期
- `packages/database_sync/`: 同期エンジン
  - `SyncProvider` トレイト: 汎用同期インターフェース
  - `GitHubSyncProvider`: GitHub Contents API経由でファイル操作
  - `SyncDataInputPort`: ユースケース層

### ✅ フロントエンド (TypeScript/React)
- `apps/library/src/app/v1beta/_components/data-detail-ui/ext-github-editor.tsx`:
  - `ExtGithubEditor`: `ext_github` プロパティ専用エディタ
  - リポジトリ選択、パス入力、有効/無効トグル
- `apps/library/src/app/v1beta/_components/data-detail-ui/property-value/index.tsx`:
  - `ext_github` プロパティを特別扱いしてカスタムUIで表示
- `apps/library/src/app/v1beta/_components/properties-ui/github-repos-editor.tsx`:
  - `GitHubReposEditorDialog`: `ext_github_repos` 設定ダイアログ
  - Properties画面で同期先リポジトリを管理
- `apps/library/src/app/v1beta/_components/properties-ui/index.tsx`:
  - `ext_github_repos` を特別扱いして専用UIを表示

### ✅ 認証・設定
- GitHub Apps認証 (User Access Token Flow)
- IAC設定: `scripts/seeds/n1-seed/003-iac-manifests.yaml` にGitHub App設定
- OAuth関連アクション: `scripts/seeds/n1-seed/008-auth-policies.yaml`

### 動作確認済み
- データ保存時に `ext_github` 設定に基づいて自動同期
- GitHub上にFrontmatter付きMarkdownが正しくコミットされる
- `ext_github:` セクションがYAMLとして正しく展開される

## TDD（テスト駆動開発）戦略

- エクスポートユニットテスト: データ→Frontmatter Markdown変換のスナップショットテスト。
- ディレクトリ解決テスト: `directory`指定あり/なし、カテゴリ別の解決パスをテーブルドリブンで検証。
- 同期テスト: モックGitリポジトリ上で差分の最小化とコミットメッセージ生成を確認。
- エラーハンドリング: 必須フィールド欠落・GitHub接続失敗時の挙動をテスト。

## タスク分解

- [x] 要件定義の明確化（frontmatter項目・ディレクトリ命名規則・同期トリガー）
- [x] 技術調査（既存ライブラリデータ取得方法、GitHub連携方法、テンプレート管理）
- [x] 実装（エクスポートロジック、ディレクトリ解決、同期コマンド、テンプレート）✅
- [x] 動作確認（Playwright MCP による E2E テスト）✅
- [ ] ドキュメント更新（利用手順、環境変数、CIジョブ追加時の手順）📝 将来タスク

## 技術調査結果

### 既存実装（Rust側 - メイン実装）
- **`apps/library-api/src/handler/data.rs`** にFrontmatter付きMarkdown生成の基礎実装あり
  - `build_frontmatter()`: プロパティからFrontmatter生成（YAML形式）
  - `pick_body()`: Markdown/HTML本文抽出（contentプロパティ優先）
  - `compose_markdown()`: 完成形Markdown生成
  - `view_data_markdown` エンドポイント: `/v1beta/repos/{org}/{repo}/data/{data_id}/md`

### 既存実装（TypeScript側 - クライアントプレビュー用）
- `apps/library/src/app/v1beta/_lib/markdown-export.ts`
  - クライアントサイドでのプレビュー表示用
  - `ext_github` 拡張フィールドの型定義とバリデーション実装済み

### データモデル
- `Data`: id, tenantId, databaseId, name, propertyData[], createdAt, updatedAt
- `Repo`: id, organizationId, orgUsername, name, username, description, isPublic, databases[], tags[]
- `Source`: id, repoId, name, url

### 実装方針
1. **Rust側（library-api）でGitHub同期処理を実装**（メイン）
   - GitHub OAuthトークン管理
   - GitHub Contents API呼び出し
   - 同期usecase実装
2. `ext_github`拡張フィールドをRust側Frontmatter生成に追加
3. TypeScript側は認証UIとステータス表示を担当

## Playwright MCPによる動作確認

- 本タスクではUI変更が発生する場合のみ追加。現時点では未定。必要に応じてチェックリストを追加する。

## スケジュール

- 詳細設計完了目安: 1営業日
- 実装 & テスト: 1〜2営業日（データ件数と同期範囲に依存）

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| GitHubアクセストークン漏洩 | 高 | 環境変数と`.env.sample`整備、権限最小化、CIシークレット管理 |
| 差分肥大化（改行/順序揺れ） | 中 | フォーマッタを固定し、出力順を決め打ちする |
| ディレクトリ指定ミスによる上書き | 中 | 事前バリデーションとdry-runでパスを一覧表示する |
| エクスポート対象の拡大による性能劣化 | 低 | ページング処理と差分のみ同期の設計 |

## 参考資料

- `docs/src/tasks/template.md`
- GitHub Contents API / git CLI 同期パターン調査メモ（別途作成予定）

## 完了条件

- [x] Frontmatter付きMarkdownへのエクスポートがデータ単位で実行できる ✅
- [x] データごとの保存ディレクトリを指定できる ✅ (`ext_github.path` で指定)
- [x] GitHubへの同期フロー（dry-run含む）が動作する ✅
- [x] ext_ プレフィックスは予約語としてバリデーションされる ✅
- [x] Settings > Integrations で GitHub Sync を有効化/無効化できる ✅
- [ ] 利用手順ドキュメントが更新されている 📝 将来タスク

---

## 実装計画（UI側GitHub認証 + Rust側同期）

### アーキテクチャ概要

```
┌────────────────────┐     ┌──────────────────────┐     ┌────────────────────┐
│   Library UI       │     │   library-api        │     │   External APIs    │
│   (Next.js)        │     │   (Rust/axum)        │     │                    │
├────────────────────┤     ├──────────────────────┤     ├────────────────────┤
│                    │     │                      │     │                    │
│ 1. Provider OAuth  │────▶│ 2. Token Exchange    │────▶│ OAuth Endpoints    │
│    Connect Button  │     │    & Storage         │     │ (GitHub/GitLab/etc)│
│                    │     │                      │     │                    │
│ 3. Sync Trigger    │────▶│ 4. Sync Engine       │────▶│ Contents APIs      │
│    (per data)      │     │    (database_sync)   │     │ (GitHub/GitLab/S3) │
│                    │     │                      │     │                    │
│ 5. Status Display  │◀────│ 6. Sync Status       │     │                    │
│                    │     │    Management        │     │                    │
└────────────────────┘     └──────────────────────┘     └────────────────────┘

                           ┌──────────────────────────────────────────────────┐
                           │ packages/database_sync (新規サブコンテキスト)     │
                           ├──────────────────────────────────────────────────┤
                           │ domain/                                          │
                           │   sync_config.rs     - 同期設定エンティティ      │
                           │   sync_result.rs     - 同期結果                  │
                           │   sync_provider.rs   - プロバイダートレイト      │
                           │                                                  │
                           │ usecase/                                         │
                           │   sync_data.rs       - データ同期                │
                           │   configure_sync.rs  - 同期設定管理              │
                           │                                                  │
                           │ providers/                                       │
                           │   github.rs          - GitHub Contents API       │
                           │   gitlab.rs          - GitLab Files API          │
                           │   bitbucket.rs       - Bitbucket API             │
                           │   s3.rs              - AWS S3                    │
                           │   (将来拡張可能)                                  │
                           └──────────────────────────────────────────────────┘
```

### 設計方針：database_sync サブコンテキスト

database context（packages/database）のサブコンテキストとして `packages/database_sync` を新規作成し、プロバイダー抽象化により複数の同期先に対応可能な設計とする。

**メリット:**
1. **再利用性**: library-api以外のアプリでも同期機能を使える
2. **拡張性**: プロバイダートレイトで後からGitLab、S3等を追加可能
3. **関心の分離**: データ管理（database_manager）と同期ロジックを分離しつつ、関連性を保つ
4. **テスト容易性**: プロバイダーをモックして同期ロジックを単体テスト可能

### Phase 0: database_sync サブコンテキスト作成

#### 0.1 新規クレート作成: `packages/database_sync`

```
packages/database_sync/
├── Cargo.toml
├── domain/
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs
│       ├── sync_config.rs      # 同期設定エンティティ
│       ├── sync_result.rs      # 同期結果
│       └── sync_provider.rs    # プロバイダートレイト
├── src/
│   ├── lib.rs
│   ├── usecase/
│   │   ├── mod.rs
│   │   ├── sync_data.rs        # データ同期usecase
│   │   └── configure_sync.rs   # 同期設定管理
│   ├── interface_adapter/
│   │   ├── mod.rs
│   │   └── gateway/
│   │       └── sqlx_sync_config_repository.rs
│   └── providers/
│       ├── mod.rs
│       ├── github.rs           # GitHub Contents API
│       ├── gitlab.rs           # GitLab Files API (将来)
│       └── s3.rs               # AWS S3 (将来)
└── migrations/
    └── YYYYMMDD_sync_configs.up.sql
```

#### 0.2 プロバイダートレイト設計

```rust
// packages/database_sync/domain/src/sync_provider.rs
use async_trait::async_trait;
use std::fmt::Debug;

/// 同期先プロバイダーの抽象トレイト
/// GitHub, GitLab, S3, CRM (HubSpot, Salesforce) 等を共通インターフェースで扱う
#[async_trait]
pub trait SyncProvider: Send + Sync + Debug {
    /// プロバイダー名 (github, gitlab, s3, hubspot 等)
    fn provider_name(&self) -> &'static str;
    
    /// プロバイダーの種類
    fn provider_type(&self) -> ProviderType;
    
    /// データ取得（存在しない場合はNone）
    async fn get_data(
        &self,
        auth: &SyncAuth,
        target: &SyncTarget,
    ) -> errors::Result<Option<RemoteData>>;
    
    /// データ作成または更新
    async fn put_data(
        &self,
        auth: &SyncAuth,
        target: &SyncTarget,
        data: &SyncPayload,
    ) -> errors::Result<SyncResult>;
    
    /// データ削除
    async fn delete_data(
        &self,
        auth: &SyncAuth,
        target: &SyncTarget,
    ) -> errors::Result<SyncResult>;
    
    /// 同期先の存在確認
    async fn exists(
        &self,
        auth: &SyncAuth,
        target: &SyncTarget,
    ) -> errors::Result<bool> {
        Ok(self.get_data(auth, target).await?.is_some())
    }
}

/// プロバイダーの種類
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProviderType {
    /// Git系 (GitHub, GitLab, Bitbucket)
    GitRepository,
    /// オブジェクトストレージ (S3, GCS, Azure Blob)
    ObjectStorage,
    /// CRM (HubSpot, Salesforce)
    Crm,
    /// その他
    Other,
}

/// 認証情報（プロバイダーごとに解釈が異なる）
#[derive(Debug, Clone)]
pub struct SyncAuth {
    pub access_token: String,
    pub refresh_token: Option<String>,
    /// API Key認証用（一部プロバイダー向け）
    pub api_key: Option<String>,
}

/// 同期先の指定（プロバイダーごとに解釈が異なる）
#[derive(Debug, Clone)]
pub struct SyncTarget {
    /// コンテナ名
    /// - Git: "owner/repo"
    /// - S3: "bucket-name"
    /// - CRM: "contacts", "deals", "products" 等のオブジェクトタイプ
    pub container: String,
    
    /// リソースパス/ID
    /// - Git: "docs/content/article.md"
    /// - S3: "path/to/object.json"
    /// - CRM: レコードID or None（新規作成時）
    pub resource: Option<String>,
    
    /// バージョン/ブランチ/タグ（オプション）
    pub version: Option<String>,
}

/// 同期ペイロード
#[derive(Debug, Clone)]
pub struct SyncPayload {
    /// コンテンツ（文字列）
    pub content: String,
    /// コンテンツタイプ (text/markdown, application/json 等)
    pub content_type: String,
    /// メタデータ（コミットメッセージ、CRMプロパティ等）
    pub metadata: SyncMetadata,
}

/// 同期メタデータ
#[derive(Debug, Clone, Default)]
pub struct SyncMetadata {
    /// Git: コミットメッセージ
    pub message: Option<String>,
    /// CRM: プロパティマップ
    pub properties: Option<serde_json::Value>,
}

/// リモートデータ情報
#[derive(Debug, Clone)]
pub struct RemoteData {
    /// 一意識別子（SHA, ETag, レコードID等）
    pub id: String,
    /// コンテンツ
    pub content: String,
    /// コンテンツタイプ
    pub content_type: Option<String>,
    /// サイズ（バイト）
    pub size: Option<u64>,
    /// 最終更新日時
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// 同期結果
#[derive(Debug, Clone)]
pub struct SyncResult {
    /// 成功したか
    pub success: bool,
    /// 結果ID（コミットSHA, レコードID等）
    pub result_id: Option<String>,
    /// URL（あれば）
    pub url: Option<String>,
    /// 差分（dry-run時）
    pub diff: Option<String>,
}
```

#### 0.3 同期設定ドメインモデル

```rust
// packages/database_sync/domain/src/sync_config.rs
use chrono::{DateTime, Utc};
use value_object::{DataId, TenantId};

/// 同期設定エンティティ
#[derive(Debug, Clone)]
pub struct SyncConfig {
    pub id: SyncConfigId,
    pub tenant_id: TenantId,
    pub data_id: DataId,
    pub provider: String,          // "github", "gitlab", "s3", "hubspot"
    pub target: SyncTarget,        // 同期先の指定
    pub status: SyncStatus,
    pub last_synced_at: Option<DateTime<Utc>>,
    pub last_result_id: Option<String>,  // コミットSHA, レコードID等
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SyncStatus {
    NeverSynced,
    Synced,
    Pending,
    Failed(String),
}

/// 同期設定リポジトリ
#[async_trait]
pub trait SyncConfigRepository: Send + Sync + Debug {
    async fn save(&self, config: &SyncConfig) -> errors::Result<()>;
    async fn find_by_data_id(&self, data_id: &DataId) -> errors::Result<Option<SyncConfig>>;
    async fn find_by_tenant_and_provider(
        &self,
        tenant_id: &TenantId,
        provider: &str,
    ) -> errors::Result<Vec<SyncConfig>>;
    async fn delete(&self, id: &SyncConfigId) -> errors::Result<()>;
}
```

### Phase 1: GitHub OAuthプロバイダー実装

#### 1.1 新規パッケージ作成: `packages/providers/github`

```rust
// packages/providers/github/src/lib.rs
pub struct GitHub {
    oauth: Option<OAuthConfig>,
}

impl OAuthProvider for GitHub {
    fn provider_name(&self) -> &'static str { "github" }
    fn authorization_url(&self, scope: &[&str], state: &str) -> Result<String>;
    async fn exchange_token(&self, code: &str) -> Result<OAuthToken>;
    async fn refresh_token(&self, refresh_token: &str) -> Result<OAuthToken>;
}
```

**GitHub OAuth必要スコープ:**
- `repo` - リポジトリへの読み書きアクセス
- `read:user` - ユーザー情報取得

#### 1.2 GitHub SyncProvider 実装

```rust
// packages/database_sync/src/providers/github.rs
use crate::domain::{
    ProviderType, RemoteData, SyncAuth, SyncPayload, SyncProvider, SyncResult, SyncTarget,
};

#[derive(Debug)]
pub struct GitHubSyncProvider {
    client: reqwest::Client,
}

impl GitHubSyncProvider {
    pub fn new() -> Self {
        Self { client: reqwest::Client::new() }
    }
}

#[async_trait]
impl SyncProvider for GitHubSyncProvider {
    fn provider_name(&self) -> &'static str { "github" }
    
    fn provider_type(&self) -> ProviderType { ProviderType::GitRepository }
    
    async fn get_data(&self, auth: &SyncAuth, target: &SyncTarget) -> errors::Result<Option<RemoteData>> {
        let path = target.resource.as_ref()
            .ok_or(errors::Error::invalid("resource path is required for GitHub"))?;
        let url = format!(
            "https://api.github.com/repos/{}/contents/{}",
            target.container, path
        );
        
        let response = self.client
            .get(&url)
            .header("Authorization", format!("Bearer {}", auth.access_token))
            .header("User-Agent", "database-sync")
            .header("Accept", "application/vnd.github.v3+json")
            .send()
            .await?;
        
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }
        
        let json: serde_json::Value = response.json().await?;
        let content = base64::decode(json["content"].as_str().unwrap_or(""))?;
        
        Ok(Some(RemoteData {
            id: json["sha"].as_str().unwrap_or("").to_string(),
            content: String::from_utf8(content)?,
            content_type: Some("text/plain".to_string()),
            size: json["size"].as_u64(),
            updated_at: None,
        }))
    }
    
    async fn put_data(&self, auth: &SyncAuth, target: &SyncTarget, data: &SyncPayload) -> errors::Result<SyncResult> {
        let path = target.resource.as_ref()
            .ok_or(errors::Error::invalid("resource path is required for GitHub"))?;
        
        // 既存ファイルのSHAを取得
        let existing = self.get_data(auth, target).await?;
        
        let url = format!(
            "https://api.github.com/repos/{}/contents/{}",
            target.container, path
        );
        
        let content_base64 = base64::encode(&data.content);
        let message = data.metadata.message.clone()
            .unwrap_or_else(|| format!("Update {}", path));
        
        let mut body = serde_json::json!({
            "message": message,
            "content": content_base64,
        });
        if let Some(ref_name) = &target.version {
            body["branch"] = serde_json::Value::String(ref_name.clone());
        }
        if let Some(remote) = existing {
            body["sha"] = serde_json::Value::String(remote.id);
        }
        
        let response = self.client
            .put(&url)
            .header("Authorization", format!("Bearer {}", auth.access_token))
            .header("User-Agent", "database-sync")
            .json(&body)
            .send()
            .await?;
        
        let json: serde_json::Value = response.json().await?;
        
        Ok(SyncResult {
            success: true,
            result_id: json["commit"]["sha"].as_str().map(|s| s.to_string()),
            url: json["content"]["html_url"].as_str().map(|s| s.to_string()),
            diff: None,
        })
    }
    
    async fn delete_data(&self, auth: &SyncAuth, target: &SyncTarget) -> errors::Result<SyncResult> {
        // ... GitHub Contents API DELETE 実装
    }
}
```

#### 1.3 HubSpot SyncProvider 実装例（将来拡張）

```rust
// packages/database_sync/src/providers/hubspot.rs
use crate::domain::{
    ProviderType, RemoteData, SyncAuth, SyncPayload, SyncProvider, SyncResult, SyncTarget,
};

#[derive(Debug)]
pub struct HubSpotSyncProvider {
    client: reqwest::Client,
}

#[async_trait]
impl SyncProvider for HubSpotSyncProvider {
    fn provider_name(&self) -> &'static str { "hubspot" }
    
    fn provider_type(&self) -> ProviderType { ProviderType::Crm }
    
    async fn get_data(&self, auth: &SyncAuth, target: &SyncTarget) -> errors::Result<Option<RemoteData>> {
        // target.container = "contacts", "deals", "products" 等
        // target.resource = レコードID
        let record_id = target.resource.as_ref()
            .ok_or(errors::Error::invalid("record ID is required"))?;
        
        let url = format!(
            "https://api.hubapi.com/crm/v3/objects/{}/{}",
            target.container, record_id
        );
        
        let response = self.client
            .get(&url)
            .header("Authorization", format!("Bearer {}", auth.access_token))
            .send()
            .await?;
        
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }
        
        let json: serde_json::Value = response.json().await?;
        
        Ok(Some(RemoteData {
            id: json["id"].as_str().unwrap_or("").to_string(),
            content: serde_json::to_string(&json["properties"])?,
            content_type: Some("application/json".to_string()),
            size: None,
            updated_at: json["updatedAt"].as_str()
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                .map(|dt| dt.with_timezone(&chrono::Utc)),
        }))
    }
    
    async fn put_data(&self, auth: &SyncAuth, target: &SyncTarget, data: &SyncPayload) -> errors::Result<SyncResult> {
        // CRMの場合: data.metadata.properties を使ってレコードを更新
        let properties = data.metadata.properties.clone()
            .unwrap_or(serde_json::json!({}));
        
        let (method, url) = if let Some(record_id) = &target.resource {
            // 更新
            (reqwest::Method::PATCH, format!(
                "https://api.hubapi.com/crm/v3/objects/{}/{}",
                target.container, record_id
            ))
        } else {
            // 新規作成
            (reqwest::Method::POST, format!(
                "https://api.hubapi.com/crm/v3/objects/{}",
                target.container
            ))
        };
        
        let body = serde_json::json!({ "properties": properties });
        
        let response = self.client
            .request(method, &url)
            .header("Authorization", format!("Bearer {}", auth.access_token))
            .json(&body)
            .send()
            .await?;
        
        let json: serde_json::Value = response.json().await?;
        
        Ok(SyncResult {
            success: true,
            result_id: json["id"].as_str().map(|s| s.to_string()),
            url: None,
            diff: None,
        })
    }
    
    async fn delete_data(&self, auth: &SyncAuth, target: &SyncTarget) -> errors::Result<SyncResult> {
        // ... HubSpot DELETE API 実装
    }
}
```

#### 1.3 auth::App への GitHub プロバイダー追加

`packages/auth/src/usecase/exchange_oauth_token.rs` の `build_oauth_provider()` に GitHub 対応を追加。

### Phase 2: GraphQL API拡張

#### 2.1 OAuth連携エンドポイント

```graphql
type Mutation {
  # GitHub OAuth認証URL取得
  getGitHubAuthUrl(input: GetGitHubAuthUrlInput!): GetGitHubAuthUrlPayload!
  
  # OAuth認可コード交換
  exchangeGitHubToken(input: ExchangeGitHubTokenInput!): ExchangeGitHubTokenPayload!
  
  # GitHub連携解除
  disconnectGitHub(input: DisconnectGitHubInput!): DisconnectGitHubPayload!
}

type Query {
  # GitHub連携状態取得
  gitHubConnection(organizationId: ID!): GitHubConnection
}

type GitHubConnection {
  connected: Boolean!
  username: String
  connectedAt: DateTime
}
```

#### 2.2 同期API

```graphql
type Mutation {
  # 単一データをGitHubへ同期
  syncDataToGitHub(input: SyncDataToGitHubInput!): SyncDataToGitHubPayload!
  
  # リポジトリ全データを一括同期
  syncRepoToGitHub(input: SyncRepoToGitHubInput!): SyncRepoToGitHubPayload!
}

input SyncDataToGitHubInput {
  dataId: ID!
  targetRepo: String!   # "owner/repo" 形式
  targetPath: String!   # 例: "docs/content/my-article.md"
  commitMessage: String
  dryRun: Boolean
}

type SyncDataToGitHubPayload {
  success: Boolean!
  commitSha: String
  diff: String          # dryRun時のプレビュー
  error: String
}

type Query {
  # 同期ステータス取得
  syncStatus(dataId: ID!): SyncStatus
}

type SyncStatus {
  lastSyncedAt: DateTime
  lastCommitSha: String
  targetRepo: String
  targetPath: String
  status: SyncStatusEnum!
}

enum SyncStatusEnum {
  SYNCED
  PENDING
  FAILED
  NEVER_SYNCED
}
```

### Phase 3: database_sync Usecase実装

**注意**: 既存の `apps/library-api/src/handler/data.rs` に `compose_markdown()` が実装済み。これを活用する。

#### 3.1 SyncData Usecase（プロバイダー抽象化）

```rust
// packages/database_sync/src/usecase/sync_data.rs
use std::sync::Arc;
use crate::domain::{
    SyncConfig, SyncProvider, SyncAuth, SyncTarget, SyncPayload, 
    SyncMetadata, SyncResult as DomainSyncResult, SyncStatus,
};

/// 同期ユースケース - プロバイダー抽象化により複数の同期先に対応
pub struct SyncData {
    oauth_token_repo: Arc<dyn auth::domain::oauth::OAuthTokenRepository>,
    sync_config_repo: Arc<dyn SyncConfigRepository>,
    provider_registry: Arc<SyncProviderRegistry>,
}

pub struct SyncDataInputData<'a> {
    pub executor: &'a auth::Executor,
    pub multi_tenancy: &'a dyn auth::MultiTenancyAction,
    pub data_id: String,
    pub provider: String,             // "github", "gitlab", "s3", "hubspot"
    pub target: SyncTarget,
    pub payload: SyncPayload,
    pub dry_run: bool,
}

/// 同期結果
pub struct SyncDataResult {
    pub status: SyncStatus,
    pub result_id: Option<String>,
    pub url: Option<String>,
    pub diff: Option<String>,
}

#[async_trait::async_trait]
impl SyncDataInputPort for SyncData {
    async fn execute<'a>(&self, input: &SyncDataInputData<'a>) -> errors::Result<SyncDataResult> {
        // 1. プロバイダー取得
        let provider = self.provider_registry
            .get(&input.provider)
            .ok_or(errors::Error::not_found(format!(
                "Sync provider '{}' not found", input.provider
            )))?;
        
        // 2. 認証情報取得
        let operator_id = input.multi_tenancy.operator_id();
        let token = self.oauth_token_repo
            .find_by_tenant_id_and_provider(&operator_id, &input.provider)
            .await?
            .ok_or(errors::Error::not_found(format!(
                "{} not connected", input.provider
            )))?;
        
        let auth = SyncAuth {
            access_token: token.access_token().to_string(),
            refresh_token: token.refresh_token().map(|s| s.to_string()),
            api_key: None,
        };
        
        // 3. dry-run: 差分計算のみ
        if input.dry_run {
            let existing = provider.get_data(&auth, &input.target).await?;
            let diff = calculate_diff(existing.as_ref(), &input.payload.content);
            return Ok(SyncDataResult {
                status: SyncStatus::Pending,
                result_id: None,
                url: None,
                diff: Some(diff),
            });
        }
        
        // 4. 同期実行
        let result = provider
            .put_data(&auth, &input.target, &input.payload)
            .await?;
        
        // 5. 同期設定を保存/更新
        let config = SyncConfig {
            tenant_id: operator_id,
            data_id: input.data_id.parse()?,
            provider: input.provider.clone(),
            target: input.target.clone(),
            status: SyncStatus::Synced,
            last_synced_at: Some(chrono::Utc::now()),
            last_result_id: result.result_id.clone(),
            ..Default::default()
        };
        self.sync_config_repo.save(&config).await?;
        
        Ok(SyncDataResult {
            status: SyncStatus::Synced,
            result_id: result.result_id,
            url: result.url,
            diff: None,
        })
    }
}

fn calculate_diff(existing: Option<&RemoteData>, new_content: &str) -> String {
    match existing {
        Some(remote) => {
            // 既存データとの差分を計算
            similar::TextDiff::from_lines(&remote.content, new_content)
                .unified_diff()
                .to_string()
        }
        None => {
            // 新規作成の場合は全体が追加
            format!("+++ new\n{}", new_content)
        }
    }
}
```

#### 3.2 プロバイダーレジストリ

```rust
// packages/database_sync/src/providers/mod.rs
use std::{collections::HashMap, sync::Arc};
use crate::domain::SyncProvider;

pub mod github;
pub mod gitlab;  // 将来実装
pub mod s3;      // 将来実装

/// プロバイダーレジストリ
#[derive(Debug, Default)]
pub struct SyncProviderRegistry {
    providers: HashMap<String, Arc<dyn SyncProvider>>,
}

impl SyncProviderRegistry {
    pub fn new() -> Self {
        Self::default()
    }
    
    pub fn register(&mut self, provider: Arc<dyn SyncProvider>) {
        self.providers.insert(
            provider.provider_name().to_string(),
            provider,
        );
    }
    
    pub fn get(&self, name: &str) -> Option<Arc<dyn SyncProvider>> {
        self.providers.get(name).cloned()
    }
    
    pub fn available_providers(&self) -> Vec<&str> {
        self.providers.keys().map(|s| s.as_str()).collect()
    }
}

/// デフォルトプロバイダーでレジストリを構築
pub fn build_default_registry() -> SyncProviderRegistry {
    let mut registry = SyncProviderRegistry::new();
    registry.register(Arc::new(github::GitHubSyncProvider::new()));
    // registry.register(Arc::new(gitlab::GitLabSyncProvider::new()));
    // registry.register(Arc::new(s3::S3SyncProvider::new()));
    registry
}
```

#### 3.3 library-api からの統合

```rust
// apps/library-api/src/usecase/sync_to_provider.rs
use database_sync::{
    SyncDataInputData, SyncTarget, SyncPayload, SyncMetadata, SyncDataResult,
};
use crate::handler::data::compose_markdown;

/// library-api 固有の同期ユースケース
/// database_sync を利用しつつ、Markdown変換は既存実装を使う
pub struct SyncToProvider {
    view_data: Arc<dyn ViewDataInputPort>,
    sync_data: Arc<dyn database_sync::SyncDataInputPort>,
}

pub struct SyncToProviderInput<'a> {
    pub executor: &'a auth::Executor,
    pub multi_tenancy: &'a dyn auth::MultiTenancyAction,
    pub org_username: String,
    pub repo_username: String,
    pub data_id: String,
    pub provider: String,           // "github", "gitlab", "hubspot" 等
    pub container: String,          // Git: "owner/repo", CRM: "contacts"
    pub resource: Option<String>,   // Git: "path/to/file.md", CRM: record_id
    pub version: Option<String>,    // Git: branch name
    pub commit_message: Option<String>,
    pub dry_run: bool,
}

impl SyncToProvider {
    pub async fn execute<'a>(&self, input: &SyncToProviderInput<'a>) -> errors::Result<SyncDataResult> {
        // 1. データ取得
        let (data, properties) = self.view_data.execute(&ViewDataInputData {
            executor: input.executor,
            multi_tenancy: input.multi_tenancy,
            org_username: input.org_username.clone(),
            repo_username: input.repo_username.clone(),
            data_id: input.data_id.clone(),
        }).await?;
        
        // 2. コンテンツ生成（プロバイダータイプに応じて変換）
        let (content, content_type, properties) = match input.provider.as_str() {
            "github" | "gitlab" | "bitbucket" => {
                // Git系: Markdown変換
                let markdown = compose_markdown(&data, &properties);
                (markdown, "text/markdown".to_string(), None)
            }
            "hubspot" | "salesforce" => {
                // CRM系: JSON変換
                let json = convert_to_crm_properties(&data, &properties)?;
                (serde_json::to_string(&json)?, "application/json".to_string(), Some(json))
            }
            _ => {
                // デフォルト: Markdown
                let markdown = compose_markdown(&data, &properties);
                (markdown, "text/markdown".to_string(), None)
            }
        };
        
        // 3. database_sync経由で同期
        self.sync_data.execute(&SyncDataInputData {
            executor: input.executor,
            multi_tenancy: input.multi_tenancy,
            data_id: input.data_id.clone(),
            provider: input.provider.clone(),
            target: SyncTarget {
                container: input.container.clone(),
                resource: input.resource.clone(),
                version: input.version.clone(),
            },
            payload: SyncPayload {
                content,
                content_type,
                metadata: SyncMetadata {
                    message: input.commit_message.clone(),
                    properties,
                },
            },
            dry_run: input.dry_run,
        }).await
    }
}

/// データをCRMプロパティ形式に変換
fn convert_to_crm_properties(
    data: &database_manager::domain::Data,
    properties: &[database_manager::domain::Property],
) -> errors::Result<serde_json::Value> {
    let mut result = serde_json::Map::new();
    result.insert("name".to_string(), serde_json::Value::String(data.name().to_string()));
    
    // プロパティを変換
    for prop_data in data.property_data() {
        if let Some(prop) = properties.iter().find(|p| p.id() == prop_data.property_id()) {
            if let Some(value) = prop_data.value() {
                result.insert(
                    prop.name().to_string(),
                    property_value_to_json(value),
                );
            }
        }
    }
    
    Ok(serde_json::Value::Object(result))
}
```

### Phase 4: フロントエンドUI

#### 4.1 GitHub連携設定ページ

`apps/library/src/app/v1beta/[org]/settings/github/page.tsx`

```tsx
// GitHub連携状態表示 & Connect/Disconnectボタン
export default async function GitHubSettingsPage({ params }: Props) {
  const connection = await getGitHubConnection(params.org);
  
  return (
    <div>
      <h1>GitHub連携設定</h1>
      {connection?.connected ? (
        <GitHubConnectedCard 
          username={connection.username}
          onDisconnect={handleDisconnect}
        />
      ) : (
        <GitHubConnectButton />
      )}
    </div>
  );
}
```

#### 4.2 データ詳細ページへの同期ボタン追加

`apps/library/src/app/v1beta/[org]/[repo]/data/[dataId]/` に同期UIを追加:

- 同期先リポジトリ/パス設定
- 同期実行ボタン（dry-run / 本番）
- 同期ステータス表示
- 差分プレビュー

#### 4.3 OAuthコールバックページ

`apps/library/src/app/(auth)/oauth/github/callback/page.tsx`

### Phase 5: DBマイグレーション

#### 5.1 同期設定テーブル

```sql
-- apps/library-api/migrations/YYYYMMDD_github_sync_config.up.sql
CREATE TABLE library_github_sync_configs (
    id VARCHAR(29) PRIMARY KEY,
    data_id VARCHAR(29) NOT NULL,
    target_repo VARCHAR(255) NOT NULL,
    target_path VARCHAR(512) NOT NULL,
    last_synced_at TIMESTAMP NULL,
    last_commit_sha VARCHAR(40) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'never_synced',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_data_id (data_id),
    FOREIGN KEY (data_id) REFERENCES library_data(id) ON DELETE CASCADE
);
```

### 環境変数

```env
# apps/library-api/.env
GITHUB_CLIENT_ID=your_github_oauth_app_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_app_client_secret
GITHUB_REDIRECT_URI=http://localhost:3002/oauth/github/callback
```

### タスク分解（更新）

- [x] **Phase 0: database_sync サブコンテキスト** ✅ 完了
  - [x] `packages/database_sync` クレート作成
  - [x] `packages/database_sync/domain` ドメインモデル実装
    - [x] `SyncProvider` トレイト
    - [x] `SyncConfig` エンティティ
    - [x] `SyncTarget`, `SyncAuth`, `SyncPayload`, `SyncResult` 値オブジェクト
  - [x] `SyncConfigRepository` インターフェース & SQLx実装
  - [x] `SyncProviderRegistry` 実装
  - [x] DBマイグレーション作成（sync_configs テーブル） - 現在はPropertyベースで実装

- [x] **Phase 1: GitHub プロバイダー** ✅ 完了
  - [x] `packages/providers/github` クレート作成
  - [x] `OAuthProvider` トレイト実装（認証用）
  - [x] `GitHubSyncProvider` (`SyncProvider` トレイト実装)
  - [x] `auth::App` への GitHub OAuthプロバイダー追加
  - [x] `tachyon_apps::AuthApp` トレイトに OAuth 操作メソッド追加
    - `get_oauth_token_by_provider`
    - `save_oauth_token`
    - `delete_oauth_token`

- [x] **Phase 2: GraphQL API** ✅ 完了
  - [x] OAuth連携用mutation追加 (`githubAuthUrl`, `githubExchangeToken`, `githubDisconnect`)
  - [x] OAuth連携用query追加 (`githubConnection`)
  - [x] 同期用mutation追加 (`syncDataToGithub`)
  - [x] GraphQL model追加 (`GitHubAuthUrl`, `GitHubConnection`, `SyncResult`, `SyncStatus`)

- [x] **Phase 3: library-api 統合** ✅ 完了
  - [x] `compose_markdown` を `pub` に変更して再利用可能に
  - [x] `database_sync` をDIで注入 (`router.rs`)
  - [x] `Arc<dyn tachyon_apps::auth::AuthApp>` 経由でOAuthトークン管理
  - [x] GraphQL mutation内で `SyncData` usecase を呼び出し

- [x] **Phase 4: フロントエンドUI** ✅ 完了
  - [x] GitHub連携設定ページ (`apps/library/src/app/v1beta/[org]/settings/github/page.tsx`)
  - [x] OAuthコールバック処理（設定ページ内でクエリパラメータ処理）
  - [x] GraphQL Document生成 (`github.graphql` → `@/gen/graphql`)
  - [x] データ詳細ページで `ext_github` 編集UI（SelectでリポジトリとPath設定）
  - [ ] 同期ステータス表示（将来拡張）

- [ ] **Phase 5: テスト & ドキュメント** 📝 将来タスク
  - [x] Playwright動作確認（OAuth, 同期, 一括同期）
  - [ ] ユニットテスト（プロバイダートレイト、同期ロジック）
  - [ ] 統合テスト（OAuth flow、API）
  - [ ] 利用手順ドキュメント更新
  - [ ] GitHub App/OAuth App 作成手順の文書化

- [x] **Phase 6: ext_github Property ベースの自動同期** ✅ 完了
  - [x] `ext_github` Property 型定義（JSON型）
    - `repo`: GitHubリポジトリ（owner/repo形式）
    - `path`: 同期先ファイルパス
    - `defaultPath`: デフォルトパステンプレート（`{{name}}`プレースホルダー対応）
  - [x] Frontmatter 出力に `ext_github:` セクション追加
  - [x] データ更新時の自動同期トリガー実装
    - `UpdateData` usecase 後に `ext_github` Property を参照
    - `repo`/`path` が設定されていれば同期実行
  - [x] Property UI で `ext_github` の入力フォーム（Configure ダイアログ）
  - [x] 一括同期機能（BulkSyncExtGithub usecase）
  - [x] 動作確認テスト

- [x] **Phase 7: ext_ プレフィックス予約語化 & Settings統合** ✅ 完了
  - [x] **ext_ プレフィックスの予約語化**
    - [x] フロントエンド: 「Add New Property」で `ext_` 開始名をバリデーションエラー
    - [x] バックエンド: `addProperty` mutation で `ext_` 開始名を拒否
    - [x] システム用 mutation (`enableGithubSync`/`disableGithubSync`) で ext_ プロパティを作成/削除
  - [x] **Settings画面からのGitHub Sync有効化**
    - [x] Settings > Integrations に「GitHub Sync」トグル追加
    - [x] ONにすると `ext_github` プロパティを自動作成
    - [x] OFFにすると `ext_github` プロパティを削除（確認ダイアログ付き）
    - [x] Configure ダイアログは Properties 画面で引き続き利用可能
  - [x] **Properties画面の改善**
    - [x] `ext_` プロパティは「System Extensions」セクションで表示
    - [x] 「Add New Property」ボタンからは `ext_` プロパティを作成不可
    - [x] System Extensions セクションに「Settings > Integrations」へのリンク追加
  - [ ] **UI/UX改善（残タスク）**
    - [ ] プロパティ追加後のステート即時反映（リロード不要に）
    - [ ] Bulk sync 後のフィードバック改善（成功件数表示等）

- [ ] **将来拡張（Phase 8+）**
  - [ ] GitLab SyncProvider 実装 (`ext_gitlab` Property)
  - [ ] S3 SyncProvider 実装 (`ext_s3` Property)
  - [ ] Bitbucket SyncProvider 実装
  - [ ] HubSpot SyncProvider 実装（CRM連携）
  - [ ] Salesforce SyncProvider 実装（CRM連携）
  - [ ] Google Drive SyncProvider 実装
  - [ ] 同期ステータス表示

### Playwright動作確認チェックリスト

#### Phase 1-5: GitHub OAuth & 基本同期
- [x] GitHub連携設定ページでConnectボタンが表示される ✅
- [x] GitHubへリダイレクト後、コールバックで連携完了 ✅
- [x] 連携完了後、Connected状態が表示される ✅
- [x] GitHub App インストールリンクが表示される ✅
- [x] 同期実行後、GitHubリポジトリにファイルが作成/更新される ✅

#### Phase 6: ext_github Property & 一括同期 ✅ 完了
- [x] Properties画面で `ext_github` プロパティを追加可能 ✅
- [x] Configure ダイアログでリポジトリを検索・選択可能 ✅
- [x] デフォルトパス設定が保存される ✅
- [x] 一括同期確認ダイアログが表示される ✅
- [x] 一括同期後、GitHubにファイルが作成される ✅
- [x] Data画面で設定済みリポジトリのみ選択可能 ✅
- [x] データ更新時に自動同期が実行される ✅ (mutation.rs で auto-sync 実装済み)
- [x] 連携解除ができる ✅ (Settings > Integrations でトグルOFFで削除)

#### Phase 7: ext_ 予約語化 & Settings統合 ✅ 完了
- [x] Add New Propertyで `ext_` 開始名がエラーになる ✅
- [x] Settings > Integrations に GitHub Sync セクションがある ✅
- [x] GitHub Sync トグルONで `ext_github` プロパティが自動作成 ✅
- [x] GitHub Sync トグルOFFで確認ダイアログ後に `ext_github` 削除 ✅
- [x] Properties画面で ext_ プロパティが「System Extensions」に表示 ✅
- [x] System Extensions セクションに「Settings > Integrations」リンクがある ✅

---

## Phase 6: ext_github Property ベースの自動同期

### 設計方針

`ext_github` をデータの Property として管理し、Frontmatter との整合性を保ちながら自動同期を実現する。

### Property 定義

リポジトリの Properties ページで `ext_github` Property を追加（型: JSON）:

```yaml
# Property定義
name: ext_github
type: json
description: GitHub同期設定
```

### データ値の形式

各データに対して `ext_github` の値を設定:

```json
{
  "repo": "owner/repo",
  "path": "docs/content/article.md",
  "enabled": true
}
```

### Frontmatter 出力

`compose_markdown()` で `ext_github` Property を特別扱いし、YAML セクションとして展開:

```yaml
---
id: data_01xxx
title: My Article
ext_github:
  repo: owner/repo
  path: docs/content/article.md
---

# My Article

Content here...
```

### 自動同期トリガー

1. **データ更新時**: `UpdateData` usecase 完了後
2. **Property 更新時**: `UpdateProperty` で `ext_github` が変更された場合
3. **新規データ作成時**: `CreateData` で `ext_github` が設定されている場合

```rust
// UpdateData usecase 内
let (data, properties) = /* 更新処理 */;

// ext_github Property を確認
if let Some(ext_github) = get_ext_github_property(&data, &properties) {
    if ext_github.enabled.unwrap_or(true) {
        // 自動同期実行
        self.sync_data.execute(&SyncDataInputData {
            data_id: data.id().to_string(),
            provider: "github".to_string(),
            target: SyncTarget::git_with_branch(
                &ext_github.repo,
                &ext_github.path,
                "main".to_string(),
            ),
            payload: SyncPayload::markdown(&compose_markdown(&data, &properties)),
            dry_run: false,
        }).await?;
    }
}
```

### UI フロー

1. Properties ページで `ext_github` Property を追加
2. データ編集時に `ext_github` フィールドに値を入力:
   - repo: `owner/repo` 形式
   - path: `docs/path/to/file.md` 形式
3. データ保存時に自動同期が実行される
4. 同期結果は通知またはデータ詳細ページで確認

---

## Phase 7: ext_ プレフィックス予約語化 & Settings統合 詳細設計

### 背景・課題

現状の `ext_github` プロパティ作成フローには以下の問題がある：

1. **手動入力が必要**: ユーザーが「Add New Property」→「ext_github」と正確に入力する必要がある
2. **予約語の誤用リスク**: `ext_` プレフィックスはシステム用だが、誰でも任意の `ext_xxx` を作成可能
3. **設定の分散**: GitHub連携設定がProperties画面にあり、Settings画面と分離している
4. **ステート不整合**: プロパティ追加直後にConfigureすると、IDがnullのままになる場合がある

### 解決策

#### 1. ext_ プレフィックスの予約語化

**フロントエンド（Property追加ダイアログ）**:
```tsx
// apps/library/src/app/v1beta/_components/properties-ui/property-dialog.tsx
const validatePropertyName = (name: string) => {
  if (name.startsWith('ext_')) {
    return 'Property names starting with "ext_" are reserved for system use';
  }
  return null;
};
```

**バックエンド（GraphQL mutation）**:
```rust
// apps/library-api/src/handler/graphql/mutation.rs
pub async fn add_property(&self, input: PropertyInput) -> Result<Property> {
    // ext_ プレフィックスチェック
    if input.name.starts_with("ext_") {
        return Err(Error::bad_request(
            "Property names starting with 'ext_' are reserved for system use"
        ));
    }
    // ...
}
```

#### 2. Settings画面からのGitHub Sync有効化

**UI設計**:
```
Settings > Integrations
┌─────────────────────────────────────────────────────────────┐
│ GitHub Sync                                                 │
│ ────────────────────────────────────────────────────────── │
│                                                             │
│ ☐ Enable GitHub synchronization                            │
│                                                             │
│ When enabled, data can be synchronized to GitHub           │
│ repositories as Frontmatter Markdown files.                │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Sync Repositories                                       ││
│ │                                                         ││
│ │ • takanorifukuyama/library-sync-test                   ││
│ │   Default path: docs/{{name}}.md                       ││
│ │                                                         ││
│ │ [+ Add Repository]                                      ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ [Save Changes]                                              │
└─────────────────────────────────────────────────────────────┘
```

**フロー**:
1. ユーザーが「Enable GitHub synchronization」をONに
2. システムが `ext_github` プロパティを自動作成
3. リポジトリ設定ダイアログが開く
4. 設定保存時に既存データの一括同期を提案

**無効化フロー**:
1. ユーザーが「Enable GitHub synchronization」をOFFに
2. 確認ダイアログ表示:「This will remove GitHub sync settings. Synced files on GitHub will NOT be deleted. Continue?」
3. 確認後、`ext_github` プロパティを削除

#### 3. Properties画面の改善

**システムプロパティセクション**:
```
Properties
┌─────────────────────────────────────────────────────────────┐
│ [Search properties...]            [+ Add New Property]      │
├─────────────────────────────────────────────────────────────┤
│ User Properties                                             │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Name      │ Type     │ Options          │ Actions       ││
│ ├───────────┼──────────┼──────────────────┼───────────────┤│
│ │ id        │ STRING   │ -                │ (System)      ││
│ │ content   │ MARKDOWN │ -                │ (System)      ││
│ │ category  │ SELECT   │ tech, design     │ Edit Remove   ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ System Extensions                                           │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Name       │ Type        │ Status      │ Actions        ││
│ ├────────────┼─────────────┼─────────────┼────────────────┤│
│ │ ext_github │ GitHub Sync │ 1 repo      │ → Settings     ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ℹ️ System extensions are managed in Settings > Integrations │
└─────────────────────────────────────────────────────────────┘
```

#### 4. 実装タスク ✅ 完了

**バックエンド**: ✅
- [x] `addProperty` mutation に `ext_` バリデーション追加
- [x] `enableGithubSync` mutation 追加（ext_github自動作成）
- [x] `disableGithubSync` mutation 追加（ext_github削除）

**フロントエンド**: ✅
- [x] PropertyDialog に `ext_` バリデーション追加
- [x] Settings > Integrations に GitHub Sync セクション追加
- [x] GitHub Sync トグル実装
- [x] Properties画面を「User Properties」と「System Extensions」に分離
- [x] System Extensions に「Settings > Integrations」リンク実装

**テスト**: ✅ 全て完了
- [x] `ext_` プレフィックスがブロックされることを確認 ✅
- [x] Settings からの GitHub Sync 有効化/無効化 ✅
- [x] 有効化時の自動プロパティ作成 ✅
- [x] 無効化時の確認ダイアログと削除 ✅

---

## 実装進捗メモ

### 2025-12-04: Phase 7 完了 ✅

#### Phase 7 完了内容

1. **ext_ プレフィックスの予約語化** ✅
   - フロントエンド: `property-dialog.tsx` で zod バリデーション追加
   - バックエンド: `addProperty` mutation で `ext_` プレフィックスを拒否
   - システム用 mutation 追加: `enableGithubSync`, `disableGithubSync`

2. **Settings画面のGitHub Sync改善** ✅
   - Integrations タブにシンプルなトグル追加
   - 有効化: トグルON → `ext_github` プロパティ自動作成
   - 無効化: トグルOFF → 確認ダイアログ表示 → `ext_github` 削除
   - トースト通知でフィードバック

3. **Properties画面の分離** ✅
   - 「User Properties」セクション: ユーザー定義プロパティ
   - 「System Extensions」セクション: `ext_` プロパティ（Settings管理）
   - System Extensions には「Settings > Integrations」リンク追加
   - ext_ プロパティは Properties から直接追加・削除不可

4. **動作確認** ✅
   - 新規リポジトリ作成 → Settings で GitHub Sync 有効化
   - `ext_test` プロパティ追加試行 → バリデーションエラー表示
   - GitHub Sync 無効化 → 確認ダイアログ → ext_github 削除

#### 変更ファイル

- `apps/library/src/app/v1beta/_components/properties-ui/property-dialog.tsx` - zod バリデーション追加
- `apps/library/src/app/v1beta/_components/properties-ui/index.tsx` - User/System セクション分離
- `apps/library/src/app/v1beta/[org]/[repo]/settings/form.tsx` - トグル UI 実装
- `apps/library/src/app/v1beta/[org]/[repo]/settings/actions.ts` - 新 mutation 呼び出し
- `apps/library/src/app/v1beta/[org]/[repo]/settings/setting.graphql` - GraphQL 追加
- `apps/library-api/src/handler/graphql/mutation.rs` - `enableGithubSync`/`disableGithubSync` 追加

---

### 2025-12-04: Phase 6 完了 & Phase 7 計画

#### Phase 6 完了内容

1. **ext_github Property 実装** ✅
   - Properties画面で `ext_github` プロパティを追加可能
   - Configure ダイアログでリポジトリ・デフォルトパス設定
   - ComboBoxでGitHubリポジトリを検索・選択

2. **一括同期機能（BulkSyncExtGithub）** ✅
   - `apps/library-api/src/usecase/bulk_sync_ext_github.rs` - バックエンドusecase
   - `apps/library-api/src/usecase/markdown_composer.rs` - Markdown生成（handler→usecase移動）
   - 設定保存時に「Sync all existing data?」ダイアログ表示
   - 全データに `ext_github` 設定を適用し、GitHubへ一括同期

3. **Data画面の ext_github 選択** ✅
   - Propertyで設定したリポジトリのみSelectで選択可能
   - デフォルトパスの自動適用

4. **動作確認** ✅
   - フロントエンドUIからの一括同期成功
   - GitHubに正しくファイルが作成されることを確認

#### 発見した課題（Phase 7で対応）

1. **プロパティ追加直後のステート不整合**
   - 新規プロパティ追加後、リロードせずにConfigureするとプロパティIDがnullになる場合がある
   - 結果: `invalid 'PropertyId'` エラー

2. **ext_ プレフィックスの直接入力**
   - 現状: ユーザーが「Add New Property」から「ext_github」と手動入力
   - 課題: 予約語であるべき `ext_` をユーザーが自由に使える

3. **設定の分散**
   - GitHub連携設定がProperties画面にある
   - Settings画面と一元化すべき

---

### 2025-12-04 (earlier): Phase 5 完了 & Phase 6 開始

#### 完了した作業

1. **GitHub OAuth 認証** ✅
   - Settings タブ内に GitHub Integration UI を実装
   - OAuth フロー: Connect → GitHub認証 → トークン保存 → 接続完了
   - GitHub App インストールリンク追加

2. **データ同期テスト成功** ✅
   - `syncDataToGithub` mutation で手動同期実行
   - Frontmatter Markdown 形式で GitHub にプッシュ成功
   - コミット SHA 返却確認

3. **認可ポリシー追加** ✅
   - `auth:SaveOAuthToken`, `auth:DeleteOAuthToken`, `auth:GetOAuthToken` アクション追加
   - `008-auth-policies.yaml` シード更新

4. **IAC 連携** ✅
   - GitHub App 設定を IAC manifest (`003-iac-manifests.yaml`) で管理
   - `library-api` 起動時に IAC から設定を読み込む

#### 次のステップ: Phase 6 (ext_github 自動同期)

1. `ext_github` Property 型定義
2. Frontmatter 出力に `ext_github:` セクション追加
3. データ更新時の自動同期トリガー実装
4. UI で `ext_github` 入力フォーム

---

### 2025-12-03: Phase 0-4 完了

1. **database_sync サブコンテキスト作成**
   - `packages/database_sync/` - メインクレート
   - `packages/database_sync/domain/` - ドメインモデル
   - `SyncProvider` トレイト、`SyncConfig`、`SyncTarget`、`SyncPayload` 等

2. **GitHub プロバイダー実装**
   - `packages/providers/github/` - OAuth & SyncProvider
   - `GitHubSyncProvider` - GitHub Contents API 連携

3. **tachyon_apps::AuthApp 拡張**
   - OAuth トークン管理メソッド追加

4. **library-api 統合**
   - GraphQL mutation/query 追加
   - `database_sync` DI

5. **フロントエンド**
   - GitHub 設定ページ作成

6. **CI 対応**
   - `mise run ci` 通過
