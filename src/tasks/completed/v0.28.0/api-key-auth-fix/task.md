---
title: "tachyon-api APIキー動作確認と修正"
type: "bug"
emoji: "🐛"
topics:
  - tachyon-api
  - api-key
  - auth
  - verification
published: true
targetFiles:
  - apps/tachyon-api/
  - apps/tachyon-api/tests/scenarios/
  - packages/auth/
  - docs/src/tasks/in-progress/api-key-auth-fix/
github: "https://github.com/quantum-box/tachyon-apps"
---

# tachyon-api APIキー動作確認と修正

## 概要

tachyon-apiのAPIキー発行・認証の動作を確認し、期待どおりに動かない箇所を修正する。

## 背景・目的

- APIキー周りの動作確認依頼に対応する
- REST/GraphQL双方でのAPIキー認証挙動を明確化する
- 認証エラー時のレスポンスやログの整合性を確保する

## 詳細仕様

### 機能要件

1. GraphQLのAPIキー発行・一覧が期待どおり動作する
2. APIキー必須のRESTエンドポイントが認証できる
3. 無効/未設定のAPIキーは適切なエラーになる
4. multi-tenancyヘッダーとAPIキーの組み合わせが整合する

### 非機能要件

- APIキー値がログやレスポンスに不要に露出しない
- 認証失敗時のレスポンスが一貫している

### 仕様のYAML定義

```yaml
api_key_verification:
  graphql:
    operations:
      - createPublicApiKey
      - publicApiKey
      - serviceAccounts
  rest:
    endpoints:
      - "/v1/agent/tool-jobs" # 実装で実際の対象に差し替え
  headers:
    authorization: "Bearer <pk_...>" # APIキー使用時
    operator_id: "tn_01hjryxysgey07h5jz5wagqj0m"
    api_key_header: "Authorization: Bearer <pk_...>"
  expected:
    success:
      status: 200
    unauthorized:
      status: 401
```

### シードデータ整理（tachyon-devテナント）

```yaml
seed_targets:
  tenant_id: tn_01hjryxysgey07h5jz5wagqj0m
  files:
    - scripts/seeds/n1-seed/002-auth-service-accounts.yaml
  tables:
    service_accounts:
      id: sa_<new>
      name: tachyon-dev-api
      tenant_id: tn_01hjryxysgey07h5jz5wagqj0m
    public_api_keys:
      id: pk_<new>
      name: tachyon-dev-api-key
      public_api_key: pk_<47chars>
      service_account_id: sa_<new>
      tenant_id: tn_01hjryxysgey07h5jz5wagqj0m
  optional_tables:
    service_account_policies:
      service_account_id: sa_<new>
      policy_id: pol_01hjryxysgey07h5jz5w00005 # AIAgentExecutorPolicy
notes:
  - public_api_keyは"pk_" + base64(32bytes)で47文字
  - IDは`mise run ulid`で生成しprefixを付ける
  - 既存シナリオ: apps/tachyon-api/tests/scenarios/service_account_api_key.yaml
```

## 実装方針

### アーキテクチャ設計

- 既存のauth/usecaseのAPIキー発行・認証処理を踏襲する
- 既存のポリシー/サービスアカウントの権限に合わせて検証する

### 技術選定

- 既存のGraphQL/RESTクライアント、scenario testを活用する
- RESTのAPIキー確認は `apps/tachyon-api/tests/scenarios/api_key_rest.yaml` を追加

## タスク分解

### フェーズ1: 調査 ✅ (2026-01-11 完了)
- [x] 対象APIキー種別とヘッダー名を確認
- [x] 対象エンドポイントを列挙
- [x] 既存の認可ポリシーを確認
- [x] tachyon-devテナント向けservice account/APIキーのシード要件を整理

### フェーズ2: 動作確認 ✅ (2026-01-12 完了)
- [x] GraphQLでAPIキー発行を実施（一覧取得は未実施）
- [x] RESTでAPIキー認証の成功/失敗を確認（シナリオ + 手動）
- [x] エラーレスポンスとログを記録
- [x] tachyon-devテナント向けservice account/APIキーは手動作成で検証

### フェーズ3: 修正 ✅ (2026-01-12 完了)
- [x] 不具合の修正
- [x] 追加/更新のテスト（`mise run tachyon-api-scenario-test` が成功）
- [x] 動作確認レポート作成

実装メモ: APIキー認証では`x-operator-id`未指定時に即時401とし、プラットフォームIDのフォールバックを抑止した。
検証メモ: `mise run tachyon-api-scenario-test` は成功。`api_key_rest` と `service_account_chatroom_creation` の `UserId` パースエラーは解消し、`ParseError` は `ChatRoomId` のみ。Anthropicのagent_api価格をシードに追加し、`mise run docker-seed` で反映。

## テスト計画

- docker環境で検証（`mise run up-tachyon`）
- 必要に応じてシナリオテストを追加し`mise run docker-scenario-test`
- GraphQL/RESTの手動確認（curl/GraphQLクライアント）

## Playwright MCPによる動作確認

UI変更がないため今回は対象外。

## スケジュール

短期タスクのため省略。

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 対象APIキーの範囲が不明確 | 中 | 事前に対象エンドポイントとヘッダー名を確定する |
| 既存シードデータ不足 | 中 | 必要なサービスアカウント/ポリシーを確認する |

## 参考資料

- `docs/src/services/library/api-key.md`
- `scripts/seeds/n1-seed/008-auth-policies.yaml`

## 完了条件

- [ ] GraphQL/REST双方でAPIキー挙動を確認できている
- [ ] 不具合があれば修正済み
- [ ] `verification-report.md` を更新済み
- [ ] タスクディレクトリを `completed/` に移動済み
