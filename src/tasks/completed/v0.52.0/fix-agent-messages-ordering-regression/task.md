---
title: "Agent Messages の順序逆転回帰修正"
type: "bug"
emoji: "🧭"
topics:
  - Agent
  - Message Ordering
  - Scenario Test
published: true
targetFiles:
  - packages/llms/domain/src/message.rs
  - packages/llms/src/adapter/gateway/sqlx_message_repository.rs
  - apps/tachyon-api/tests/scenarios/agent_client_tool_call_test.yaml
  - packages/llms/migrations/20260222000000_expand_messages_created_at_precision.up.sql
github: ""
---

## 概要

`fix-agent-messages-text-loss` 後に、`GET /v1/llms/chatrooms/{chatroom_id}/agent/messages` の返却順が不安定になる回帰を修正し、シナリオテストを順序まで厳密に検証する。

## 背景・目的

- assistant の text と tool_call を分割保存した結果、同一タイムスタンプ衝突時に順序が崩れる。
- 既存シナリオが `contains` 中心で、順序逆転を検知できない。
- API 利用側が期待する `user -> say -> tool_call -> tool_call_args` の時系列順を安定化する。

## 詳細仕様

### 機能要件

1. `messages` は `created_at ASC, id ASC` で安定して取得される。
2. 分割保存された message はマイクロ秒単位で順序が保持される。
3. シナリオテストで `agent/messages` の先頭配列要素順を index 指定で検証する。

### 非機能要件

- 既存 API 形状は変更しない。
- 既存の text-loss 修正の意図を壊さない。

## 実装方針

- `Message::create_chat_messages()` で分割要素にマイクロ秒オフセットを付与。
- `SqlxChatMessageRepository::find_all()` を SQL の明示ソートに変更。
- `bulk_save()` を typed bind に変更し、秒単位切り捨てを回避。
- DB マイグレーションで `messages.created_at` を `TIMESTAMP(6)` 化。

## タスク分解

### フェーズ1: 実装修正 ✅
- [x] `create_chat_messages()` の timestamp offset 実装
- [x] `find_all()` の ORDER BY 安定化
- [x] `bulk_save()` の日時精度保持
- [x] `messages.created_at` 精度拡張 migration 追加

### フェーズ2: テスト強化 ✅
- [x] `agent_client_tool_call_test.yaml` を順序検証へ更新
- [x] repository 側順序回帰テスト追加
- [x] message domain 側の順序テスト追加

### フェーズ3: 検証 🔄
- [ ] `mise run check`
- [ ] `SCENARIO=agent_client_tool_call_test mise run docker-scenario-test-single`

実装メモ:
- `2026-02-22` 時点で両コマンドとも `muon/Cargo.toml` が存在しないため実行失敗。
- エラー: `failed to load manifest for dependency muon`。

## テスト計画

- 単体: `packages/llms/domain/src/message.rs`
- 統合: `packages/llms/src/adapter/gateway/sqlx_message_repository.rs`
- シナリオ: `apps/tachyon-api/tests/scenarios/agent_client_tool_call_test.yaml`

## リスクと対策

- リスク: 既存データの created_at 精度が秒のまま。
- 対策: tie-break に `id ASC` を併用して順序を安定化。

## 完了条件

- `agent/messages` の順序が回帰テストで固定的に検証される。
- 変更対象の Rust/Scenario テストが通過する。
