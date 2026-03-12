---
title: "Tenantスコープのポリシー割当を強制する"
type: improvement
emoji: "🛡️"
topics:
  - auth
  - policy
  - multi-tenancy
published: true
targetFiles:
  - packages/auth/migrations
  - packages/auth/src
  - scripts/seeds/n1-seed/008-auth-policies.yaml
  - docs/src/architecture
github: ""
---

# Tenantスコープのポリシー割当を強制する

## 概要

`user_policies` テーブルおよび関連ドメインロジックを「テナントごとに必ず個別ポリシーを割り当てる」前提へ刷新し、`tenant_scope` に依存しないシンプルな権限管理へ移行する。

## 背景・目的

- 現行実装ではシステム共通ポリシーを許容するため `tenant_scope` の派生列を用いているが、運用ではテナント単位での明示的な付与を求めている。
- 共通ポリシーが欠損した場合に認可判定が空になりやすく、トラブルシュートが煩雑になる。
- DB・アプリ側の複雑な条件 (`tenant_scope IN ('system', ...)`) を排除し単純化することで、保守性と可観測性を向上させる。

## 詳細仕様

### 機能要件

1. `user_policies` は `tenant_id` を必須列 (`NOT NULL`) とし、主キーを `(user_id, tenant_id, policy_id)` に再定義する。
2. `tenant_scope` 列および "system" という暗黙スコープを廃止する。
3. 既存の `tenant_id = NULL` データを、対象テナントごとの個別割当へ移行する移行スクリプトを提供する。
4. アプリケーションのリポジトリ層・ドメインサービスは `tenant_id` のみを参照し、NULL を前提とした分岐を排除する。
5. Seeder・初期データは全て `tenant_id` を明示し、共通ポリシーの概念を廃止する。
6. GraphQL/API からの呼び出し時に `tenantId` を省略できないようバリデーション／エラーを強化する。

### 非機能要件

- マイグレーションはダウンタイム無しで実施できる手順（事前データ更新 → スキーマ変更）を用意する。
- 既存の権限チェックのレスポンスタイムを劣化させない。
- 監査ログやトレースにおけるテナント情報の欠落を防ぐ。

### コンテキスト別の責務

```yaml
contexts:
  auth:
    description: "認可データの正規化"
    responsibilities:
      - user_policies スキーマの再定義
      - ポリシーリポジトリ/サービスのクエリ修正
      - GraphQL Resolver / Usecase の入力バリデーション強化
  docs:
    description: "運用手順のアップデート"
    responsibilities:
      - 権限管理仕様書の更新
      - Seeder 手順書の更新
  scripts:
    description: "データ移行と初期データ整備"
    responsibilities:
      - 既存NULLレコードの補完
      - 008-auth-policies.yaml の修正
```

### 仕様のYAML定義

```yaml
user_policies:
  primary_key: [user_id, tenant_id, policy_id]
  columns:
    user_id:
      type: varchar(255)
      nullable: false
    tenant_id:
      type: varchar(29)
      nullable: false
    policy_id:
      type: varchar(32)
      nullable: false
    assigned_at:
      type: timestamp
      default: current_timestamp
migration_plan:
  - step: "共通ポリシー割当の棚卸し"
    description: "tenant_id IS NULL の行を抽出し、対象テナントへコピー"
  - step: "データ更新"
    description: "UPDATE user_policies SET tenant_id = <target> WHERE tenant_id IS NULL"
  - step: "スキーマ変更"
    description: "tenant_scope 削除・NOT NULL 制約追加・インデックス再作成"
```

## 実装方針

1. **データ移行**: トランザクション内で共通割当を各テナントへ複製するスクリプトを作成し、マイグレーション前に適用する。
2. **マイグレーション**: 2段階（新テーブル作成→データ移行→リネーム）で `tenant_scope` を削除し、`tenant_id` を必須化する。
3. **コード更新**:
   - `SqlxUserPolicyMappingRepository` / `PolicyService` のクエリを `tenant_scope` 非依存へ書き換え。
   - `CheckPolicyImpl` を含む権限チェックで `system` スコープに関する分岐を削除。
   - GraphQL Resolver で `tenantId` 未指定の場合はエラーを返すよう修正。
4. **Seeder更新**: 008-auth-policies.yaml 内の `tenant_id: null` を全て具体的な `tn_...` に差し替える。
5. **ドキュメント**: 権限管理仕様と運用手順を更新し、共通ポリシーの撤廃を明記する。

## タスク分解

### フェーズ1: 現状調査 📝
- [ ] 共通ポリシー割当（`tenant_id IS NULL`）の一覧化
- [ ] `policies.tenant_id` の利用状況調査
- [ ] 影響を受けるAPI/Usecaseの洗い出し

### フェーズ2: データ移行設計 📝
- [ ] 共通割当をどのテナントへ紐付けるか決定
- [ ] データ移行SQL/スクリプトのドラフト作成
- [ ] 検証環境でリハーサル

### フェーズ3: スキーマ変更 🔄
- [ ] 新マイグレーションの実装
- [ ] Up/Down 双方のテスト
- [ ] `tenant_scope` 参照コードの削除

### フェーズ4: アプリ・Seeder更新 🔄
- [ ] SQLxクエリの改修
- [ ] GraphQL / Usecase 入力バリデーション強化
- [ ] Seeder更新と `mise run seeding` 動作確認

### フェーズ5: ドキュメント・リリース準備 📝
- [ ] 仕様書更新
- [ ] 運用手順/Runbook更新
- [ ] リリースノート草案作成

## テスト計画

- `mise run tachyon-api-scenario-test` で権限関連シナリオが通ること。
- `cargo nextest -p auth`（もしくは `mise run test` 対応タスク）でユニットテストを網羅。
- マイグレーション適用前後の DB スナップショットを取得し、差分検証スクリプトで `tenant_id IS NULL` が 0 件になることを確認。
- GraphQL 経由で `AuthQuery::users` を呼び、`tenantId` 未指定時に期待どおりエラーが返ることを確認する。

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| テナント割当ルールの齟齬 | 高 | 事前に利害関係者へ合意形成し、移行テーブルを共有 |
| マイグレーションでのロック | 中 | 事前にリハーサルし、ピーク外時間での実行・バッチ化 |
| Seeder 変更漏れ | 中 | CI で `mise run seeding --dry-run` を追加実行 |
| 既存 API が `tenantId` 未指定を前提にしている | 高 | 呼び出し元を洗い出し、先行修正 or デプリケーション通知 |

## ⚠️ 要注意事項

1. 潜在的セキュリティ懸念（`packages/auth/src/domain/service/check_policy.rs:220` 付近）

```rust
// 現在の実装の潜在的問題
if has_policy {
    match override_policy.effect() {
        PolicyEffect::Allow => allowed = true,
        PolicyEffect::Deny => {
            explicitly_denied = true;
            break; // 早期breakで後続のAllowオーバーライドを見逃す可能性
        }
    }
}
```

- 複数のオーバーライドが存在する場合、`break` によって後続の Allow オーバーライドを評価できず許可ロジックが漏れる恐れがある。
- 推奨対応: 全ての適用対象オーバーライドを収集した上で、`Deny` 優先ルールを一貫して評価するロジックへ改修する。

## 参考資料

- `packages/auth/migrations/20251016093000_add_tenant_scope_to_user_policies.up.sql`
- `packages/auth/src/interface_adapter/gateway/sqlx_user_policy_mapping_repository.rs`
- `docs/src/tachyon-apps/authentication/multi-tenancy.md`
- `scripts/seeds/n1-seed/008-auth-policies.yaml`

## 完了条件

- [ ] `user_policies` から `tenant_scope` を削除し、`tenant_id` が必須になっている。
- [ ] 既存データに `tenant_id IS NULL` の割当前が存在しない。
- [ ] アプリケーションの権限チェックがテナント必須で動作することを自動テストで確認。
- [ ] Seeder とドキュメントが新方針を反映している。
- [ ] リリースノート/Runbook が更新されている。

## 備考

- 変更規模は破壊的ではあるが API 互換性は維持予定のため、バージョンはマイナーバンプ（例: v0.x → v0.(x+1).0）を想定。
- 既存の共通ポリシー (`AdminPolicy` など) はテナント単位で複製し、命名規約（例: `AdminPolicy@tn_xxx`）を設ける予定。詳細はフェーズ2で詰める。
