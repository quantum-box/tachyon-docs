# tachyon アーキテクチャ

## 概要
tachyonは統合ビジネスプラットフォーム（ERP的基盤）。全機能をモジュールとして統一的に提供する。

## モジュール構成

| モジュール | 責務 | パッケージ |
|-----------|------|-----------|
| **Core (Auth/IAM)** | 認証、テナント、RBAC、OAuth2 | packages/auth/ |
| **Compute** | Cloud Run, CF Pages, CodeBuild, カスタムドメイン | packages/compute/ |
| **Library** | CMS、コンテンツ管理、GitHub同期、image型 | apps/library-api/ |
| **AI** | Studio, Agent, Tool Jobs, SSEストリーミング | packages/agent-chat/ |
| **Commerce (bakuure)** | 商品, 注文, 在庫, 決済, B2B見積 | apps/bakuure-api/ |
| **CRM** | HubSpot連携, 顧客管理 | packages/crm/ |
| **IaC** | ProjectConfig, Provider管理, SecretResolver | packages/iac/ |
| **Feature Flags** | フラグ管理, 評価, Playground | packages/feature_flag/ |
| **Scenario Tests** | muon連携, APIテスト | muon/ (submodule) |
| **Ops** | Process Manager, Taskflow, Onboarding | packages/process_manager/, packages/onboarding/ |
| **Payment** | Stripe, Square, 決済処理 | packages/payment/, packages/providers/square/ |

## テナントモデル

### 階層構造
```
system (root)
├── Platform Tenant (例: Tachyon)
│   ├── Organization (例: Quantum Box)
│   │   ├── Operator (例: bakuure-sandbox)
│   │   │   └── Store (例: POWSON EC)
│   │   └── Operator (例: bakuure-production)
│   └── Organization (例: 別企業)
│       └── Operator
└── Dev Tenant (例: Tachyon dev)
    └── (開発用テナント群)
```

### テナントID体系
- tenant: `tn_` + ULID
- service_account: `sa_` + ULID
- public_api_key: `pk_` + ULID

### テナント作成時に必要なもの
1. `tachyon_apps_auth.tenants` レコード
2. `tachyon_apps_auth.service_accounts` レコード
3. `tachyon_apps_auth.public_api_keys` レコード
4. `tachyon_apps_iac.manifests` (kind: ProjectConfig) — プロバイダー設定

## レイヤーアーキテクチャ

### 3層UI構成
```
┌─────────────────────────────────────────────────┐
│  Platform Admin (tachyon-ui)                    │
│  対象: プラットフォーム管理者                    │
│  機能: テナントCRUD, Compute, IAM, 課金,        │
│        Library, AI Studio, Feature Flags,       │
│        Scenario Tests, IaC設定                  │
│  URL: app.txcloud.app / app.n1.tachy.one        │
├─────────────────────────────────────────────────┤
│  Operator Admin (bakuure-admin-ui)              │
│  対象: 各テナントの業務管理者                    │
│  機能: 商品管理, 注文管理, 在庫管理, 顧客管理,  │
│        見積・受注, Square/Stripe連携設定,        │
│        自テナント設定                           │
│  URL: bakuureadmin.n1.tachy.one                 │
├─────────────────────────────────────────────────┤
│  End User (bakuure-ui / 個別ストア)             │
│  対象: 消費者・エンドユーザー                    │
│  機能: ストアフロント, カート, チェックアウト,   │
│        注文履歴                                 │
│  URL: *.txcloud.app (テナントごと)              │
└─────────────────────────────────────────────────┘
```

### RBACモデル (設計方針)
| ロール | スコープ | 権限 |
|--------|---------|------|
| **platform_admin** | 全テナント横断 | テナントCRUD, Compute管理, IAM全権限 |
| **org_admin** | Organization内 | 配下Operator管理, 課金設定 |
| **operator_admin** | 自テナント | 商品/注文/在庫/顧客/設定の全権限 |
| **store_staff** | 自テナント(制限) | 注文確認, ステータス更新, 在庫確認 |
| **customer** | 自アカウント | 注文履歴, プロフィール編集 |

### セルフサービス化の方針
- **テナント作成**: Platform Admin が tachyon-ui から作成 (CC-553)
- **プロバイダー接続**: Operator が bakuure-admin-ui から OAuth接続 (Square等)
- **ストア公開**: Operator が Compute経由でデプロイ
- **初期設定**: Onboardingパッケージ (QuickStartDrawer) で誘導

## プロバイダーパターン (IaC)

外部サービス連携はすべてIaC ProjectConfig経由で統一管理:

```yaml
apiVersion: apps.tachy.one/v1alpha
kind: ProjectConfig
metadata:
  name: bakuure-sandbox
  tenantId: tn_xxx
spec:
  providers:
    - name: square
      provider_type: payment
      config:
        api_key: { $secret_ref: square/api_key }
    - name: stripe
      provider_type: payment
      config:
        api_key: { $secret_ref: stripe/secret_key }
    - name: hubspot
      provider_type: crm
      config:
        api_key: { $secret_ref: hubspot/api_key }
```

- `$secret_ref` で AWS Secrets Manager から動的解決
- テナントごとにプロバイダー構成をカスタマイズ可能
- `allow_override` で Operator レベルのカスタマイズも許可

## API設計原則

| プロトコル | 用途 |
|-----------|------|
| **GraphQL** | CRUD操作全般（商品, 注文, テナント等） |
| **REST** | 外部webhook受信, OAuth callback, 公開API |
| **SSE** | リアルタイム（AIストリーミング, ビルド進捗, muon実行） |

## デプロイ構成

| コンポーネント | インフラ |
|---------------|---------|
| tachyon-api (Rust) | ECS on Fargate → NLB |
| tachyon-ui (Next.js) | AWS Amplify |
| bakuure-api | tachyon-apiに統合 |
| bakuure-admin-ui | AWS Amplify |
| bakuure-ui / 個別ストア | CF Pages (tachyon compute) |
| docs.txcloud.app | CF Pages (tachyon compute) |
| ルーティング | Cloudflare Worker (txcloud-proxy) + KV |

## 今後の設計課題
- RBAC完全実装 (platform_admin / org_admin / operator_admin / store_staff / customer)
- テナントオンボーディングフロー（作成→初期設定→商品登録→ストア公開）
- Operator向けセルフサービスダッシュボード
- マルチOrganization対応
- テナント間データ分離の強化
- API Gatewayパターン（テナントごとのレート制限、API key認証）
