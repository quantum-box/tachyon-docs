# Policy管理システム

## 概要

Policy管理システムは、Tachyon Appsにおける権限制御の中核となるシステムです。従来のハードコードされた権限定義からデータベースベースの動的な権限管理に移行し、柔軟かつ安全な権限制御を実現しています。

## アーキテクチャ

### システム構成
```
Policy Management System
├── Action Management (操作定義)
├── Policy Management (権限ポリシー)  
├── Assignment Management (権限割り当て)
└── UI Management Console (管理コンソール)
```

### データモデル

```sql
-- Action定義テーブル
CREATE TABLE `actions` (
  `id` VARCHAR(29) NOT NULL,              -- act_xxxxx形式
  `context` VARCHAR(50) NOT NULL,         -- auth, llms, order等
  `name` VARCHAR(100) NOT NULL,           -- CreateUser, ExecuteAgent等  
  `description` TEXT,
  `resource_pattern` VARCHAR(255),        -- trn:tachyon-apps:*:*:*:*
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `context_name` (`context`, `name`)
);

-- Policy定義テーブル
CREATE TABLE `policies` (
  `id` VARCHAR(29) NOT NULL,              -- pol_xxxxx形式
  `name` VARCHAR(100) NOT NULL,
  `description` TEXT,
  `is_system` BOOLEAN NOT NULL DEFAULT FALSE,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
);

-- Policy-Action関連テーブル
CREATE TABLE `policy_actions` (
  `policy_id` VARCHAR(29) NOT NULL,
  `action_id` VARCHAR(29) NOT NULL,
  `effect` ENUM('allow', 'deny') NOT NULL DEFAULT 'allow',
  PRIMARY KEY (`policy_id`, `action_id`)
);

-- User-Policy関連テーブル
CREATE TABLE `user_policies` (
  `user_id` VARCHAR(255) NOT NULL,
  `policy_id` VARCHAR(29) NOT NULL,
  `assigned_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `policy_id`)
);

-- ServiceAccount-Policy関連テーブル
CREATE TABLE `service_account_policies` (
  `service_account_id` VARCHAR(29) NOT NULL,
  `policy_id` VARCHAR(29) NOT NULL,
  `assigned_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`service_account_id`, `policy_id`)
);
```

## 主要機能

### 1. Action管理
**概要**: システム内のすべての操作（Action）を定義・管理します。

**機能**:
- Action定義の登録・更新・削除
- コンテキスト別のAction分類
- リソースパターンの定義
- Action使用状況の追跡

**実装されているAction**:
- **auth**: 13個 (ユーザー・サービスアカウント管理)
- **llms**: 17個 (AI機能関連)
- **order**: 17個 (注文・見積り管理)
- **payment**: 5個 (決済処理)
- **delivery**: 3個 (配送管理)
- **crm**: 15個 (顧客管理)
- **feature_flag**: 19個 (機能フラグ)
- **iac**: 1個 (インフラ管理)

**総計**: 90個のAction

### 2. Policy管理
**概要**: Actionの組み合わせによる権限ポリシーを定義・管理します。

**実装されているPolicy**:

#### SystemPolicy（システムポリシー）
1. **AdminPolicy**: システム管理者用全権限
2. **DefaultServiceAccountPolicy**: サービスアカウント標準権限
3. **ReadOnlyPolicy**: 読み取り専用権限
4. **DeveloperPolicy**: 開発者用権限（本番制限付き）
5. **AIAgentExecutorPolicy**: AI機能実行権限
6. **TenantAdminPolicy**: テナント管理者権限
7. **BillingManagerPolicy**: 課金管理権限

#### CustomPolicy
- 組織固有の要件に合わせたカスタムポリシー作成が可能

### 3. 権限割り当て管理
**概要**: User/ServiceAccountに対するPolicy割り当てを管理します。

**機能**:
- Policy Attach/Detach操作
- 複数Policy同時割り当て
- 割り当て状況の可視化
- 権限効果のプレビュー

### 4. 管理コンソールUI

#### IAM管理ダッシュボード
- 統計情報表示（Users、Service Accounts、Policies、Actions）
- クイックアクション（Create User、Create Service Account等）
- セキュリティ通知

#### Policy管理画面
- Policy一覧・詳細表示
- Policy作成・編集・削除
- Action関連の管理
- SystemPolicy保護機能

#### User/Service Account管理画面
- 一覧表示・検索・フィルタ
- Policy割り当て状況表示
- リアルタイムPolicy管理ダイアログ

#### Action管理画面
- コンテキスト別Action一覧
- Action検索・フィルタ機能
- Action使用状況表示

## API仕様

### GraphQL API

#### Query
```graphql
# Action一覧取得
actions(input: ListActionsInput): [Action!]!

# Policy一覧取得
policies: [Policy!]!

# Policy詳細取得
policy(id: ID!): Policy
```

#### Mutation
```graphql
# Action登録
registerAction(
  context: String!, 
  name: String!, 
  description: String, 
  resourcePattern: String
): Action!

# Policy登録
registerPolicy(input: RegisterPolicyInput!): Policy!

# Policy更新
updatePolicy(input: UpdatePolicyInput!): Policy!

# User-Policy割り当て
attachPolicyToUser(userId: String!, policyId: String!): String!
detachPolicyFromUser(userId: String!, policyId: String!): String!

# ServiceAccount-Policy割り当て
attachPolicyToServiceAccount(serviceAccountId: String!, policyId: String!): String!
detachPolicyFromServiceAccount(serviceAccountId: String!, policyId: String!): String!
```

### 型定義
```graphql
type Action {
  id: ID!
  context: String!
  name: String!
  fullName: String!      # context:name形式
  description: String
  resourcePattern: String
}

type Policy {
  id: ID!
  name: String!
  description: String
  isSystem: Boolean!
  actions: [PolicyAction!]!
  createdAt: DateTime!
  updatedAt: DateTime!
  userCount: Int!
  serviceAccountCount: Int!
}

type PolicyAction {
  action: Action!
  effect: PolicyEffect!  # ALLOW | DENY
}
```

## セキュリティ

### 権限制御
- Policy管理UIへのアクセスには`auth:UpdatePolicy`権限が必要
- SystemPolicyは編集・削除不可
- すべての操作に対する権限チェック

### 監査ログ
- Policy変更操作の完全なログ記録
- 変更者・時刻・内容の追跡
- セキュリティインシデント時の調査支援

### データ保護
- Policy効果変更前のプレビュー機能
- 意図しない権限付与の防止
- SystemPolicy削除の保護機能

## 運用

### 管理者向け操作
1. **Policy作成**: 新しい権限ポリシーの定義
2. **権限割り当て**: User/ServiceAccountへのPolicy適用
3. **監査**: 権限変更履歴の確認
4. **トラブルシューティング**: 権限問題の調査・解決

### 開発者向け操作
1. **Action定義**: 新機能のAction追加
2. **Policy設計**: 機能に応じた適切なPolicy設計
3. **テスト**: 権限制御のテストケース作成

## パフォーマンス

### 最適化
- Policy取得のキャッシュ機能（実装予定）
- インデックス最適化による高速検索
- 並列処理による応答性向上

### スケーラビリティ
- 大量Action/Policyへの対応
- 複数テナントでの独立運用
- 水平スケーリング対応

## 技術仕様

### Backend
- **言語**: Rust
- **フレームワーク**: axum, sqlx
- **アーキテクチャ**: Clean Architecture
- **データベース**: MySQL (TiDB)

### Frontend  
- **言語**: TypeScript
- **フレームワーク**: React, Next.js
- **UI**: Tailwind CSS, Radix UI
- **状態管理**: Apollo GraphQL

### 品質管理
- **テスト**: Unit Test, Integration Test完備
- **品質**: rustfmt, clippy, Biome準拠
- **CI/CD**: GitHub Actions統合

## 関連ドキュメント

- [Multi-Tenancy構造](./multi-tenancy.md)
- [Authentication Overview](./overview.md)
- [実装詳細](../../tasks/completed/v0.9.0/organize-policy-management/)
- [GraphQL API詳細](../../tasks/completed/v0.9.0/organize-policy-management/graphql-implementation-summary.md)

## 変更履歴

### v0.9.0 (2025-01-17)
- Policy管理システム完全実装
- データベース化完了
- 管理コンソールUI実装
- GraphQL API完備
- 包括的テスト完備
- 90個Action、7個Policy実装

### 今後の予定
- キャッシュ機能実装
- 自動Action登録機能
- 高度な条件付きPolicy
- 外部システム連携機能