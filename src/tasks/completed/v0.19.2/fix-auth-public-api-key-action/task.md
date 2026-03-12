---
title: "auth:FindAllPublicApiKeys アクション命名の規約違反修正"
type: "bug"
emoji: "🐞"
topics:
  - Auth
  - Policy
  - AccessControl
published: true
targetFiles:
  - packages/auth/src/usecase/find_all_public_api_key.rs
  - scripts/seeds/n1-seed/008-auth-policies.yaml
  - packages/auth/discovered_actions.md
github: https://github.com/quantum-box/tachyon-apps
---

# auth:FindAllPublicApiKeys アクション命名の規約違反修正

## 概要

authコンテキストのPublic API Key参照用アクションが `read:publicApiKey` として運用されており、既定の `context:ActionName` 規則から逸脱している。命名規約に沿ったアクション名へ統一し、関連コードとシードデータを更新する。

## 背景・目的

- 権限システムで参照するアクション名が一貫していないため、ポリシーデータベースとコードの整合性が崩れていた。
- `read:` プレフィックスのみの特殊形式を残したままだと、移行済みの他アクションとの扱いが分岐し、今後の自動同期やバリデーションに支障が出る。
- 規約に沿った命名へ統一することで、追加のバリデーションやドキメント生成処理に対応しやすくする。

## 詳細仕様

### 機能要件

1. `FindAllPublicApiKey` ユースケースで使用するアクション名を `auth:FindAllPublicApiKeys` に変更する。
2. シードデータ（`tachyon_apps_auth.actions`）の該当行を新しいアクション名・コンテキストへ更新する。
3. `discovered_actions.md` など参照ドキュメントの一覧を新名称へ更新する。
4. 既存ポリシーID（`act_01hjryxysgey07h5jz5w00103`）は維持し、命名のみを差し替える。

### 非機能要件

- 変更内容は後方互換を保ち、既存ポリシーや付与済み権限がそのまま有効であること。
- リリース後に追加のマイグレーションを必要としない構成変更であること。
- コード／ドキュメント／シードデータの差分が自明で、レビュー時に追跡しやすいこと。

### コンテキスト別の責務

- authコンテキスト: 公開APIキーの参照権限を管理し、アクション名を規約どおり提供する。

### 仕様のYAML定義

```yaml
actions:
  - id: act_01hjryxysgey07h5jz5w00103
    context: auth
    name: FindAllPublicApiKeys
    description: "Find all public API keys"
    resource_pattern: trn:tachyon-apps:auth:*:*:api-key:*
```

## 実装方針

- ユースケースで返却する `ActionString` を新しいアクション名へ更新する。
- シードデータ内の該当行を修正し、命名規則の整合性を確保する。
- ドキュメント（`discovered_actions.md`）を同期してメンテナンス負債を排除する。
- 必要に応じて `yaml-seeder apply` で再投入し、ローカルDBとコードの不一致を防ぐ。

## タスク分解

### フェーズ1: コード更新 ✅
- [x] `FindAllPublicApiKeyInputPort` の `policy()` を新しいアクション名へ変更

### フェーズ2: データ更新 ✅
- [x] `tachyon_apps_auth.actions` のアクション定義を修正
- [x] `discovered_actions.md` を更新

### フェーズ3: 動作確認 📝
- [ ] `yaml-seeder apply` で該当テーブルを再投入（任意／検証環境）
- [ ] ポリシー参照APIで新しいアクション名を取得できることを確認（任意）

## テスト計画

- 必要に応じて `yaml-seeder apply dev scripts/seeds/n1-seed/008-auth-policies.yaml` を実行し、DB上のアクション名が更新されていることを確認。
- 認可チェックを行うユースケース（例: 公開APIキー一覧取得）で、許可されたユーザーが引き続きアクセス可能であることを手動確認。

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| シード未適用により環境間でアクション名がずれる | 中 | デプロイ手順に `yaml-seeder apply` を追加し、適用状況を確認 |
| 古いアクション名を参照したドキュメントが残る | 低 | ドキュメント検索で `read:publicApiKey` を排除し、レビュー時に確認 |

## 参考資料

- `packages/auth/discovered_actions.md`
- `scripts/seeds/n1-seed/008-auth-policies.yaml`
- `packages/auth/src/usecase/find_all_public_api_key.rs`

## 完了条件

- [x] コード・シード・ドキュメントで `auth:FindAllPublicApiKeys` に統一されている
- [ ] 必要な環境へシードを適用済みである（適用完了後チェック）
- [ ] 動作確認レポートを `verification-report.md` に追記している（必要に応じて）
- [ ] バージョン番号更新の要否を判断し、リリースノートへ反映している

## 備考

- このタスクは命名規則の是正によるバグ修正であり、リリース時はパッチバージョンの更新を想定する。
