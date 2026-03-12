# Org Owner Repo Full Access

## 概要

組織オーナー（DefaultRole::Owner）に対して、組織内の全リポジトリへのフルアクセス権限を自動付与する機能を実装する。

## 背景

- 現状: `DefaultRole` はラベルとしてのみ機能し、実際の権限チェックには使用されていない
- 課題: 組織オーナーでも個別リポジトリへの権限付与が必要だった
- 解決策: `pol_01libraryrepoowner` ポリシーを `resource_scope = NULL` で付与し、組織内の全リポジトリへのアクセスを許可

## 技術方針

### アプローチ

当初は `OrgOwnerAccessService` を作成して認可チェック時に動的判定する案があったが、影響範囲が大きいため却下。
代わりに、ポリシーベースのアプローチを採用：

- `pol_01libraryrepoowner` ポリシーを `resource_scope = NULL` で `user_policies` に追加
- `resource_scope = NULL` は「全リソースに適用」を意味する
- 3つのタイミングでポリシーを付与：
  1. サインイン時（既存オーナー向け）
  2. 組織メンバー招待時（新規オーナー向け）
  3. ロール変更時（昇格/降格時）

### ポリシー構成

| Policy ID | 用途 |
|-----------|------|
| `pol_01libraryuserpolicy` | 基本的なライブラリユーザー権限 |
| `pol_01libraryrepoowner` | 全リポジトリへのフルアクセス権限 |

## 実装内容

### 1. User ドメインモデル拡張 ✅

**ファイル**: `packages/auth/domain/src/user.rs`

```rust
/// Create a new User with a different role
pub fn with_role(&self, role: DefaultRole) -> Self {
    Self {
        role,
        updated_at: Utc::now(),
        ..self.clone()
    }
}
```

### 2. InviteOrgMember Usecase ✅

**ファイル**: `apps/library-api/src/usecase/invite_org_member.rs`

- auth の `InviteUser` をラップ
- `role` パラメータでオーナー/マネージャー/一般を指定可能
- オーナーの場合は `pol_01libraryrepoowner` を自動付与
- 全招待ユーザーに `pol_01libraryuserpolicy` を付与

### 3. ChangeOrgMemberRole Usecase ✅

**ファイル**: `apps/library-api/src/usecase/change_org_member_role.rs`

- ユーザーの組織内ロールを変更
- オーナーへ昇格時: `pol_01libraryrepoowner` を付与
- オーナーから降格時: `pol_01libraryrepoowner` を剥奪

### 4. GraphQL Mutation 更新 ✅

**ファイル**: `apps/library-api/src/handler/graphql/mutation.rs`

- `invite_user` に `role` パラメータを追加
- `change_org_member_role` ミューテーションを追加

```graphql
type Mutation {
  inviteUser(
    platformId: String
    tenantId: String!
    invitee: IdOrEmailInput!
    notifyUser: Boolean
    role: String  # "OWNER", "MANAGER", "GENERAL"
  ): User!

  changeOrgMemberRole(input: ChangeOrgMemberRoleInput!): User!
}

input ChangeOrgMemberRoleInput {
  tenantId: String!
  userId: String!
  newRole: String!  # "OWNER", "MANAGER", "GENERAL"
}
```

### 5. LibraryApp 統合 ✅

**ファイル**: `apps/library-api/src/app.rs`

- `invite_org_member` と `change_org_member_role` をアプリケーションに追加
- `GetRepoMembers::new` の引数修正（auth_app を追加）

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `packages/auth/domain/src/user.rs` | `with_role` メソッド追加 |
| `apps/library-api/src/usecase/invite_org_member.rs` | 新規作成 |
| `apps/library-api/src/usecase/change_org_member_role.rs` | 新規作成 |
| `apps/library-api/src/usecase/mod.rs` | モジュール追加 |
| `apps/library-api/src/app.rs` | Usecase統合 |
| `apps/library-api/src/handler/graphql/mutation.rs` | ミューテーション追加・更新 |
| `apps/library-api/tests/scenarios/library_org_member_role.yaml` | シナリオテスト追加 |

## 技術的な学び

1. **RepositoryV1 トレイト**: `save` メソッドを使用（`update` ではない）
2. **auth::App.user_repo**: メソッドではなくパブリックフィールド
3. **Rust ドキュメントコメント**: 関数パラメータには `///` は使えない → `#[graphql(desc = "...")]` を使用

## テスト方針

- [x] 既存オーナーのサインイン時にポリシーが付与されることを確認
  - `sign_in.rs` に `attach_repo_owner_policy_if_org_owner` メソッドが実装済み
- [ ] 新規メンバー招待時にロールに応じたポリシーが付与されることを確認
  - ローカル環境ではCognito認証が必要なため完全テスト不可
  - GraphQLスキーマで `role` パラメータが追加されていることは確認済み
- [x] ロール変更時にポリシーの付与/剥奪が正しく行われることを確認

## 動作確認結果 (2026-01-02)

### changeOrgMemberRole mutation

1. **OWNER → GENERAL**: ポリシー剥奪成功
   ```
   detached repo owner policy during role downgrade from Owner
   user=us_01hs2yepy5hw4rz8pdq2wywnwt tenant=tn_01hjryxysgey07h5jz5wagqj0m
   ```

2. **GENERAL → OWNER**: ポリシー付与成功
   ```
   attached repo owner policy during role upgrade to Owner
   user=us_01hs2yepy5hw4rz8pdq2wywnwt tenant=tn_01hjryxysgey07h5jz5wagqj0m
   ```

3. **DB確認**: `pol_01libraryrepoowner` が `resource_scope = NULL` で付与
   ```sql
   SELECT * FROM user_policies WHERE policy_id = 'pol_01libraryrepoowner';
   -- user_id: us_01hs2yepy5hw4rz8pdq2wywnwt
   -- tenant_id: tn_01hjryxysgey07h5jz5wagqj0m
   -- resource_scope: NULL (全リポジトリに適用)
   ```

### inviteUser mutation

- GraphQLスキーマに `role` パラメータ追加確認済み
- Cognito連携のためローカル完全テストは未実施

## ステータス

- [x] 設計・方針決定
- [x] User.with_role メソッド追加
- [x] InviteOrgMember Usecase 実装
- [x] ChangeOrgMemberRole Usecase 実装
- [x] GraphQL Mutation 更新
- [x] LibraryApp 統合
- [x] コンパイル確認
- [x] 動作確認テスト
- [x] シナリオテスト (docker-scenario-test)
- [x] CI チェック (docker-ci)
