---
title: "AgentコマンドスタックのActorId統一"
type: "refactor"
emoji: "🧭"
topics:
  - LLMS
  - ActorId
  - ServiceAccount
published: true
targetFiles:
  - packages/llms/src/usecase/execute_agent.rs
  - packages/llms/src/usecase/resume_agent.rs
  - packages/llms/src/usecase/command_stack/
  - packages/llms/domain/src/message.rs
  - packages/llms/domain/src/chat_message.rs
github: https://github.com/quantum-box/tachyon-apps
---

# AgentコマンドスタックのActorId統一

## 概要

LLMS文脈のエージェント実行フロー（`ExecuteAgent` / `ResumeAgent` / `CommandStack` 系列）で所有者を `UserId` 固定としている実装を `ActorId` へ刷新し、サービスアカウント実行を許容できるようにする。

## 背景・目的

- Agent API は現在 `Executor::ServiceAccount` の実行を拒否しており、サービスアカウント起点の自動化が利用できない。
- チャット履歴保存や課金処理が `UserId` 前提のため整合性が担保できず、実装全体を `ActorId` ベースへ寄せる必要がある。
- `ActorId` へ統一することで監査・課金トレースを維持したままサービスアカウント実行を許可する。

## 詳細仕様

### 機能要件

1. `ExecuteAgent` および `ResumeAgent` のガードを緩和し、`ActorId::ServiceAccount` を許容する。
2. コマンドスタック・履歴保存・BillingContext の所有者情報を `ActorId` へ統一する。
3. ユーザー固有機能（メモリ検索・ユーザープリファレンス）を `ActorId::User` の場合のみ実行するよう明示化する。

### 非機能要件

- 既存のユーザー実行フローを壊さない。
- 監査ログ・課金ログに実行主体が欠落しない。
- コンパイルエラーで型の取りこぼしを検知できるよう、段階的に `ActorId` へ置換する。

### コンテキスト別の責務

```yaml
contexts:
  llms:
    responsibilities:
      - Agent実行フロー全体のActorId対応
      - 履歴保存・再開処理の整合性確保
  payment:
    responsibilities:
      - BillingContextがActorIdを保持できることを確認
  auth:
    responsibilities:
      - ExecutorからActorIdへの変換ユーティリティの再利用
```

### 仕様のYAML定義

```yaml
owner_representation:
  type: ActorId
  variants:
    - user: "UserIdベース (us_)"
    - service_account: "ServiceAccountIdベース (sa_)"
  storage:
    chat_message.owner: string  # 永続化は従来通り
    chat_room.owner: string
  invariants:
    - "保存時は必ずActorId::as_str()で文字列化する"
    - "復元はActorId::from_strで行い、種類に応じた分岐を用意する"
```

## タスク分解

- ✅ 影響調査と既存仕様の整理 (2025-10-28)
- ✅ `ExecuteAgent` / `ResumeAgent` のガード修正
- ✅ `CommandStack`・ドメインモデルの `ActorId` 化
- ✅ テストコードの追従と追加 (cargo test -p llms)
- 🔄 docs / taskdoc 更新

## テスト計画

- `cargo test -p llms`
- `mise run check`
- 必要に応じて `mise run tachyon-api-scenario-test` の関連シナリオ

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 既存ユーザーフローの破損 | 高 | 段階的に型置換し、コンパイルエラーで漏れを検知 |
| BillingContextとの不整合 | 中 | `ActorId` を保持できる構造へ更新し単体テストで確認 |
| メモリ・プリファレンス機能の回帰 | 中 | `ActorId::User` 条件を明示した分岐を追加 |

## 参考資料

- `docs/src/tachyon-apps/llms/chatroom-actor-id.md`
- `packages/llms/src/usecase/execute_agent.rs`
- `packages/value_object/src/actor_id.rs`

## 完了条件

- [ ] Agent実行でサービスアカウントが利用可能になっている
- [ ] コマンドスタックとチャット保存が `ActorId` で統一されている
- [ ] 主要テストが通過し、追加テストを実施済み
- [ ] taskdoc の進捗を反映済み

## 備考

- 動作確認はAPI層のユニットテスト中心で問題ない。UI確認は不要。
