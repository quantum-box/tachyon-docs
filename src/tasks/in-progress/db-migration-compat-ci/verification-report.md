# DBマイグレーション互換性CI 動作確認レポート

実施日: 2026-02-22
実施者: Codex

## 確認内容

- [x] workflowの静的検証
- [x] ジョブ依存関係の確認
- [x] 破壊的DDLガード条件の確認
- [x] deploy後migrationの実行条件確認

## 実施結果

### ✅ 実施済み

- `python3 + PyYAML` で以下workflowのYAMLパース成功
  - `.github/workflows/tidb-migration-check.yaml`
  - `.github/workflows/tachyon-api-release.yml`
- `git diff` で追加ジョブの依存関係と条件分岐を確認
  - `guard-destructive-ddl` は PR時のみ実行
  - 互換性ジョブ2つは `check-changes` と `guard-destructive-ddl` 成功時のみ実行
  - `prod-migrate` は `build-and-deploy` 成功後にのみ実行
- 互換性ジョブのテスト設定をTiDB用に上書きする実装を確認
  - `TEST_CONFIG_PATH=tests/config/ci-tidb.yaml`
  - `ci.yaml` の `localhost:15000` を `127.0.0.1:4000` へ置換
  - TiDB readiness waitステップを追加

### ⚠️ 未実施（GitHub上の実行で確認が必要）

- 実際のPRイベントでの互換性ジョブ完走
- 本番相当シークレット (`PROD_DATABASE_URL`) を用いた `prod-migrate` 実行

## 追記（2026-02-22）

- PR実行で `Compat check (new app x old db)` が失敗
  - 原因1: 互換性ジョブが `.github/tidb-compat` のオーバーレイを使用しておらず、既知のTiDB非互換migration (`20251115090000_trim_agent_protocols.up.sql`) で失敗
  - 対応1: 互換性ジョブのmigration適用処理を `mysql client + tidb-compat優先` に変更
  - 原因2: `head`/`base` の2checkout構成で `tidb-compat` 参照先がルート相対になっており、オーバーレイが見つからなかった
  - 対応2: `COMPAT_DIR` を `head/.github/tidb-compat` / `base/.github/tidb-compat` に修正
  - 追加: `Install MySQL client` ステップを互換性2ジョブへ追加
- PR実行で互換性2ジョブが継続失敗
  - 原因3: テスト実行中に `tachyon_apps_ops` へ接続が発生するが、互換性ジョブで `packages/deployment_event/migrations` を適用しておらずDB未作成
  - 対応3: 互換性2ジョブの migration 適用対象に `packages/deployment_event/migrations -> tachyon_apps_ops` を追加
