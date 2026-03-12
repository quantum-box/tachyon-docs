---
title: "Libraryサインイン時のポリシー自動付与"
type: "improvement"
emoji: "🔐"
topics:
  - auth
  - policy
  - library
published: true
targetFiles:
  - packages/tachyon_apps/src/auth.rs
  - packages/auth/src/usecase/sign_in_with_platform.rs
  - packages/auth/src/lib.rs
  - apps/library-api/src/handler/graphql/mutation.rs
  - apps/library-api/src/usecase/sign_in_with_platform.rs
  - apps/library-api/schema.graphql
  - scripts/seeds/n1-seed/008-auth-policies.yaml
github: https://github.com/quantum-box/tachyon-apps
---

# Libraryサインイン時のポリシー自動付与

## 概要

Library プラットフォームへサインインするユーザーに必要最小限のポリシーを自動付与し、`me` クエリでの PermissionDenied を解消する。

## 背景・目的

- 現状、Library のダッシュボード初期表示で `auth:GetUserById` などが必要だが、新規サインイン直後はポリシー未付与のため 403/PermissionDenied が発生。
- サインインフロー内で所定のポリシーを付与することで、初回表示を安定させる。

## 詳細仕様

### 機能要件
1. Library プラットフォーム ID（`tn_01j702qf86pc2j35s0kv0gv3gy`）でサインイン完了時、自ユーザーに Library 用ポリシーを付与する。
2. ポリシーはプラットフォームスコープと、ユーザー所属の各オペレーター（必要に応じて）に付与できること。
3. 同ポリシーは冪等に付与できること（重複エラーにならない）。
4. GraphQL `sign_in`（library-api、内部で auth の `sign_in_with_platform` を利用）経由でも同様に動作する。

### 非機能要件
- 既存サインイン処理のパフォーマンスを劣化させない（付与処理は最小クエリ数で）。
- 既存ポリシー体系を壊さない（ID固定、限定的な action のみ許可）。

### コンテキスト別責務
```yaml
contexts:
  auth:
    responsibilities:
      - Library 専用ポリシーの定義・付与ロジック
  tachyon_apps (facade):
    responsibilities:
      - AuthApp からポリシー付与/剥奪を呼び出せる公開 API の整備
  library-api:
    responsibilities:
      - sign_in_with_platform 成功時に AuthApp の付与 API を呼び出す
```

## 実装方針

- `tachyon_apps::auth::App` に `attach_user_policy` / `detach_user_policy` を公開し、既存 usecase を注入（完了）。
- Library 専用ポリシーを seed に追加（ID: `pol_01libraryuserpolicy`）し、`GetUserById` / `GetOperatorById` / `FindAllOperatorsByUserId` を許可（追加済み）。
- GraphQL ミューテーション名を `sign_in` に変更し、内部で Library 用 usecase (`LibrarySignInWithPlatform`) 経由でポリシー付与を行う（コンテキスト責務分離）。
- 冪等性は `UserPolicyMappingRepository::create_mapping` に依存（既存挙動）。

## タスク分解
- [x] AuthApp に attach/detach API を追加（DI/モック含む）
- [x] LibraryUserPolicy を seed に追加（必要 action のみ許可）
- [x] library-api に `LibrarySignInWithPlatform` usecase を追加し、GraphQL `sign_in` から呼び出す
- [ ] テスト/CI 実行（`mise run ci`）
- [ ] 動作確認ログの取得（PermissionDenied が消えること）

## テスト計画
- 単体: attach/detach の公開 API が呼べること（モックで検証）。
- 結合: `sign_in` 実行後、`me` クエリが PermissionDenied にならないこと（開発環境 dummy-token で確認）。
- CI: `mise run ci`。

## リスクと対策
| リスク | 影響 | 対策 |
| --- | --- | --- |
| ポリシー付与が冪等でない | サインイン失敗/重複エラー | 既存 create_mapping の冪等性を前提にし、失敗時は warn ログに留める |
| 他プラットフォームへの誤付与 | 余計な権限付与 | プラットフォーム ID チェックを厳密に |

## 完了条件
- Library サインイン直後の `me` 取得で PermissionDenied が出ない。
- seed に LibraryUserPolicy が含まれる。
- CI (`mise run ci`) が通過。
