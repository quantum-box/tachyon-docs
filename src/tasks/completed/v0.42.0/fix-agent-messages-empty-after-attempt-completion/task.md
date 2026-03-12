---
title: "Agent Messages API が attempt_completion 後に空になる事象の調査・修正"
type: "bug"
emoji: "🐛"
topics:
  - Agent API
  - Message Persistence
  - Debugging
published: true
targetFiles:
  - packages/llms/src/agent/recursive.rs
  - packages/llms/src/adapter/axum/agent_handler.rs
  - packages/llms/src/adapter/gateway/sqlx_message_repository.rs
  - packages/llms/tests/adapter/axum/agent_history_consistency_test.rs
github: ""
---

## 概要

`POST /v1/llms/chatrooms/{chatroom_id}/agent/execute` では `attempt_completion` chunk が返る一方で、
`GET /v1/llms/chatrooms/{chatroom_id}/agent/messages` が空配列になるように見える事象を再現・切り分けし、
原因を特定して修正する。

## 背景・目的

- UI確認ベースで「実行時ストリームは成功するが履歴表示が空」の報告がある。
- ただし、現時点では以下の切り分けが未実施。
  - APIレスポンスが本当に空か
  - DBにメッセージが保存されているか
  - UI側描画・取得ロジックの問題か
- 本タスクで API/DB/UI のどこで欠落しているかを特定し、再発防止のためのテストを追加する。

## 事前調査メモ（コード読解ベース）

- `get_agent_messages` は `queries` を受け取るが、`GetAgentHistoryInputData` に常に `queries: None` を渡している（limit/offset未反映）。
- `GetAgentHistory` は `chat_message_repository.find_all(chatroom_id)` の結果を `messages_to_chunks` で変換して返す。
- `SqlxChatMessageRepository::find_all` は `ORDER BY` がなく、DB依存順で返却される。
- `RecursiveAgent::handle` では `AttemptCompletion` 検知時に `save_messages` を実行する実装になっているため、理論上は保存される。

> 上記だけでは「空配列になる」決定的要因は断定できないため、実行時の API/DB 検証が必須。

## 詳細仕様

### 機能要件

1. 事象を再現できる最小手順を確立する。
2. 同一 `chatroom_id` に対して、以下を時系列で取得・記録する。
   - execute の SSEイベント
   - messages APIレスポンス
   - DB (`tachyon_apps_llms.messages`) の保存データ
3. 原因がバックエンド実装の場合は修正する。
4. 原因がフロントエンド取得/表示の場合は修正する。
5. 再発防止の自動テストを追加する。

### 非機能要件

- 調査結果は verification-report に再現手順付きで残す。
- 変更後は既存 Agent API の互換性を壊さない。
- レースコンディションが疑われる場合、テストを安定実行できる設計にする。

### 仕様のYAML定義

```yaml
investigation:
  tenant_id: tn_01hjryxysgey07h5jz5wagqj0m
  headers:
    authorization: "Bearer dummy-token"
    x-operator-id: "tn_01hjryxysgey07h5jz5wagqj0m"

steps:
  - id: execute
    request:
      method: POST
      path: /v1/llms/chatrooms/{chatroom_id}/agent/execute
    expected:
      sse_contains:
        - type: attempt_completion

  - id: messages_api
    request:
      method: GET
      path: /v1/llms/chatrooms/{chatroom_id}/agent/messages
    expected:
      messages_count: ">= 1"
      contains_attempt_completion: true

  - id: db_check
    query:
      sql: |
        SELECT id, created_at, role, content
        FROM tachyon_apps_llms.messages
        WHERE chatroom_id = :chatroom_id
          AND deleted_at IS NULL
        ORDER BY created_at ASC;
    expected:
      row_count: ">= 1"
      contains_attempt_completion_xml: true
```

## 実装方針

### 切り分け順序

1. **API観測**: execute SSE と messages API を同一 chatroom で比較。
2. **DB観測**: messages API が空の場合、DBに同チャットルームの行があるか確認。
3. **原因別対応**:
   - DB保存なし: `RecursiveAgent`〜Repository 保存経路を修正。
   - DB保存あり / API空: `GetAgentHistory` / `find_all` / 変換処理を修正。
   - APIは値あり / UI空: `getAgentMessages`・Hook・描画側を修正。

### 修正候補

- `get_agent_messages` で `queries` を実際に usecase に渡す。
- `SqlxChatMessageRepository::find_all` に明示的な `ORDER BY created_at ASC` を付与。
- `attempt_completion` を含む履歴変換の回帰テスト追加。

## タスク分解

### フェーズ1: 再現と観測 ✅
- [x] API実行ログ（SSE）を取得 — `ch_01kh440bes2qs5e32zx097y5at` で Say/Ask chunk 確認
- [x] messages APIレスポンスを取得 — user/thinking/say/ask メッセージ取得成功
- [x] DB保存状況を確認 — 非AttemptCompletion フローでは正常保存
- [x] 3者の時系列差分を記録

実装メモ: 非AttemptCompletionフローではメッセージ保存・取得ともに正常動作。
AttemptCompletion固有の問題であることをコード静的解析で特定。

### フェーズ2: 原因特定 ✅
- [x] バックエンド / フロントエンドの責務境界で原因を確定 → **バックエンド（RecursiveAgent）**
- [x] 根本原因を1文で表現

**根本原因**: `RecursiveAgent::handle()` の AttemptCompletion match arm が
ストリーミング中間チャンク（`is_finished == Some(false)`）でも発火し、
`*buffer = MessageCollection::new()` でバッファをクリアしていた。
これにより `streaming_attempt_result` フィールドに蓄積中のテキストが破壊され、
最終チャンクでの `save_messages` 時にメッセージが不完全または空になっていた。

**副次的問題**:
1. `SqlxChatMessageRepository::find_all` に ORDER BY がなく、返却順が非決定的
2. `get_agent_messages` ハンドラが `queries: None` をハードコードし、limit/offset 無視

### フェーズ3: 実装 ✅
- [x] Fix 1: RecursiveAgent バッファクリアタイミング修正（主修正）
  - ストリーミングチャンク（`is_finished == Some(false)`）ではクライアント転送のみ
  - 最終チャンク（`is_finished != Some(false)`）でのみバッファクリア＆メッセージ保存
- [x] Fix 2: `find_all` にRust側ソート追加（`created_at` 昇順）
  - SQL側 ORDER BY はSQLxキャッシュの問題で回避し、Rust側 `sort_by` で実装
- [x] Fix 3: `get_agent_messages` で `queries` パラメータを正しく渡すよう修正
- [x] 回帰テスト `test_attempt_completion_persisted_in_messages_api` 追加

`mise run check` 通過済み。

### フェーズ4: 検証 ✅
- [x] bacon ホットリロードでの動作確認 — tachyon-api 正常起動確認
- [x] 同手順で再実行し、messages APIが空でないことを確認
  - chatroom `ch_01khd85y6q7jx1vfdfwc03yav0` で検証
  - SSE: say (111 chunks) + attempt_completion (streaming + final) + usage + done
  - messages API: user + attempt_completion (result テキスト完全)
  - サーバーログ: "AttemptCompletion messages saved successfully"
- [x] verification-report.md を更新

## Playwright MCPによる動作確認

- [ ] `/v1beta/{tenant_id}/ai/agent/chat` で再現手順を実施（別途実施予定）
- [ ] attempt_completion が表示され、リロード後も履歴に残ることを確認
- [ ] スクリーンショットを `./screenshots/` に保存

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| UI起因・API起因の切り分け不足 | 高 | API/DB/UIの3点観測を必須化 |
| 非決定的な並び順で再現がぶれる | 中 | SQLにORDER BYを明示し、テストでも順序を固定 |
| ローカル環境差で再現しない | 中 | 実行コマンド・ヘッダー・chatroom_idを記録 |

## 参考資料

- `packages/llms/src/adapter/axum/agent_handler.rs`
- `packages/llms/src/usecase/get_agent_history.rs`
- `packages/llms/src/adapter/gateway/sqlx_message_repository.rs`
- `packages/llms/src/agent/messages_to_chunk.rs`
- `packages/llms/tests/adapter/axum/agent_history_consistency_test.rs`

## 完了条件

- [x] 原因が API / DB / UI のどこかで明確に特定されている → バックエンド（RecursiveAgent）
- [x] 修正後に `agent/messages` で期待チャンクが取得できる → 2メッセージ返却確認済み
- [x] 回帰テストが追加され CI で再現不能になっている
- [x] verification-report.md に証跡（APIレスポンス、サーバーログ）を記録

## 備考

- 本タスクは「まず原因特定」を主目的とし、推測だけで修正しない。
- 必要に応じて `mise run up-tachyon` 環境で API と DB を直接確認する。
