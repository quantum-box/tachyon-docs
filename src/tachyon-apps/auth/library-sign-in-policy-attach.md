# Libraryサインイン時のポリシー自動付与

## 目的
Library プラットフォームで初回サインインした直後に `me` クエリが 403 になる問題を防ぐため、サインイン完了時に必要最小限の Auth ポリシーを自動付与する。

## 適用範囲
- プラットフォーム ID が `tn_01j702qf86pc2j35s0kv0gv3gy` のときのみ実行。
- GraphQL ミューテーション `sign_in`（`apps/library-api`）経由で呼ばれる `LibrarySignInWithPlatform` usecase に組み込み。

## 付与ロジック
1. Auth の `sign_in_with_platform` でユーザー作成/取得を実施。
2. 上記プラットフォーム ID と一致する場合に限り、以下を冪等に実行する。
   - プラットフォームスコープ（tenant = `tn_01j702qf86pc2j35s0kv0gv3gy`）で `pol_01libraryuserpolicy` を付与。
   - サインイン後のユーザーが保持する全オペレーター ID それぞれに同ポリシーを付与（重複は HashSet で抑止）。
3. 実行主体は `Executor::SystemUser`、`MultiTenancy::default()`。エラーは握りつぶし、サインイン自体は成功させる。

## ポリシー内容
- ポリシー ID: `pol_01libraryuserpolicy`
- 付与アクション（すべて `effect: allow`）:
  - `auth:GetUserById`
  - `auth:GetOperatorById`
  - `auth:FindAllOperatorsByUserId`
- シードファイル: `scripts/seeds/n1-seed/008-auth-policies.yaml`

## 運用メモ
- プラットフォーム ID が変わる場合は `apps/library-api/src/usecase/sign_in_with_platform.rs` の定数とシードの両方を更新する。
- 冪等性は `UserPolicyMappingRepository::create_mapping` に依存しており、既存付与済みでもエラーにはならない。
