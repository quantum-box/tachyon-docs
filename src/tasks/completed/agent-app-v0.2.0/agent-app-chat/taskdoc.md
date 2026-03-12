# Agent App - Tachyon Agent API Chat 実装

## 概要
`apps/agent-app` に Tachyon Agent API を使ったエージェントチャット機能を実装する。
SSE（Server-Sent Events）でストリーミング応答を受け取り、リアルタイムにUI表示する。

## 背景
- `apps/agent-app` は Better Auth + Cognito を使った認証が既に実装済み
- Tachyon Agent API (`/v1/llms/chatrooms/:id/agent/execute`) はSSEでストリーミング応答を返す
- 既存の `apps/tachyon` に類似実装（`useAgentStream` Hook）があり、これを参考にする

## 目標
1. Agent API クライアント実装（SSE対応）
2. `useAgentStream` Hook の簡略版実装
3. チャットUIコンポーネント作成
4. `/chat` ページ実装

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

## 実装計画

### Phase 1: API クライアント ✅
- [x] `src/gen/llms-api.d.ts` - OpenAPI スキーマから自動生成した型定義
- [x] `src/gen/types.ts` - 型ヘルパー（AgentChunkWithError, type guards 等）
- [x] `src/lib/agent-api.ts` - Agent API クライアント実装
  - `createChatRoom()` - チャットルーム作成
  - `executeAgent()` - エージェント実行（SSEストリーム）

### Phase 2: Hook 実装 ✅
- [x] `src/hooks/useAgentStream.ts` - SSEストリーミングHook
  - チャンクのローカル状態管理
  - AbortController によるキャンセル対応
  - エラーハンドリング
  - モデル選択

### Phase 3: UIコンポーネント ✅
- [x] `src/components/chat/ChatMessage.tsx` - メッセージ表示
- [x] `src/components/chat/ChatInput.tsx` - 入力フォーム
- [x] `src/components/chat/AgentStream.tsx` - ストリーム表示（sayチャンク結合対応）

### Phase 4: ページ実装 ✅
- [x] `src/app/chat/page.tsx` - チャットページ（サーバーコンポーネント）
- [x] `src/app/chat/client.tsx` - チャットクライアント（クライアントコンポーネント）
- [x] ホームページにチャットへのリンク追加

## ファイル構成
```
apps/agent-app/src/
├── app/
│   ├── chat/
│   │   ├── page.tsx          # チャットページ（Server Component）
│   │   └── client.tsx        # チャットクライアント（Client Component）
│   └── page.tsx              # ホームページ（チャットへのリンク追加）
├── components/
│   ├── chat/
│   │   ├── ChatMessage.tsx   # メッセージコンポーネント
│   │   ├── ChatInput.tsx     # 入力フォーム
│   │   └── AgentStream.tsx   # ストリーム表示（sayチャンク結合）
│   └── ui/
│       └── button.tsx        # UIコンポーネント（既存）
├── gen/
│   ├── llms-api.d.ts         # OpenAPI自動生成型（yarn codegen で更新）
│   └── types.ts              # 型ヘルパー・type guards
├── hooks/
│   └── useAgentStream.ts     # SSEストリーミングHook
├── lib/
│   ├── agent-api.ts          # Agent APIクライアント
│   └── auth.ts               # Better Auth設定（既存）
```

## 依存関係
既存の `package.json` で十分。追加パッケージは不要。
- lucide-react（アイコン、既存）
- tailwindcss（スタイリング、既存）

## 実装メモ

### 参考実装
- `apps/tachyon/src/hooks/useAgentStream.ts` - SSE処理の参考
- `apps/tachyon/src/lib/llms-api-extended.ts` - API呼び出しの参考

### 注意点
- SSEは改行区切りでデータが送られるため、不完全な行をバッファリングする必要あり
- `AbortController` でリクエストキャンセル対応
- エラー時は `error` イベントで通知される
- Better Auth のアクセストークンを使って認証
- **sayチャンクは1文字ずつ送られるため、連続するsayチャンクを結合して表示する必要あり**
- **attempt_completionタイプに最終結果が含まれる**

### 使用方法
1. `apps/agent-app` を起動: `yarn workspace agent-app dev`
2. http://localhost:5020 でサインイン
3. ホームページの「Open Chat」ボタンをクリック
4. チャット画面でメッセージを入力して送信

## 進捗記録

### 2025-01-06
- タスクドキュメント作成開始
- 既存コード調査完了
- Phase 1-4 の実装完了
  - 型定義 (`src/types/agent.ts`)
  - Agent API クライアント (`src/lib/agent-api.ts`)
  - useAgentStream Hook (`src/hooks/useAgentStream.ts`)
  - チャットUIコンポーネント (`src/components/chat/`)
  - チャットページ (`src/app/chat/`)
- TypeScript ビルド確認済み
- Biome lint 確認済み

## 動作確認結果 ✅

### Playwright MCP での確認（2025-01-06）
- ✅ agent-app の開発サーバーが起動（http://localhost:5020）
- ✅ サインインページが正常に表示される
- ✅ Cognito認証フローが正常に動作
- ✅ ホームページに「Open Chat」ボタンが表示
- ✅ チャットページのUI表示（ヘッダー、モデル選択、入力フォーム）
- ✅ メッセージ送信後、SSEでレスポンスを受信
- ✅ sayチャンクの結合処理が正常に動作
- ✅ attempt_completionの結果が「Result」として表示
- ✅ トークン使用量とコストが表示

### 修正した問題
1. `attempt_completion`タイプを型定義に追加
2. 空のsayチャンクをスキップする処理を追加
3. 連続するsayチャンクを結合して1つのメッセージとして表示

### 動作確認時のスクリーンショット
- ユーザーメッセージ「What is 2+2?」
- エージェント応答「The answer to 2+2 is 4.」（sayチャンク結合）
- 最終結果「2 + 2 = 4」（attempt_completion、緑のResultボックス）
- トークン使用量: 3217 prompt, 137 completion

### Phase 5: OpenAPI 型自動生成への移行 ✅ (2026-01-06)
- [x] `package.json` に `codegen:rest` スクリプト追加
- [x] `packages/llms/llms.openapi.yaml` から `src/gen/llms-api.d.ts` を自動生成
- [x] `src/gen/types.ts` で型ヘルパーを定義
  - `AgentChunkWithError` - ErrorChunk を含む拡張型
  - Type guards (`isSayChunk`, `isErrorChunk` 等)
- [x] 全コンポーネントを生成型に移行
- [x] 手動型定義 `src/types/agent.ts` を削除
- [x] TypeScript ビルド・Biome lint 確認済み
- [x] Playwright MCP で動作確認完了
