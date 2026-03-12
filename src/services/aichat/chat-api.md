---
title: "チャットAPIドキュメント"
topics: ["chat", "API", "backend", "aichat"]
type: "tech"
published: true
targetFiles: ["apps/aichat/src/app/api/chat"]
---

# チャットAPIドキュメント

このドキュメントでは、Tachyon AppsのチャットAPIの仕様とインターフェースについて説明します。

## APIエンドポイント

### メッセージ送信

```
POST /api/chat
```

#### リクエストパラメータ

| パラメータ | 型 | 必須 | 説明 |
|-----------|----|----|------|
| `messages` | `Array<Message>` | 必須 | 送信するメッセージの配列 |
| `operator_id` | `string` | 必須 | 対応するオペレーターID |
| `chatroomId` | `string` | 任意 | チャットルームID（新規作成の場合は "new" または省略） |
| `model` | `string` | 任意 | 使用するAIモデルID |

#### レスポンス

レスポンスはストリーミング形式で返され、各チャンクは以下の形式です：

```json
{
  "id": "msg_123456789",
  "role": "assistant",
  "content": "こんにちは！",
  "created_at": "2023-04-01T12:34:56Z"
}
```

新規チャットルームの場合、レスポンスヘッダーに `x-chatroom-id` が追加されます。

### チャットルーム一覧取得

```
GET /api/chat
```

#### リクエストパラメータ

| パラメータ | 型 | 必須 | 説明 |
|-----------|----|----|------|
| `operator_id` | `string` | 必須 | オペレーターID |
| `limit` | `number` | 任意 | 取得件数（デフォルト: 20） |
| `offset` | `number` | 任意 | オフセット（デフォルト: 0） |

#### レスポンス

```json
{
  "chatrooms": [
    {
      "id": "chat_123456789",
      "name": "チャットルーム1",
      "created_at": "2023-04-01T12:34:56Z",
      "updated_at": "2023-04-01T13:45:12Z",
      "last_message": {
        "content": "こんにちは！",
        "role": "assistant"
      }
    },
    ...
  ],
  "total": 42,
  "limit": 20,
  "offset": 0
}
```

### チャットルーム詳細取得

```
GET /api/chat/:id
```

#### リクエストパラメータ

| パラメータ | 型 | 必須 | 説明 |
|-----------|----|----|------|
| `id` | `string` | 必須 | チャットルームID |
| `operator_id` | `string` | 必須 | オペレーターID |

#### レスポンス

```json
{
  "id": "chat_123456789",
  "name": "チャットルーム1",
  "created_at": "2023-04-01T12:34:56Z",
  "updated_at": "2023-04-01T13:45:12Z",
  "messages": [
    {
      "id": "msg_111",
      "role": "user",
      "content": "こんにちは",
      "created_at": "2023-04-01T12:34:56Z"
    },
    {
      "id": "msg_112",
      "role": "assistant",
      "content": "こんにちは！どのようにお手伝いできますか？",
      "created_at": "2023-04-01T12:35:02Z"
    },
    ...
  ]
}
```

### チャットルーム削除

```
DELETE /api/chat/:id
```

#### リクエストパラメータ

| パラメータ | 型 | 必須 | 説明 |
|-----------|----|----|------|
| `id` | `string` | 必須 | チャットルームID |
| `operator_id` | `string` | 必須 | オペレーターID |

#### レスポンス

```json
{
  "success": true,
  "id": "chat_123456789"
}
```

## 型定義

### Message

```typescript
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}
```

### ChatRoom

```typescript
interface ChatRoom {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  messages?: Message[];
  last_message?: {
    content: string;
    role: 'user' | 'assistant' | 'system';
  };
}
```

### Model

```typescript
interface Model {
  id: string;
  name: string;
  description?: string;
  max_tokens?: number;
  pricing?: {
    input: number;
    output: number;
  };
}
```

## エラーハンドリング

APIエラーは以下の形式で返されます：

```json
{
  "error": {
    "message": "エラーメッセージ",
    "code": "ERROR_CODE",
    "status": 400
  }
}
```

### 主なエラーコード

| コード | ステータス | 説明 |
|-------|---------|------|
| `INVALID_REQUEST` | 400 | リクエストパラメータが不正 |
| `UNAUTHORIZED` | 401 | 認証エラー |
| `NOT_FOUND` | 404 | リソースが見つからない |
| `SERVER_ERROR` | 500 | サーバー内部エラー |

## 使用例

### Vercel AI SDKとの統合

```typescript
// hooks/useChat.ts
import { useChat as useVercelChat } from 'ai/react'

export function useChat({ 
  operatorId, 
  chatroomId 
}: { 
  operatorId: string, 
  chatroomId?: string 
}) {
  return useVercelChat({
    api: '/api/chat',
    body: {
      operator_id: operatorId,
      chatroomId: chatroomId || 'new'
    },
    onResponse: (response) => {
      // 新規チャットルームIDを取得
      const newChatroomId = response.headers.get('x-chatroom-id')
      if (newChatroomId) {
        // 必要な処理
      }
    }
  })
} 