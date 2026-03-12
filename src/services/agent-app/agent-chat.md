# Agent Chat

Tachyon Agent API を使ったリアルタイムチャット機能の仕様。

## 技術仕様

### エンドポイント

```
POST /v1/llms/chatrooms/:chatroom_id/agent/execute
Content-Type: application/json
Accept: text/event-stream

Headers:
- Authorization: Bearer {access_token}
- x-operator-id: {operator_id} (必須)
- x-user-id: {user_id} (任意)
```

### SSEイベント形式

```
event: say
data: {"type":"say","text":"T","index":404}  # 1文字ずつストリーミング

event: attempt_completion
data: {"type":"attempt_completion","result":"2 + 2 = 4","command":null}

event: usage
data: {"type":"usage","prompt_tokens":3217,"completion_tokens":137,"total_tokens":3354}
```

### APIベースURL

```
NEXT_PUBLIC_TACHYON_API_URL=http://localhost:50054
```

## ファイル構成

```
apps/agent-app/src/
├── app/
│   ├── chat/
│   │   ├── page.tsx          # チャットページ（Server Component）
│   │   └── client.tsx        # チャットクライアント（Client Component）
│   └── page.tsx              # ホームページ
├── components/
│   └── chat/
│       ├── ChatMessage.tsx   # メッセージコンポーネント
│       ├── ChatInput.tsx     # 入力フォーム
│       └── AgentStream.tsx   # ストリーム表示（sayチャンク結合）
├── gen/
│   ├── llms-api.d.ts         # OpenAPI自動生成型（yarn codegen で更新）
│   └── types.ts              # 型ヘルパー・type guards
├── hooks/
│   └── useAgentStream.ts     # SSEストリーミングHook
└── lib/
    ├── agent-api.ts          # Agent APIクライアント
    └── auth.ts               # Better Auth設定
```

## 型生成

OpenAPI スキーマから TypeScript 型を自動生成:

```bash
yarn workspace agent-app codegen
```

生成元: `packages/llms/llms.openapi.yaml`
生成先: `apps/agent-app/src/gen/llms-api.d.ts`

### 型ヘルパー

`src/gen/types.ts` で以下を提供:

- `AgentChunk` - サーバーから送信されるチャンク型
- `AgentChunkWithError` - ErrorChunk を含む拡張型
- Type guards (`isSayChunk`, `isUsageChunk`, etc.)

## 注意点

- SSEは改行区切りでデータが送られるため、不完全な行をバッファリングする
- `AbortController` でリクエストキャンセル対応
- **sayチャンクは1文字ずつ送られるため、連続するsayチャンクを結合して表示**
- **attempt_completionタイプに最終結果が含まれる**

## 使用方法

1. `apps/agent-app` を起動: `yarn workspace agent-app dev`
2. http://localhost:5020 でサインイン
3. ホームページの「Open Chat」ボタンをクリック
4. チャット画面でメッセージを入力して送信

## 関連タスク

- [agent-app-v0.2.0](../../tasks/completed/agent-app-v0.2.0/agent-app-chat/taskdoc.md) - 実装タスクドキュメント
