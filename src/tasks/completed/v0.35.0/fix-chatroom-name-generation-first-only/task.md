# Fix ChatroomNameGeneration FirstOnly behavior

- **Task ID**: `01kf5as29v7vjjrr163v2knq4w`
- **Status**: ✅ Completed
- **Created**: 2026-01-17

## Summary

`ChatroomNameGeneration::FirstOnly` の動作を修正。

**変更前**: chatroomがデフォルト名(`"New Room"`)の場合のみ生成
**変更後**: 最初のメッセージの時は常に自動生成（デフォルト名かどうかに関係なく）

## Changes

### Modified Files

1. `packages/llms/src/usecase/execute_agent.rs`
   - enum docコメント更新
   - `force_update` 判定ロジック: `FirstOnly` でも `force_update=true` を設定

2. `packages/llms/src/adapter/axum/agent_handler.rs`
   - APIドキュメントコメント更新

## Implementation Details

```rust
// Before
let force_update = chatroom_name_generation == ChatroomNameGeneration::Always;

// After
let force_update = matches!(
    chatroom_name_generation,
    ChatroomNameGeneration::Always | ChatroomNameGeneration::FirstOnly
);
```

`force_update=true` により `AutoGenerateChatroomName` usecase 内のデフォルト名チェックがスキップされる。
