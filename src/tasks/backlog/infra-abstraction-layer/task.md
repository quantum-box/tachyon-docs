---
title: "クラウドインフラ抽象化層コンテキストの構築"
type: "feature"
emoji: "🌐"
topics:
  - infrastructure
  - cloud
  - sakura-cloud
  - sakura-apprun
  - aws-ec2
  - gce
  - cloud-run
  - ecs
  - cloudflare-containers
  - abstraction-layer
published: true
targetFiles:
  - packages/compute/
  - packages/compute/domain/
  - packages/compute/src/
  - packages/providers/sakura/
  - packages/providers/aws/
  - packages/providers/google/
  - packages/providers/cloudflare/
github: "https://github.com/quantum-box/tachyon-apps"
---

# クラウドインフラ抽象化層コンテキストの構築

## 概要

さくらクラウド、AWS EC2、Google Cloud GCE などのVMインスタンス、およびCloud Run、ECS、さくらのAppRunなどのマネージドコンテナサービスを統一的なインターフェースで管理できる抽象化層（Compute Context）を構築する。

## 背景・目的

- 複数のクラウドプロバイダーを利用する際、各プロバイダー固有のAPIやSDKを個別に扱う必要がある
- インスタンス管理のビジネスロジックがプロバイダー固有の実装に依存してしまう
- プロバイダーの追加・切り替え時に大規模な改修が必要になる
- 統一インターフェースを提供することで、マルチクラウド戦略を柔軟に実現したい

### 期待される成果

- プロバイダーに依存しないインスタンス管理ユースケースの実装
- 新規クラウドプロバイダー追加時の実装コスト削減
- テスト容易性の向上（モックプロバイダーの利用）
- IaC（Infrastructure as Code）連携の基盤整備

## 詳細仕様

### 機能要件

1. **インスタンスライフサイクル管理**
   - インスタンスの作成（Create）
   - インスタンスの削除（Delete）
   - インスタンスの起動（Start）
   - インスタンスの停止（Stop）
   - インスタンスの再起動（Restart）

2. **インスタンス情報取得**
   - インスタンス一覧の取得（List）
   - インスタンス詳細の取得（Get）
   - インスタンスステータスの取得（GetStatus）

3. **対応クラウドプロバイダー**

   **VMインスタンス:**
   - さくらクラウド（Sakura Cloud）
   - AWS EC2
   - Google Cloud GCE
   - （将来拡張）Azure VM、Vultr、ConoHa など

   **マネージドコンテナサービス:**
   - さくらのAppRun（Sakura AppRun）
   - Google Cloud Run
   - AWS ECS (Fargate)
   - Cloudflare Containers
   - （将来拡張）Azure Container Apps、Fly.io など

4. **インスタンス構成（VM）**
   - CPU/メモリスペックの指定
   - ディスク構成
   - ネットワーク設定（VPC、サブネット、セキュリティグループ）
   - タグ/ラベル管理
   - SSHキー設定

5. **サービス構成（コンテナ）**
   - コンテナイメージ指定
   - CPU/メモリリソース割り当て
   - 環境変数・シークレット
   - ポート設定
   - オートスケーリング設定（最小/最大インスタンス数）
   - ヘルスチェック設定

### 非機能要件

- **パフォーマンス**: 各プロバイダーAPIのレート制限を考慮した実装
- **セキュリティ**: 認証情報はSecrets Manager等で管理、コード内にハードコードしない
- **可観測性**: 操作ログ、メトリクス、トレースの出力
- **保守性**: Clean Architecture に準拠し、ドメイン層とインフラ層を分離
- **拡張性**: 新規プロバイダーの追加が容易な設計
- **可用性**: リトライロジック、サーキットブレーカーパターンの実装

### コンテキスト別の責務

```yaml
contexts:
  compute:
    description: "クラウドコンピュート抽象化層"
    responsibilities:
      - インスタンスライフサイクル管理のドメインモデル定義
      - プロバイダー非依存のユースケース実装
      - 統一インターフェース（Trait）の定義
      - インスタンス構成のバリデーション
      - プロバイダーレジストリの管理

  providers:
    description: "各クラウドプロバイダーのアダプター実装（packages/providers/配下）"
    responsibilities:
      - さくらクラウドAPI連携（VM/AppRun）（packages/providers/sakura/）
      - AWS EC2/ECS SDK連携（packages/providers/aws/に追加）
      - Google Cloud GCE/Cloud Run API連携（packages/providers/google/を新設）
      - Cloudflare Containers API連携（packages/providers/cloudflare/を新設）
      - 認証・認可の処理
      - プロバイダー固有設定のマッピング

  iac:
    description: "既存IaCコンテキストとの連携"
    responsibilities:
      - インフラ構成のマニフェスト管理
      - テナント別クラウド設定の保持
      - シークレット注入
```

### ドメインモデル設計

```yaml
# ドメインエンティティ
entities:
  # 共通の抽象リソース
  ComputeResource:
    description: "VM/コンテナを抽象化した計算リソース"
    fields:
      - id: ResourceId           # プロバイダー非依存の内部ID
      - provider_id: String      # プロバイダー側のリソースID
      - provider: CloudProvider
      - resource_type: ResourceType  # VM or Container
      - name: String
      - status: ResourceStatus
      - tags: Map<String, String>
      - created_at: DateTime
      - updated_at: DateTime

  # VMインスタンス固有
  VmInstance:
    description: "VMインスタンスを表すエンティティ"
    fields:
      - resource: ComputeResource  # 共通フィールド
      - spec: VmSpec
      - network: NetworkConfig
      - ssh_keys: Vec<String>

  VmSpec:
    description: "VMのスペック"
    fields:
      - cpu_cores: u32
      - memory_gb: u32
      - disk_size_gb: u32
      - disk_type: DiskType      # SSD / HDD
      - os_image: OsImage

  # コンテナサービス固有
  ContainerService:
    description: "マネージドコンテナサービスを表すエンティティ"
    fields:
      - resource: ComputeResource  # 共通フィールド
      - spec: ContainerSpec
      - scaling: ScalingConfig
      - health_check: HealthCheckConfig

  ContainerSpec:
    description: "コンテナのスペック"
    fields:
      - image: String            # コンテナイメージURL
      - cpu: f32                 # vCPU (0.25, 0.5, 1, 2, 4, etc.)
      - memory_mb: u32           # メモリ（MB）
      - port: u16                # 公開ポート
      - env_vars: Map<String, String>
      - secrets: Vec<SecretRef>
      - command: Option<Vec<String>>

  ScalingConfig:
    description: "オートスケーリング設定"
    fields:
      - min_instances: u32
      - max_instances: u32
      - target_cpu_percent: Option<u32>
      - target_memory_percent: Option<u32>
      - scale_to_zero: bool      # Cloud Run等のゼロスケール対応

  HealthCheckConfig:
    description: "ヘルスチェック設定"
    fields:
      - path: String             # /health など
      - interval_seconds: u32
      - timeout_seconds: u32
      - healthy_threshold: u32
      - unhealthy_threshold: u32

  NetworkConfig:
    description: "ネットワーク設定"
    fields:
      - public_ip: Option<IpAddr>
      - private_ip: Option<IpAddr>
      - vpc_id: Option<String>
      - subnet_id: Option<String>
      - security_groups: Vec<String>
      - ingress_url: Option<String>  # AppRun/Cloud Run 等のURL

# 値オブジェクト
value_objects:
  ResourceId:
    prefix: "res_"
    description: "計算リソースの一意識別子"

  ResourceType:
    variants:
      - Vm
      - Container

  CloudProvider:
    variants:
      # VM
      - SakuraCloud
      - AwsEc2
      - GoogleGce
      # Container
      - SakuraAppRun
      - GoogleCloudRun
      - AwsEcs
      - CloudflareContainers

  ResourceStatus:
    variants:
      - Pending
      - Provisioning
      - Running
      - Stopping
      - Stopped
      - Failed
      - Terminated
      - Unknown

  DiskType:
    variants:
      - Ssd
      - Hdd

  OsImage:
    fields:
      - provider_image_id: String
      - os_type: OsType          # Linux / Windows
      - distribution: Option<String>  # Ubuntu, CentOS, etc.

  SecretRef:
    description: "シークレット参照"
    fields:
      - name: String             # 環境変数名
      - secret_id: String        # Secrets Manager等のID
      - version: Option<String>
```

### プロバイダートレイト設計

```rust
/// VMプロバイダーの統一インターフェース
#[async_trait]
pub trait VmProvider: Send + Sync {
    async fn create(&self, input: CreateVmInput) -> Result<VmInstance>;
    async fn delete(&self, instance_id: &str) -> Result<()>;
    async fn start(&self, instance_id: &str) -> Result<()>;
    async fn stop(&self, instance_id: &str) -> Result<()>;
    async fn list(&self, filter: VmFilter) -> Result<Vec<VmInstance>>;
    async fn get(&self, instance_id: &str) -> Result<Option<VmInstance>>;
    fn provider_type(&self) -> CloudProvider;
}

/// コンテナサービスプロバイダーの統一インターフェース
#[async_trait]
pub trait ContainerServiceProvider: Send + Sync {
    async fn deploy(&self, input: DeployContainerInput) -> Result<ContainerService>;
    async fn delete(&self, service_id: &str) -> Result<()>;
    async fn update(&self, service_id: &str, input: UpdateContainerInput) -> Result<ContainerService>;
    async fn scale(&self, service_id: &str, min: u32, max: u32) -> Result<()>;
    async fn list(&self, filter: ContainerFilter) -> Result<Vec<ContainerService>>;
    async fn get(&self, service_id: &str) -> Result<Option<ContainerService>>;
    async fn get_logs(&self, service_id: &str, since: Duration) -> Result<Vec<LogEntry>>;
    fn provider_type(&self) -> CloudProvider;
}

/// 統一リソースプロバイダー（VM/コンテナを抽象化）
#[async_trait]
pub trait ComputeProvider: Send + Sync {
    async fn create_resource(&self, input: CreateResourceInput) -> Result<ComputeResource>;
    async fn delete_resource(&self, resource_id: &str) -> Result<()>;
    async fn list_resources(&self, filter: ResourceFilter) -> Result<Vec<ComputeResource>>;
    async fn get_resource(&self, resource_id: &str) -> Result<Option<ComputeResource>>;
    fn provider_type(&self) -> CloudProvider;
    fn resource_type(&self) -> ResourceType;
}

/// プロバイダーレジストリ（テナント別にプロバイダーを管理）
pub trait ComputeProviderRegistry: Send + Sync {
    fn get_vm_provider(&self, tenant_id: &TenantId, provider: CloudProvider)
        -> Result<Arc<dyn VmProvider>>;
    fn get_container_provider(&self, tenant_id: &TenantId, provider: CloudProvider)
        -> Result<Arc<dyn ContainerServiceProvider>>;
}
```

### ユースケース設計

```yaml
usecases:
  # === VM関連 ===
  CreateVm:
    description: "新規VMインスタンスを作成する"
    input:
      - executor: Executor
      - multi_tenancy: MultiTenancyAction
      - provider: CloudProvider
      - name: String
      - spec: VmSpec
      - network: NetworkConfig
      - tags: Map<String, String>
    output:
      - instance: VmInstance
    policy_action: "compute:CreateVm"

  DeleteVm:
    description: "VMインスタンスを削除する"
    input:
      - executor: Executor
      - multi_tenancy: MultiTenancyAction
      - instance_id: ResourceId
    output: "()"
    policy_action: "compute:DeleteVm"

  StartVm:
    description: "停止中のVMを起動する"
    policy_action: "compute:StartVm"

  StopVm:
    description: "実行中のVMを停止する"
    policy_action: "compute:StopVm"

  ListVms:
    description: "VMインスタンス一覧を取得する"
    policy_action: "compute:ListVms"

  GetVm:
    description: "VMインスタンス詳細を取得する"
    policy_action: "compute:GetVm"

  # === コンテナサービス関連 ===
  DeployContainerService:
    description: "コンテナサービスをデプロイする"
    input:
      - executor: Executor
      - multi_tenancy: MultiTenancyAction
      - provider: CloudProvider  # SakuraAppRun / CloudRun / ECS / CloudflareContainers
      - name: String
      - spec: ContainerSpec
      - scaling: ScalingConfig
      - tags: Map<String, String>
    output:
      - service: ContainerService
    policy_action: "compute:DeployContainerService"

  UpdateContainerService:
    description: "コンテナサービスを更新する（イメージ、設定変更）"
    input:
      - executor: Executor
      - multi_tenancy: MultiTenancyAction
      - service_id: ResourceId
      - spec: Option<ContainerSpec>
      - scaling: Option<ScalingConfig>
    output:
      - service: ContainerService
    policy_action: "compute:UpdateContainerService"

  DeleteContainerService:
    description: "コンテナサービスを削除する"
    policy_action: "compute:DeleteContainerService"

  ScaleContainerService:
    description: "コンテナサービスのスケール設定を変更する"
    policy_action: "compute:ScaleContainerService"

  ListContainerServices:
    description: "コンテナサービス一覧を取得する"
    policy_action: "compute:ListContainerServices"

  GetContainerService:
    description: "コンテナサービス詳細を取得する"
    policy_action: "compute:GetContainerService"

  GetContainerLogs:
    description: "コンテナサービスのログを取得する"
    policy_action: "compute:GetContainerLogs"

  # === 統一リソース関連 ===
  ListResources:
    description: "全計算リソース（VM/コンテナ）を一覧取得する"
    policy_action: "compute:ListResources"
```

## 実装方針

### アーキテクチャ設計

```
# Compute コンテキスト（ドメイン・ユースケース・アダプター）
packages/compute/
├── Cargo.toml
├── domain/
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs
│       ├── resource.rs          # ComputeResource エンティティ
│       ├── vm_instance.rs       # VmInstance エンティティ
│       ├── vm_spec.rs           # VmSpec 値オブジェクト
│       ├── container_service.rs # ContainerService エンティティ
│       ├── container_spec.rs    # ContainerSpec 値オブジェクト
│       ├── scaling_config.rs    # ScalingConfig 値オブジェクト
│       ├── cloud_provider.rs    # CloudProvider 列挙型
│       ├── resource_status.rs   # ResourceStatus 列挙型
│       ├── network_config.rs    # NetworkConfig 値オブジェクト
│       ├── provider.rs          # VmProvider / ContainerServiceProvider トレイト定義
│       └── repository.rs        # ResourceRepository トレイト
├── src/
│   ├── lib.rs
│   ├── usecase/
│   │   ├── mod.rs
│   │   ├── create_vm.rs
│   │   ├── delete_vm.rs
│   │   ├── start_vm.rs
│   │   ├── stop_vm.rs
│   │   ├── list_vms.rs
│   │   ├── deploy_container_service.rs
│   │   ├── update_container_service.rs
│   │   ├── delete_container_service.rs
│   │   ├── scale_container_service.rs
│   │   ├── list_container_services.rs
│   │   └── get_container_logs.rs
│   ├── interface_adapter/
│   │   ├── mod.rs
│   │   ├── gateway/
│   │   │   ├── mod.rs
│   │   │   └── sqlx_resource_repository.rs
│   │   └── controller/
│   │       └── graphql/
│   │           ├── mod.rs
│   │           ├── query.rs
│   │           └── mutation.rs
│   ├── registry.rs              # ComputeProviderRegistry 実装
│   └── app.rs                   # ComputeApp
└── migrations/
    └── YYYYMMDDHHMMSS_create_compute_resources_table.up.sql

# プロバイダー実装（既存 packages/providers/ に追加）
packages/providers/
├── sakura/                      # 【新規】さくらクラウド
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs
│       ├── client.rs            # API クライアント
│       ├── vm.rs                # VmProvider 実装
│       ├── apprun.rs            # ContainerServiceProvider 実装（AppRun）
│       └── error.rs
├── aws/                         # 【既存拡張】AWS
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs
│       ├── ec2.rs               # VmProvider 実装
│       ├── ecs.rs               # ContainerServiceProvider 実装
│       └── ... (既存機能)
├── google/                      # 【新規】Google Cloud
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs
│       ├── gce.rs               # VmProvider 実装
│       └── cloud_run.rs         # ContainerServiceProvider 実装
└── cloudflare/                  # 【新規】Cloudflare
    ├── Cargo.toml
    └── src/
        ├── lib.rs
        └── containers.rs        # ContainerServiceProvider 実装
```

### 技術選定

| 領域 | 技術 | 理由 |
|------|------|------|
| **VMプロバイダー** | | |
| さくらクラウドAPI | `sacloud-rs` または直接HTTP | Rust用公式SDKは限定的、REST APIを直接呼び出し |
| AWS EC2 | `aws-sdk-ec2` | 公式SDK、非同期対応 |
| Google GCE | `google-compute1` | 公式SDK |
| **コンテナプロバイダー** | | |
| さくらのAppRun | REST API | さくらクラウドAPIと同様の認証方式 |
| Google Cloud Run | `google-run1` または REST API | 公式SDK |
| AWS ECS | `aws-sdk-ecs` | 公式SDK、非同期対応 |
| Cloudflare Containers | REST API | Cloudflare API Token認証 |
| **共通** | | |
| 非同期ランタイム | `tokio` | プロジェクト標準 |
| HTTP Client | `reqwest` | さくらクラウド/Cloud Run API呼び出し用 |
| シリアライゼーション | `serde` | 各プロバイダーAPIレスポンスのデシリアライズ |

### さくらクラウドAPI連携

```yaml
sakura_cloud_api:
  base_url: "https://secure.sakura.ad.jp/cloud/zone/{zone}/api/cloud/1.1"
  authentication:
    type: "Basic Auth"
    credentials:
      access_token: "環境変数 SAKURA_ACCESS_TOKEN"
      access_token_secret: "環境変数 SAKURA_ACCESS_TOKEN_SECRET"

  endpoints:
    create_server: "POST /server"
    delete_server: "DELETE /server/{id}"
    get_server: "GET /server/{id}"
    list_servers: "GET /server"
    power_on: "PUT /server/{id}/power"
    power_off: "DELETE /server/{id}/power"

  zone_mapping:
    is1a: "石狩第1ゾーン"
    is1b: "石狩第2ゾーン"
    tk1a: "東京第1ゾーン"
    tk1b: "東京第2ゾーン"
```

### データベース設計

```sql
-- 計算リソース管理テーブル（VM/コンテナ共通）
CREATE TABLE compute_resources (
    id VARCHAR(36) PRIMARY KEY,              -- res_ULID
    resource_type VARCHAR(16) NOT NULL,      -- vm / container
    provider VARCHAR(32) NOT NULL,           -- sakura_cloud / sakura_apprun / aws_ec2 / gce / cloud_run / ecs / cloudflare_containers
    provider_resource_id VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL,
    metadata JSON NOT NULL DEFAULT '{}',     -- tags等
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    deleted_at DATETIME(6),

    INDEX idx_tenant_provider (tenant_id, provider),
    INDEX idx_resource_type (resource_type),
    INDEX idx_status (status),
    UNIQUE INDEX idx_provider_resource (provider, provider_resource_id)
);

-- VMインスタンス詳細テーブル
CREATE TABLE compute_vm_instances (
    resource_id VARCHAR(36) PRIMARY KEY,
    cpu_cores INT UNSIGNED NOT NULL,
    memory_gb INT UNSIGNED NOT NULL,
    disk_size_gb INT UNSIGNED NOT NULL,
    disk_type VARCHAR(16) NOT NULL,          -- ssd / hdd
    os_image_id VARCHAR(255),
    public_ip VARCHAR(45),
    private_ip VARCHAR(45),
    vpc_id VARCHAR(255),
    subnet_id VARCHAR(255),
    security_groups JSON NOT NULL DEFAULT '[]',
    ssh_keys JSON NOT NULL DEFAULT '[]',

    FOREIGN KEY (resource_id) REFERENCES compute_resources(id) ON DELETE CASCADE
);

-- コンテナサービス詳細テーブル
CREATE TABLE compute_container_services (
    resource_id VARCHAR(36) PRIMARY KEY,
    image VARCHAR(512) NOT NULL,
    cpu DECIMAL(4,2) NOT NULL,               -- vCPU (0.25, 0.5, 1, 2, etc.)
    memory_mb INT UNSIGNED NOT NULL,
    port INT UNSIGNED,
    min_instances INT UNSIGNED NOT NULL DEFAULT 0,
    max_instances INT UNSIGNED NOT NULL DEFAULT 1,
    scale_to_zero BOOLEAN NOT NULL DEFAULT FALSE,
    ingress_url VARCHAR(512),
    env_vars JSON NOT NULL DEFAULT '{}',
    secrets JSON NOT NULL DEFAULT '[]',
    health_check JSON,

    FOREIGN KEY (resource_id) REFERENCES compute_resources(id) ON DELETE CASCADE
);
```

## タスク分解

### フェーズ1: ドメインモデル・基盤実装 📝
- [ ] `packages/compute/domain` クレート作成
- [ ] ResourceId, CloudProvider, ResourceStatus, ResourceType 値オブジェクト実装
- [ ] ComputeResource, VmInstance, ContainerService エンティティ実装
- [ ] VmSpec, ContainerSpec, ScalingConfig, NetworkConfig 値オブジェクト実装
- [ ] VmProvider / ContainerServiceProvider トレイト定義（domain/provider.rs）
- [ ] ResourceRepository トレイト定義

### フェーズ2: ユースケース実装 📝
- [ ] CreateVm / DeleteVm / StartVm / StopVm / ListVms ユースケース実装
- [ ] DeployContainerService / UpdateContainerService / DeleteContainerService ユースケース実装
- [ ] ScaleContainerService / ListContainerServices / GetContainerLogs ユースケース実装
- [ ] ComputeProviderRegistry 実装（compute/src/registry.rs）
- [ ] ComputeApp 統合

### フェーズ3: さくらクラウドプロバイダー実装（packages/providers/sakura/）📝
- [ ] `packages/providers/sakura` クレート新規作成
- [ ] さくらクラウドAPI クライアント実装
- [ ] 認証処理（Basic Auth）
- [ ] VmProvider トレイト実装（サーバー CRUD / 電源操作）
- [ ] ContainerServiceProvider トレイト実装（AppRun）
- [ ] エラーハンドリング・リトライロジック

### フェーズ4: AWSプロバイダー実装（packages/providers/aws/ 拡張）📝
- [ ] 既存 `packages/providers/aws` クレートに Compute 機能を追加
- [ ] EC2: aws-sdk-ec2 統合、VmProvider 実装
- [ ] ECS: aws-sdk-ecs 統合、ContainerServiceProvider 実装（Fargate）
- [ ] IAMロール/認証情報管理

### フェーズ5: Google Cloudプロバイダー実装（packages/providers/google/）📝
- [ ] `packages/providers/google` クレート新規作成
- [ ] GCE: google-compute1 SDK統合、VmProvider 実装
- [ ] Cloud Run: Cloud Run API統合、ContainerServiceProvider 実装
- [ ] サービスアカウント認証

### フェーズ6: Cloudflareプロバイダー実装（packages/providers/cloudflare/）📝
- [ ] `packages/providers/cloudflare` クレート新規作成
- [ ] Cloudflare Containers API統合、ContainerServiceProvider 実装
- [ ] API Token認証

### フェーズ7: リポジトリ・永続化層 📝
- [ ] マイグレーションファイル作成（3テーブル）
- [ ] SqlxResourceRepository 実装
- [ ] シナリオテスト作成

### フェーズ8: GraphQL API 📝
- [ ] Query: vms, vm, containerServices, containerService
- [ ] Mutation: createVm, deleteVm, startVm, stopVm, deployContainerService, updateContainerService, deleteContainerService, scaleContainerService
- [ ] GraphQL スキーマ生成・フロントエンド連携

### フェーズ9: IaC連携・運用整備 📝
- [ ] IaCコンテキストとの連携設計
- [ ] テナント別クラウド認証情報管理
- [ ] Policy Action 追加（compute:*）
- [ ] ドキュメント整備

## テスト計画

### ユニットテスト
- ドメインモデルのバリデーションテスト
- ユースケースのロジックテスト（モックプロバイダー使用）
- エラーハンドリングテスト

### 統合テスト
- SqlxInstanceRepository の CRUD テスト
- GraphQL API のレスポンステスト

### E2Eテスト（手動/CI制限付き）
- 各クラウドプロバイダーへの実際の接続テスト
- インスタンス作成→起動→停止→削除の一連フロー

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| さくらクラウドのRust SDKが未成熟 | 中 | REST APIを直接呼び出し、独自クライアント実装 |
| 各プロバイダーのAPI仕様差異 | 中 | 抽象化層で差異を吸収、プロバイダー固有設定はmetadataで管理 |
| 認証情報の漏洩リスク | 高 | Secrets Manager/IaCマニフェストで管理、環境変数経由で注入 |
| APIレート制限 | 中 | リトライロジック、バックオフ戦略の実装 |
| テスト時の課金発生 | 低 | モックプロバイダー活用、最小スペックでのテスト |

## 参考資料

- [さくらクラウドAPI リファレンス](https://developer.sakura.ad.jp/cloud/api/)
- [さくらのAppRun](https://apprun.io/)
- [AWS EC2 API Reference](https://docs.aws.amazon.com/AWSEC2/latest/APIReference/)
- [Google Compute Engine API](https://cloud.google.com/compute/docs/reference/rest/v1)
- [Google Cloud Run API](https://cloud.google.com/run/docs/reference/rest)
- [Cloudflare Containers](https://developers.cloudflare.com/containers/)
- [aws-sdk-rust](https://github.com/awslabs/aws-sdk-rust)
- [google-apis-rs](https://github.com/Byron/google-apis-rs)

## 完了条件

- [ ] ドメインモデル・ユースケースが実装されている
- [ ] さくらクラウド/AWS EC2/GCE の3プロバイダーが動作する
- [ ] GraphQL API が提供されている
- [ ] シナリオテストが通過する
- [ ] 正式な仕様ドキュメントが作成されている
- [ ] タスクディレクトリを completed/[新バージョン]/ に移動済み

### バージョン番号の決定基準

**マイナーバージョン（x.X.x）を上げる場合:**
- [x] 新機能の追加
- [x] 新しいAPIエンドポイントの追加
- [x] 新しい統合やサービスの追加

→ 本タスク完了時はマイナーバージョンを上げる（例: v0.27.0 → v0.28.0）

## 備考

- 初期実装ではさくらクラウドを優先し、その後AWS EC2、GCEの順で実装を進める
- 各プロバイダーの実装は独立したサブタスクとして進行可能
- フロントエンドUI（インスタンス管理画面）は別タスクとして分離する
