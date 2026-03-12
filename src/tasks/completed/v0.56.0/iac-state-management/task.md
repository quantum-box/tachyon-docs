---
title: "IaCマニフェストのステート管理 — yaml-seeder直接投入からの脱却"
type: refactor
emoji: "🏗️"
topics:
  - IaC
  - State Management
  - Manifest
  - yaml-seeder
  - DevOps
published: true
targetFiles:
  - packages/iac/
  - packages/yaml-seeder/
  - scripts/seeds/n1-seed/003-iac-manifests.yaml
  - apps/tachyon-api/src/di.rs
github: ""
---

# IaCマニフェストのステート管理 — yaml-seeder直接投入からの脱却

## 概要

現在、IaCマニフェスト（プロバイダー設定、認可ポリシー、シードデータ等）は `yaml-seeder` で直接DBに投入されており、変更履歴の追跡・ドリフト検出・ロールバックができない。宣言的なステート管理を導入し、「誰がいつ何を変えたか」を追跡可能にする。

## 背景・目的

### 現状の問題

1. **変更追跡不能**: yaml-seeder は `INSERT ... ON DUPLICATE KEY UPDATE` を直接実行するため、DB上のマニフェストがいつ・誰によって変更されたかの監査ログがない
2. **ドリフト検出不能**: 手動でDBを直接変更した場合に差分を検出する手段がない。YAML定義とDB上の実態が乖離しても気づけない
3. **ロールバック不能**: 問題が起きても「前の状態に戻す」操作が不可能。git revert + yaml-seeder再実行で対応するしかない
4. **循環依存**: IaCマニフェスト自体がyaml-seederで投入されるというメタブートストラップ問題
5. **本番とdevの乖離**: `scripts/seeds/n1-seed/` はdev用のシードだが、本番のマニフェスト管理とは別フローで、環境差異が管理されていない

### 既に存在する仕組み

- **`manifest_apply_logs` テーブル**: `applyManifest` GraphQL API経由での変更はログが残る
- **`IacConfigurationProvider`**: 3階層の継承解決（System → Platform → Operator）は成熟している
- **`SecretExtractor`/`SecretResolver`**: `$secret_ref` によるシークレット分離は完成済み
- **`SeedData` マニフェスト種別**: ランタイムでのデータ適用の仕組みは存在する

### 目的

- yaml-seeder によるIaCマニフェストの直接DB投入を廃止し、API経由のステート管理に移行
- すべてのマニフェスト変更に監査ログを残す
- 宣言的な desired state と actual state の差分管理を実現

## 詳細仕様

### 機能要件

#### 1. マニフェストバージョニング

- マニフェストの変更ごとにバージョン（revision）を記録
- 過去のバージョンを照会可能にする（`getManifestHistory` API）
- 任意のバージョンへのロールバックを可能にする

#### 2. ドリフト検出

- YAML定義（desired state）とDB上のマニフェスト（actual state）のハッシュ比較
- CLI コマンドで差分を検出: `iac-cli diff <environment>`
- 差分がある場合の警告・レポート

#### 3. 環境別マニフェスト管理

```yaml
environments:
  dev:
    source: scripts/seeds/n1-seed/003-iac-manifests.yaml
    apply_mode: auto  # yaml-seeder からの移行対象
  production:
    source: manifests/production/
    apply_mode: manual  # 承認フロー必須
```

#### 4. 適用ワークフロー

```
YAML定義 → diff → plan → apply → verify
                    ↓
              audit log に記録
```

- `plan`: 適用予定の変更一覧を表示（dry-run）
- `apply`: 変更をDB + Secrets Managerに適用
- `verify`: 適用後の状態確認

### 非機能要件

- **後方互換性**: 移行期間中はyaml-seederとの併用が可能であること
- **冪等性**: 同じYAML定義を何度適用しても結果が同じであること
- **パフォーマンス**: diff/plan は1秒以内、apply は5秒以内で完了
- **セキュリティ**: `$secret_ref` のシークレット値は監査ログに記録しない

### コンテキスト別の責務

```yaml
contexts:
  iac:
    description: "マニフェストのステート管理"
    responsibilities:
      - マニフェストのバージョン管理
      - desired state / actual state の差分検出
      - 適用ワークフロー（plan → apply → verify）
      - 監査ログ記録
      - 環境別マニフェスト管理

  secrets:
    description: "シークレット値の保管・解決（既存）"
    responsibilities:
      - AWS Secrets Manager / .secrets.json でのシークレット保管
      - $secret_ref の解決

  yaml-seeder:
    description: "ブートストラップ専用に縮小"
    responsibilities:
      - 初回セットアップ時のテーブル構造初期化のみ
      - IaCマニフェストの投入からは撤退
```

## 実装方針

### アーキテクチャ

```
┌──────────────────────────────────────────────────────┐
│  CLI / CI Pipeline                                    │
│  iac-cli diff | plan | apply | history | rollback    │
└───────────────────────┬──────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────┐
│  IaC State Manager (packages/iac)                     │
│  ┌──────────────┐ ┌───────────────┐ ┌─────────────┐ │
│  │ Diff Engine  │ │ Apply Engine  │ │ Version Mgr │ │
│  │ desired vs   │ │ plan → apply  │ │ revisions   │ │
│  │ actual state │ │ → verify      │ │ & rollback  │ │
│  └──────────────┘ └───────────────┘ └─────────────┘ │
└───────────────────────┬──────────────────────────────┘
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
┌──────────────┐ ┌────────────┐ ┌──────────────┐
│ manifests DB │ │ apply_logs │ │ Secrets Mgr  │
│ (actual)     │ │ (audit)    │ │ (secrets)    │
└──────────────┘ └────────────┘ └──────────────┘
```

### 技術選定

| 技術 | 用途 | 選定理由 |
|------|------|---------|
| 既存 `packages/iac` | ステート管理ロジック追加先 | マニフェスト管理の責務が既にある |
| `manifest_apply_logs` テーブル | 監査ログ | 既存テーブルを活用 |
| SHA-256 ハッシュ | ドリフト検出 | マニフェストJSON内容の高速比較 |
| `clap` CLI | iac-cli コマンド | Rustエコシステムで統一 |

### データモデル追加

```sql
-- マニフェストにリビジョン管理用カラムを追加
ALTER TABLE tachyon_apps_iac.manifests
  ADD COLUMN content_hash VARCHAR(64) NOT NULL DEFAULT '',
  ADD COLUMN revision INT NOT NULL DEFAULT 1;

-- マニフェストリビジョン履歴
CREATE TABLE tachyon_apps_iac.manifest_revisions (
  id VARCHAR(29) NOT NULL PRIMARY KEY,
  manifest_id VARCHAR(29) NOT NULL,
  revision INT NOT NULL,
  manifest JSON NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  applied_by VARCHAR(128) NOT NULL,
  applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uk_manifest_revision (manifest_id, revision),
  FOREIGN KEY (manifest_id) REFERENCES manifests(id)
);
```

## タスク分解

### Phase 1: マニフェストバージョニング 📝

- [x] `manifest_revisions` テーブル作成（マイグレーション）
- [x] `manifests` テーブルに `content_hash`, `revision` カラム追加
- [x] `ManifestRepository::save` でリビジョン自動記録
- [x] `getManifestHistory` GraphQL クエリ追加
- [x] `rollbackManifest` GraphQL ミューテーション追加

### Phase 2: ドリフト検出 + CLI 📝

- [x] `tachyon-cli iac` サブコマンド追加（既存 Tachyon CLI へ統合）
- [x] `diff` サブコマンド: ローカルmanifestと最新revisionの差分表示
- [x] `plan` サブコマンド: 適用予定の変更一覧（create/update/no-change）
- [x] `apply` サブコマンド: `saveManifest` への適用
- [x] `history` サブコマンド: `manifestHistory` で変更履歴表示
- [x] `rollback` サブコマンド: `rollbackManifest` で指定revisionへ復元

### Phase 3: yaml-seeder からの移行 📝

- [x] `003-iac-manifests.yaml` の投入を `tachyon-cli iac import-seed` に移行
- [x] `mise run docker-seed` のIaCマニフェスト部分を `tachyon-cli iac` に切り替え
- [x] CI/CDパイプラインでの `tachyon-cli iac import-seed` 統合
- [x] 本番環境シーディング経路を `tachyon-cli iac import-seed` 管理下に統一

### Phase 4: 環境別管理 + 承認フロー 📝

- [x] 環境別マニフェスト運用方針の設計（dev/prod）
- [x] 本番適用時の承認フロー（GitHub PR連動）を文書化
- [x] ドリフト検出の定期実行（CI schedule）を追加
- [x] ドキュメント整備

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 移行期間中のyaml-seederとの競合 | 高 | Phase 3まではyaml-seederとの併用を維持し、段階的に移行 |
| 本番マニフェストの初回インポート | 中 | `iac-cli import` で既存DBデータからYAML定義を逆生成 |
| TiDB DDL制約 | 低 | `create-migration` スキルでTiDB互換のマイグレーション作成 |
| Secrets Manager値とマニフェストの整合性 | 中 | `verify` コマンドで `$secret_ref` の解決可否を検証 |

## 参考資料

- 既存IaC仕様: `docs/src/tachyon-apps/iac/seed-data-management.md`
- マニフェスト型定義: `packages/iac/src/domain/manifest.rs`
- 設定プロバイダ: `packages/iac/src/configuration.rs`
- シークレット管理: `docs/src/tachyon-apps/secrets/developer-guide.md`
- 既存適用ログ: `tachyon_apps_iac.manifest_apply_logs`

## 完了条件

- [x] IaCマニフェストの全変更がリビジョン管理され、監査ログが残る
- [x] `tachyon-cli iac diff/verify-seed` でYAML定義とDB実態の差分を検出できる
- [x] `tachyon-cli iac apply` でマニフェストを適用でき、`tachyon-cli iac rollback` で戻せる
- [x] `003-iac-manifests.yaml` のyaml-seeder投入が `tachyon-cli iac import-seed` に置き換わっている
- [x] 本番環境のマニフェスト投入経路が `tachyon-cli iac` 管理下にある

### バージョン番号の決定基準

**マイナーバージョン（x.X.x）を上げる:**
- [x] 新しいCLIツールの追加（iac-cli）
- [x] 新しいAPIエンドポイントの追加（getManifestHistory, rollbackManifest）
- [x] 既存機能の大幅な改善（マニフェスト管理のワークフロー変更）

## 備考

- このタスクは元々「Terraform Secrets管理」として計画されていたが、IaCマニフェスト方式で実質的なシークレット管理は解決済み。残る課題は**マニフェスト自体のステート管理**であるため、スコープを再定義した。
- yaml-seeder はテナント・ユーザー等のブートストラップデータ投入には引き続き使用する。廃止対象はIaCマニフェスト（`003-iac-manifests.yaml`）の投入部分のみ。
- 将来的にはポリシー（`008-auth-policies.yaml`）等もSeedDataマニフェスト経由に移行し、yaml-seederの責務をさらに縮小する方向。
- 2026-02-23: Phase 1として `manifest_revisions` 追加、`ManifestRepository::save` のrevision自動採番、`manifestHistory`/`rollbackManifest` GraphQL 追加を実装。
- 2026-02-23: Phase 2として `apps/tachyond` に `iac` サブコマンド（history/diff/plan/apply/rollback）を追加し、`tachyon-cli iac ...` で運用可能にした。
- 2026-02-23: Phase 3として `mise run docker-seed` / CI の `003-iac-manifests.yaml` 投入を `tachyon-cli iac import-seed` へ移行。
- 2026-02-23: Phase 4として `verify-seed` コマンドと定期CI (`.github/workflows/iac-drift-check.yml`) を追加し、運用ドキュメント `docs/src/tachyon-apps/iac/state-management.md` を作成。
