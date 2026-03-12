---
title: "全プロダクト・全画面にエージェントチャットインターフェースを追加（SDK化）"
type: "feature"
emoji: "🤖"
topics: ["agent", "chat", "SDK", "cross-product", "UI", "React", "Rust", "API"]
published: true
targetFiles:
  - packages/agent-chat/
  - apps/tachyon/src/app/v1beta/[tenant_id]/ai/agent/chat/
  - apps/tachyon/src/lib/agent-api.ts
  - apps/tachyon/src/hooks/useAgentStream.ts
  - packages/llms/src/adapter/axum/
github: ""
---

# 全プロダクト・全画面にエージェントチャットインターフェースを追加（SDK化）

## 概要

エージェントチャット機能を **`@tachyon-apps/agent-chat` SDK パッケージ** として切り出し、全プロダクト（tachyon, library, aichat, bakuure-ui, bakuure-admin-ui, stockmind, cms, agent-app, airsales, prosales, web）の全画面に組み込む。SDK として提供することで、数行のコードで任意のReactアプリにエージェントチャットを統合でき、全APIを自然言語で操作可能にする。

## 背景・目的

- **現状**: エージェントチャットは `tachyon` アプリの AI Studio セクション (`/ai/agent/chat`) にのみ存在し、UIコンポーネント・APIクライアント・ストリーミングフックが `apps/tachyon` 内に密結合している。
- **課題**:
  - 他プロダクトからエージェントチャットを使いたい場合、コードを丸ごとコピーする必要がある
  - APIクライアントやストリーミングロジックが再利用できない
  - 各画面のコンテキストに応じた操作をしたい場合、AI Studio に移動する必要がある
- **目標**: SDK パッケージとして切り出し、`<AgentChat />` を置くだけで動作するようにする
- **期待される成果**:
  - 任意のプロダクトに 3-5行で統合可能
  - ユーザー体験の向上（コンテキストスイッチの排除）
  - エージェント利用率の向上
  - 全APIへの統一的なアクセスポイント
  - 将来的な外部公開（npm publish）への道筋

## 詳細仕様

### SDK パッケージ設計

#### パッケージ構成

```
packages/agent-chat/
├── package.json              # @tachyon-apps/agent-chat
├── tsconfig.json
├── vite.config.ts            # ライブラリビルド（ES/CJS）
├── src/
│   ├── index.ts              # パブリック API エクスポート
│   │
│   ├── components/           # UI コンポーネント
│   │   ├── AgentChat.tsx             # メインコンポーネント（SDK エントリ）
│   │   ├── FloatingChatPanel.tsx     # フローティングパネル
│   │   ├── ChatPanel.tsx             # インラインパネル
│   │   ├── MessageList.tsx           # メッセージ一覧表示
│   │   ├── MessageBubble.tsx         # 個別メッセージ
│   │   ├── ChatInput.tsx             # 入力フォーム
│   │   ├── StreamingRenderer.tsx     # ストリーミング表示
│   │   ├── ThinkingIndicator.tsx     # Thinking 表示
│   │   ├── ToolCallDisplay.tsx       # Tool Call/Result 表示
│   │   └── ModelSelector.tsx         # モデル選択
│   │
│   ├── hooks/                # React フック
│   │   ├── useAgentChat.ts           # チャット状態管理（メインフック）
│   │   ├── useAgentStream.ts         # SSE ストリーミング処理
│   │   ├── useChatRoom.ts            # チャットルーム CRUD
│   │   └── useChatPersistence.ts     # ローカルストレージ永続化
│   │
│   ├── client/               # API クライアント
│   │   ├── AgentChatClient.ts        # メインクライアント
│   │   ├── chatroom-api.ts           # チャットルーム API
│   │   ├── agent-api.ts              # エージェント実行 API
│   │   └── types.ts                  # API 型定義
│   │
│   ├── providers/            # React Context
│   │   └── AgentChatProvider.tsx      # 設定・認証コンテキスト
│   │
│   └── styles/               # スタイル
│       └── agent-chat.css            # Tailwind ベース
│
└── stories/                  # Storybook
    ├── AgentChat.stories.tsx
    └── FloatingChatPanel.stories.tsx
```

#### パブリック API

```typescript
// packages/agent-chat/src/index.ts

// --- メインコンポーネント ---
export { AgentChat } from './components/AgentChat'
export { FloatingChatPanel } from './components/FloatingChatPanel'
export { ChatPanel } from './components/ChatPanel'

// --- プロバイダー ---
export { AgentChatProvider } from './providers/AgentChatProvider'
export type { AgentChatConfig } from './providers/AgentChatProvider'

// --- フック（高度な利用向け） ---
export { useAgentChat } from './hooks/useAgentChat'
export { useAgentStream } from './hooks/useAgentStream'
export { useChatRoom } from './hooks/useChatRoom'

// --- API クライアント（ヘッドレス利用向け） ---
export { AgentChatClient } from './client/AgentChatClient'

// --- 型定義 ---
export type {
  AgentChunk,
  ChatRoom,
  ChatMessage,
  AgentExecuteRequest,
  ToolAccess,
  StreamEvent,
} from './client/types'
```

#### 利用イメージ

**最小構成（3行）:**
```tsx
import { AgentChatProvider, FloatingChatPanel } from '@tachyon-apps/agent-chat'

export default function Layout({ children }) {
  return (
    <AgentChatProvider
      apiBaseUrl={process.env.NEXT_PUBLIC_API_URL}
      accessToken={session.accessToken}
      tenantId={tenantId}
    >
      {children}
      <FloatingChatPanel />
    </AgentChatProvider>
  )
}
```

**フルカスタマイズ:**
```tsx
import { AgentChatProvider, ChatPanel, useAgentChat } from '@tachyon-apps/agent-chat'

<AgentChatProvider
  apiBaseUrl="http://localhost:50054"
  accessToken={token}
  tenantId="tn_01hjryxysgey07h5jz5wagqj0m"
  userId={userId}
  defaultModel="claude-sonnet-4-6"
  context={{ page: 'orders', hint: '注文管理画面' }}
  toolAccess={{ filesystem: false, command: false, web_search: true }}
  onError={(err) => console.error(err)}
>
  {/* インライン埋め込み */}
  <ChatPanel className="h-[600px]" />
</AgentChatProvider>
```

**ヘッドレス（UIなし、APIクライアントのみ）:**
```typescript
import { AgentChatClient } from '@tachyon-apps/agent-chat'

const client = new AgentChatClient({
  apiBaseUrl: 'http://localhost:50054',
  accessToken: token,
  tenantId: 'tn_01hjryxysgey07h5jz5wagqj0m',
})

const room = await client.createChatRoom('My Chat')
const stream = client.executeAgent(room.id, { task: '最近の注文を表示して' })
for await (const chunk of stream) {
  console.log(chunk)
}
```

### 機能要件

1. **`FloatingChatPanel` コンポーネント**
   - 画面右下にチャットアイコンを表示
   - クリックでチャットパネルがスライドイン（オーバーレイ表示）
   - パネルの開閉状態はローカルストレージで永続化
   - パネルの高さはドラッグでリサイズ可能
   - キーボードショートカット対応（`Cmd/Ctrl + K` でトグル等）

2. **`ChatPanel` コンポーネント**
   - インライン埋め込み用のパネル
   - 幅・高さはホスト側で制御
   - AI Studio のフルページチャットもこれで構成

3. **コンテキスト認識**
   - `AgentChatProvider` の `context` prop でページコンテキストを指定
   - コンテキストに応じたシステムプロンプトを自動付与
   - ユーザーにコンテキスト情報を表示

4. **全API操作**
   - エージェントが利用可能なツール（API）を全て公開
   - `toolAccess` prop で利用可能なツールカテゴリを制御
   - 主要API操作カテゴリ:
     - 認証・権限管理（auth）
     - テナント管理（tenants）
     - LLM/エージェント操作（llms, agents）
     - 注文・決済（orders, payment）
     - カタログ・プロダクト（catalog）
     - CRM（crm, hubspot連携）
     - コンテンツ管理（cms）
     - 在庫管理（stockmind）
     - IAC設定管理（iac）
     - Feature Flag管理
     - ライブラリ管理（library）

5. **チャット履歴**
   - チャット履歴はテナント・ユーザー単位で永続化（既存の chatroom API を活用）
   - 画面遷移してもチャット状態を維持
   - 過去の会話に戻れる

6. **ストリーミング表示**
   - SSE ベースのリアルタイムストリーミング
   - Thinking / Tool Call / Tool Result / Assistant の各チャンクを表示
   - Sub-agent の実行状態も表示

### 非機能要件

- **パフォーマンス**: チャットパネルは `React.lazy` + `Suspense` で遅延ロード。メインコンテンツの描画をブロックしない
- **バンドルサイズ**: Tree-shaking 対応。ヘッドレスで使う場合は UI コンポーネントが含まれない
- **セキュリティ**: SDK 側では認証トークンを保持しない。ホスト側から注入する設計
- **テスタビリティ**: Storybook で全コンポーネントのビジュアルテスト。API クライアントはモック可能
- **拡張性**: 新しいAPIが追加された場合、バックエンド側でツール定義を追加するだけでエージェントが使えるようにする

### `AgentChatConfig` 型定義

```typescript
interface AgentChatConfig {
  // 必須
  apiBaseUrl: string          // tachyon-api の URL
  accessToken: string         // Bearer トークン
  tenantId: string            // オペレーター ID (tn_xxx)

  // オプション
  userId?: string             // ユーザー ID（未指定時はサーバー側でセッションから解決）
  defaultModel?: string       // デフォルト LLM モデル
  context?: {                 // ページコンテキスト
    page: string              // ページ識別子
    hint?: string             // エージェントへのヒント
    data?: Record<string, unknown>  // 追加コンテキストデータ
  }
  toolAccess?: {              // ツールアクセス制御
    filesystem?: boolean
    command?: boolean
    coding_agent_job?: boolean
    agent_protocol?: boolean
    web_search?: boolean
    url_fetch?: boolean
    sub_agent?: boolean
  }
  theme?: 'light' | 'dark' | 'system'  // テーマ
  locale?: string             // ロケール（'ja' | 'en'）
  onError?: (error: Error) => void      // エラーハンドラ
  onMessage?: (message: ChatMessage) => void  // メッセージコールバック
}
```

## 実装方針

### アーキテクチャ設計

```
┌─────────────────────────────────────────────────────────┐
│  @tachyon-apps/agent-chat (SDK パッケージ)               │
│                                                         │
│  ┌─────────────────┐  ┌────────────────┐  ┌──────────┐ │
│  │ UI Components   │  │ React Hooks    │  │ API      │ │
│  │ FloatingPanel    │  │ useAgentChat   │  │ Client   │ │
│  │ ChatPanel       │  │ useAgentStream │  │ chatroom │ │
│  │ MessageList     │  │ useChatRoom    │  │ agent    │ │
│  │ ChatInput       │  │                │  │ stream   │ │
│  └────────┬────────┘  └───────┬────────┘  └────┬─────┘ │
│           │                   │                 │       │
│  ┌────────▼───────────────────▼─────────────────▼─────┐ │
│  │  AgentChatProvider (React Context)                  │ │
│  │  config: { apiBaseUrl, accessToken, tenantId, ... } │ │
│  └─────────────────────────┬───────────────────────────┘ │
└────────────────────────────┼─────────────────────────────┘
                             │ REST API (SSE streaming)
┌────────────────────────────▼─────────────────────────────┐
│  tachyon-api (既存・変更不要)                              │
│  ├ /v1/llms/chatrooms/*                                  │
│  ├ /v1/llms/sessions/*/agent/execute                     │
│  ├ /v1/llms/models                                       │
│  └ /v1/agent/tool-jobs/*                                 │
└──────────────────────────────────────────────────────────┘
```

### 技術選定

| 要素 | 選定 | 理由 |
|------|------|------|
| パッケージ構成 | `packages/agent-chat` 新規パッケージ | `packages/ui` は基本UIコンポーネント、チャットは独立SDKとして分離 |
| ビルド | Vite ライブラリモード（ES/CJS）| `@tachyon-apps/react` と同じ構成。Tree-shaking 対応 |
| 型定義 | `vite-plugin-dts` | `@tachyon-apps/react` と同じ。`.d.ts` 自動生成 |
| UIベース | Tailwind CSS + Radix UI | 既存プロダクトと一貫したスタイル |
| 状態管理 | React Context + `useReducer` | 外部依存なし。軽量 |
| ストリーミング | `EventSource` (SSE) | 既存の `useAgentStream` を移植 |
| テスト | Vitest + Storybook + Playwright | ユニット、ビジュアル、E2E の3層 |

### 既存コードからの移植マッピング

| 移植元（tachyon） | 移植先（SDK） | 備考 |
|-------------------|--------------|------|
| `src/lib/agent-api.ts` | `src/client/agent-api.ts` | 認証をコンストラクタ注入に変更 |
| `src/lib/llms-api.ts` | `src/client/chatroom-api.ts` | 同上 |
| `src/hooks/useAgentStream.ts` | `src/hooks/useAgentStream.ts` | ほぼそのまま移植 |
| `ai/agent/chat/client.tsx` | `src/components/ChatPanel.tsx` | 独立コンポーネントとして再構成 |
| `ai/components/agent/AgentStream.tsx` | `src/components/StreamingRenderer.tsx` | 同上 |
| `ai/components/agent/ChatInput.tsx` | `src/components/ChatInput.tsx` | 同上 |
| `ai/components/model-selector.tsx` | `src/components/ModelSelector.tsx` | 同上 |

## タスク分解

### Phase 1: SDK パッケージ基盤の構築 📝
- [ ] `packages/agent-chat/` ディレクトリ作成
- [ ] `package.json` 設定（`@tachyon-apps/agent-chat`、peerDependencies: react 18-19）
- [ ] Vite ライブラリビルド設定（`@tachyon-apps/react` の `vite.config.ts` を参考）
- [ ] `tsconfig.json` 設定
- [ ] Yarn workspace への登録確認

### Phase 2: API クライアントの移植 📝
- [ ] `AgentChatClient` クラスの実装（認証コンストラクタ注入）
- [ ] `chatroom-api.ts` の移植（createChatRoom, getChatrooms, deleteChatroom 等）
- [ ] `agent-api.ts` の移植（executeAgent, getMessages, getStatus 等）
- [ ] `types.ts`（AgentChunk, ChatRoom, ChatMessage 等の型定義）
- [ ] SSE ストリーミングの抽象化（AsyncIterator ベース）
- [ ] ユニットテスト

### Phase 3: React フックの移植 📝
- [ ] `useAgentStream` の移植（SSE パース、チャンク処理）
- [ ] `useAgentChat` メインフック（チャット状態管理、送信、履歴）
- [ ] `useChatRoom` フック（チャットルーム CRUD）
- [ ] `useChatPersistence` フック（ローカルストレージ永続化）
- [ ] `AgentChatProvider` コンテキスト実装
- [ ] フックのユニットテスト

### Phase 4: UI コンポーネントの実装 📝
- [ ] `MessageBubble` / `MessageList` コンポーネント
- [ ] `ChatInput` コンポーネント（入力、送信、Shift+Enter 対応）
- [ ] `StreamingRenderer` / `ThinkingIndicator` / `ToolCallDisplay`
- [ ] `ModelSelector` コンポーネント
- [ ] `ChatPanel`（インライン埋め込み用）
- [ ] `FloatingChatPanel`（フローティングオーバーレイ、開閉、リサイズ）
- [ ] `AgentChat`（メインエントリコンポーネント）
- [ ] Tailwind スタイリング
- [ ] Storybook ストーリー作成

### Phase 5: tachyon への統合・既存チャット置き換え 📝
- [ ] tachyon の依存に `@tachyon-apps/agent-chat` を追加
- [ ] AI Studio の既存チャットページを SDK コンポーネントで置き換え
- [ ] `v1beta/[tenant_id]/layout.tsx` に `AgentChatProvider` + `FloatingChatPanel` を追加
- [ ] コンテキスト認識ロジック（URLパス → context prop マッピング）
- [ ] 既存 AI Studio チャットの動作確認（機能後退なし）
- [ ] tachyon 全画面でのフローティングパネル動作確認

### Phase 6: 他プロダクトへの展開 📝
- [ ] library アプリへの統合
- [ ] aichat アプリへの統合
- [ ] bakuure-ui / bakuure-admin-ui への統合
- [ ] その他プロダクト（stockmind, cms, agent-app, airsales, prosales, web）への統合
- [ ] 各プロダクト固有のコンテキスト設定

### Phase 7: 全API操作の充実 📝
- [ ] 各コンテキスト用ツール定義（auth, tenants, catalog, payment, crm, etc.）
- [ ] コンテキスト別システムプロンプトの最適化
- [ ] ツール使用状況の分析・改善

## Playwright MCPによる動作確認

### 実施タイミング
- [ ] Phase 4 完了後: Storybook でのコンポーネント確認
- [ ] Phase 5 完了後: tachyon 全画面でのフローティングパネル動作確認
- [ ] Phase 6 完了後: 各プロダクトでの動作確認

### 動作確認チェックリスト

#### SDK コンポーネント（Storybook）
- [ ] `ChatPanel` が単体で正しくレンダリングされる
- [ ] `FloatingChatPanel` の開閉アニメーションが動作する
- [ ] `MessageList` が各メッセージタイプ（user, assistant, tool_call 等）を正しく表示
- [ ] `ChatInput` で入力・送信ができる

#### tachyon 統合
- [ ] チャットアイコンが全画面右下に表示されている
- [ ] クリックでパネルがスライドインする
- [ ] 再度クリックでパネルが閉じる
- [ ] パネル開閉状態がページ遷移後も維持される
- [ ] メインコンテンツの操作がパネルに影響しない
- [ ] テキスト入力・送信ができる
- [ ] エージェントのストリーミング応答が表示される
- [ ] Thinking / Tool Call / Tool Result が適切にレンダリングされる
- [ ] チャット履歴が画面遷移後も維持される
- [ ] AI Studio の既存チャットが引き続き正常動作する

#### クロスプロダクト（Phase 6以降）
- [ ] library アプリでチャットパネルが動作する
- [ ] 各プロダクトで認証が正しく機能する

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| SDK 切り出しによる既存 AI Studio チャット UI の機能後退 | 高 | Phase 5 で既存テストが通ることを確認。Storybook VRT で差分検出 |
| 各プロダクトの認証方式の違い | 中 | `AgentChatProvider` の `accessToken` prop で統一。認証取得はホスト側の責務 |
| バンドルサイズの肥大化 | 中 | Vite の tree-shaking 対応。UI/Client/Hooks を個別 import 可能に |
| Tailwind CSS の設定衝突 | 中 | SDK 側は `agent-chat-` プレフィックス付きクラスを使用。または CSS-in-JS を検討 |
| 全APIへのアクセス権限管理 | 高 | 既存のポリシーチェックをそのまま活用。エージェントのAPI呼び出しもユーザー権限で制限 |
| 外部公開時のAPI互換性維持 | 中 | セマンティックバージョニング。Breaking changes は mejar version で管理 |

## 参考資料

### 移植元（既存実装）
- エージェントチャット UI: `apps/tachyon/src/app/v1beta/[tenant_id]/ai/agent/chat/`
- API クライアント: `apps/tachyon/src/lib/agent-api.ts`, `apps/tachyon/src/lib/llms-api.ts`
- ストリーミングフック: `apps/tachyon/src/hooks/useAgentStream.ts`
- UI コンポーネント: `apps/tachyon/src/app/v1beta/[tenant_id]/ai/components/`

### SDK 構成参考
- `@tachyon-apps/react`: `packages/react/` (Vite ライブラリビルド、peerDependencies パターン)

### バックエンド
- LLMs REST API: `packages/llms/src/adapter/axum/`
- ルーター統合: `apps/tachyon-api/src/router.rs`

## 完了条件

- [ ] `@tachyon-apps/agent-chat` SDK パッケージが `packages/agent-chat/` に存在する
- [ ] `FloatingChatPanel` / `ChatPanel` / `AgentChatProvider` がエクスポートされている
- [ ] ヘッドレス利用（`AgentChatClient`）が可能
- [ ] Storybook ストーリーが存在し、ビジュアルテストが通る
- [ ] tachyon の既存 AI Studio チャットが SDK コンポーネントで動作する
- [ ] tachyon 全画面にフローティングチャットパネルが表示される
- [ ] 少なくとも 1つの他プロダクト（library）でもチャットパネルが動作する
- [ ] エージェントが全APIを操作できる
- [ ] 動作確認レポートが完成している

### バージョン番号の決定基準

- [x] **マイナーバージョン（x.X.x）を上げる**: 新規SDKパッケージ追加 + 全プロダクトへの機能追加

## 備考

- **バックエンドは変更不要**: tachyon-api は既にチャットルーム・エージェント実行の全APIが揃っている。本タスクはフロントエンドSDKの切り出しと統合が主な作業。
- **段階的な外部公開**: 初期はモノレポ内部利用。将来的にnpm publishで外部公開する場合は、APIクライアントの認証周りとドキュメントを整備する。
- **UI拡張の余地**: 将来的にチャットパネル内でのウィジェット表示（テーブル、グラフ、フォーム等）をサポートするが、本タスクのスコープ外。
- **`packages/ui` との棲み分け**: `packages/ui` は汎用UIプリミティブ（Button, Input, Dialog 等）。`packages/agent-chat` はエージェントチャット特化のドメインSDK。依存関係は `agent-chat → ui` の方向。
