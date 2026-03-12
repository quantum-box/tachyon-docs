# Org Owner Repo Full Access

## 概要

組織オーナー（DefaultRole::Owner）に対して、組織内の全リポジトリへのフルアクセス権限を自動付与する機能。

## 背景

- **課題**: `DefaultRole` はラベルとしてのみ機能し、実際の権限チェックには使用されていなかった
- **問題**: 組織オーナーでも個別リポジトリへの権限付与が必要だった
- **解決策**: `pol_01libraryrepoowner` ポリシーを `resource_scope = NULL` で付与し、組織内の全リポジトリへのアクセスを許可

## 技術方針

### ポリシーベースアプローチ

当初は `OrgOwnerAccessService` を作成して認可チェック時に動的判定する案があったが、影響範囲が大きいため却下。代わりに、ポリシーベースのアプローチを採用：

- `pol_01libraryrepoowner` ポリシーを `resource_scope = NULL` で `user_policies` に追加
- `resource_scope = NULL` は「全リソースに適用」を意味する
- 3つのタイミングでポリシーを付与：
  1. **サインイン時**（既存オーナー向け）
  2. **組織メンバー招待時**（新規オーナー向け）
  3. **ロール変更時**（昇格/降格時）

### ポリシー構成

| Policy ID | 用途 |
|-----------|------|
| `pol_01libraryuserpolicy` | 基本的なライブラリユーザー権限 |
| `pol_01libraryrepoowner` | 全リポジトリへのフルアクセス権限 |

## API

### GraphQL Mutation

```graphql
type Mutation {
  # メンバー招待（ロール指定可能）
  inviteUser(
    platformId: String
    tenantId: String!
    invitee: IdOrEmailInput!
    notifyUser: Boolean
    role: String  # "OWNER", "MANAGER", "GENERAL"
  ): User!

  # ロール変更
  changeOrgMemberRole(input: ChangeOrgMemberRoleInput!): User!
}

input ChangeOrgMemberRoleInput {
  tenantId: String!
  userId: String!
  newRole: String!  # "OWNER", "MANAGER", "GENERAL"
}
```

## 動作仕様

### サインイン時

- 既存のオーナーがサインインすると、`attach_repo_owner_policy_if_org_owner` が呼ばれる
- ユーザーのロールが `Owner` の場合、`pol_01libraryrepoowner` を自動付与
- `resource_scope = NULL` で付与されるため、組織内の全リポジトリにアクセス可能

### メンバー招待時（InviteOrgMember）

- `role` パラメータでオーナー/マネージャー/一般を指定可能
- オーナーの場合は `pol_01libraryrepoowner` を自動付与
- 全招待ユーザーに `pol_01libraryuserpolicy` を付与

### ロール変更時（ChangeOrgMemberRole）

- ユーザーの組織内ロールを変更
- **オーナーへ昇格時**: `pol_01libraryrepoowner` を付与
- **オーナーから降格時**: `pol_01libraryrepoowner` を剥奪

## データベース

### user_policies テーブル

```sql
SELECT * FROM user_policies WHERE policy_id = 'pol_01libraryrepoowner';

-- 結果例:
-- user_id: us_01hs2yepy5hw4rz8pdq2wywnwt
-- tenant_id: tn_01hjryxysgey07h5jz5wagqj0m
-- policy_id: pol_01libraryrepoowner
-- resource_scope: NULL  -- 全リポジトリに適用
```

## 実装ファイル

| ファイル | 内容 |
|---------|------|
| `packages/auth/domain/src/user.rs` | `with_role` メソッド追加 |
| `apps/library-api/src/usecase/invite_org_member.rs` | 招待時のポリシー付与 |
| `apps/library-api/src/usecase/change_org_member_role.rs` | ロール変更時のポリシー管理 |
| `apps/library-api/src/usecase/sign_in.rs` | サインイン時のポリシー付与 |
| `apps/library-api/src/handler/graphql/mutation.rs` | GraphQL Mutation |
| `apps/library-api/tests/scenarios/library_org_member_role.yaml` | シナリオテスト |

## 関連ドキュメント

- [Resource-Based Access Control](../../tachyon-apps/authentication/resource-based-access-control.md)
- [Policy Management](../../tachyon-apps/authentication/policy-management.md)
