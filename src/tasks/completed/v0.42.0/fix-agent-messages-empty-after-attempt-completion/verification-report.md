# Agent Messages 空レスポンス調査 - Verification Report

実施日: 2026-02-14
実施者: Claude Code

## 1. 再現条件

- [x] execute API で `attempt_completion` chunk を確認
- [x] 修正前: ストリーミング中間チャンク(`is_finished: false`)でバッファクリアが発生し、
  最終チャンクでのメッセージ保存が不完全になる

## 2. API観測結果

### Execute SSE (chatroom: `ch_01khd85y6q7jx1vfdfwc03yav0`)

```
# say チャンク (index 1-111)
event: say
data: {"type":"say","index":1,"text":"H"}
... (111 chunks, "Hello! I'm Tachyon agent...")

# attempt_completion ストリーミングチャンク (is_finished: false)
event: attempt_completion
data: {"type":"attempt_completion","result":"\n","command":null,"is_finished":false}
event: attempt_completion
data: {"type":"attempt_completion","result":"I","command":null,"is_finished":false}
... (~60 chunks, "I've greeted you and am ready to assist...")

# attempt_completion 最終チャンク (is_finished: true)
event: attempt_completion
data: {"type":"attempt_completion","result":"","command":null,"is_finished":true}

# usage & done
event: usage
data: {"type":"usage","prompt_tokens":3320,"completion_tokens":69,...}
event: done
```

### Messages API (修正後)

```json
{
    "messages": [
        {
            "type": "user",
            "text": "Say hello",
            "id": "me_01khd86f8zq2y2h191fg90tmej",
            "user_id": "us_01hs2yepy5hw4rz8pdq2wywnwt",
            "created_at": "2026-02-14T04:57:56Z"
        },
        {
            "type": "attempt_completion",
            "result": "\n\nI've greeted you and am ready to assist with any tasks you have.\n\n",
            "command": null,
            "is_finished": true
        }
    ]
}
```

## 3. サーバーログ確認

```
AttemptCompletion messages saved successfully
```

## 4. 原因

**根本原因**: `RecursiveAgent::handle()` (recursive.rs) の AttemptCompletion match arm が
すべてのチャンク（`is_finished: false` を含む）でバッファをクリア（`*buffer = MessageCollection::new()`）していた。

`MessageCollection::push_chunk()` は `is_finished == Some(false)` のチャンクを
`streaming_attempt_result` フィールドに蓄積する設計だが、
RecursiveAgent側で中間チャンクごとにバッファを新規作成することで蓄積が破壊されていた。

**副次的問題**:
1. `SqlxChatMessageRepository::find_all` に ORDER BY がなく返却順が非決定的
2. `get_agent_messages` ハンドラが `queries: None` をハードコードし limit/offset を無視

## 5. 修正内容

### Fix 1: RecursiveAgent バッファクリアタイミング (primary fix)

**ファイル**: `packages/llms/src/agent/recursive.rs`

- `is_finished == Some(false)` のストリーミングチャンク: クライアントへ転送のみ、バッファ操作なし
- `is_finished != Some(false)` の最終チャンク: バッファからメッセージ取得→保存→クリア

### Fix 2: find_all のソート順保証

**ファイル**: `packages/llms/src/adapter/gateway/sqlx_message_repository.rs`

- Rust側 `sort_by(|a, b| a.created_at().cmp(b.created_at()))` を追加
- SQL側 ORDER BY はSQLxオフラインキャッシュの問題で回避

### Fix 3: queries パラメータ passthrough

**ファイル**: `packages/llms/src/adapter/axum/agent_handler.rs`

- `queries: None` → `queries: Some(queries)` に変更

### リグレッションテスト

**ファイル**: `packages/llms/tests/adapter/axum/agent_history_consistency_test.rs`

- `test_attempt_completion_persisted_in_messages_api` テスト追加
- モックSSEで `<attempt_completion>` XML を含むレスポンスを返し、
  messages API に attempt_completion が含まれることを検証

## 6. 再検証

- [x] messages API が空でない（2メッセージ返却: user + attempt_completion）
- [x] attempt_completion の result に完全なテキストが含まれる
- [x] サーバーログで "AttemptCompletion messages saved successfully" 確認
- [ ] UIで履歴表示される（Playwright MCP での確認は別途）
