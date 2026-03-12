# YAMLシードツール (yaml-seeder)

`yaml-seeder` は `scripts/n1-seed.sql` を置き換える目的で追加した Rust 製 CLI です。YAML ファイルで初期データを管理し、バリデーション付きで MySQL に投入・エクスポートできます。

## 目的

- SQL ファイルよりも差分管理しやすい YAML 形式へ移行する
- テーブル定義を参照したバリデーションで、未定義カラムや必須項目の欠落を検知する
- `INSERT ... ON DUPLICATE KEY UPDATE` を自動生成して upsert する
- `JSON` 列など型に合わせた値変換を行い、`NULL` が許可されない列に誤って `null` を書き込むことを防ぐ

## セットアップ

```shell
# 初回のみワークスペース依存を取得
cargo fetch
```

`yaml-seeder` は環境ごとに接続先を解決します。`apply` コマンドは `yaml-seeder apply [dev|prod] <PATH>` 形式で環境を指定でき、環境を省略した場合は `dev` が選択されます（例: `yaml-seeder apply scripts/seeds/n1-seed`）。`export` コマンドは `--env` オプションで同様に指定可能です。

`--database-url` を明示しない場合は、以下の順序で接続文字列を解決します。

1. 指定した環境に対応する環境変数（`dev` → `DEV_DATABASE_URL`, `prod` → `PROD_DATABASE_URL`）
2. `dev` 環境のみ `mysql://root@127.0.0.1:15000`

本番投入時は `PROD_DATABASE_URL` か `--database-url` を必ず設定してください。

```shell
# 例: dev/prod で接続URLを切り替える
export DEV_DATABASE_URL="mysql://root@127.0.0.1:15000"
export PROD_DATABASE_URL="mysql://user:password@prod-host:3306"
```

- `DATABASE_URL` 単体での指定は解決順位から除外されました。既存の接続文字列を使いたい場合は `--database-url "mysql://..."` を併用してください。

## YAML フォーマット

- ルート: `version: 1` と `tables` の配列
- `name`: `schema.table` 形式 (例: `tachyon_apps_auth.tenants`)
- `mode`: `insert` / `upsert-update`。指定なしは `upsert-update`
- `update_columns`: `upsert-update` の更新対象カラム。省略で投入カラム全て
- `rows`: キーがカラム名のマップ。JSON 列は `metadata: {}` のように `null` 禁止

例 (`tachyon_apps_auth.users` 抜粋):

```yaml
- name: tachyon_apps_auth.users
  mode: upsert-update
  rows:
    - id: us_...
      email: test@example.com
      role: OWNER
      metadata: {}
      created_at: 2025-09-18 02:23:31.000000
      updated_at: 2025-09-18 02:23:31.000000
```

## コマンド

### エクスポート

既存 DB の内容を YAML へ書き出します。

```shell
cargo run -p yaml-seeder -- export scripts/seeds/n1-seed/001-auth-tenants.yaml \
  --table tachyon_apps_auth.tenants \
  --table tachyon_apps_auth.users \
  ...
```

- `--table` は複数指定可能
- `--pretty` で整形済み YAML を出力
- ディレクトリ運用時は用途に応じて出力先ファイルを選び、コミット対象のファイルへ上書きします。

### シードファイルの作成

マイグレーションと同じ感覚で空のシードファイルを追加できます。

```shell
mise run seed-create -- NAME=billing-policies -- DIRECTORY=scripts/seeds
```

- 既存ファイルの先頭番号を読み取り、次の番号をゼロ埋めで自動採番します（例: `003-billing-policies.yaml`）。
- `--number` で番号を手動指定可能。
- `--width` でゼロ埋め桁数を調整可能。未指定時は既存ファイルの桁数、もしくは3桁を基準に選択します。
- `mise run seed-create -- NAME=<slug>` でタスク経由の生成も可能。`DIRECTORY`/`NUMBER`/`WIDTH` を環境変数として上書きできます。

### 投入

YAML から DB に upsert します。

```shell
# dev 環境（省略時も dev が選択されます）
cargo run -p yaml-seeder -- apply scripts/seeds/n1-seed

# 本番環境へ投入する場合
cargo run -p yaml-seeder -- apply prod scripts/seeds/n1-seed
```

ファイルではなくディレクトリを指定した場合は、その直下にある `.yaml` / `.yml` をファイル名昇順で順番に読み込みます。`001-auth-tenants.yaml`, `002-auth-service-accounts.yaml`, `003-iac-manifests.yaml` ... のように連番を付けるとマイグレーション感覚で順序管理できます。

- 各シードファイルは1トランザクションで実行され、途中で失敗すると自動的にロールバックされます。

サポートオプション:

- `--dry-run`: SQL を生成して表示するだけ
- `--validate-only`: バリデーションまで実施し実行はしない
- `SEED_ENV=prod mise run seeding`: `mise` タスク経由で prod を指定する例（内部で `yaml-seeder apply prod ...` を実行）

問題がある場合はエラー内容にテーブル名・カラム名・行番号が含まれます。

## バリデーション内容

- 情報スキーマから取得したカラム一覧と YAML を照合
  - 未知のカラム → エラー
  - `NOT NULL` かつデフォルトなしの列が欠落 → エラー
- 列型に合わせて値を変換 (`DECIMAL`, `DATETIME`, `ENUM`, `JSON` 等)
- `enum(...)` の候補チェック
- `ON DUPLICATE KEY UPDATE` の対象列は `update_columns` で制御

## 既存シードファイル

- `scripts/seeds/n1-seed/` 配下に `001-*.yaml` 形式で `scripts/n1-seed.sql` を分割したシードが配置されています
- JSON 列 (`metadata` など) は `null` の代わりに `{}` を記載してください
- 新しいシードを追加する際は YAML を編集し、`apply` で DB を更新してからコマンドが成功することを確認します

## 運用メモ

- CI や `mise run` タスクには未統合のため、必要に応じてスクリプトを追加してください
- `SQLX_OFFLINE=true` は利用せず、常に実 DB へ接続する前提です
- 大量レコードを扱う場合はテーブル単位で YAML を分割する運用も検討してください
