# Policy管理システム GraphQL実装サマリー

## 実装完了内容

### 1. GraphQLスキーマ定義
- **場所**: `apps/tachyon-api/schema.graphql`
- **追加した型**:
  - `Action` - アクション定義
  - `Policy` - ポリシー定義
  - `PolicyAction` - ポリシーとアクションの関連
  - `PolicyEffect` - ポリシー効果（ALLOW/DENY）
  - 各種入力型（ListActionsInput, RegisterPolicyInput等）

### 2. GraphQLモデル実装
- **場所**: `packages/auth/src/interface_adapter/controller/model/`
- **新規ファイル**:
  - `policy.rs` - Action, Policy, PolicyAction, PolicyEffectのGraphQL型定義
  - `policy_input.rs` - 入力型の定義

### 3. リゾルバー実装
- **Query追加** (`resolver.rs`):
  - `actions(input: ListActionsInput): [Action!]!` - アクション一覧取得
  - `policies: [Policy!]!` - ポリシー一覧取得
  - `policy(id: ID!): Policy` - ポリシーをIDで取得

- **Mutation追加** (`mutation.rs`):
  - `registerAction(...)` - 新しいアクションを登録
  - `registerPolicy(input: RegisterPolicyInput!): Policy!` - 新しいポリシーを作成
  - `updatePolicy(input: UpdatePolicyInput!): Policy!` - ポリシーを更新

## 残作業

### 1. Appへの統合
現在、`App`構造体には以下が不足しています：
- `ActionRepository`へのアクセス
- `PolicyRepository`へのアクセス
- `CheckPolicyDB`サービス（現在は`CheckPolicy`のみ）
- Policy管理関連のUsecaseインスタンス

### 2. リゾルバーの実装完了
現在のリゾルバーは全てTODOコメント付きで、実際のusecaseを呼び出していません。
以下の実装が必要です：
1. `App`にPolicy管理関連のフィールドを追加
2. `factory_auth_context`でリポジトリとusecaseをインスタンス化
3. 各リゾルバーメソッドから適切なusecaseを呼び出す

### 3. 実装例（必要な変更）

#### App構造体への追加:
```rust
pub struct App {
    // 既存のフィールド...
    
    // 追加が必要なフィールド
    pub(crate) action_repo: Arc<dyn ActionRepository>,
    pub(crate) policy_repo: Arc<dyn PolicyRepository>,
    check_policy_db: Arc<dyn CheckPolicyDB>,
    register_action: Arc<dyn RegisterActionInputPort>,
    register_policy: Arc<dyn RegisterPolicyInputPort>,
    list_actions: Arc<dyn ListActionsInputPort>,
    update_policy: Arc<dyn UpdatePolicyInputPort>,
}
```

#### リゾルバーの実装例:
```rust
async fn actions(
    &self,
    ctx: &Context<'_>,
    input: Option<super::model::ListActionsInput>,
) -> Result<Vec<super::model::Action>> {
    let executor = ctx.data_unchecked::<usecase::Executor>();
    let multi_tenancy = ctx.data_unchecked::<usecase::MultiTenancy>();
    let auth_ctx = ctx.data_unchecked::<Arc<crate::App>>();

    let output = auth_ctx
        .list_actions()
        .execute(executor, multi_tenancy, ListActionsInputData {
            context: input.and_then(|i| i.context),
        })
        .await?;

    Ok(output.actions.into_iter().map(Into::into).collect())
}
```

## 次のステップ

1. `lib.rs`の`App`構造体と`factory_auth_context`関数を更新
2. 各リゾルバーメソッドの実装を完了
3. 統合テストの作成
4. Tachyon管理画面UIの実装（別タスク）