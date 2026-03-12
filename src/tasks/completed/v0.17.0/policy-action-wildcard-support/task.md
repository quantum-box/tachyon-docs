---
title: "PolicyActionのワイルドカード対応"
type: tech
emoji: "✨"
topics:
  - Authorization
  - RBAC
  - MySQL
published: true
targetFiles:
  - packages/auth/domain/src/policy.rs
  - packages/auth/domain/src/service/check_policy.rs
  - packages/auth/src/interface_adapter/gateway/sqlx_policy_repository.rs
  - packages/auth/migrations
github: https://github.com/quantum-box/tachyon-apps
---

# PolicyActionのワイルドカード対応

## 概要

`auth:*`, `auth:Get*`, `*:*` のようなワイルドカード指定でアクション許可/拒否を設定できるようにし、管理者ポリシー等で大量アクションを網羅的に指定する手間を削減する。

## 背景・目的

- 現在の `policy_actions` は個別 `action_id` との紐付けのみで、コンテキスト単位や名称パターンで一括許可ができない。
- 新規アクションを追加するたびに管理ポリシーへ明示登録する必要があり、運用コスト・漏れリスクが高い。
- ワイルドカード指定を導入し、テナント横断の管理者ポリシーや読み取り専用ポリシーの指定を簡略化したい。

## 詳細仕様

### 機能要件

1. ポリシーに `context`/`name` のワイルドカードパターン（`*` を0文字以上、`?` を1文字、`[]` などは非対応）を登録できること。
2. `*:*`（全アクション）、`auth:*`（コンテキスト単位）、`auth:Get*`（プレフィックス指定）等を想定し、`context`/`name` 双方で `*` を利用可能にする。
3. 認可チェックでは明示アクションとワイルドカードパターンの双方を考慮し、`Deny` が常に `Allow` より優先される。
4. GraphQL/API の登録・削除フローにワイルドカードを扱う入力/出力を追加し、既存クライアントとの互換性を確保する。
5. 既存 `policy_actions` テーブルと互換性を保ちつつ、パターン専用テーブル `policy_action_patterns`（仮称）を追加する。

### 非機能要件

- 認可チェック時のパターン評価は O(N) 以内に抑え、応答時間を悪化させない（glob の事前コンパイルやキャッシュを検討）。
- SQL マイグレーションは TiDB/MySQL 双方で動作し、ロールバック可能な down スクリプトを提供する。
- パターン登録時に context/name の長さと使用可能文字をバリデーションし、不正なグロブで異常負荷を招かないようにする。

### コンテキスト別の責務

```yaml
contexts:
  auth:
    description: "認可ドメイン"
    responsibilities:
      - PolicyActionPattern エンティティ追加
      - PolicyService/CheckPolicy の評価順序更新
      - ユースケース/リゾルバーの入力更新
  infra:
    description: "スキーマ・シード管理"
    responsibilities:
      - policy_action_patterns テーブル追加
      - 既存シード/マイグレーション更新
  docs:
    description: "ドキュメント整備"
    responsibilities:
      - policy-management.md への仕様追記
```

### 仕様のYAML定義

```yaml
policy_action_patterns:
  columns:
    - name: policy_id
      type: varchar(32)
      nullable: false
    - name: context_pattern
      type: varchar(50)
      nullable: false
      description: "アクションコンテキストのワイルドカード。例: auth, *, billing"
    - name: name_pattern
      type: varchar(100)
      nullable: false
      description: "アクション名のワイルドカード。例: *, Get*, Update*"
    - name: effect
      type: enum('allow','deny')
      nullable: false
    - name: assigned_at
      type: timestamp
      nullable: false
      default: CURRENT_TIMESTAMP
  primary_key:
    - policy_id
    - context_pattern
    - name_pattern
  indexes:
    - name: idx_policy_pattern_effect
      columns: [policy_id, effect]
```

## 実装方針

### アーキテクチャ設計

- PolicyAction に加え `PolicyActionPattern` ドメインオブジェクトを導入し、パターンごとの許可/拒否を表現する。
- Repository 層を拡張し、ポリシー取得時に明示アクションとパターンを両方取得する。
- 認可判定は「明示 `Deny` → パターン `Deny` → 明示 `Allow` → パターン `Allow`」の順で評価する。
- パターンは起動時または取得時にグロブをコンパイルし、キャッシュすることで毎回の文字列操作を低減する。

### 技術選定

- パターン評価には `globset` クレートの採用を想定（`*` と `?` に対応、依存が軽量）。
- SQLx を用いて `policy_action_patterns` テーブルを操作し、ワイルドカードに関する CRUD を提供する。
- GraphQL 層は Async-GraphQL の InputObject/Enum を拡張し、API クライアントで扱いやすいスキーマを提供する。

### TDD（テスト駆動開発）戦略

#### 既存動作の保証
- `policy_management_integration_test` 等で既存の明示アクション許可/拒否が影響を受けないことを確認する。
- シードされたシステムポリシーが従来通り動作する回帰テストを追加する。

#### テストファーストアプローチ
- パターン用のユニットテスト（Allow/Deny 優先順位、複数パターン衝突など）を Red 状態で追加し、実装を進める。

#### 継続的検証
- `mise run check` / `cargo nextest -p auth` を実行し、CI 相当の検証を継続する。
- 必要に応じて簡易ベンチマークでパターン評価のパフォーマンス確認を行う。

## タスク分解

- [ ] 要件整理とテーブル設計の確定
- [ ] マイグレーション作成（up/down + シード更新）
- [ ] ドメイン層・リポジトリ・サービスのパターン対応実装
- [ ] Usecase/GraphQL/API のインタフェース更新
- [ ] テスト整備とパフォーマンス検証
- [ ] ドキュメントとリリースノートの更新

## Playwright MCPによる動作確認

### 実施タイミング
- [ ] フロントエンドにポリシー編集 UI を追加・変更する場合のみ実施

### 動作確認チェックリスト

- [ ] ワイルドカードを含むポリシーが管理 UI から登録でき、API でも正しく反映される
- [ ] 該当ポリシーを持つユーザーで対象アクションを呼び出した際、期待通りに許可/拒否される
