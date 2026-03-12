# Agent API 仕様書

## 概要
Tachyon Agent APIは、LLMエージェントシステムを利用してタスクを実行するためのストリーミングAPIです。Server-Sent Events (SSE)を使用してリアルタイムで実行状況を配信します。

## 1. エンドポイント

### エージェント実行API
| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/v1/llms/chatrooms/{chatroom_id}/agent/execute` | エージェント実行 |
| GET | `/v1/llms/chatrooms/{chatroom_id}/agent/status` | エージェントステータス取得 |
| GET | `/v1/llms/chatrooms/{chatroom_id}/agent/messages` | エージェントメッセージ取得 |

### MCP設定API
| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/v1beta/{tenant_id}/mcp-config` | MCP設定取得 |
| POST | `/v1beta/{tenant_id}/mcp-config` | MCP設定保存 |

## 2. リクエスト仕様

### AgentExecuteRequest
エージェント実行時のリクエストボディ

```json
{
  "task": "実行するタスクの説明",
  "user_custom_instructions": "カスタム指示（オプション）",
  "assistant_name": "アシスタント名（オプション）",
  "additional_tool_description": "追加ツール説明（オプション）",
  "auto_approve": false,
  "max_requests": 10,
  "mcp_hub_config_json": "MCP設定JSON（オプション）",
  "model": "anthropic/claude-3.5-sonnet"
}
```

#### パラメータ詳細

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|-----|------|------------|------|
| task | string | ✓ | - | 実行するタスクの説明 |
| user_custom_instructions | string | - | null | ユーザーカスタム指示 |
| assistant_name | string | - | null | アシスタントの名前 |
| additional_tool_description | string | - | null | 追加ツールの説明 |
| auto_approve | boolean | - | false | ツール実行の自動承認 |
| max_requests | number | - | 10 | 最大リクエスト数 |
| mcp_hub_config_json | string | - | null | MCPハブ設定のJSON文字列 |
| model | string | - | null | 使用するLLMモデル |

#### モデル指定形式

モデルは以下の2つの形式で指定可能：

1. **明示的指定**: `provider/modelname`
   - `anthropic/claude-sonnet-4-5-20250929`
   - `anthropic/claude-opus-4-1-20250805`
  - `openai/gpt-5`
   - `google_ai/gemini-2.5-pro`

2. **自動推測**: `modelname`のみ
   - `gpt-*` → OpenAIプロバイダー
   - `claude-*` → Anthropicプロバイダー
   - `gemini*` → Google AIプロバイダー

### 認証ヘッダー

| ヘッダー | 必須 | 説明 |
|---------|------|------|
| Authorization | ✓ | Bearer トークン |
| x-operator-id | ✓ | テナントID（例: `tn_01hjryxysgey07h5jz5wagqj0m`） |
| x-user-id | - | ユーザーID（省略時はデフォルト値使用） |

## 3. レスポンス仕様

### SSEストリーム形式
レスポンスはServer-Sent Events形式でストリーミング配信されます。

```
event: tool_call
data: {"type":"tool_call","tool_id":"t_123","tool_name":"calculator"}

event: tool_result
data: {"type":"tool_result","tool_id":"t_123","result":"42","is_finished":true}

event: say
data: {"type":"say","index":0,"text":"計算結果は42です。"}

event: done
data: 
```

### AgentChunkイベント種別

| イベントタイプ | 説明 | データ構造 |
|---------------|------|-----------|
| `tool_call` | ツール呼び出し開始 | `{tool_id: string, tool_name: string}` |
| `tool_call_args` | ツール引数 | `{tool_id: string, args: object}` |
| `tool_result` | ツール実行結果 | `{tool_id: string, result: string, is_finished: boolean}` |
| `thinking` | 思考プロセス | `{index: number, text: string, is_finished: boolean}` |
| `say` | エージェント発言 | `{index: number, text: string}` |
| `user` | ユーザーメッセージ | `{text: string, id: string, user_id: string, created_at: string}` |
| `ask` | ユーザーへの質問 | `{text: string, options?: string[]}` |
| `attempt_completion` | タスク完了試行 | `{result: string, command?: string}` |
| `usage` | トークン使用量 | `{prompt_tokens: number, completion_tokens: number}` |
| `error` | エラー | `{code: string, message: string}` |
| `done` | ストリーム終了 | (空データ) |

## 4. コスト計算と課金

### 料金体系（NanoDollar単位）

1 NanoDollar = $0.000000001 (10^-9 USD)

#### 基本料金
- エージェント実行: 100,000,000 NanoDollars ($0.10)

#### トークン料金（モデル別）

| モデル | 入力（/token） | 出力（/token） |
|--------|---------------|---------------|
| Claude 3.5 Sonnet | 3,000 ($0.000003) | 15,000 ($0.000015) |
| Claude Opus 4 | 15,000 ($0.000015) | 75,000 ($0.000075) |
| GPT-5 | 99,000 ($0.000099) | 396,000 ($0.000396) |
| GPT-5 mini | 18,000 ($0.000018) | 72,000 ($0.000072) |
| GPT-5 nano | 1,000 ($0.000001) | 4,000 ($0.000004) |
| Gemini 2.5 Pro | 1,250 ($0.00000125) | 10,000 ($0.00001) |

#### ツール使用料金

| ツール | 料金（NanoDollars） | USD相当 |
|--------|-------------------|---------|
| mcp_search | 500,000,000 | $0.50 |
| mcp_read | 200,000,000 | $0.20 |
| mcp_write | 300,000,000 | $0.30 |
| mcp_exec | 400,000,000 | $0.40 |
| web_search | 500,000,000 | $0.50 |
| code_execution | 300,000,000 | $0.30 |
| file_operation | 200,000,000 | $0.20 |

### 課金フロー

1. **事前見積もり**: タスク内容から概算コストを計算
2. **残高確認**: PaymentAppで課金可能かチェック
3. **実行時課金**: 実際の使用量に基づいて課金
4. **コスト記録**: AgentExecutionCostテーブルに記録

### AgentExecutionCostデータ構造

```typescript
{
  id: string,                    // ULID
  agent_execution_id: string,    // ULID
  tenant_id: string,             // テナントID
  base_cost: number,             // 基本料金
  token_cost: number,            // トークン料金
  tool_cost: number,             // ツール使用料金
  total_cost: number,            // 合計
  tool_usage_details: object,   // ツール使用詳細
  created_at: string             // ISO 8601形式
}
```

## 5. エラーハンドリング

### エラーコード

| コード | 説明 | HTTPステータス |
|--------|------|---------------|
| `PAYMENT_REQUIRED` | 残高不足 | 402 |
| `EXECUTION_ERROR` | 実行エラー | 500 |
| `STREAM_ERROR` | ストリーミングエラー | 500 |
| `INVALID_REQUEST` | リクエスト不正 | 400 |

### エラーレスポンス例

```json
{
  "type": "error",
  "code": "PAYMENT_REQUIRED",
  "message": "Insufficient balance for agent execution. Required: 1000 credits, Available: 500 credits"
}
```

## 6. 実装上の重要な仕様

### 非同期処理
- クライアントが切断されてもエージェント処理は継続
- バックグラウンドでタスクを完了まで実行

### ストリーミング特性
- リアルタイムで実行状況を配信
- Keep-Aliveによる接続維持
- 部分的な結果の逐次配信

### マルチプロバイダー対応
- Anthropic (Claude系)
- OpenAI (GPT系)
- Google AI (Gemini系)

### MCP (Model Context Protocol) 統合
- 外部ツールとの連携
- カスタムツールの動的登録
- ツール実行結果のストリーミング

## 7. 使用例

### cURLでの実行例

```bash
curl -X POST "https://api.tachyon.app/v1/llms/chatrooms/cr_01abc123/agent/execute" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "x-operator-id: tn_01hjryxysgey07h5jz5wagqj0m" \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Pythonで簡単なWebサーバーを実装してください",
    "auto_approve": false,
    "max_requests": 20,
    "model": "anthropic/claude-3.5-sonnet"
  }'
```

### JavaScriptでのSSE処理例

```javascript
const eventSource = new EventSource(
  'https://api.tachyon.app/v1/llms/chatrooms/cr_01abc123/agent/execute',
  {
    headers: {
      'Authorization': 'Bearer YOUR_TOKEN',
      'x-operator-id': 'tn_01hjryxysgey07h5jz5wagqj0m'
    }
  }
);

eventSource.addEventListener('say', (event) => {
  const data = JSON.parse(event.data);
  console.log('Agent says:', data.text);
});

eventSource.addEventListener('tool_call', (event) => {
  const data = JSON.parse(event.data);
  console.log('Calling tool:', data.tool_name);
});

eventSource.addEventListener('done', () => {
  console.log('Execution completed');
  eventSource.close();
});

eventSource.addEventListener('error', (event) => {
  const data = JSON.parse(event.data);
  console.error('Error:', data.message);
  eventSource.close();
});
```

## 8. 制限事項

- 最大実行時間: 10分
- 最大リクエスト数: 100回/実行
- 最大タスク文字数: 10,000文字
- 同時実行数: テナントあたり5実行

## 更新履歴

- 2025-01-28: 初版作成
- NanoDollar単位系の採用
- MCP統合機能の追加
- マルチプロバイダー対応
