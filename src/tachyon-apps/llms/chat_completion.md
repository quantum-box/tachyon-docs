# Chat completion

Chat completionは、OpenAI APIと互換性のある形式でLLMとの対話を可能にするAPIです。

## エンドポイント

```
POST /v1/llms/chat/completions
```

## リクエスト

```json
{
  "model": "google_ai:gemini-2.0-flash-exp",
  "messages": [
    {
      "role": "user",
      "content": "こんにちは"
    }
  ],
  "temperature": 1.0,
  "stream": false
}
```

### パラメータ

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|------------|-----|------|------------|------|
| model | string | × | "openai:gpt-4o" | 使用するモデルのID |
| messages | array | ○ | - | 会話履歴のメッセージ配列 |
| temperature | float | × | 1.0 | 生成の多様性（0-2） |
| top_p | float | × | 1.0 | 核サンプリングの確率（0-1） |
| n | integer | × | 1 | 生成する応答の数（1-10） |
| stream | boolean | × | false | ストリーミング応答の有効化 |
| max_completion_tokens | integer | × | 10000 | 生成する最大トークン数 |
| presence_penalty | float | × | 0 | 存在ペナルティ（-2-2） |
| frequency_penalty | float | × | 0 | 頻度ペナルティ（-2-2） |
| tools | array | × | - | モデルが使用可能なツール定義 |
| tool_choice | string | × | - | ツール選択の制御（"auto"または"any"） |

### メッセージのロール

`messages`配列の各メッセージの`role`フィールドには以下の値が使用できます：

- `system`: システム指示（モデルの振る舞いを定義）
- `user`: ユーザーからの入力
- `assistant`: アシスタントからの応答

### ツール選択の制御

`tool_choice`パラメータは以下の値をサポートします：

- `auto`: モデルが必要に応じてツールを使用
- `any`: モデルが積極的にツールを使用

### モデル指定

モデルIDは以下の形式で指定します：

```
[provider]:[model_name]
```

例：
- `google_ai:gemini-2.0-flash-exp`
- `openai:gpt-4`

プロバイダ名を省略した場合は`openai`として扱われます。

### 利用可能なプロバイダーとモデル

#### Google AI
- `google_ai:gemini-1.5-pro-latest` (コンテキスト長: 2,097,152トークン)
- `google_ai:gemini-1.5-flash-latest` (コンテキスト長: 1,048,576トークン)
- `google_ai:gemini-2.0-flash-exp` (コンテキスト長: 2,097,152トークン)

#### OpenAI
- `openai:gpt-4o` (コンテキスト長: 128,000トークン)
- `openai:gpt-4o-mini` (コンテキスト長: 128,000トークン)
- `openai:o1-preview` (コンテキスト長: 128,000トークン)

#### Anthropic
- `anthropic:claude-opus-4-1-20250805` (コンテキスト長: 200,000トークン)
- `anthropic:claude-sonnet-4-5-20250929` (コンテキスト長: 200,000トークン)
- `anthropic:claude-3-5-haiku-20241022` (コンテキスト長: 200,000トークン)

#### Groq
- `groq:llama-3.3-70b-versatile` (コンテキスト長: 128,000トークン)
- `groq:mixtral-8x7b-32768` (コンテキスト長: 32,768トークン)
- `groq:gemma2-9b-it` (コンテキスト長: 8,192トークン)

#### Perplexity AI
- `perplexity:llama-3.1-sonar-huge-128k-online` (コンテキスト長: 127,072トークン)
- `perplexity:llama-3.1-sonar-large-128k-online` (コンテキスト長: 127,072トークン)
- `perplexity:llama-3.1-sonar-small-128k-online` (コンテキスト長: 127,072トークン)

各モデルは以下の機能をサポートしています：
- ストリーミング応答
- ツール呼び出し
- システムプロンプト
- 生成パラメータの調整（temperature, top_p等）

## レスポンス

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "google_ai:gemini-2.0-flash-exp",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "こんにちは、お手伝いできることはありますか？"
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 9,
    "completion_tokens": 12,
    "total_tokens": 21
  }
}
```

### 完了理由

`finish_reason`フィールドは、応答生成が完了した理由を示します：

- `stop`: 正常に完了
- `length`: 最大トークン数に到達
- `tool_calls`: ツール呼び出しのため停止
- `content_filter`: コンテンツフィルターにより停止

## ストリーミング

`stream: true`を指定すると、Server-Sent Events形式で部分的な応答を受信できます：

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion.chunk",
  "created": 1677652288,
  "model": "google_ai:gemini-2.0-flash-exp",
  "choices": [{
    "index": 0,
    "delta": {
      "content": "こん"
    }
  }]
}
```

## ツール統合

ツールを定義して、モデルに特定の機能を実行させることができます：

```json
{
  "tools": [{
    "type": "function",
    "function": {
      "name": "get_weather",
      "description": "現在の天気を取得する",
      "parameters": {
        "type": "object",
        "properties": {
          "location": {
            "type": "string",
            "description": "都市名"
          }
        },
        "required": ["location"]
      }
    }
  }],
  "tool_choice": "auto"
}
```

## エラーレスポンス

| ステータスコード | 説明 |
|-----------------|------|
| 400 | 不正なリクエスト |
| 401 | 認証エラー |
| 429 | レート制限超過 |
| 500 | サーバーエラー |

## 実装タスク

## Tachyon ai studioのStream対応

chat_completion_on_chatroomの実装とsubscriptionの実装
chat_completionはクライアント側でchatメッセージの履歴をもつ。しかし、chat_completion_on_chatroomではクライアントは永続化を持たないようにする。

- [ ] の実装

  - [ ] useChatで
