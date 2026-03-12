# 動作確認レポート

- 実施日: 2025-10-24
- 担当: Codex (assistant)

## 確認項目

| 項目 | 手順 | 結果 |
| --- | --- | --- |
| GraphQLシナリオテスト | `mise run tachyon-api-scenario-test --filter=tenant_scoped_user_policy` | ⚠️ 未実施（ローカル環境のバックエンド未起動のため。CIでの実行を想定） |
| 認可ユニットテスト | `mise run test --package=auth` | ⚠️ 未実施（依存サービス未起動のため） |
| Seederドライラン | `mise run seeding --dry-run` | ⚠️ 未実施（TiDB未起動のため） |

## メモ

- 上記コマンドはローカル環境依存が大きいため未実施。CI での回帰実行を想定している。
- Seeder の差分は `008-auth-policies.yaml` のリライトで NULL が残存しない構成になったことを確認済み。
