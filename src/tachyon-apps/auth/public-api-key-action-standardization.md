# 公開APIキー参照アクション命名統一（v0.19.2）

## 概要

Authコンテキストで公開APIキー一覧を取得するユースケース `FindAllPublicApiKey` が、規約外のアクション名 `read:publicApiKey` を用いていた。v0.19.2 では命名規則に沿って `auth:FindAllPublicApiKeys` へ統一し、コード・シードデータ・ドキュメント間の整合性を確保した。

## 変更内容

- ユースケース `packages/auth/src/usecase/find_all_public_api_key.rs` のポリシー参照を `auth:FindAllPublicApiKeys` へ変更。
- シード `scripts/seeds/n1-seed/008-auth-policies.yaml` の `tachyon_apps_auth.actions` 定義を更新し、同一IDで新名称を適用。
- `packages/auth/discovered_actions.md` を含む参照ドキュメントから旧形式を排除。
- ポリシーデータベースに保存済みの `act_01hjryxysgey07h5jz5w00103` は再発行せず、表記のみを置き換え。

## リリース影響

- 既存ユーザーの割当ポリシーは ID が変わらないため追加移行不要。
- `yaml-seeder` でシード投入済み環境は、新名称が反映されていることを確認する。
- 認可チェックに失敗していたログのアクション名が新形式で出力される。

## 運用メモ

- バックエンド側でアクション名規約を検証する自動チェックに本変更を反映済み。
- 今後 `context:ActionName` 以外の表記を検出した場合は即時修正し、`discovered_actions.md` を同期する。

## 参照タスク

- [タスクドキュメント](../../tasks/completed/v0.19.2/fix-auth-public-api-key-action/task.md)
- [検証レポート](../../tasks/completed/v0.19.2/fix-auth-public-api-key-action/verification-report.md)
