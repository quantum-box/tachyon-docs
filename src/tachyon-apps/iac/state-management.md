# IaC Manifest State Management

## 概要

IaCマニフェストの適用経路を以下に統一する。

- 通常シード: `yaml-seeder`
- IaCマニフェスト (`003-iac-manifests.yaml`): `tachyon-cli iac import-seed`

これにより、`manifests` テーブル更新時に `manifest_revisions` が自動記録され、履歴とロールバックが利用可能になる。

## 運用コマンド

```bash
# 履歴確認
cargo run -p tachyond --bin tachyon-cli -- iac history --kind ProjectConfig --name system-config

# 変更差分確認
cargo run -p tachyond --bin tachyon-cli -- iac diff --file ./manifest.json

# 適用計画
cargo run -p tachyond --bin tachyon-cli -- iac plan --file ./manifest.json

# 適用
cargo run -p tachyond --bin tachyon-cli -- iac apply --file ./manifest.json

# ロールバック
cargo run -p tachyond --bin tachyon-cli -- iac rollback \
  --kind ProjectConfig --name system-config --revision 3

# seedファイルとDBのドリフト検証
cargo run -p tachyond --bin tachyon-cli -- iac verify-seed \
  --file ./scripts/seeds/n1-seed/003-iac-manifests.yaml
```

## 環境別マニフェスト方針

- `dev`: `scripts/seeds/n1-seed/003-iac-manifests.yaml`
- `prod`: 同一フォーマットを基準にしつつ、適用前に `tachyon-cli iac plan` と `verify-seed` を実施

## 承認フロー（本番）

1. PRで `003-iac-manifests.yaml` の差分レビュー
2. CI/手動で `tachyon-cli iac plan` を実行し変更内容を確認
3. 承認後に `mise run seeding prod` を実行
4. 適用後に `tachyon-cli iac history` で revision を確認

## 定期ドリフト検出

- Workflow: `.github/workflows/iac-drift-check.yml`
- `PROD_DATABASE_URL` が設定されている場合、`verify-seed` でドリフトを検査
