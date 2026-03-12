---
title: "AIChat エージェントUI"
topics: ["chat", "AI", "agent", "UI", "aichat"]
type: "tech"
published: true
targetFiles: ["apps/aichat"]
---

# AIChat エージェントUI

AIChat アプリケーションにおけるエージェントUIは、ユーザーがAIエージェントと対話し、複雑なタスクを実行するためのインターフェースです。このドキュメントでは、エージェントUIの設計、実装、使用方法について説明します。

## 🎯 目的

エージェントUIの主な目的は以下の通りです：

1. **AIエージェントとの対話**: ユーザーがタスクを指示し、エージェントの実行状況をリアルタイムで確認
2. **ツール実行の可視化**: エージェントが使用するツールとその結果を直感的に表示
3. **インタラクティブな操作**: 必要に応じてユーザーが承認や追加情報を提供できる対話的なUI
4. **実行状態の追跡**: エージェントの進行状況と現在の状態を明確に表示

## 🏗️ アーキテクチャ

エージェントUIは以下のようなアーキテクチャで構成されています：

```
クライアント (React) ←→ Server-Sent Events API ←→ エージェント実行エンジン
     ↓                                               ↓
UIコンポーネント                                 ツール実行システム
```

### コンポーネント構成

1. **AgentExecutor**: エージェント実行を管理する主要コンポーネント
2. **AgentStream**: SSEストリームを購読し、UIを更新するコンポーネント
3. **AgentThinking**: エージェントの思考プロセスを表示
4. **AgentToolCall**: ツール呼び出しとその結果を表示
5. **AgentApproval**: ユーザー承認が必要なアクションを表示
6. **AgentStatus**: 現在のエージェント状態と進捗を表示

## 📡 API インターフェース

エージェントUIは以下のAPIエンドポイントと通信します。これらのAPIは`packages/llms`パッケージで定義・実装されています。

### エージェント実行 (SSE)

```
POST /v1/llms/chatrooms/{chatroom_id}/agent/execute
```

#### リクエスト本文（AgentExecuteRequest）

```json
{
  "task": "実行するタスクの説明",
  "user_custom_instructions": "カスタムインストラクション（オプション）",
  "assistant_name": "アシスタント名（オプション）",
  "additional_tool_description": "追加ツール説明（オプション）",
  "auto_approve": false,
  "max_requests": 10
}
```

| フィールド | 型 | 必須 | 説明 |
|------------|------|----------|-------------|
| task | string | はい | エージェントに実行させるタスクの説明 |
| user_custom_instructions | string | いいえ | ユーザーからのカスタムインストラクション |
| assistant_name | string | いいえ | アシスタントの名前をカスタマイズ |
| additional_tool_description | string | いいえ | 追加ツールの説明 |
| auto_approve | boolean | いいえ | true の場合、ユーザー承認なしで自動的にアクションを実行（デフォルト: false） |
| max_requests | integer | いいえ | 最大リクエスト数（デフォルト: 10） |

#### レスポンス

Server-Sent Events (SSE) ストリーム。ストリームの各イベントは以下の`AgentChunk`のいずれかのタイプとして返されます：

##### 1. thinking - 思考プロセス

エージェントの思考プロセスを表すチャンク。

```json
{
  "type": "thinking",
  "index": 0,
  "text": "このタスクについて考えています...",
  "is_finished": false
}
```

| フィールド | 型 | 説明 |
|------------|------|-------------|
| type | string | "thinking" 固定値 |
| index | integer | 思考の順序インデックス（0から始まる） |
| text | string | 思考の内容テキスト |
| is_finished | boolean | この思考プロセスが完了したかどうか |

##### 2. say - エージェントの発言

エージェントからユーザーへのメッセージを表すチャンク。

```json
{
  "type": "say",
  "index": 0,
  "text": "このタスクを実行します。"
}
```

| フィールド | 型 | 説明 |
|------------|------|-------------|
| type | string | "say" 固定値 |
| index | integer | メッセージの順序インデックス |
| text | string | メッセージ内容 |

##### 3. tool_call - ツール呼び出し

エージェントがツールを呼び出す際に発行されるチャンク。

```json
{
  "type": "tool_call",
  "tool_id": "t_123",
  "tool_name": "calculator"
}
```

| フィールド | 型 | 説明 |
|------------|------|-------------|
| type | string | "tool_call" 固定値 |
| tool_id | string | ツール呼び出しの一意識別子 |
| tool_name | string | 呼び出されるツールの名前 |

##### 4. tool_call_args - ツール呼び出し引数

ツール呼び出しに使用される引数を含むチャンク。

```json
{
  "type": "tool_call_args",
  "tool_id": "t_123",
  "args": {
    "query": "2+2"
  }
}
```

| フィールド | 型 | 説明 |
|------------|------|-------------|
| type | string | "tool_call_args" 固定値 |
| tool_id | string | ツール呼び出しの識別子（tool_callと一致） |
| args | object | ツールに渡される引数（キーと値のペア） |

##### 5. tool_result - ツール実行結果

ツールの実行結果を含むチャンク。

```json
{
  "type": "tool_result",
  "tool_id": "t_123",
  "result": "4",
  "is_finished": true
}
```

| フィールド | 型 | 説明 |
|------------|------|-------------|
| type | string | "tool_result" 固定値 |
| tool_id | string | ツール呼び出しの識別子 |
| result | string | ツール実行の結果 |
| is_finished | boolean | ツール実行が完了したかどうか |

##### 6. ask - ユーザーへの質問

エージェントがユーザーに追加情報や選択肢を求める際に発行されるチャンク。

```json
{
  "type": "ask",
  "text": "次にどうしますか？",
  "options": ["オプション1", "オプション2"]
}
```

| フィールド | 型 | 説明 |
|------------|------|-------------|
| type | string | "ask" 固定値 |
| text | string | ユーザーへの質問テキスト |
| options | array | ユーザーに提示する選択肢の配列 |

##### 7. completion - タスク完了

タスクが完了したことを示すチャンク。

```json
{
  "type": "completion",
  "result": "タスクが完了しました。",
  "command": "ls -la"
}
```

| フィールド | 型 | 説明 |
|------------|------|-------------|
| type | string | "completion" 固定値（OpenAPIでは"attempt_completion"） |
| result | string | タスク完了の結果メッセージ |
| command | string | オプションで実行可能なコマンド |

#### SSEイベント名

各チャンクタイプはSSEイベント名としても送信されます：

- `thinking`
- `say`
- `tool_call`
- `tool_call_args`
- `tool_result`
- `ask`
- `completion`（OpenAPIでは"attempt_completion"）

### エージェント状態取得

```
GET /v1/llms/chatrooms/{chatroom_id}/agent/status
```

#### レスポンス (AgentStatusResponse)

```json
{
  "is_running": true,
  "progress": 45,
  "state": "tool_execution"
}
```

| フィールド | 型 | 説明 |
|------------|------|-------------|
| is_running | boolean | エージェントが現在実行中かどうか |
| progress | integer | 進捗状況のパーセンテージ（0-100） |
| state | string | 現在のエージェント状態の説明 |

## 🎨 UI コンポーネント設計

### AgentExecutor

エージェント実行の開始と管理を行うメインコンポーネント。

```tsx
<AgentExecutor
  chatRoomId="cr_123456"
  onComplete={(result) => handleCompletion(result)}
  autoApprove={false}
/>
```

### AgentStream

SSEストリームを購読し、チャンクタイプに応じた適切なUIコンポーネントをレンダリング。

```tsx
<AgentStream
  chatRoomId="cr_123456"
  onChunk={(chunk) => handleChunk(chunk)}
  onError={(error) => handleError(error)}
  onComplete={() => handleStreamComplete()}
/>
```

### AgentThinking

エージェントの思考プロセスを表示。

```tsx
<AgentThinking
  text="タスクの実行方法を考えています..."
  isFinished={false}
/>
```

### AgentToolCall

ツール呼び出しとその結果を表示。

```tsx
<AgentToolCall
  toolName="ファイル検索"
  args={{ query: "*.tsx" }}
  result="10件のファイルが見つかりました"
  status="completed" // 'pending', 'running', 'completed', 'error'
/>
```

### AgentApproval

ユーザー承認が必要なアクションの表示。

```tsx
<AgentApproval
  action="ファイル編集"
  details="index.tsxを更新します"
  onApprove={() => approveAction()}
  onDeny={() => denyAction()}
/>
```

## 📱 ユーザーエクスペリエンス

### エージェント実行フロー

1. **タスク入力**: ユーザーがエージェントに実行させたいタスクを入力
2. **実行開始**: エージェントが思考を開始し、計画を立てる
3. **ツール実行**: 必要なツールを順次実行（ファイル検索、コード生成など）
4. **ユーザー承認**: 設定によっては重要なアクションの前にユーザー承認を要求
5. **タスク完了**: 結果の表示と次のアクションの提案

### インタラクションパターン

- **自動/手動承認モード**: ユーザーはエージェントのアクションを自動承認するか、手動で確認するか選択可能
- **アクション履歴**: 実行されたすべてのアクションと結果を時系列で表示
- **中断と再開**: 実行中のエージェントタスクを一時停止/再開可能

## 💻 実装ガイド

新しいエージェントUIを実装するための推奨手順：

1. **SSEクライアント実装**:
   ```tsx
   type AgentChunk = {
     type: 'thinking' | 'say' | 'tool_call' | 'tool_call_args' | 'tool_result' | 'ask' | 'completion';
     [key: string]: any;
   };

   const useAgentStream = (chatRoomId: string) => {
     const [chunks, setChunks] = useState<AgentChunk[]>([]);
     
     useEffect(() => {
       const eventSource = new EventSource(`/api/v1/llms/chatrooms/${chatRoomId}/agent/execute`);
       
       eventSource.addEventListener('thinking', (e) => {
         const data = JSON.parse(e.data);
         setChunks(prev => [...prev, data]);
       });
       
       eventSource.addEventListener('say', (e) => {
         const data = JSON.parse(e.data);
         setChunks(prev => [...prev, data]);
       });
       
       eventSource.addEventListener('tool_call', (e) => {
         const data = JSON.parse(e.data);
         setChunks(prev => [...prev, data]);
       });
       
       eventSource.addEventListener('tool_call_args', (e) => {
         const data = JSON.parse(e.data);
         setChunks(prev => [...prev, data]);
       });
       
       eventSource.addEventListener('tool_result', (e) => {
         const data = JSON.parse(e.data);
         setChunks(prev => [...prev, data]);
       });
       
       eventSource.addEventListener('ask', (e) => {
         const data = JSON.parse(e.data);
         setChunks(prev => [...prev, data]);
       });
       
       eventSource.addEventListener('completion', (e) => {
         const data = JSON.parse(e.data);
         setChunks(prev => [...prev, data]);
       });
       
       eventSource.addEventListener('error', (e) => {
         console.error('SSE Error:', e);
       });
       
       return () => {
         eventSource.close();
       };
     }, [chatRoomId]);
     
     return chunks;
   };
   ```

2. **UIコンポーネント実装**:
   - React Componentとしてエージェント関連の各コンポーネントを実装
   - Tailwind CSSとshadcn/uiを使用して一貫したデザインを維持
   - アニメーションでユーザーエクスペリエンスを向上

3. **状態管理**:
   - React ContextかZustandを使用してエージェント状態を管理
   - エージェントの実行状態、チャンク履歴、ユーザー入力を保持

## 🧪 テスト戦略

エージェントUIのテストには以下のアプローチを推奨します：

1. **ユニットテスト**: 各UIコンポーネントの機能テスト
2. **インタラクションテスト**: Storybookを使用したコンポーネント間の対話テスト
3. **モックSSEテスト**: サーバーイベントのモックによるUIの反応テスト
4. **E2Eテスト**: 実際のエージェント実行とのエンドツーエンドテスト

## 📈 パフォーマンス考慮事項

1. **メモ化**: 頻繁に更新されるコンポーネントの不要な再レンダリングを防止
2. **仮想化**: 大量のチャンクが生成される場合はリストの仮想化を検討
3. **チャンクバッファリング**: 大量の更新時のUIブロッキングを防止

## 📝 今後の拡張計画

1. **カスタムツールUI**: 各ツールタイプに特化したビジュアル表現
2. **複数エージェント対応**: 複数のエージェントが協力して作業する場合の表示
3. **ユーザーフィードバック機能**: エージェント実行中の即時フィードバック
4. **パフォーマンスダッシュボード**: エージェントの効率と成功率の分析

## 📚 関連ドキュメント

詳細については、以下の関連ドキュメントを参照してください：

- [チャットコンポーネントドキュメント](./chat-components.md) - 基本的なチャットUIコンポーネント
- [チャットAPIドキュメント](./chat-api.md) - 基盤となるAPI仕様
- [LLMsパッケージドキュメント](../../tachyon-apps/llms/index.md) - エージェントバックエンドの詳細 

## 🛠️ OpenAPI定義からTypeScript型を自動生成する

エージェントUIやAPI連携の型安全性を高めるため、OpenAPI定義（llms.openapi.yaml）からTypeScript型を自動生成することを推奨します。

### 推奨パッケージ

- [openapi-typescript](https://github.com/openapi-ts/openapi-typescript)
  - OpenAPI 3仕様からTypeScript型を自動生成するツールです。
  - コマンド例：
    ```bash
    npx openapi-typescript ../packages/llms/llms.openapi.yaml --output ./src/types/llms-api.d.ts
    ```
  - 公式サイト: [openapi-ts.dev](https://openapi-ts.dev/)

- [openapi-generator](https://www.openapis.org/openapi-generator)
  - より多機能なクライアント・サーバースタブ生成ツール。TypeScript用のプリセットもあり。
  - コマンド例：
    ```bash
    npx @openapitools/openapi-generator-cli generate -i ../packages/llms/llms.openapi.yaml -g typescript-fetch -o ./src/api/llms
    ```

### メリット
- API仕様とフロントエンド型定義の自動同期
- 型安全なAPIコールの実現
- API仕様変更時の型エラーによる早期検知

### 参考
- [openapi-typescript GitHub](https://github.com/openapi-ts/openapi-typescript)
- [Generating TypeScript Types with OpenAPI for REST API Consumption](https://www.pullrequest.com/blog/generating-typescript-types-with-openapi-for-rest-api-consumption/)

> **運用方針**: API仕様変更時は必ず型生成コマンドを再実行し、型の最新化を徹底してください。 