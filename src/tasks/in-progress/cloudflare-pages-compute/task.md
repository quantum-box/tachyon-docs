# Cloudflare Pages デプロイ対応 — 実装仕様 (task.md)

## 進捗

- [x] Phase 1: ドメイン層 + DB マイグレーション (commit: 1faf844)
- [x] Phase 2: Adapter 実装 (CloudflarePagesProvider + MockPagesProvider) (commit: 1faf844)
- [x] Phase 3: ユースケース分岐 (commit: e86869f)
- [x] Phase 4: DI + IaC (PagesProvider の DI 統合) (commit: e86869f)
- [ ] Phase 5: REST API + シナリオテスト
- [x] E2E検証: CF Pages Direct Upload API (2026-03-08)

### 実装ノート
- CodeBuildProvider (AWS CodeBuild) は既存の `BuildProvider` トレイトが Docker 固有のため後回し。Mock で代替。
- `compute` パッケージはコンパイル通過。`delivery` パッケージの既存エラーは別件。
- SQLx オフラインキャッシュを全量再生成済み。

---

## Phase 1: ドメイン層 + DB マイグレーション

### 1-1. DeploymentTarget enum 追加

**ファイル**: `packages/compute/domain/src/compute_app.rs`

```rust
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Display, EnumString)]
#[strum(serialize_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum DeploymentTarget {
    CloudRun,
    CloudflarePages,
}

impl Default for DeploymentTarget {
    fn default() -> Self {
        Self::CloudRun
    }
}
```

ComputeApp struct に `deployment_target: DeploymentTarget` フィールド追加。

### 1-2. PagesProvider トレイト定義

**新規ファイル**: `packages/compute/domain/src/provider/pages_provider.rs`

ビルドは CodeBuildProvider (AWS CodeBuild) を使うため、PagesProvider はデプロイ・管理のみ。

```rust
#[async_trait]
pub trait PagesProvider: Send + Sync {
    /// Pages プロジェクト作成 (GitHub 連携なし、Direct Upload 用)
    async fn create_project(&self, input: CreatePagesProjectInput) -> errors::Result<PagesProject>;
    async fn get_project(&self, project_name: &str) -> errors::Result<PagesProject>;
    async fn delete_project(&self, project_name: &str) -> errors::Result<()>;
    /// ビルド成果物を Direct Upload でデプロイ
    async fn upload_deployment(&self, input: UploadPagesDeploymentInput) -> errors::Result<PagesDeployment>;
    async fn get_deployment(&self, project_name: &str, deployment_id: &str) -> errors::Result<PagesDeployment>;
    async fn rollback_deployment(&self, project_name: &str, deployment_id: &str) -> errors::Result<PagesDeployment>;
    async fn set_env_vars(&self, project_name: &str, env_vars: Vec<PagesEnvVar>) -> errors::Result<()>;
    // NOTE: add_custom_domain / delete_custom_domain は初期スコープ外（後日 Cloudflare for Platforms で実装予定）
}
```

入出力型:
- `CreatePagesProjectInput` { name }
- `PagesProject` { name, subdomain, created_on }
- `UploadPagesDeploymentInput` { project_name, assets: Vec<PagesAsset> }
- `PagesAsset` { path: String, content: Vec<u8>, content_type: String }
- `PagesDeployment` { id, project_name, url, environment, status (idle/active/failure), created_on }
- `PagesEnvVar` { key, value, target (production/preview) }

### 1-3. DB マイグレーション

**`create-migration` スキルを使用。**

```sql
-- compute_apps テーブルに deployment_target カラム追加
ALTER TABLE compute_apps ADD COLUMN deployment_target VARCHAR(32) NOT NULL DEFAULT 'cloud_run';

-- builds テーブルにビルド成果物パスを追加
ALTER TABLE builds ADD COLUMN artifact_path VARCHAR(512) DEFAULT NULL;

-- deployments テーブルに Pages 固有カラム追加
ALTER TABLE deployments ADD COLUMN pages_project_name VARCHAR(128) DEFAULT NULL;
ALTER TABLE deployments ADD COLUMN pages_deployment_id VARCHAR(128) DEFAULT NULL;
```

### 1-4. Repository 更新

`SqlxComputeAppRepository`: SELECT/INSERT/UPDATE に `deployment_target` カラム追加。
`SqlxBuildRepository`: SELECT/INSERT/UPDATE に `artifact_path` カラム追加。
`SqlxDeploymentRepository`: SELECT/INSERT に `pages_project_name`, `pages_deployment_id` 追加。

---

## Phase 2: Adapter 実装

### 2-1. CodeBuildProvider (AWS CodeBuild)

**新規ファイル**: `packages/compute/src/adapter/gateway/codebuild_provider.rs`

`BuildProvider` トレイトの AWS CodeBuild 実装。

```rust
pub struct CodeBuildProvider {
    region: String,
    s3_bucket: String,
    client: aws_sdk_codebuild::Client,
    s3_client: aws_sdk_s3::Client,
}
```

- `submit_build` → CodeBuild `StartBuild` API
  - compute type: `BUILD_GENERAL1_SMALL` + `ARM_CONTAINER` (Graviton)
  - buildspec.yml: `npm install` → `next build` → `npx @cloudflare/next-on-pages` → S3 sync
- `get_build_status` → CodeBuild `BatchGetBuilds` API
- `get_build_logs` → CloudWatch Logs `GetLogEvents` API
- `cancel_build` → CodeBuild `StopBuild` API

### 2-2. CloudflarePagesProvider

**新規ファイル**: `packages/compute/src/adapter/gateway/cloudflare_pages_provider.rs`

```rust
pub struct CloudflarePagesProvider {
    account_id: String,
    api_token: String,
    http: reqwest::Client,
}
```

Cloudflare API v4 ベース URL: `https://api.cloudflare.com/client/v4`

各メソッドの API マッピング:
- `create_project` → POST `/accounts/{account_id}/pages/projects`
  - body: `{ name, production_branch: "main" }` (GitHub 連携なし)
- `get_project` → GET `/accounts/{account_id}/pages/projects/{name}`
- `delete_project` → DELETE `/accounts/{account_id}/pages/projects/{name}`
- `upload_deployment` → POST `/accounts/{account_id}/pages/projects/{name}/deployments` (multipart/form-data)
  - 各ファイルを `/<path>` キーで送信
- `get_deployment` → GET `/accounts/{account_id}/pages/projects/{name}/deployments/{id}`
- `rollback_deployment` → POST `/accounts/{account_id}/pages/projects/{name}/deployments/{id}/rollback`
- `set_env_vars` → PATCH `/accounts/{account_id}/pages/projects/{name}` (deployment_configs.production.env_vars)

レスポンス共通形式: `{ success: bool, errors: [], result: T }`

### 2-3. MockPagesProvider / MockCodeBuildProvider

**新規ファイル**: `packages/compute/src/adapter/gateway/mock_pages_provider.rs`
**新規ファイル**: `packages/compute/src/adapter/gateway/mock_codebuild_provider.rs`

テスト・開発用。全メソッドが固定値を返す。

---

## Phase 3: ユースケース分岐

### 3-1. CreateApp 拡張

`deployment_target` が `CloudflarePages` の場合:
1. DB に app を保存
2. `PagesProvider::create_project` を呼び出し
3. Pages project の subdomain を app に関連付け

### 3-2. TriggerBuild 分岐

`CloudflarePages` の場合:
- **AWS CodeBuild を使用** (`CodeBuildProvider` — `BuildProvider` トレイトの新実装)
- buildspec.yml のビルドステップ:
  1. `npm install`
  2. `next build`
  3. `npx @cloudflare/next-on-pages`
  4. ビルド成果物を S3 にアップロード (`s3://bucket/builds/{build_id}/`)
- ビルドログは CloudWatch Logs 経由で取得
- Build エンティティの `artifact_path` に S3 パスを保存

### 3-3. CreateDeployment 分岐

`CloudflarePages` の場合:
1. Build の `artifact_path` から S3 のファイルを取得
2. `PagesProvider::upload_deployment` でファイルを Pages Direct Upload
3. `pages_deployment_id` を Deployment に保存
4. `RouteStore::put` で `*.txcloud.app` → Pages URL のルーティングを KV に登録

### 3-4. RollbackDeployment 分岐

`CloudflarePages` の場合:
- `PagesProvider::rollback_deployment` を呼び出し

### 3-5. DeleteApp 分岐

`CloudflarePages` の場合:
- `PagesProvider::delete_project` を呼び出し
- `RouteStore::delete` で KV のルーティングエントリを削除

### 3-6. UpdateScaling

`CloudflarePages` の場合:
- Pages は自動スケールのため、エラーを返す (`LogicError: "Scaling is not configurable for Cloudflare Pages"`)

---

## Phase 4: DI + IaC

### 4-1. di.rs 更新

2つのプロバイダーを解決:

**cloudflare_pages**:
1. IaC manifests から `cloudflare_pages` エントリを検索
2. `account_id` + `api_token` で `CloudflarePagesProvider` を構築
3. フォールバック: 環境変数 `CLOUDFLARE_PAGES_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`
4. 未設定時: `MockPagesProvider`

**aws_codebuild**:
1. IaC manifests から `aws_codebuild` エントリを検索
2. `region` + `s3_bucket` + AWS SDK デフォルト認証で `CodeBuildProvider` を構築
3. フォールバック: 環境変数 `AWS_DEFAULT_REGION` + IAM ロール
4. 未設定時: `MockCodeBuildProvider`

### 4-2. シード更新

`scripts/seeds/n1-seed/003-iac-manifests.yaml` に `cloudflare_pages` + `aws_codebuild` プロバイダー追加。

---

## Phase 5: REST API + シナリオテスト

### 5-1. REST ハンドラー更新

CreateApp ハンドラーで `deployment_target` パラメータを受け付ける。

### 5-2. シナリオテスト

`apps/tachyon-api/tests/scenarios/compute_cloudflare_pages.scenario.md`:

1. CreateApp (deployment_target: cloudflare_pages) → 200
2. GetApp → deployment_target が cloudflare_pages
3. TriggerBuild → 200 (mock CodeBuildProvider)
4. CreateDeployment → 200 (mock PagesProvider)
5. GetDeployment → Pages deployment 情報
6. DeleteApp → 200

---

## 実装順序

1. Phase 1 (ドメイン + DB) — 基盤
2. Phase 2 (Adapter) — プロバイダー実装
3. Phase 3 (ユースケース) — ビジネスロジック分岐
4. Phase 4 (DI) — 結合
5. Phase 5 (テスト) — 検証

Phase 1-2 は並列可能。Phase 3 は 1-2 に依存。

---

## E2E検証結果: CF Pages Direct Upload API (2026-03-08)

### 概要

Cloudflare Pages Direct Upload API の動作をcurlのみで検証。
wrangler (`WRANGLER_LOG=debug WRANGLER_LOG_SANITIZE=false`) のリクエスト/レスポンスを完全にトレースし、
curlで同一フローを再現してHTTP 200配信に成功した。

### Step 1: トークン検証

```bash
curl -s 'https://api.cloudflare.com/client/v4/accounts/{account_id}/tokens/verify' \
  -H 'Authorization: Bearer {api_token}'
# → {"result":{"id":"404b50e7...","status":"active"},"success":true}
```

- **エンドポイント**: `GET /accounts/{account_id}/tokens/verify` （アカウントスコープ）
- **注意**: `/user/tokens/verify` はアカウントスコープトークンでは `Invalid API Token` を返す。必ずアカウントスコープのエンドポイントを使用する。

### Step 2-4: Direct Upload フロー

#### 試行1: 単純な `POST /deployments` (multipart) — ❌ 失敗

CFドキュメントに記載のある以下の方式を最初に試行:

```bash
curl -X POST '.../pages/projects/{name}/deployments' \
  -F 'manifest={"/index.html":"{md5_hash}"}' \
  -F '{md5_hash}=@/tmp/test.html;type=text/html'
```

- API レスポンス: `success: true`, deploy stage: `success`
- **しかし `*.pages.dev` へのアクセスは HTTP 500（content-length: 0）**
- ハッシュにMD5を使用しても、任意文字列を使用しても、同じ結果
- **原因**: ファイルコンテンツがCloudflareのアセットKVストアに登録されないため

#### 試行2: wranglerフロー解析 → curlで再現 — ✅ 成功

wranglerのデバッグログ (`WRANGLER_LOG=debug WRANGLER_LOG_SANITIZE=false`) を解析し、
実際のAPIコールフローを特定。以下の **4段階プロセス** が必要:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                CF Pages Direct Upload: 正しいフロー                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Step 1: Upload Token 取得                                              │
│  GET /accounts/{id}/pages/projects/{name}/upload-token                  │
│  Auth: Bearer {API_TOKEN}                                               │
│  → JWT を取得（assets API 認証用、30分有効）                             │
│                                                                         │
│  Step 2: ファイルアップロード（KVストアへbase64で格納）                    │
│  POST /pages/assets/upload                                              │
│  Auth: Bearer {JWT}  ← API_TOKEN ではなく JWT を使う                     │
│  Content-Type: application/json                                         │
│  Body: [{                                                               │
│    "key": "{blake3_hash}",                                              │
│    "value": "{base64_encoded_content}",                                 │
│    "metadata": {"contentType": "text/html"},                            │
│    "base64": true                                                       │
│  }]                                                                     │
│  → {"result":{"successful_key_count":1,"unsuccessful_keys":[]}}         │
│                                                                         │
│  Step 3: ハッシュ登録（アセット参照の確定）                               │
│  POST /pages/assets/upsert-hashes                                       │
│  Auth: Bearer {JWT}                                                     │
│  Content-Type: application/json                                         │
│  Body: {"hashes":["{blake3_hash}"]}                                     │
│  → {"success":true}                                                     │
│                                                                         │
│  Step 4: デプロイ作成（マニフェストのみ、ファイル本体なし）                │
│  POST /accounts/{id}/pages/projects/{name}/deployments                  │
│  Auth: Bearer {API_TOKEN}  ← JWT ではなく API_TOKEN に戻す              │
│  multipart/form-data:                                                   │
│    manifest={"/index.html":"{blake3_hash}"}                             │
│    branch=main                                                          │
│  → deployment URL                                                       │
│                                                                         │
│  ※ オプション: Step 2 の前に check-missing で既存ハッシュを確認可能       │
│  POST /pages/assets/check-missing  Body: {"hashes":[...]}               │
│  → 未登録のハッシュのみ返される（差分アップロード最適化）                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

#### ハッシュ計算方法: Blake3（wrangler準拠）

wranglerソースコード (`wrangler-dist/cli.js`, `src/pages/hash.ts`) より特定:

```javascript
// wrangler (blake3-wasm)
hashFile = (filepath) => {
    const contents = fs.readFileSync(filepath);
    const base64Contents = contents.toString("base64");
    const extension = path.extname(filepath).substring(1); // ".html" → "html"
    return blake3Wasm.hash(base64Contents + extension).toString("hex").slice(0, 32);
};
```

**計算式**:
```
hash = blake3( base64(file_content) + extension_without_dot ).hex()[0..32]

例:
  file: index.html
  content: '<h1>test</h1>\n'
  base64(content) = 'PGgxPnRlc3Q8L2gxPgo='
  input = 'PGgxPnRlc3Q8L2gxPgo=' + 'html'
  hash  = blake3(input).hex()[0..32]
```

**検証**: blake3-wasmで計算したハッシュとwranglerが生成したハッシュが完全一致することを確認済み。

**Rust での計算**:
```rust
use blake3;
use base64::Engine;

fn compute_pages_hash(content: &[u8], extension: &str) -> String {
    let b64 = base64::engine::general_purpose::STANDARD.encode(content);
    let input = format!("{}{}", b64, extension);
    let hash = blake3::hash(input.as_bytes());
    hash.to_hex()[..32].to_string()
}
```

#### 検証結果サマリ

| ステップ | エンドポイント | 結果 |
|---------|---------------|------|
| プロジェクト作成 | `POST /pages/projects` | ✅ 成功 |
| Upload Token 取得 | `GET .../upload-token` | ✅ JWT取得 |
| check-missing | `POST /pages/assets/check-missing` | ✅ 未登録ハッシュ返却 |
| ファイルアップロード | `POST /pages/assets/upload` | ✅ successful_key_count: 1 |
| ハッシュ登録 | `POST /pages/assets/upsert-hashes` | ✅ success: true |
| デプロイ作成 | `POST .../deployments` | ✅ success: true |
| `*.pages.dev` アクセス | HTTPS GET | ✅ **HTTP 200**、HTMLコンテンツ正常配信 |
| プロジェクト削除 | `DELETE /pages/projects` | ✅ success: true |

### 既存 CloudflarePagesProvider の問題点

現在の実装 (`packages/compute/src/adapter/gateway/cloudflare_pages_provider.rs`) は
4段階フロー自体は正しく実装されているが、**ハッシュ計算にMD5を使用している**:

```rust
// 現在の実装 (L247-257) — ❌ MD5を使用
// Build manifest: "/<path>" → "<md5-hex-hash>".
// Cloudflare Pages uses MD5 hashes.   ← このコメントが誤り
let hash = format!("{:x}", md5::compute(&asset.content));
```

**問題**: wranglerはBlake3を使用しており、MD5ハッシュではアセットKVストアとの整合性が取れない。
`check-missing` API は常に「全ファイル未登録」と返し、アップロード自体は成功するが、
マニフェストのMD5ハッシュがKVストア内のキーと一致しないため **配信時に500エラー** になる可能性がある。

#### 修正方針

```diff
// Cargo.toml に blake3 を追加
+ blake3 = "1"
- md5 = "0.7"  # 削除可能

// cloudflare_pages_provider.rs
- let hash = format!("{:x}", md5::compute(&asset.content));
+ let b64 = base64::engine::general_purpose::STANDARD.encode(&asset.content);
+ let ext = std::path::Path::new(&asset.path)
+     .extension()
+     .and_then(|e| e.to_str())
+     .unwrap_or("");
+ let input = format!("{}{}", b64, ext);
+ let hash = blake3::hash(input.as_bytes()).to_hex()[..32].to_string();
```

この修正により、wranglerと同一のハッシュが生成され、
`check-missing` による差分アップロード最適化も正しく機能するようになる。

---

## 影響範囲

- `packages/compute/domain/` — トレイト・enum 追加
- `packages/compute/src/usecase/` — 5-6 ファイル修正
- `packages/compute/src/adapter/gateway/` — 4 ファイル新規 (CodeBuild/Pages 実装 + mock) + 3 ファイル修正 (repository)
- `packages/compute/migrations/` — 1 マイグレーション追加
- `apps/tachyon-api/src/di.rs` — プロバイダー登録 (CodeBuild + Pages)
- `apps/tachyon-api/tests/scenarios/` — 1 テスト追加
- `Cargo.toml` — `aws-sdk-codebuild`, `aws-sdk-s3` 依存追加
