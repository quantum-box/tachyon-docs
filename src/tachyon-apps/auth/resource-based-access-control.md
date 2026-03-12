# リソースベースアクセス制御 (Resource-Based Access Control)

## 概要

リソースベースアクセス制御は、AWS IAMスタイルのポリシーシステムを採用し、テナント単位だけでなくリソース単位（リポジトリ、データベース、プロジェクトなど）での細かいアクセス制御を実現する仕組みです。

## 背景

従来のテナント単位のアクセス制御では、以下の課題がありました：

1. **粒度の粗さ**: テナント全体への権限付与しかできず、特定のリソース（例: リポジトリA）だけへの権限付与ができない
2. **二重管理**: `library.policies`（リポジトリ単位）と `tachyon_apps_auth.user_policies`（テナント単位）が併存
3. **拡張性の低さ**: 新しいリソースタイプ追加時に独自テーブルが増える

## TRN (Tachyon Resource Name)

リソースを一意に識別するための命名規則として、TRN形式を採用しています。

### フォーマット

```
trn:<service>:<resource-type>:<resource-id>
```

### 例

```
trn:library:repo:rp_xxx         # 特定のLibraryリポジトリ
trn:library:repo:*              # 全Libraryリポジトリ
trn:library:database:db_xxx     # 特定のLibraryデータベース
trn:auth:user:us_xxx            # 特定のユーザー
trn:*:*:*                       # 全リソース（管理者用）
```

### パターンマッチング

TRNはワイルドカード（`*`）を使用したパターンマッチングに対応しています：

```rust
// TrnPattern::matches() による判定
"trn:library:repo:*".matches("trn:library:repo:rp_123")  // true
"trn:library:*:*".matches("trn:library:repo:rp_123")     // true
"trn:*:*:*".matches("trn:library:repo:rp_123")           // true
"trn:auth:*:*".matches("trn:library:repo:rp_123")        // false
```

実装には `globset` クレートを使用し、柔軟なパターンマッチングを実現しています。

## データベース設計

### Policy Statements テーブル

AWS IAM Statementに相当するテーブルです。

```sql
CREATE TABLE policy_statements (
  id VARCHAR(32) NOT NULL,
  policy_id VARCHAR(32) NOT NULL,
  effect ENUM('allow', 'deny') NOT NULL DEFAULT 'allow',
  resource_pattern VARCHAR(255) NOT NULL DEFAULT '*',
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (policy_id) REFERENCES policies(id) ON DELETE CASCADE,
  KEY idx_policy_resource (policy_id, resource_pattern)
);
```

### Statement と Action の関連

```sql
CREATE TABLE policy_statement_actions (
  statement_id VARCHAR(32) NOT NULL,
  action_id VARCHAR(32) NOT NULL,
  PRIMARY KEY (statement_id, action_id),
  FOREIGN KEY (statement_id) REFERENCES policy_statements(id) ON DELETE CASCADE,
  FOREIGN KEY (action_id) REFERENCES actions(id) ON DELETE CASCADE
);
```

### User Policies の拡張

```sql
ALTER TABLE user_policies
  ADD COLUMN resource_scope VARCHAR(255) NULL DEFAULT NULL;
  -- NULL = ポリシー定義のresource_patternをそのまま使用
  -- 値あり = ポリシー定義より狭いスコープに制限
```

## ポリシー定義例

### LibraryRepoOwnerPolicy

```yaml
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
```

### ユーザーへの割り当て（リソーススコープ付き）

```yaml
user_policies:
  - user_id: us_xxx
    tenant_id: tn_xxx
    policy_id: pol_01libraryrepoowner
    resource_scope: "trn:library:repo:rp_123"  # 特定リポジトリに限定
```

このユーザーは、`rp_123`リポジトリに対してのみOwner権限を持ちます。

## 権限チェックフロー

### CheckPolicy::execute_for_resource

```rust
pub async fn execute_for_resource(
    &self,
    executor: &dyn ExecutorAction,
    tenant_id: &dyn MultiTenancyAction,
    action: ActionString,
    resource_trn: &str,  // "trn:library:repo:rp_123"
) -> Result<()>
```

### フロー

```
1. user_policies からユーザーのポリシー一覧取得
   └─ resource_scope でフィルタ（resource_trn がスコープ内か）

2. 各ポリシーの policy_statements を取得
   └─ resource_pattern が resource_trn にマッチするか

3. マッチした Statement の actions/action_patterns を確認
   └─ 要求された action が含まれるか

4. Effect を評価
   └─ Deny優先、Allow判定

5. 結果返却
```

## Library統合

### アクセスチェック（変更前）

```rust
fn check_repo_access(user_id: &str, repo_id: &str, required_role: Role) -> Result<()> {
    let policy = library_policy_repository.find(user_id, repo_id)?;
    if policy.role >= required_role {
        Ok(())
    } else {
        Err(Error::permission_denied())
    }
}
```

### アクセスチェック（変更後）

```rust
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

### リポジトリ作成時のポリシー割り当て

```rust
// CreateRepo Usecase
let resource_scope = format!("trn:library:repo:{}", repo_id);
auth_app.attach_user_policy_with_scope(
    &user_id,
    &tenant_id,
    &PolicyId::from_str("pol_01libraryrepoowner")?,
    Some(resource_scope),
).await?;
```

## フロントエンド対応

### GraphQL API

```graphql
# リソーススコープ付きポリシー取得
query {
  user(userId: "us_xxx") {
    userPoliciesWithScope {
      userId
      tenantId
      policyId
      resourceScope
      policy {
        id
        name
        statements {
          id
          effect
          resourcePattern
          actions {
            id
            name
          }
        }
      }
    }
  }
}

# 特定リソースへのアクセス権を持つユーザー一覧
query {
  usersWithResourceAccess(resourceTrn: "trn:library:repo:rp_123") {
    userId
    userName
    resourceScope
    policy {
      name
    }
  }
}

# リソーススコープ付きポリシー割り当て
mutation {
  attachUserPolicyWithScope(
    input: {
      userId: "us_xxx"
      tenantId: "tn_xxx"
      policyId: "pol_01libraryrepoowner"
      resourceScope: "trn:library:repo:rp_123"
    }
  ) {
    success
  }
}
```

### Tachyon管理画面

- **ポリシー詳細画面**: YAMLタブでStatement定義を表示・編集
- **ユーザーポリシーマネージャー**: リソーススコープ付きでポリシーを割り当て
- **Libraryリポジトリ設定**: メンバー招待UI（Owner/Writer/Reader選択）

## 移行

### library.policies からの移行

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

移行後、`library.policies` テーブルは削除されます。

## AWS IAMとの対応表

| AWS IAM | Tachyon Auth | 説明 |
|---|---|---|
| Policy | Policy | ポリシー定義 |
| Statement | PolicyStatement | Effect + Actions + Resource のセット |
| Action | Action | 操作（`s3:GetObject` → `library:ViewRepo`） |
| Resource (ARN) | Resource (TRN) | リソース識別子 |
| Principal | User/ServiceAccount | 権限の付与先 |
| Condition | （将来実装） | 条件付き許可 |

## 参考資料

- タスクドキュメント: `docs/src/tasks/completed/v0.26.0/library-resource-based-access-control/`
- [AWS IAM Policies](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies.html)
- [Authorization Overview](./authorization.md)
