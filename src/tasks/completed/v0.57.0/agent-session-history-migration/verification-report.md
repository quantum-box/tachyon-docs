# Agent Session History Migration Verification Report

実施日: 2026-02-24 ～ 2026-02-26
実施者: codex

## Phase 0-5: イベントベースストレージ移行 (2026-02-24 ～ 2026-02-25)

- `mise run check` ✅
  - Rust コンパイルは成功
  - 既知の unrelated warning: `packages/scenario_report` の dead_code warning

## Phase 6: セッション分離 (2026-02-26)

- シナリオテスト (`agent_session_api_test.yaml`) ✅
  - `POST /v1/llms/sessions` でセッション作成
  - `as_` ID で execute/messages/status
  - チャットルーム経由の既存フローも維持

## Phase 7: AIレビュー対応 (2026-02-26)

- TiDB互換: テーブル未存在時のグレースフルデグラデーション確認 ✅
- チャンク統合: 連続するthinking/say/attempt_completionチャンクが1メッセージに統合されることを確認 ✅

## Phase 8: JSON Tool Call デフォルト化 (2026-02-26)

- Anthropic/OpenAI/Google AI等: JSON mode でネイティブfunction calling ✅
- CLI wrapper (opencode/claude_code): XML mode フォールバック ✅
- 手動検証: chatroom/session 両方で execute API の `ask` / `tool_call` イベント確認
  - 非決定的挙動あり（モデル依存、2/5成功率）— セッション分離による退行ではないことを確認

## Phase 9: ドキュメント (2026-02-26)

- Execute API 仕様書: 全フィールド・12種SSEイベント・XML/JSONモード比較を網羅 ✅
- Messages API 仕様書: チャンク統合・永続化・Resume変換ルールを網羅 ✅
- OpenAPI アノテーション: utoipa によるSwagger生成対応 ✅

## コミット一覧 (main..HEAD)

```
ef486a647 docs(llms): add Agent Execute and Messages API specification documents
a28e32281 docs(llms): add OpenAPI annotations for agent and models endpoints
bbad010ca feat(llms): default to native JSON tool calls for all providers
195b7b25c chore(llms): format rust files
ed4843198 fix(llms): consolidate streaming chunks in agent messages API
cc4f44dbf chore(llms): format rust files
30f5ab1ce fix(llms): address AI review issues for agent session history
8a898de3d ci: add description comment to TiDB migration check workflow
5aeaecd41 docs(llms): improve rustdoc for table-not-found helper
ffbb0e522 ci: trigger workflow re-run
17b6a124a chore(llms): format rust files
8fab52eb8 fix(llms): handle missing agent_sessions table gracefully for TiDB compat check
c8dab25e6 feat(llms): add auth policies and scenario tests for agent sessions
9671f42eb feat(llms): add independent session endpoints and refactor session handlers
4ad5a4579 refactor(llms): replace chatroom_id with AgentExecutionTarget in agent usecases
a4ae0b50d feat(llms): add CreateAgentSession and ListAgentSessions usecases
7bd8b1064 feat(llms): add AgentSessionId domain type and session repository methods
c0245ff41 chore(llms): format rust files
43cb5010e docs: update agent session history migration progress
02db1e4e3 feat(tachyon): add agent sessions page and update stream hook
58650ce58 feat(llms): migrate agent history to event-based persistence
b123867f9 refactor(llms): remove chat_message_repo from agent execution path
3eaad4a26 fix(llms): split agent session backfill into separate migration
9fa02a624 chore(llms): format rust files
259d5e021 feat(llms): add agent session history and session API scenarios
82ed1b39d fix(ci): add checkout permissions for tidb migration workflow
```
