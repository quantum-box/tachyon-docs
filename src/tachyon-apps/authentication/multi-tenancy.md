---
title: "マルチテナンシー構造"
emoji: "🏢"
topics: ["authentication", "multi-tenancy", "platform", "operator"]
published: true
---

# マルチテナンシー構造

Tachyon Appsでは、複雑なB2B SaaS要件に対応するため、階層的なマルチテナンシー構造を採用しています。

## 概要

システムは以下の4階層で構成されています：

```
Host
└── Platform（プラットフォーム提供者）
    └── Operator（顧客企業）
        └── User（エンドユーザー）
```

## エンティティの詳細

### Platform（プラットフォーム）

**定義**: Operatorに機能を提供するための上位テナント

**特徴**:
- 複数のOperatorを作成・管理できる
- `PlatformId`で識別される
- SaaS事業者やプラットフォーム提供者を表す

**例**:
- QuantumBox Platform
- パートナー企業のプラットフォーム

### Operator（オペレーター）

**定義**: ユーザーに機能を提供するための下位テナント

**特徴**:
- 必ず1つのPlatformに所属する（`platform_id`を持つ）
- `OperatorId`（内部的には`TenantId`）で識別される
- 一意のエイリアス（`operator_name`）を持つ
- 実際のサービスを利用する企業や組織を表す

**例**:
- 企業A（製造業）
- 企業B（小売業）
- 企業C（サービス業）

## MultiTenancyパターン

認証システムは、以下の4つのMultiTenancyパターンをサポートしています：

### 1. (None, None)
- **対象**: すべてのテナント
- **用途**: パブリックな画面、Tachyonアプリの初期画面
- **例**: ログイン画面、公開ランディングページ

### 2. (None, Some(operator))
- **対象**: 特定のOperatorのみ
- **用途**: 特定企業向けのアプリケーション操作
- **例**: 企業専用の管理画面、顧客ポータル

### 3. (Some(platform), None)
- **対象**: 特定Platform配下の全Operator
- **用途**: Platform管理者による一括操作
- **例**: Platform管理画面、全Operator向けの通知

### 4. (Some(platform), Some(operator))
- **対象**: 特定Platformの特定Operator
- **用途**: より細かい権限制御が必要な操作
- **例**: Platform管理者による特定Operatorのサポート

## HTTPヘッダーによる制御

APIリクエストでは、以下のHTTPヘッダーを使用してマルチテナンシーを制御します：

### 必須ヘッダー

```http
x-operator-id: te_01j5qvqd7v0kprfqvwhrgqb3f3  # Operator ID（Tenant ID）
Authorization: Bearer <token>                  # 認証トークン
```

### オプションヘッダー

```http
x-platform-id: te_01j5qvqd7v0kprfqvwhrgqb3f2  # Platform ID
x-user-id: us_01hs2yepy5hw4rz8pdq2wywnwt      # User ID（開発環境のみ）
```

## 開発環境での使用

開発環境（`ENVIRONMENT=development`）では、以下の簡易認証が利用可能です：

```http
Authorization: Bearer dummy-token
x-operator-id: <任意のOperator ID>
x-user-id: <任意のUser ID>（省略時: us_01hs2yepy5hw4rz8pdq2wywnwt）
```

## データベース構造

`tenants`テーブルで統一管理され、`parent_tenant_id`で親子関係を表現します：

```sql
-- Platform（parent_tenant_id = NULL）
INSERT INTO tenants (id, name, parent_tenant_id) 
VALUES ('te_platform_001', 'QuantumBox Platform', NULL);

-- Operator（parent_tenant_id = Platform ID）
INSERT INTO tenants (id, name, parent_tenant_id) 
VALUES ('te_operator_001', '企業A', 'te_platform_001');
```

## 実装例

### Rustでの実装

```rust
use crate::usecase::{Executor, MultiTenancy};

// ハンドラーでの使用例
async fn handler(
    executor: Executor,
    multi_tenancy: MultiTenancy,
) -> Result<Response> {
    // 権限チェック
    auth_app.check_policy(
        &executor,
        &multi_tenancy,
        "resource:action",
    ).await?;
    
    // ビジネスロジック
    let operator_id = multi_tenancy.get_operator_id()?;
    // ...
}
```

### TypeScriptでの使用例

```typescript
// APIリクエストの例
const response = await fetch('/api/resource', {
  headers: {
    'Authorization': 'Bearer ' + token,
    'x-operator-id': operatorId,
    'x-platform-id': platformId, // オプション
  }
});
```

## プロバイダー設定の継承

テナント階層に基づき、プロバイダー設定（APIキー等）は3段階で解決されます。

### 設定解決の優先順位

```
1. Operator設定   → 最優先（InheritanceRuleが許可する場合）
2. Platform設定   → Operator設定がない場合
3. Host設定       → Platform設定もない場合（フォールバック）
```

### InheritanceRule（継承ルール）

各プロバイダーには継承ルールが設定され、Operatorがどの程度カスタマイズできるかを制御します。

| ルール | 説明 | 例 |
|--------|------|-----|
| `Mandatory` | Operatorは上書き不可。Platform/Host設定のみ使用 | OpenAI, Anthropic, Stripe |
| `AllowOverride` | Operatorが自由にカスタマイズ可能 | HubSpot, Square |
| `AllowExtend` | 親設定に存在しないキーのみ追加可能 | OAuth2設定 |
| `AllowSubset` | 親設定に存在するキーのみ設定可能 | 機能制限時 |

### 設定例（IaCマニフェスト）

継承ルールはHost設定のProjectConfigManifestで定義します：

```yaml
# scripts/seeds/n1-seed/003-iac-manifests.yaml
apiVersion: apps.tachy.one/v1alpha
kind: ProjectConfig
metadata:
  name: system-config
  tenantId: <host_tenant_id>
spec:
  providers:
    - name: openai
      provider_type: ai
      config:
        api_key:
          $secret_ref: openai/api_key
  inheritance_rules:
    - provider: openai
      rule: mandatory
      description: "OpenAI settings are Platform-managed (cost control)"
    - provider: hubspot
      rule: allow_override
      description: "HubSpot can be customized per Operator"
```

### 読み取り時の動作

```
Operatorがプロバイダー設定を要求
    ↓
InheritanceRule をチェック
    ↓
┌─ Mandatory ────────────────────────┐
│  Operator設定は無視                 │
│  Platform設定 → Host設定の順で解決  │
└────────────────────────────────────┘
┌─ AllowOverride ────────────────────┐
│  Operator設定があれば使用           │
│  なければPlatform → Hostへ          │
└────────────────────────────────────┘
```

### 書き込み時の動作

```
Operatorが設定を保存しようとする
    ↓
InheritanceRule をチェック
    ↓
┌─ Mandatory ────────────────────────┐
│  エラー: "このプロバイダーは        │
│  Platform管理です"                  │
└────────────────────────────────────┘
┌─ AllowOverride ────────────────────┐
│  保存を許可                         │
└────────────────────────────────────┘
```

### 実装例

```rust
// プロバイダー設定の取得
let config = iac_config_provider
    .get_provider_config(&operator_id, "hubspot")
    .await?;

// 設定階層の取得（デバッグ用）
let hierarchy = iac_config_provider
    .get_config_hierarchy(&operator_id)
    .await?;
// hierarchy.host_config      - Host設定
// hierarchy.platform_config  - Platform設定
// hierarchy.operator_config  - Operator設定
// hierarchy.effective_config - 解決後の設定
```

## セキュリティ考慮事項

1. **権限の分離**: PlatformとOperatorで明確に権限を分離
2. **テナント間のアイソレーション**: 各Operatorのデータは完全に分離
3. **階層的なアクセス制御**: Platformは配下のOperatorを管理可能
4. **プロバイダー設定の保護**: Mandatoryルールでコスト・セキュリティ重要な設定を保護
5. **監査ログ**: すべてのテナント操作を記録

## ベストプラクティス

1. **明示的なテナント指定**: 常に`x-operator-id`を指定する
2. **最小権限の原則**: 必要最小限の権限でアクセス
3. **テナントコンテキストの検証**: すべてのAPIで適切な検証を実施
4. **エラーハンドリング**: テナント不整合時の適切なエラー処理