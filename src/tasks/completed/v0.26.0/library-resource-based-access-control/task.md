---
title: "Library リソースベースアクセス制御"
type: "feature"
emoji: "🔐"
topics:
  - auth
  - library
  - rbac
published: false
targetFiles:
  - packages/auth/migrations/
  - packages/auth/domain/src/
  - packages/auth/src/usecase/
  - apps/library-api/
github: https://github.com/quantum-box/tachyon-apps
---

# Library リソースベースアクセス制御

## 概要

`library.policies` テーブル（リポジトリ単位のrole管理）を廃止し、authパッケージのポリシーシステムでリソース（リポジトリ/Organization）単位のアクセス制御を実現する。

## 背景・目的

### 現状の問題

1. **二重管理**: library.policies（リポジトリ単位）と tachyon_apps_auth.user_policies（テナント単位）が併存
2. **整合性**: 2つのシステム間でアクセス制御ロジックが分散
3. **拡張性**: 新しいリソースタイプ追加時に独自テーブルが増える

### 現状のテーブル構造

```
library.policies
├── user_id VARCHAR(255)
├── role VARCHAR(255)      -- OWNER / WRITER / READER
└── repo_id VARCHAR(29)    -- リポジトリID

tachyon_apps_auth.user_policies
├── user_id VARCHAR(255)
├── tenant_id VARCHAR(29)  -- テナント（Organization）単位
├── policy_id VARCHAR(32)
└── assigned_at TIMESTAMP
```

### 目標

- `library.policies` を廃止
- authのポリシーシステムでリソース単位の制御を実現
- Organization = Tenant、Repository = Resource として統一

## 詳細仕様

### AWS IAMスタイルの設計

AWS IAMのポリシーのように、**ポリシー自体にResource条件を含める**設計を採用。

#### AWS IAMの例

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::my-bucket/*"
    }
  ]
}
```

#### Tachyon版の設計

```yaml
# ポリシー定義
policy:
  id: pol_01libraryrepoowner
  name: LibraryRepoOwnerPolicy
  statements:
    - effect: allow
      actions:
        - library:UpdateRepo
        - library:DeleteRepo
        - library:ViewPrivateRepo
        - library:ManagePolicy
      resource: "trn:library:repo:*"  # 全リポジトリ（ポリシー定義時はワイルドカード）

# ユーザーへの割当時にリソースを限定
user_policy:
  user_id: us_xxx
  tenant_id: tn_xxx
  policy_id: pol_01libraryrepoowner
  resource_scope: "trn:library:repo:rp_xxx"  # 特定リポジトリに限定
```

### TRN (Tachyon Resource Name) フォーマット

```
trn:<service>:<resource-type>:<resource-id>

例:
- trn:library:repo:*              # 全リポジトリ
- trn:library:repo:rp_xxx         # 特定リポジトリ
- trn:library:database:db_xxx     # 特定データベース
- trn:auth:user:us_xxx            # 特定ユーザー
- trn:*:*:*                       # 全リソース（管理者用）
```

### データベース設計

#### 案A: policy_action_patterns を拡張（シンプル）

```sql
-- 既存テーブルにresource_patternを追加
ALTER TABLE policy_action_patterns
  ADD COLUMN resource_pattern VARCHAR(255) NOT NULL DEFAULT '*';

-- インデックス追加
CREATE INDEX idx_policy_resource ON policy_action_patterns (policy_id, resource_pattern);
```

#### 案B: policy_statements テーブルを新設（✅ 推奨・AWS IAMに近い）

```sql
-- AWS IAM Statement相当のテーブル
CREATE TABLE policy_statements (
  id VARCHAR(32) NOT NULL,
  policy_id VARCHAR(32) NOT NULL,
  effect ENUM('allow', 'deny') NOT NULL DEFAULT 'allow',
  resource_pattern VARCHAR(255) NOT NULL DEFAULT '*',  -- TRNパターン
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (policy_id) REFERENCES policies(id) ON DELETE CASCADE,
  KEY idx_policy_resource (policy_id, resource_pattern)
);

-- Statement と Action の関連
CREATE TABLE policy_statement_actions (
  statement_id VARCHAR(32) NOT NULL,
  action_id VARCHAR(32) NOT NULL,
  PRIMARY KEY (statement_id, action_id),
  FOREIGN KEY (statement_id) REFERENCES policy_statements(id) ON DELETE CASCADE,
  FOREIGN KEY (action_id) REFERENCES actions(id) ON DELETE CASCADE
);

-- Statement と Action Pattern の関連（ワイルドカード用）
CREATE TABLE policy_statement_action_patterns (
  statement_id VARCHAR(32) NOT NULL,
  context_pattern VARCHAR(50) NOT NULL,
  name_pattern VARCHAR(100) NOT NULL,
  PRIMARY KEY (statement_id, context_pattern, name_pattern),
  FOREIGN KEY (statement_id) REFERENCES policy_statements(id) ON DELETE CASCADE
);
```

#### user_policies の拡張

```sql
-- 既存テーブルにリソーススコープを追加
ALTER TABLE user_policies
  ADD COLUMN resource_scope VARCHAR(255) NULL DEFAULT NULL;
  -- NULL = ポリシー定義のresource_patternをそのまま使用
  -- 値あり = ポリシー定義より狭いスコープに制限

-- 主キー変更（resource_scopeを含める）
ALTER TABLE user_policies
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (user_id, tenant_id, policy_id, resource_scope);
```

### 権限チェックフロー

```
CheckPolicy::execute_with_resource(executor, tenant_id, action, resource_trn)
│
├─ 1. user_policies からユーザーのポリシー一覧取得
│      └─ resource_scope でフィルタ（resource_trn がスコープ内か）
│
├─ 2. 各ポリシーの policy_statements を取得
│      └─ resource_pattern が resource_trn にマッチするか
│
├─ 3. マッチした Statement の actions/action_patterns を確認
│      └─ 要求された action が含まれるか
│
├─ 4. Effect を評価
│      └─ Deny優先、Allow判定
│
└─ 5. 結果返却
```

### TRNパターンマッチング

```rust
impl TrnPattern {
    /// パターンがTRNにマッチするか判定
    /// 
    /// パターン例:
    /// - "*" -> 全てにマッチ
    /// - "trn:library:repo:*" -> library:repoの全てにマッチ
    /// - "trn:library:repo:rp_xxx" -> 特定リポジトリのみ
    /// - "trn:library:*:*" -> libraryサービスの全リソース
    pub fn matches(&self, trn: &Trn) -> bool {
        // ワイルドカードマッチング実装
    }
}
```

### Library用ポリシー定義例

```yaml
# LibraryRepoOwnerPolicy
- policy_id: pol_01libraryrepoowner
  statements:
    - id: stmt_owner_full
      effect: allow
      resource_pattern: "trn:library:repo:*"
      actions:
        - library:UpdateRepo
        - library:DeleteRepo
        - library:ViewPrivateRepo
        - library:ManagePolicy
        - library:InviteMember

# LibraryRepoWriterPolicy  
- policy_id: pol_01libraryrepowriter
  statements:
    - id: stmt_writer
      effect: allow
      resource_pattern: "trn:library:repo:*"
      actions:
        - library:UpdateRepo
        - library:ViewPrivateRepo

# LibraryRepoReaderPolicy
- policy_id: pol_01libraryreporeader
  statements:
    - id: stmt_reader
      effect: allow
      resource_pattern: "trn:library:repo:*"
      actions:
        - library:ViewPrivateRepo
```

### API設計

#### 新規Usecase

```rust
/// リソーススコープ付きでポリシーをアタッチ
pub struct AttachUserPolicyWithScope {
    pub user_id: String,
    pub tenant_id: TenantId,
    pub policy_id: PolicyId,
    pub resource_scope: Option<String>,  // TRN形式、Noneなら全リソース
}

/// リソースに対する権限チェック
pub struct CheckResourcePolicy {
    pub executor: Executor,
    pub tenant_id: TenantId,
    pub action: ActionString,
    pub resource_trn: String,  // "trn:library:repo:rp_xxx"
}
```

#### CheckPolicy の拡張

```rust
#[async_trait::async_trait]
pub trait CheckPolicy: Send + Sync + Debug {
    /// 既存（テナント単位、リソース指定なし）
    async fn execute(
        &self,
        executor: &dyn ExecutorAction,
        tenant_id: &dyn MultiTenancyAction,
        action: ActionString,
    ) -> Result<()>;

    /// 新規（リソース指定あり）
    async fn execute_for_resource(
        &self,
        executor: &dyn ExecutorAction,
        tenant_id: &dyn MultiTenancyAction,
        action: ActionString,
        resource_trn: &str,
    ) -> Result<()>;
}
```

### Library-APIの変更

```rust
// 現状
fn check_repo_access(user_id: &str, repo_id: &str, required_role: Role) -> Result<()> {
    let policy = library_policy_repository.find(user_id, repo_id)?;
    if policy.role >= required_role {
        Ok(())
    } else {
        Err(Error::permission_denied())
    }
}

// 変更後
async fn check_repo_access(
    auth_app: &AuthApp,
    executor: &Executor,
    tenant_id: &TenantId,
    repo_id: &str,
    action: ActionString,
) -> Result<()> {
    let resource_trn = format!("trn:library:repo:{}", repo_id);
    auth_app.check_policy_for_resource(
        executor,
        tenant_id,
        action,
        &resource_trn,
    ).await
}
```

### 移行時のデータ変換

```sql
-- library.policies → user_policies + resource_scope
INSERT INTO tachyon_apps_auth.user_policies 
  (user_id, tenant_id, policy_id, resource_scope, assigned_at)
SELECT
  p.user_id,
  'tn_01j91h09tpj5ehwbwfwfxpak2b' AS tenant_id,
  CASE p.role
    WHEN 'OWNER' THEN 'pol_01libraryrepoowner'
    WHEN 'WRITER' THEN 'pol_01libraryrepowriter'
    WHEN 'READER' THEN 'pol_01libraryreporeader'
  END AS policy_id,
  CONCAT('trn:library:repo:', p.repo_id) AS resource_scope,
  NOW() AS assigned_at
FROM library.policies p;
```

## 移行計画

### Phase 1: 基盤整備 ✅ 完了

1. [x] マイグレーション:
   - [x] `policy_statements` テーブル作成 (`20251206100000_add_policy_statements.up.sql`)
   - [x] `policy_statement_actions` テーブル作成 (同上)
   - [x] `policy_statement_action_patterns` テーブル作成 (同上)
   - [x] `user_policies` に `resource_scope` カラム追加 (`20251206100001_add_resource_scope_to_user_policies.up.sql`)
2. [x] ドメイン:
   - [x] `PolicyStatement` エンティティ (`packages/auth/domain/src/policy_statement.rs`)
   - [x] `TrnPattern` 値オブジェクト (`packages/auth/domain/src/trn.rs`) - globset によるパターンマッチング
3. [x] リポジトリ:
   - [x] `PolicyStatementRepository` トレイト (`packages/auth/domain/src/policy_repository.rs`)
   - [x] `SqlxPolicyStatementRepository` 実装 (`packages/auth/src/interface_adapter/gateway/sqlx_policy_statement_repository.rs`)
   - [x] `UserPolicyRepository` / `UserPolicyMappingRepository` の resource_scope 対応 (`sqlx_user_policy_mapping_repository.rs`)
4. [x] シードデータ:
   - [x] Library用Statement定義 (`scripts/seeds/n1-seed/009-auth-policy-statements.yaml`)
   - [x] Action.resource_pattern形式の統一 (`008-auth-policies.yaml` - `trn:<service>:<type>:<id>` 形式に変更)

### Phase 2: 権限チェック実装 ✅ 完了

1. [x] CheckPolicy:
   - [x] `execute_for_resource` メソッド追加 (`packages/auth/domain/src/service/check_policy.rs`)
   - [x] `TrnPattern::matches()` によるパターンマッチング
   - [x] `UserPolicy::matches_resource()` によるリソーススコープ判定
2. [x] ユースケース:
   - [x] `AttachUserPolicyWithScope` 実装 (`packages/auth/src/usecase/attach_user_policy_with_scope.rs`)
   - [x] `DetachUserPolicyWithScope` 実装 (`packages/auth/src/sdk.rs` - `AuthApp::detach_user_policy_with_scope` として実装)
3. [x] テスト:
   - [x] TRNパターンマッチングのユニットテスト (`packages/auth/domain/src/trn.rs`)
   - [x] `execute_for_resource` の単体テスト (`packages/auth/domain/src/service/check_policy.rs`) - 14件:
     - システムユーザーは常に許可
     - ユーザーが存在しない場合はエラー
     - テナント所属がない場合はエラー
     - アクションが存在しない場合はエラー
     - リソーススコープがマッチしない場合は拒否
     - リソーススコープがマッチする場合は許可
     - resource_scopeがNULLの場合は全リソースに適用
     - ワイルドカードスコープがマッチする場合
     - Denyが優先される
     - 異なるリソースタイプはマッチしない
     - パターンマッチでAllowの場合
     - **Action.resource_pattern バリデーション（不一致でBadRequest）**
     - **Action.resource_pattern マッチ時は通過**
     - **Action.resource_pattern 未設定時はスキップ**

### Phase 3: Library-API統合 ✅ 実装完了（並行運用未実施）

1. [x] データ移行:
   - [x] `library.policies` → `user_policies + resource_scope` 移行スクリプト (`20251206100002_migrate_library_policies.up.sql`)
   - [x] 移行検証クエリ（downマイグレーションあり）
2. [x] Library-API変更:
   - [x] アクセスチェックを `auth_app.check_policy_for_resource` に置き換え (`change_repo_policy.rs`)
   - [x] リポジトリ作成時に `attach_user_policy_with_scope` を呼び出す (`create_repo.rs`)
   - [x] `ChangeRepoPolicy` をリソーススコープ対応に更新 (`change_repo_policy.rs`)
3. [x] SDK/API層:
   - [x] `tachyon_apps::auth::AuthApp` に `check_policy_for_resource` 追加 (`packages/tachyon_apps/src/auth/mod.rs`)
   - [x] `tachyon_apps::auth::AuthApp` に `attach_user_policy_with_scope` 追加
   - [x] `tachyon_apps::auth::AuthApp` に `detach_user_policy_with_scope` 追加
   - [x] 入力データ型追加: `CheckPolicyForResourceInput`, `AttachUserPolicyWithScopeInput`, `DetachUserPolicyWithScopeInput`
   - [x] `auth::App` での実装 (`packages/auth/src/sdk.rs`)
4. [ ] 並行運用:
   - [ ] 両システムで権限チェック（不整合検出）
   - [ ] 問題なければ旧システムを無効化

### Phase 4: 移行完了 🔄 未着手

1. [ ] `library.policies` テーブルの参照を全て削除
2. [ ] `library.policies` テーブルをドロップ
3. [ ] 関連コードのクリーンアップ
4. [ ] ドキュメント更新

### Phase 5: フロントエンド対応 ✅ 主要機能完了

管理画面でリソースベースポリシーをYAML形式で確認・編集できるようにする。

1. [x] GraphQL API:
   - [x] `User.userPoliciesWithScope` クエリ追加（resource_scope付きユーザーポリシー取得）
   - [x] `Policy.statements` フィールド追加（ポリシーのStatement一覧取得）
   - [x] `UserPolicyWithScope` 型追加（関連ポリシー詳細取得含む）
   - [x] `PolicyStatement` 型追加
   - [x] `attachUserPolicyWithScope` mutation追加
   - [x] `detachUserPolicyWithScope` mutation追加
   - [x] `usersWithResourceAccess(resourceTrn)` クエリ追加（特定リソースへのアクセス権を持つユーザー一覧取得）
2. [x] Tachyonフロントエンド:
   - [x] ポリシー詳細画面でYAML形式表示（YAMLタブ追加）
   - [x] ポリシー詳細画面でYAML編集機能（action_patterns編集対応）
   - [x] ポリシー詳細画面でStatementsタブ追加
   - [x] リソーススコープ付きポリシー割り当てUI（ユーザーポリシーマネージャー）
   - [ ] ユーザーポリシー一覧で`resource_scope`カラム表示（DBからの取得必要）
3. [x] Library リポジトリ詳細画面:
   - [x] メンバー一覧タブ追加（Repo.membersフィールド使用）
   - [x] メンバー招待UI（Owner/Writer/Reader選択）
   - [x] `inviteRepoMember` GraphQLミューテーション追加
   - [x] 組織ユーザー取得（`GetOrganizationUsersForInvite`クエリ）
   - [x] nuqsによるタブ状態のURL同期

#### 実装済みファイル

**バックエンド:**
- `packages/auth/src/interface_adapter/controller/model/policy.rs`: `UserPolicyWithScope`, `PolicyStatement` GraphQL型追加
- `packages/auth/src/interface_adapter/controller/model/policy_input.rs`: `AttachUserPolicyWithScopeInput`, `DetachUserPolicyWithScopeInput` 追加
- `packages/auth/src/interface_adapter/controller/mutation.rs`: `attachUserPolicyWithScope`, `detachUserPolicyWithScope` mutation追加
- `packages/auth/src/interface_adapter/controller/resolver.rs`: `User.userPoliciesWithScope`, `usersWithResourceAccess` クエリ追加
- `packages/auth/domain/src/service/policy_service.rs`: `user_policy_repo()` getter追加
- `packages/auth/domain/src/policy_repository.rs`: `UserPolicyRepository.find_by_resource_scope` メソッド追加
- `packages/auth/src/interface_adapter/gateway/sqlx_user_policy_mapping_repository.rs`: `find_by_resource_scope` 実装追加
- `packages/auth/src/lib.rs`: `policy_statement_repo` をAppに追加

**フロントエンド (Tachyon):**
- `apps/tachyon/.../iam/policies/policies.graphql`: `PolicyDetail` fragmentに`statements`フィールド追加
- `apps/tachyon/.../iam/policies/[id]/policy-detail.tsx`: YAMLタブ、Statementsタブ、YAML表示/編集機能追加
- `apps/tachyon/.../iam/user/policy-mutations.graphql`: `AttachPolicyToUserWithScope`, `DetachPolicyFromUserWithScope` mutation追加
- `apps/tachyon/.../iam/user/[user_id]/user-policy-manager.tsx`: リソーススコープ付きポリシー割り当てUI追加
- `apps/tachyon/.../iam/user/resource-members.graphql`: `usersWithResourceAccess`クエリ追加
- `apps/tachyon/package.json`: `js-yaml`パッケージ追加（YAMLパース用）

**フロントエンド (Library):**
- `apps/library/.../settings/members.graphql`: `GetRepoMembers`クエリ追加
- `apps/library/.../settings/invite-member.graphql`: `InviteRepoMember`mutation、`GetOrganizationUsersForInvite`クエリ追加
- `apps/library/.../settings/form.tsx`: Accessタブにメンバー一覧表示UI、招待ダイアログ追加
- `apps/library/.../settings/actions.ts`: `getRepoMembersAction`、`getOrganizationUsersAction`、`inviteRepoMemberAction`追加
- `apps/library/src/app/providers.tsx`: NuqsAdapter追加
- `apps/library/package.json`: `nuqs`パッケージ追加

**Library-API:**
- `apps/library-api/src/handler/graphql/model.rs`: `RepoMember`型追加
- `apps/library-api/src/handler/graphql/resolver.rs`: `Repo.members`フィールド追加
- `apps/library-api/src/handler/graphql/mutation.rs`: `inviteRepoMember`mutation追加、`InviteRepoMemberInput`型追加
- `apps/library-api/src/usecase/invite_repo_member.rs`: `InviteRepoMember`ユースケース追加
- `apps/library-api/src/usecase/boundary.rs`: `InviteRepoMemberInputPort`、`InviteRepoMemberInputData`追加
- `apps/library-api/src/app.rs`: `invite_repo_member`フィールド追加

#### YAML編集機能の仕様

- **表示モード**: ポリシーの全情報をYAML形式で表示、クリップボードにコピー可能
- **編集モード**: テキストエリアでYAMLを直接編集
- **保存対象**: 現在は`action_patterns`の追加/削除のみ対応
  - `actions`の編集には別途アクションID解決が必要（未実装）
  - `statements`の編集にはバックエンドmutation追加が必要（未実装）
- **バリデーション**: リアルタイムでYAML構文とスキーマを検証
- **制限**: システムポリシーは編集不可

#### YAML表示フォーマット例

```yaml
# ポリシー定義
policy:
  id: pol_01libraryrepoowner
  name: LibraryRepoOwnerPolicy
  statements:
    - id: pst_01libownerall
      effect: allow
      resource_pattern: "trn:library:repo:*"
      actions:
        - library:UpdateRepo
        - library:DeleteRepo
        - library:ViewPrivateRepo
        - library:ManageRepoPolicy

# ユーザーへの割り当て（リソーススコープ付き）
user_policies:
  - user_id: us_xxx
    tenant_id: tn_xxx
    policy_id: pol_01libraryrepoowner
    resource_scope: "trn:library:repo:rp_xxx"  # 特定リポジトリに限定
```

## 既存ユーザーへの暫定対応（本番エラー解消） 🚨

### 問題

本番環境で以下のエラーが発生：

```
"message": "PermissionDenied: No policies assigned to this user/service account. 
user_id: us_01jbbpwt0g2ecjtwpt55hm7q3p, action: auth:GetUserById, 
tenant_id: tn_01j91h09tpj5ehwbwfwfxpak2b"
```

### 原因

`library-api` から `auth` パッケージへのポリシー移行に伴い、既存ユーザーに `LibraryUserPolicy` がアタッチされていない。

### 対応手順

#### 1. 影響範囲の確認

```sql
-- library.policiesに登録されているがuser_policiesにLibraryUserPolicyがないユーザー数
SELECT COUNT(DISTINCT p.user_id) AS affected_users
FROM library.policies p
WHERE NOT EXISTS (
  SELECT 1 FROM tachyon_apps_auth.user_policies up
  WHERE up.user_id = p.user_id
    AND up.tenant_id = 'tn_01j91h09tpj5ehwbwfwfxpak2b'
    AND up.policy_id = 'pol_01libraryuserpolicy'
);
```

#### 2. LibraryUserPolicyのアタッチ（本番実行クエリ）

```sql
-- library.policiesに登録されている既存ユーザー全員にLibraryUserPolicyをアタッチ
INSERT INTO tachyon_apps_auth.user_policies 
  (user_id, tenant_id, policy_id, assigned_at)
SELECT DISTINCT
  p.user_id,
  'tn_01j91h09tpj5ehwbwfwfxpak2b' AS tenant_id,
  'pol_01libraryuserpolicy' AS policy_id,
  NOW() AS assigned_at
FROM library.policies p
WHERE NOT EXISTS (
  SELECT 1 FROM tachyon_apps_auth.user_policies up
  WHERE up.user_id = p.user_id
    AND up.tenant_id = 'tn_01j91h09tpj5ehwbwfwfxpak2b'
    AND up.policy_id = 'pol_01libraryuserpolicy'
)
ON DUPLICATE KEY UPDATE assigned_at = VALUES(assigned_at);
```

#### 3. 確認クエリ

```sql
-- アタッチ後の確認
SELECT COUNT(*) AS attached_count
FROM tachyon_apps_auth.user_policies
WHERE tenant_id = 'tn_01j91h09tpj5ehwbwfwfxpak2b'
  AND policy_id = 'pol_01libraryuserpolicy';

-- 全library.policiesユーザーがカバーされているか
SELECT COUNT(DISTINCT p.user_id) AS missing_users
FROM library.policies p
WHERE NOT EXISTS (
  SELECT 1 FROM tachyon_apps_auth.user_policies up
  WHERE up.user_id = p.user_id
    AND up.tenant_id = 'tn_01j91h09tpj5ehwbwfwfxpak2b'
    AND up.policy_id = 'pol_01libraryuserpolicy'
);
-- 結果が 0 であればOK
```

### 注意事項

- `tn_01j91h09tpj5ehwbwfwfxpak2b` はLibrary本番テナントID
- `pol_01libraryuserpolicy` は基本的なLibraryユーザー権限（自分/所属オペレーターの参照等）
- この暫定対応はテナント単位の権限付与のみ。リポジトリ単位の権限（Owner/Writer/Reader）はPhase 3で移行

## テスト計画

- 単体: `UserResourcePolicyRepository` CRUD操作
- 単体: `CheckResourcePolicy` の許可/拒否判定
- 結合: Library-APIでリポジトリ操作時の権限チェック
- 移行: `library.policies` → `user_resource_policies` データ整合性

## リスクと対策

| リスク | 影響 | 対策 |
|---|---|---|
| 移行中のデータ不整合 | アクセス制御が正しく動作しない | 両テーブルを並行運用し、段階的に切り替え |
| パフォーマンス劣化 | 権限チェックの遅延 | インデックス最適化、キャッシュ検討 |
| 既存APIの破壊的変更 | Library-APIの互換性問題 | 内部実装の変更に留め、外部APIは維持 |

## 完了条件

### 必須（Phase 1-4）
- [ ] `policy_statements` 関連テーブルが本番に存在（マイグレーション作成済み、デプロイ待ち）
- [ ] `user_policies.resource_scope` カラムが追加されている（マイグレーション作成済み、デプロイ待ち）
- [x] TRNパターンマッチングが実装されている (`packages/auth/domain/src/trn.rs`)
- [x] `CheckPolicy::execute_for_resource` が動作する (`packages/auth/domain/src/service/check_policy.rs`)
- [x] Library-APIがauthのリソース単位権限チェックを使用 (`create_repo.rs`, `change_repo_policy.rs`)
- [ ] `library.policies` テーブルが削除
- [ ] CI (`mise run ci`) が通過

### オプション（Phase 5）
- [x] GraphQL APIでリソーススコープ付きポリシーを取得できる（`User.userPoliciesWithScope`, `Policy.statements`）
- [x] Tachyonフロントエンドでポリシーをスコープ形式で確認できる（YAMLタブ実装済み）
- [x] TachyonフロントエンドでYAML形式でポリシーを編集できる（action_patterns対応）
- [x] リソーススコープ付きポリシーの割り当て/解除UI（ユーザーポリシーマネージャー）

## 参考: AWS IAMとの対応表

| AWS IAM | Tachyon Auth | 説明 |
|---|---|---|
| Policy | Policy | ポリシー定義 |
| Statement | PolicyStatement | Effect + Actions + Resource のセット |
| Action | Action | 操作（`s3:GetObject` → `library:ViewRepo`） |
| Resource (ARN) | Resource (TRN) | リソース識別子 |
| Principal | User/ServiceAccount | 権限の付与先 |
| Condition | （将来実装） | 条件付き許可 |

