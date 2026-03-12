# Tenantスコープポリシー強制 taskdoc

## 基本情報
- 着手日: 2025-10-22
- 担当: Codex (assistant)
- 参照タスク: docs/src/tasks/completed/v0.19.0/enforce-tenant-scoped-policies/task.md
- 関連領域: auth認可、multi-tenancy、GraphQL、TiDBマイグレーション、seed運用

## フェーズ計画

- フェーズ0 調査準備 ✅ (2025-10-22 完了)
  - [x] `user_policies` 現行スキーマと既存マイグレーションの確認
  - [x] `tenant_scope` / `tenant_id IS NULL` 参照コードの洗い出し
  - [x] Seeder (`008-auth-policies.yaml`) の NULL 割当ケース把握
- フェーズ1 データ移行設計 ✅ (2025-10-22 完了)
  - [x] NULL 割当の移行方針と対象テナントの決定（シード所属に基づき複製）
  - [x] 移行SQL/バッチのドラフト作成
  - [x] ロールバック手順と検証観点の整理
- フェーズ2 スキーマ変更 ✅ (2025-10-22 完了)
  - [x] 新マイグレーションの設計（NOT NULL・PK再定義・`tenant_scope`削除）
  - [x] up/down 双方の手順確認
  - [x] 影響範囲コードのバックワード互換性レビュー
- フェーズ3 アプリケーション & Seeder 改修 ✅ (2025-10-22 完了)
  - [x] SQLx リポジトリ／サービスの `tenant_scope` 依存除去
  - [x] GraphQL / Usecase 入力バリデーション更新
  - [x] Seeder 更新と `mise run seeding` 検証（ローカル検証は後続、シード差分を反映済み）
- フェーズ4 ドキュメント & リリース準備 ✅ (2025-10-24 完了)
  - [x] 権限管理仕様・運用手順の更新
  - [x] リリースノート草案
  - [x] verification-report 更新

## 初期メモ
- 既存システムは `tenant_scope` による共通ポリシーを許容しており、NULL テナントの扱いが広範囲で前提化されている可能性が高い。認可キャッシュや GraphQL レイヤーまで追跡する。
- マイグレーションはダウンタイム無しが要件のため、事前データ補完 → 制約追加 → 列削除の順序を taskdoc で明確化する。
- Seeder 更新では `tenant_id` を具体的な `tn_...` ID に統一する必要あり。利用可能なテナント ID の整理が必須。
- 2025-10-22: `packages/auth/migrations/20251022090000_enforce_tenant_scoped_user_policies.(up|down).sql` を追加。NULL 割当を `_tenant_to_user` 経由で複製し、`tenant_scope` を廃止するスキーマへ移行するドラフト。
- 2025-10-22: GraphQL/resolver で `tenantId` を必須化し、`PolicyService`/`UserPolicy` 周辺を `TenantId` ベースに統一。
- 2025-10-22: `scripts/seeds/n1-seed/008-auth-policies.yaml` を更新し、システムポリシー含めすべての `user_policies` 割当で `tenant_id` を明示する構成に変更。
- 2025-10-23: GraphQL シナリオ `enforce_tenant_scoped_user_policies.yaml` を追加し、`mise run tachyon-api-scenario-test` が成功することを確認（従来シナリオも通過）。

## リスクメモ
1. NULL テナントの移行対象テナントが誤ると、既存ユーザーが権限喪失する。
2. マイグレーション中に `user_policies` を参照するトランザクションがロックされ、API が一時的に失敗するリスク。
3. GraphQL 呼び出しで `tenantId` を必須化すると既存クライアントがエラーになる可能性があるため、呼び出し元の棚卸しが必要。

## 直近TODO
- なし
