# Rustシナリオテストのサーバーライフサイクル運用

このドキュメントは `apps/tachyon-api/tests/run_tests.rs` と `packages/muon` を用いたシナリオテスト実行フローをまとめたものです。テストバイナリから `tachyon-api` を自動起動し、YAMLシナリオの `base_url` を動的に注入するまでの一連の流れと注意点を記載します。

## 1. サーバー自動起動

- テスト開始時に `TestServerGuard` が `tachyon-api` を子プロセスとして起動します。
- 起動後は `/health` に最大 30 秒間ポーリングし、200 応答でシナリオ実行を開始します。
- テスト終了時（成功・失敗問わず）に `kill` → `wait` でプロセスを回収します。`Drop` 実装で panic 時もリークしません。

### 必要な環境変数

| 変数 | 役割 |
| --- | --- |
| `PAYMENT_SKIP_BILLING=true` | Stripe 課金のバリデーションをスキップ |
| `ENVIRONMENT=development` または `test` | `Bearer dummy-token` を許可し、認証レスを簡易化 |
| `ROOT_ID=tn_01hjryxysgey07h5jz5wagqj0m` | DI 初期化で Host テナントを解決 |

MySQL/TiDB、Redis などの依存サービスは `mise run up` で事前に起動しておきます。

## 2. base_url の動的注入

- YAML シナリオから `config.base_url` を削除し、`packages/muon` が `scenario.default_base_url`（`apps/tachyon-api/tests/config/default.yaml` で 50050）を注入します。
- シナリオ内で明示的に絶対パスを書きたい場合は `https://` などスキーマ付きで記載してください。スキーマがない場合は自動的に `base_url` が付与されます。
- `vars.timestamp` 等の既存テンプレートは従来通り使用できます。

## 3. シードデータの更新

2025-10-06 時点で以下を追加しています：

| 追加内容 | ファイル |
| --- | --- |
| `AttachUserPolicy` / `DetachUserPolicy` アクションの登録 | `scripts/seeds/n1-seed/008-auth-policies.yaml` |
| `AdminPolicy`, `TenantAdminPolicy` への両アクション許可付与 | 同上 `policy_actions` |

これにより `attachUserPolicy` / `detachUserPolicy` ミューテーションがシード環境で利用できます。

## 4. 実行手順

```bash
# 依存サービスを起動
mise run up

# シナリオテストを実行（サーバー自動起動付き）
mise run tachyon-api-scenario-test

# または直接 cargo で実行
cargo test -p tachyon-api --test run_tests -- --ignored
```

テストログは `/tmp/tachyon_scenario.log` に退避しておくと複数回実行の比較が容易です。

## 5. よくあるエラー

| 症状 | 対処 |
| --- | --- |
| `error trying to connect: tcp connect error` | `mise run up` を実行し、MySQL/Redis が立ち上がっているか確認 |
| `Invalid base_url provided` | YAML に絶対 URL を記載しているか、`tests/config/default.yaml` の `default_base_url` を確認 |
| `Action 'auth:AttachUserPolicy' not found` | シード未適用の可能性。`yaml-seeder apply scripts/seeds/n1-seed` を再実行 |

## 6. 参考シナリオ

- `apps/tachyon-api/tests/scenarios/operator_lifecycle.yaml`
- `apps/tachyon-api/tests/scenarios/policy_lifecycle.yaml`
- `apps/tachyon-api/tests/scenarios/user_policy_management.yaml`

これらは 50050 ポート前提の操作をすべてテンプレート化しており、ポート変更時は `tests/config/default.yaml` の `default_base_url` を更新するだけで対応できます。
