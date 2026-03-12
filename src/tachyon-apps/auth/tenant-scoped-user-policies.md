# テナントスコープ付きユーザーポリシー管理

## 概要

ユーザーポリシー割当を常にオペレーター（テナント）単位で管理し、`tenant_scope` や NULL 許容列に依存したグローバル割当を全廃した。これにより、テナント外の権限が混入するリスクを排除し、運用時にポリシー配布状況を追跡しやすくする。

## 背景

- 旧 `user_policies` は `(user_id, policy_id)` の複合キーで、ユーザーが所属するすべてのテナントでポリシーが有効になっていた。
- 生成列 `tenant_scope` を用いた「システム共通ポリシー」の表現は、NULL 割当のまま残存しやすく調査コストが高かった。
- 認可チェックの度に `tenant_scope` を解釈する分岐が必要となり、観測性とクエリ最適化を阻害していた。

## 要求仕様

### データモデル

- `user_policies` の主キーを `(user_id, tenant_id, policy_id)` に再定義し、`tenant_id` を `NOT NULL` 化。
- 列 `tenant_scope` を削除し、生成列や既存ビューからの参照も全て除去する。
- インデックス構成:
  - `idx_user_tenant (user_id, tenant_id)`
  - `idx_tenant_policy (tenant_id, policy_id)`
- `assigned_at` の既定値は従来通り `CURRENT_TIMESTAMP`。

### ポリシー種別

- システムポリシー (`is_system = true`) はホスト用途のテナント ID を保持し、対象テナントごとに `user_policies` へ明示的に複製する。暗黙の共通ポリシー概念は廃止。
- カスタムポリシー (`tenant_id = Some(OperatorId)`) は従来通り指定テナント内でのみ有効。

### アプリケーションサービス

- `PolicyService` / `UserPolicyRepository` の取得系メソッドで `TenantId` を必須パラメータ化し、NULL ケース分岐を除去。
- `CheckPolicyImpl` は `MultiTenancy` から取得した `operator_id` のみで判定し、テナント外の割当がヒットしても許可ロジックに混入しない。
- `AttachUserPolicy` / `DetachUserPolicy` などのユースケース入力に `tenant_id` を追加し、別テナント指定時は `forbidden` を返す。
- オーバーライド評価は `Deny` 優先で全件走査し、途中 `break` による Allow 漏れを解消。

### API / GraphQL

- GraphQL の Mutation / Query 入力から `tenantId` を省略した場合は `invalid_argument` を返す。UI 側は常に現在表示中のオペレーター ID を送信する。
- Tachyon API は `x-operator-id` ヘッダーを `MultiTenancy` に伝播し、未指定時は 400 を返すよう問い合わせ層でバリデーションを追加。

### マイグレーション / シード

- 2 段階マイグレーションでデータをバックフィル後にスキーマを変更する。
  1. `_tenant_to_user` を参照して `tenant_id IS NULL` の割当を各所属テナントへ複製。
  2. `tenant_scope` 削除、`tenant_id` の `NOT NULL` 制約、主キー再定義、不要インデックスの破棄。
- `scripts/seeds/n1-seed/008-auth-policies.yaml` をテナント明示形式に更新し、`mise run seeding --dry-run` でバリデーション可能にする。

### 非機能要件

- 認可クエリは `user_policies` 単体参照で完結させ、他テーブルとの結合を増やさない。
- マイグレーションはロック時間短縮のためオンライン DDL を前提にし、検証用リハーサル手順を Runbook に追記する。

## 実装サマリ（v0.19.0 / 2025-10-24）

- `user_policies` から `tenant_scope` 列および関連トリガを削除し、NULL 割当を禁止。
- GraphQL バリデーションと Usecase レイヤーで `tenantId` を必須化し、ヘッダー未設定時のハンドリングを統一。
- Seeder をテナント明示形式へリライトし、`mise run tachyon-api-scenario-test` での権限回帰テストを更新。
- `CheckPolicyImpl` のオーバーライド評価を `Deny` 優先アルゴリズムに整理し、許可判定の取りこぼしを解消。

## テスト

- `packages/auth/tests/policy_management_integration_test.rs` にテナントスコープ必須化のリグレッションテストを追加。
- `apps/tachyon-api/tests/scenarios/tenant_scoped_user_policy.yaml` で GraphQL からの割当操作を検証。
- `mise run tachyon-api-scenario-test` を CI に含め、テナント切替時の権限漏れを検出。

## 既知の課題・フォローアップ

- CSV インポートユーティリティが単一テナント前提のままのため、入力テンプレートへ `tenant_id` 列を追加する改善が未着手。
- Playwright MCP を用いた UI 動作確認はテナント切替シナリオの自動化が未完了。

## 関連ドキュメント

- [テナントスコープ付きユーザーポリシー強制タスク](../../tasks/completed/v0.19.0/enforce-tenant-scoped-policies/task.md)
- [初期ロールアウトタスク (v0.16.0)](../../tasks/completed/v0.16.0/tenant-scoped-user-policies/task.md)
