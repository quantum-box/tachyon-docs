---
title: "Tool Job Chat セッションIDクエリパラメータ化 & Agent API Tool Job統合"
type: "feature"
emoji: "🔗"
topics: ["tool-jobs", "agent-api", "chat", "session"]
published: true
targetFiles:
  - apps/tachyon/src/app/v1beta/[tenant_id]/ai/tool-jobs/chat/
  - packages/llms/src/agent/tool/coding_agent.rs
  - packages/llms/src/adapter/axum/agent_handler.rs
github: https://github.com/quantum-box/tachyon-apps
---

# Tool Job Chat セッションIDクエリパラメータ化 & Agent API Tool Job統合

## 概要

2つの改善を行う：
1. **Chat画面のセッションIDをクエリパラメータ化**: 現在URLパスベース（`/chat/new`, `/chat/{session_key}`）で管理しているセッションIDを、クエリパラメータ（`/chat/new?session=xxx`）で設定できるようにする
2. **Agent APIからTool Jobを呼べるようにする**: UIから正常動作しているTool Job機能を、Agent API（`/v1/llms/chatrooms/:id/agent/execute`）経由でも作成・実行可能にする

## 実装進捗

### Feature 2: Agent API Tool Job統合 ✅

**変更内容:**
- `packages/llms/src/adapter/axum/agent_handler.rs`:
  - L503: `coding_agent_job` のデフォルトを `unwrap_or(false)` → `unwrap_or(true)` に変更（execute handler）
  - L1366-1368: 同上（resume handler）
  - これで `tool_access` フィールドを省略した場合でも `execute_coding_agent_job` ツールがLLMに公開される
- `packages/llms/src/agent/tool/coding_agent.rs`:
  - デフォルトタイムアウトを `180` → `600`（10分）に変更
  - デフォルトプロバイダを `codex` → `open_code` に変更
- `packages/llms/src/agent/tool_definitions.rs`:
  - `execute_coding_agent_job` ツール定義の enum と description を `open_code` デフォルトに更新

**検証:**
- `mise run check` パス ✅
- Agent API → Tool Job E2E テスト完了 ✅（`screenshots/agent-api-e2e-result.md` 参照）

### Bugfix: session_id コールバック伝播 🔄

**問題:** Worker が Tool Job を完了してコールバックを送る際、ランナーが返す `session_id` がコールバックペイロードに含まれていなかった。そのため UI でセッションID取得が常に `null` になり、`?session=xxx` URL更新とセッション一覧表示が機能しなかった。

**修正:**
- `apps/tachyon-cli/src/worker.rs`:
  - `result.session_id` をコールバック body に含めるように変更
- `packages/llms/src/adapter/axum/tool_job_callback_handler.rs`:
  - `ToolJobCallbackRequest` に `session_id: Option<String>` を追加
- `packages/llms/src/usecase/handle_tool_job_callback.rs`:
  - `HandleToolJobCallbackInputData` に `session_id: Option<String>` を追加
  - `update_tool_job_directly` でハードコード `session_id: None` → `input.session_id.clone()` に変更

### Feature 1: Chat セッションIDクエリパラメータ化 ✅

**変更内容:**
- `apps/tachyon/src/hooks/useToolJobChatStream.ts`:
  - `UseToolJobChatStreamOptions` に `onSessionCreated?: (sessionId: string) => void` コールバックを追加
  - `sendMessage` 内の `completedJob.session_id` 取得後にコールバックを呼ぶ
  - `loadSession` でセッション復元後も同様にコールバックを呼ぶ

- `apps/tachyon/src/app/v1beta/[tenant_id]/ai/tool-jobs/chat/[session_key]/chat-session-client.tsx`:
  - `nuqs` の `useQueryState('session', parseAsString)` を追加
  - セッション判定ロジック: `sessionKey === 'new'` の場合、`sessionParam` をチェック → あればそれを使いロード、なければ新規チャット
  - `onSessionCreated` コールバックで `setSessionParam(newSessionId)` → URLが `?session=xxx` に自動更新
  - `handleNewChat` で `setSessionParam(null)` してリセット

- `apps/tachyon/src/app/v1beta/[tenant_id]/ai/tool-jobs/chat/chat-list-client.tsx`:
  - `handleOpenSession` のナビゲーション先を `/chat/${sessionKey}` → `/chat/new?session=${sessionKey}` に変更

**後方互換:**
- `[session_key]` ディレクトリは残存（パスベース `/chat/{session_key}` も引き続き動作）

**検証:**
- `yarn ts --filter=tachyon` パス ✅
- `yarn lint --filter=tachyon` パス ✅

## 完了条件

- [x] クエリパラメータでセッションIDを指定してチャットが開ける
- [x] Agent APIから `execute_coding_agent_job` がデフォルトで有効になる
- [x] デフォルトタイムアウトが10分に延長される
- [x] TypeScript型チェック・Lintパス
- [x] Rustコンパイルチェックパス
- [x] 動作確認（Playwright MCP）
  - UI Chat: メッセージ送信 → レスポンス受信 → `?session=xxx` にURL更新 ✅
  - セッション一覧: セッションが表示される ✅
  - セッション一覧からクリック → `/chat/new?session=xxx` で遷移・復元 ✅
  - Agent API E2E: Agent API → Tool Job (OpenCode) → succeeded → session_id 伝播 ✅
