# Agent API Tool Job E2E Test Result

## Test: Agent API → execute_coding_agent_job → OpenCode → Result

```
$ curl -s -N -X POST http://localhost:50154/v1/llms/chatrooms/{chatroom_id}/agent/execute \
  -H 'Authorization: Bearer dummy-token' \
  -H 'x-operator-id: tn_01hjryxysgey07h5jz5wagqj0m' \
  -d '{"task": "Use the execute_coding_agent_job tool to list files...", "model": "anthropic/claude-sonnet-4-5-20250929"}'
```

### SSE Event Sequence

1. **say** → "I'll use the execute_coding_agent_job tool to list the files in the current directory."
2. **tool_call** → `tool_name: "execute_coding_agent_job"`
3. **tool_call_args** → `{"prompt": "list the files in the current directory"}`
4. **tool_job_started** → `job_id: "01KJQRJ24P5ZNNAC7PFP05C21N"`, **provider: "OpenCode"**
5. **tool_result** → `status: "succeeded"`, `exit_code: 0`
   - OpenCode response: "現在のディレクトリ `/app/repo` には 72 件の項目があります。主なものは `.cargo/`, `.claude/`, `.git/`, `apps/`, `packages/`, `docs/`, `scripts/`, `tools/`, `Cargo.toml`, `package.json`, `README.md`, `yarn.lock` などです。"
6. **attempt_completion** → Agent completed
7. **done** → Stream ended

### Verified

- [x] `coding_agent_job` defaults to `true` (tool_access omitted)
- [x] Default provider is `open_code` (not codex)
- [x] Tool Job created in DB with status `queued`
- [x] Worker (tachyond) picked up and executed the job
- [x] Job completed with `succeeded` status
- [x] Agent received tool_result and produced final response
- [x] SSE stream closed cleanly with `done` event
- [x] Default timeout is 600s (10 min)
