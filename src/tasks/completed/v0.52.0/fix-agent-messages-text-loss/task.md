# Fix: Agent Messages API loses assistant text when tool_calls exist

## Status: 🔄 In Progress

## Problem

Agent Execute API (`POST /v1/llms/chatrooms/:id/agent/execute`) correctly returns both text (Say events) and tool calls via SSE stream. However, when retrieving conversation history via Agent Messages API (`GET /v1/llms/chatrooms/:id/agent/messages`), **assistant text messages are completely missing** — only `tool_call` and `tool_call_args` entries appear.

### Observed behavior

**Execute API (SSE) — works correctly:**
```
event: say
data: {"type":"say","index":1,"text":"ふーん、こんにちは、たかのり。"}

event: tool_call
data: {"type":"tool_call","tool_id":"call_34328064","tool_name":"send_stamp","is_client_tool":true}

event: tool_call_args
data: {"type":"tool_call_args","tool_id":"call_34328064","args":{"stamp_id":"cool"}}
```

**Messages API — missing text:**
```json
{
    "messages": [
        {"type": "user", "text": "こんにちは！", "id": "me_01kj1v8e3sfgccm831aap8q6bw", "user_id": "sa_01khge2m154y7fwhjgw8gam56p", "created_at": "2026-02-22T04:55:52Z"},
        {"type": "tool_call", "tool_id": "call_29516558", "tool_name": "send_stamp", "is_client_tool": true},
        {"type": "tool_call_args", "tool_id": "call_29516558", "args": {"stamp_id": "cool"}},
        {"type": "user", "text": "こんにちは！", "id": "me_01kj1w0k5ewe4p5zxe45esakyr", "user_id": "sa_01khge2m154y7fwhjgw8gam56p", "created_at": "2026-02-22T05:09:04Z"},
        {"type": "tool_call", "tool_id": "call_34328064", "tool_name": "send_stamp", "is_client_tool": true},
        {"type": "tool_call_args", "tool_id": "call_34328064", "args": {"stamp_id": "cool"}}
    ]
}
```

No `say` or `text` type entries from the assistant appear at all.

## Root Cause

`Message::create_chat_message()` in `packages/llms/domain/src/message.rs:115-147`:

```rust
pub fn create_chat_message(&self, ...) -> ChatMessage {
    // If this message has tool_calls, store as Part::ToolCall
    if let Some(tool_calls) = &self.tool_calls {
        if let Some(first_tool_call) = tool_calls.first() {
            return ChatMessage::new_tool_call(...);  // ← TEXT IS LOST HERE
        }
    }
    // Default: store as Part::Text
    ChatMessage::new_text(..., &self.content, ...)
}
```

When an assistant message has **both text content AND tool_calls**:
1. The `tool_calls` check passes → immediately returns `Part::ToolCall`
2. The text content (`self.content` containing "ふーん、こんにちは…") is **completely discarded**
3. Only the **first** tool call is saved (multiple tool calls are also lost)

### Additional issues
- Only `tool_calls.first()` is saved — multiple tool calls in a single message are lost
- The `self.content` field contains text mixed with XML tool markup (e.g. `"ふーん、こんにちは<send_stamp><stamp_id>cool</stamp_id></send_stamp>"`) — the text part needs to be extracted before saving

## Fix Plan

### 1. Change `Message::create_chat_message()` → `create_chat_messages() -> Vec<ChatMessage>`

When the message has both text and tool_calls:
- Extract pure text (before tool XML markup)
- Save as `Part::Text` ChatMessage
- Save each tool_call as separate `Part::ToolCall` ChatMessage

### 2. Update callers

- `RepositoryMessagePersistence::persist_message()` — handle Vec
- `RepositoryMessagePersistence::persist_messages()` — flat_map instead of map
- `RecursiveAgent::convert_to_chat_message()` — handle Vec

### 3. Verify `messages_to_chunks()` handles the new format

The reverse conversion in `messages_to_chunk.rs` already handles `Part::Text` and `Part::ToolCall` separately, so it should work without changes.

## Files to modify

| File | Change |
|------|--------|
| `packages/llms/domain/src/message.rs` | `create_chat_message()` → `create_chat_messages() -> Vec<ChatMessage>` |
| `packages/llms/src/agent/recursive.rs` | Update `persist_message()`, `persist_messages()`, `convert_to_chat_message()` |

## Reproduction

```bash
# 1. Execute agent (returns text + tool call correctly)
curl -X POST 'https://api.n1.tachy.one/v1/llms/chatrooms/ch_01kj1v7nes6bzp87g1h7ra4e0v/agent/execute' \
  --header 'Content-Type: application/json' \
  --header 'Accept: text/event-stream' \
  --header 'x-operator-id: tn_01kf8rtnf3vkq467vkr1a79gy4' \
  --header 'Authorization: Bearer pk_JSRJF0QoEpQyZr3W9PDb3EXAn1Es+QE44bi0Gynb+rs=' \
  --data '{"task": "こんにちは！", "assistant_name": "AIシンくん", "model": "xai/grok-4-1-fast-non-reasoning", ...}'

# 2. Get messages (missing assistant text)
curl 'https://api.n1.tachy.one/v1/llms/chatrooms/ch_01kj1v7nes6bzp87g1h7ra4e0v/agent/messages?limit=8118&offset=8118' \
  --header 'Accept: application/json' \
  --header 'x-operator-id: tn_01kf8rtnf3vkq467vkr1a79gy4' \
  --header 'Authorization: Bearer pk_JSRJF0QoEpQyZr3W9PDb3EXAn1Es+QE44bi0Gynb+rs='
```

## Implementation Notes

### Changes Made

**`packages/llms/domain/src/message.rs`:**
- Added `create_chat_messages() -> Vec<ChatMessage>` — splits messages with both text+tool_calls into separate `Part::Text` and `Part::ToolCall` entries
- Added `extract_text_before_tool_calls()` helper — finds the first `<tool_name>` XML tag and returns text before it
- Added 7 unit tests covering all combinations (text-only, tool-only, text+tool, multiple tools, extract helper)
- Original `create_chat_message()` kept for backward compatibility (has deprecation warning in doc comment)

**`packages/llms/src/agent/recursive.rs`:**
- Updated `RepositoryMessagePersistence::persist_message()` → uses `create_chat_messages()` + `bulk_save()`
- Updated `RepositoryMessagePersistence::persist_messages()` → uses `flat_map` with `create_chat_messages()`
- Updated `RecursiveAgent::save_messages()` → uses `create_chat_messages()` + `bulk_save()`
- Removed `convert_to_chat_message()` method (was using the old single-message API)

**No changes needed in `messages_to_chunk.rs`** — it already handles `Part::Text` and `Part::ToolCall` separately.

## Test Plan
- [x] Existing tests pass (`mise run check`) ✅
- [ ] Agent with text + tool call → Messages API returns both Say and ToolCall entries
- [ ] Agent with only text → Messages API returns Say entry (no regression)
- [ ] Agent with only tool call → Messages API returns ToolCall entry (no regression)
- [ ] Multiple tool calls in one turn → all saved and returned
