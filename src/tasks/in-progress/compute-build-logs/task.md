# Compute ビルドログ表示機能

## 概要
Compute機能のビルド詳細パネルにビルドログを直接表示する。現在はCodeBuildコンソールへの外部リンクのみで、ログ閲覧にAWSコンソールへの遷移が必要。

## 現状分析

### フロントエンド
- `apps/tachyon/src/app/v1beta/[tenant_id]/cloud/apps/[app_id]/builds-tab.tsx`
  - `BuildDetailRow` コンポーネントがビルド詳細を表示（展開行）
  - 現在は `buildCodeBuildUrl()` でAWSコンソールへの外部リンクのみ
  - SWRで15秒ポーリングでビルド一覧を更新中

### バックエンド
- `packages/compute/src/adapter/gateway/codebuild_provider.rs`
  - AWS SDK `aws-sdk-codebuild` を使用
  - `batch_get_builds` でビルド情報取得済み（ログ情報 `logs()` にCloudWatch `group_name`/`stream_name`含む）
  - `get_build_status` は既にビルドステータス取得を実装
- `packages/compute/domain/src/build.rs`
  - `Build` エンティティに `cloud_build_id` フィールドあり（CodeBuildのビルドID）
- Cargo.toml: `aws-sdk-codebuild = "1"` のみ、CloudWatch Logs SDKは未導入

### REST API
- `GET /v1/compute/builds/:build_id` でビルド詳細取得は存在
- ビルドログ取得用のエンドポイントは未実装

## 実装方針

### アーキテクチャ
CodeBuildのビルドログはCloudWatch Logsに保存される。CodeBuild APIの `batch_get_builds` レスポンスの `logs` フィールドから `group_name` と `stream_name` を取得し、CloudWatch Logs API (`GetLogEvents`) でログ本文を取得する。

### レイヤー構成

#### 1. Domain層 - BuildLogProvider トレイト
```rust
// packages/compute/domain/src/provider/build_log_provider.rs
#[async_trait]
pub trait BuildLogProvider: Send + Sync {
    async fn get_build_logs(
        &self,
        cloud_build_id: &str,
        next_token: Option<String>,
    ) -> Result<BuildLogOutput>;
}

pub struct BuildLogOutput {
    pub log_lines: Vec<BuildLogLine>,
    pub next_token: Option<String>,  // ページネーション用
    pub is_complete: bool,           // ビルド完了でログが全部出たか
}

pub struct BuildLogLine {
    pub timestamp: i64,   // Unix millis
    pub message: String,
}
```

#### 2. Adapter層 - CloudWatch Logs実装
```rust
// packages/compute/src/adapter/gateway/cloudwatch_log_provider.rs
pub struct CloudWatchBuildLogProvider {
    codebuild_client: aws_sdk_codebuild::Client,
    logs_client: aws_sdk_cloudwatchlogs::Client,
}
```
- `batch_get_builds` でビルドの `logs.group_name` / `logs.stream_name` を取得
- `get_log_events` でログイベントを取得（forward scan）
- `next_token` でページネーション対応

#### 3. Usecase層 - GetBuildLogs
```rust
// packages/compute/src/usecase/get_build_logs.rs
pub struct GetBuildLogs {
    build_repo: Arc<dyn BuildRepository>,
    build_log_provider: Arc<dyn BuildLogProvider>,
    auth_app: Arc<dyn AuthApp>,
}
```
- ポリシーチェック: `compute:GetBuildLogs`
- ビルドを取得 → `cloud_build_id` を使って `BuildLogProvider::get_build_logs` を呼ぶ

#### 4. REST Handler
```
GET /v1/compute/builds/:build_id/logs?next_token=xxx
```
レスポンス:
```json
{
  "lines": [
    { "timestamp": 1710000000000, "message": "[Container] Phase INSTALL" }
  ],
  "next_token": "f/xxx",
  "is_complete": true
}
```

#### 5. フロントエンド
- `BuildDetailRow` にログ表示エリアを追加
- ビルドが `building` ステータスの間は5秒ポーリングでログ更新
- `succeeded`/`failed` 時はログ全量を1回取得して表示終了
- ANSI制御文字の簡易除去（色コード等）
- 折りたたみ可能なログビューア（`<pre>` + スクロール）

## 実装ステップ

### Step 1: Domain - BuildLogProvider トレイト追加
- [ ] `packages/compute/domain/src/provider/build_log_provider.rs` 作成
- [ ] `BuildLogProvider` トレイト、`BuildLogOutput`、`BuildLogLine` 定義
- [ ] `provider/mod.rs` に公開

### Step 2: Adapter - CloudWatch Logs実装
- [ ] `Cargo.toml` に `aws-sdk-cloudwatchlogs = "1"` 追加
- [ ] `packages/compute/src/adapter/gateway/cloudwatch_log_provider.rs` 作成
- [ ] CodeBuild `batch_get_builds` → CloudWatch `get_log_events` の2段階取得
- [ ] Mock実装 (`MockBuildLogProvider`) 追加

### Step 3: Usecase - GetBuildLogs
- [ ] `packages/compute/src/usecase/get_build_logs.rs` 作成
- [ ] ポリシーチェック (`compute:GetBuildLogs`)
- [ ] `usecase/mod.rs` にエクスポート追加

### Step 4: REST Handler + Router
- [ ] `build_handler.rs` に `get_build_logs` ハンドラ追加
- [ ] `mod.rs` にルート追加: `GET /v1/compute/builds/:build_id/logs`
- [ ] OpenAPI schema更新

### Step 5: DI + App統合
- [ ] `compute::App` に `get_build_logs` usecase追加
- [ ] `apps/tachyon-api/src/di.rs` で `CloudWatchBuildLogProvider` 初期化
- [ ] ポリシーシード追加 (`compute:GetBuildLogs` アクション)

### Step 6: フロントエンド - ログ表示UI
- [ ] `compute-api.ts` に `getBuildLogs()` API関数追加
- [ ] `builds-tab.tsx` の `BuildDetailRow` にログ表示エリア追加
- [ ] ビルド中はポーリングでログ更新、完了後は全量表示
- [ ] ANSI制御文字除去、スクロール対応

### Step 7: シナリオテスト
- [ ] ビルドログ取得のシナリオテスト追加（モック環境ではログなしでも404/空配列で正常動作）

## 技術的考慮事項

### CloudWatch Logs API
- `GetLogEvents` はforward tokenを使ったページネーション
- ログストリームが存在しない場合（ビルド直後等）は空配列を返す
- レートリミット: 10 req/sec/account（十分余裕あり）

### パフォーマンス
- ログは一度に最大10,000イベント取得可能（`limit`パラメータ）
- 初回は最新1000行程度を取得し、`next_token`で追加取得
- ビルド中のポーリング間隔は5秒（CloudWatch Logsの反映遅延は通常1-2秒）

### セキュリティ
- `compute:GetBuildLogs` ポリシーで認可制御
- ログにはビルド環境変数が含まれる可能性があるため、APIレベルでのアクセス制御が重要
- フロントエンドでの追加フィルタリングは不要（バックエンドで制御）

## 進捗
- [x] コードベース調査
- [x] Step 1: Domain層 - `BuildLogProvider` トレイト、`BuildLogOutput`、`BuildLogLine`
- [x] Step 2: Adapter層 - `CloudWatchBuildLogProvider` + `MockBuildLogProvider`
- [x] Step 3: Usecase層 - `GetBuildLogs` (ポリシー: `compute:GetBuildLogs`)
- [x] Step 4: REST Handler - `GET /v1/compute/builds/:build_id/logs` + Router + App統合
- [x] Step 5: DI統合 - `di.rs` で CodeBuild有無に応じてプロバイダ切替、ポリシーシード追加
- [x] Step 6: フロントエンド - `BuildLogViewer`コンポーネント、ポーリング、ANSIストリップ
- [x] Step 7: テスト - シナリオテストにビルドログ取得ステップ追加
