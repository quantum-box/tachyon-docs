# Agent Chat Askオートレスポンス仕様

## 概要
Tachyon の Agent Chat 画面(`/v1beta/<tenant_id>/ai/agent/chat`)では、エージェント実行中に `ask` タイプのストリームイベントを受信するとユーザーへ選択肢が提示されます。本仕様では、選択肢をクリックした瞬間にユーザー発話として自動送信し、追加の手入力を不要とする UI/UX と内部処理フローを定義します。

## ユースケース
- エージェントが外部ツール実行前に確認を求める (`ask: { text, options[] }`).
- 選択肢が複数提示された際、ユーザーが即時に指示したい。
- 選択後はチャット入力欄で改めて送信することなくストリームが再開する。

## 画面挙動
1. `AgentStream` が `ask` チャンクを検出すると、`AgentAsk` コンポーネントに `onSelect` を渡す。
2. `AgentAsk` は選択肢を `Button` として表示し、選択と同時にボタン群を disabled 状態にして多重送信を防ぐ。
3. 送信完了後は「選択したオプションをエージェントへ送信しました。」メッセージを表示する。

## イベントフロー
1. `AgentAsk` → `onSelect(option)` 呼び出し。
2. `AgentStream` → `onAskResponse(option, chunk)` を介して親へ伝搬。
3. `AgentChatClient` → `sendUserMessage(option)` を呼び出し、`useAgentStream` の `sendUserMessage` を実行。
4. `useAgentStream` → チャットルームにユーザーチャンクを即座に追加し、`startTask` をリクエストして SSE を再開。

```
AgentAsk
  └── AgentStream.onAskResponse(option)
        └── AgentChatClient.sendUserMessage(option)
              └── useAgentStream.sendUserMessage(option)
                    ├── setChunks([... userChunk])
                    └── startTaskRef.current(option)
```

## 状態管理
- `useAgentStream.sendUserMessage`
  - エンプティ／ストリーム進行中は送信をキャンセル。
  - `AbortController` を尊重しつつ、新規ユーザーチャンクを state に追加。
  - 入力欄 (`input`) は `handleSubmit` と同じく送信前にクリアされる。
- `AgentAsk`
  - `selectedOption` と `isSubmitting` state を持ち、送信完了まで UI をロック。
  - 送信失敗時は state をリセットして再選択を許可。

## 主要ファイル
- `apps/tachyon/src/hooks/useAgentStream.ts`
  - `sendUserMessage` の公開と `startTaskRef` 連携、フォーム送信フローからの再利用。
- `apps/tachyon/src/app/v1beta/[tenant_id]/ai/agent/chat/client.tsx`
  - `AgentStream` へ `onAskResponse` を渡し、選択肢をユーザー送信に変換。
- `apps/tachyon/src/components/agent/AgentStream.tsx`
  - `onAskResponse` プロパティ、`AgentAsk` への委譲、既存チャンクグルーピングとの統合。
- `apps/tachyon/src/components/agent/AgentAsk.tsx`
  - ボタン UI、送信ロック、送信完了メッセージ。

## バリデーションとテスト
- Vitest: `AgentStream` の `auto sends ask option when clicked` により `onAskResponse` が呼ばれることを検証。
- `mise run check`: 型／lint チェックで安全性を担保。
- 手動テスト（要 Playwright MCP）: ask 選択→自動送信→エージェント継続を確認。

## 既知の課題
- 選択肢のテキストが長文の場合の表示最適化は今後の課題。
- 複数 `ask` が連続した場合は最新のイベントが再度ボタンを表示するが、過去の選択は履歴表示のみに留まる。

## 参考タスク
- `docs/src/tasks/completed/v0.15.0/fix-agent-api-chat-events/task.md`
