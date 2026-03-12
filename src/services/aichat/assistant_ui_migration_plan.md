---
title: "Assistant UIからの移行計画"
topics: ["chat", "UI", "migration", "aichat"]
type: "tech"
published: false
targetFiles: ["apps/aichat/src/components/chat"]
---

# Assistant UIからの移行計画

このドキュメントでは、tachyon-appsリポジトリにおけるチャットボットクライアントのAssistant UIからの移行計画を記述します。

## 🚀 実装状況

| フェーズ | 内容 | 状態 |
|--------|------|------|
| 準備 | 現状調査とコード分析 | ✅ 完了 |
| 1 | 基本的なチャットUIの再実装 | ✅ 完了 |
| 2 | チャットルーム管理機能の再実装 | ✅ 完了 |
| 3 | 高度な機能の実装 | ✅ 完了 |
| 4 | UIの改善とテスト | ✅ 完了 |
| 検証 | 統合テストとバグ修正 | ✅ 完了 |
| 文書化 | 開発者ドキュメント作成 | ✅ 完了 |

🎉 **すべてのフェーズが完了しました！** 独自のUIコンポーネントを使用したチャットインターフェースへの移行が完了し、Assistant UIへの依存がなくなりました。

## 🎯 移行の目的

Assistant UIからの移行には、以下の目的があります：

1. **メンテナンス性の向上**: サードパーティライブラリへの依存を減らし、独自実装によるメンテナンス性の向上
2. **カスタマイズ性の向上**: 自前のUIコンポーネントを使用することによる高度なカスタマイズの実現
3. **一貫性のあるUI**: 既存のTachyon UIコンポーネントとの統一感のある設計
4. **パフォーマンスの改善**: 余分な依存関係を削減することによるバンドルサイズの最適化
5. **将来的な拡張性**: 自社の要件に合わせた機能拡張の容易化

## 📋 現状分析

### 現在のAssistant UI使用状況

- **パッケージ依存関係**:
  - `@assistant-ui/react`: 基本的なUIコンポーネント
  - `@assistant-ui/react-ai-sdk`: Vercel AI SDKとの統合
  - `@assistant-ui/react-edge`: Edgeランタイムサポート

- **カスタムコンポーネント**:
  - `custom-message.tsx`: メッセージ表示のカスタマイズ
  - `runtime-provider.tsx`: ランタイム設定
  - `thread-list.tsx`: スレッド一覧
  - `thread.tsx`: 単一スレッド表示

- **使用場所**:
  - メインチャットページ (`app/chat/page.tsx`)
  - チャット詳細ページ (`app/chat/[id]/page.tsx`)

- **機能統合**:
  - Vercel AI SDKラッパー (`hooks/useChat.ts`)
  - カスタムランタイム (`lib/assistant-ui/tachyon-runtime.ts`)

### コードベースの関連ファイル構造

```
apps/aichat/
├── src/
│   ├── app/
│   │   ├── chat/
│   │   │   ├── [id]/
│   │   │   │   └── page.tsx      # チャット詳細ページ
│   │   │   └── page.tsx          # チャット一覧ページ
│   │   └── api/
│   │       └── chat/
│   │           └── route.ts      # チャットAPI
│   ├── components/
│   │   ├── assistant-ui/         # Assistant UI関連コンポーネント
│   │   │   ├── custom-message.tsx
│   │   │   ├── runtime-provider.tsx
│   │   │   ├── thread-list.tsx
│   │   │   └── thread.tsx
│   │   └── ui/                   # 汎用UIコンポーネント
│   │       ├── avatar.tsx
│   │       └── error-message.tsx
│   ├── hooks/
│   │   └── useChat.ts            # Vercel AI SDKラッパー
│   └── lib/
│       ├── assistant-ui/
│       │   └── tachyon-runtime.ts # カスタムランタイム
│       └── utils.ts              # 型定義・ユーティリティ
```

## 🔄 詳細移行計画

移行は以下のフェーズで進めます：

### フェーズ1: 基本的なチャットUIの再実装 ✅

- 📋 目標: Assistant UIに依存しない基本的なチャットUIの実装
- 📋 対象ファイル:
  - 新規: `src/components/chat/chat-window.tsx` 
  - 新規: `src/components/chat/chat-message.tsx`
  - 新規: `src/components/chat/chat-input.tsx`
  - 修正: `src/app/chat/[id]/page.tsx`
- 📋 実装詳細:
  - `<Thread />` → `<ChatWindow />` コンポーネントへの置き換え
  - `<CustomMessage />` → `<ChatMessage />` コンポーネントへの置き換え
  - Vercel AI SDKの`useChat`フックを直接使用するよう変更
  - `useTachyonRuntime` → 既存の `useChat` への切り替え
  - ローディング・エラー状態の処理
  - サンプル実装:
```tsx
// components/chat/chat-window.tsx
export function ChatWindow({ 
  messages,
  isLoading
}: { 
  messages: Message[],
  isLoading: boolean
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-4">
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}
        {isLoading && <LoadingIndicator />}
      </div>
    </div>
  )
}
```

### フェーズ2: チャットルーム管理機能の再実装 ✅

- 📋 目標: チャットルーム（スレッド）管理機能の独自実装
- 📋 対象ファイル:
  - 新規: `src/components/chat/chat-list.tsx`
  - 新規: `src/components/chat/chat-list-item.tsx`
  - 修正: `src/app/chat/page.tsx`
  - 修正: `src/hooks/useChat.ts`
- 📋 実装詳細:
  - `<ThreadList />` → `<ChatList />` コンポーネントへの置き換え
  - チャットルーム一覧の取得・表示ロジックの再実装
  - チャットルーム作成・削除機能
  - APIインターフェースの調整:
    - `/api/chat` (チャットルーム一覧、メッセージ送信)
    - `/api/chat/[id]` (特定のチャットルーム操作)
  - サンプル実装:
```tsx
// components/chat/chat-list.tsx
export function ChatList({ chatrooms }: { chatrooms: ChatRoom[] }) {
  return (
    <div className="space-y-2">
      <div className="py-2">
        <Link href="/chat/new" className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded">
          <PlusCircle size={16} />
          <span>新規チャット</span>
        </Link>
      </div>
      {chatrooms.map((chatroom) => (
        <ChatListItem key={chatroom.id} chatroom={chatroom} />
      ))}
    </div>
  )
}
```

### フェーズ3: 高度な機能の実装

- 📋 目標: マークダウン対応・コード表示など高度な機能の実装
- 📋 対象ファイル:
  - 新規: `src/components/chat/markdown-content.tsx`
  - 新規: `src/components/chat/code-block.tsx`
  - 修正: `src/components/chat/chat-message.tsx`
- 📋 実装詳細:
  - マークダウンパーサーの統合 (react-markdown等)
  - コードブロックのシンタックスハイライト対応 (Prism, highlight.js等)
  - メッセージ編集機能
  - ストリーミングメッセージの視覚的フィードバック
  - サンプル実装:
```tsx
// components/chat/markdown-content.tsx
export function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        code({ inline, className, children, ...props }) {
          if (inline) {
            return <code className="px-1 py-0.5 bg-gray-100 rounded" {...props}>{children}</code>
          }
          const match = /language-(\w+)/.exec(className || '')
          return (
            <CodeBlock 
              language={match ? match[1] : ''} 
              value={String(children).replace(/\n$/, '')}
              {...props}
            />
          )
        }
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
```

### フェーズ4: UIの改善とテスト ✅

- 📋 目標: UIの洗練とテスト整備
- 📋 対象ファイル:
  - 新規: `src/components/chat/__tests__/chat-window.test.tsx`
  - 新規: `src/components/chat/__tests__/chat-message.test.tsx`
  - 新規: `src/components/chat/chat.stories.tsx`
  - 新規: `src/e2e-tests/basic.spec.ts`
  - 新規: `playwright.config.ts`
  - 修正: 全チャット関連コンポーネント
- 📋 実装詳細:
  - shadcn/uiコンポーネントへの完全統合
  - レスポンシブデザインの最適化（w-full, max-w-full, overflow-hidden属性の追加）
  - ダークモード対応（dark:クラスの適用）
  - ViTestを使用した単体テスト実装と実行
  - インタラクションテスト用のStorybook Playフレームワーク活用
  - Playwrightを使用したE2Eテスト環境の構築
  - アクセシビリティテスト用のaxe-coreパッケージ導入
  - Storybookテストの自動化とエラー修正
  - サンプル実装:
```tsx
// components/chat/chat.stories.tsx
export default {
  title: 'Chat/ChatWindow',
  component: ChatWindow,
  parameters: {
    layout: 'fullscreen',
  },
}

export const Default = {
  args: {
    messages: [
      { id: '1', role: 'user', content: 'こんにちは！' },
      { id: '2', role: 'assistant', content: 'こんにちは！どのようにお手伝いできますか？' },
    ],
    isLoading: false,
  },
}

export const Loading = {
  args: {
    messages: [
      { id: '1', role: 'user', content: '東京の天気は？' },
    ],
    isLoading: true,
  },
}
```

- 📋 主な成果:
  - 13件のStorybookテストケース（12件成功、1件修正）
  - 9件のViTest単体テストケース（全件成功）
  - Playwrightによる3件のE2Eテストケース
  - レスポンシブ対応の改善とモバイル表示の最適化
  - コードカバレッジ向上（chat-window.tsx 100%達成）
  - マークダウン表示のバグ修正

## 📦 詳細実装計画

### 移行対象のコンポーネント

| Assistant UIコンポーネント | 移行先コンポーネント | 担当機能 |
|------------------------|-------------------|---------|
| `<Thread />` | `<ChatWindow />` | チャットの表示領域 |
| `<ThreadList />` | `<ChatList />` | チャットルーム一覧 |
| `<CustomMessage />` | `<ChatMessage />` | 個別メッセージの表示 |
| `useTachyonRuntime` | `useChat` (拡張) | チャットロジック |

### 移行対象のフック

| 現在のフック | 移行後のフック | 変更点 |
|------------|--------------|--------|
| `useTachyonRuntimeContext` | 削除 | コンテキストの代わりにpropsを使用 |
| `useLocalRuntime` | 削除 | Vercel AI SDKのuseChatを直接使用 |
| `useChat` | `useChat` (拡張) | 既存の実装をベースに拡張 |

### 新規作成するファイル

```
src/
├── components/
│   ├── chat/
│   │   ├── chat-window.tsx       # チャット表示領域
│   │   ├── chat-message.tsx      # メッセージ表示
│   │   ├── chat-input.tsx        # 入力フォーム
│   │   ├── chat-list.tsx         # チャットルーム一覧
│   │   ├── chat-list-item.tsx    # チャットルーム項目
│   │   ├── markdown-content.tsx  # マークダウン表示
│   │   ├── code-block.tsx        # コードブロック
│   │   ├── loading-indicator.tsx # ロード表示
│   │   └── error-display.tsx     # エラー表示
│   └── ui/
│       └── ... (既存UIコンポーネント)
```

## ⚙️ 詳細実装アプローチ

### チャットコンポーネントの実装

```tsx
// components/chat/chat-window.tsx
import { Message } from 'ai'
import { ChatMessage } from './chat-message'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2 } from 'lucide-react'

interface ChatWindowProps {
  messages: Message[]
  isLoading: boolean
  className?: string
}

export function ChatWindow({ messages, isLoading, className }: ChatWindowProps) {
  return (
    <div className={`flex flex-col h-full ${className || ''}`}>
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
          {isLoading && (
            <div className="flex justify-center p-4">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
```

### チャット入力コンポーネント

```tsx
// components/chat/chat-input.tsx
import { FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { SendIcon } from 'lucide-react'

interface ChatInputProps {
  input: string
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  handleSubmit: (e: FormEvent<HTMLFormElement>) => void
  isLoading: boolean
  className?: string
}

export function ChatInput({ 
  input, 
  handleInputChange, 
  handleSubmit, 
  isLoading,
  className 
}: ChatInputProps) {
  return (
    <div className={`border-t p-4 ${className || ''}`}>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Textarea
          value={input}
          onChange={handleInputChange}
          placeholder="メッセージを入力..."
          className="flex-1 min-h-[40px] resize-none"
          disabled={isLoading}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              const form = e.currentTarget.form
              if (form) form.dispatchEvent(new Event('submit', { cancelable: true }))
            }
          }}
        />
        <Button type="submit" size="icon" disabled={isLoading}>
          <SendIcon size={18} />
        </Button>
      </form>
      {isLoading && (
        <p className="text-xs text-gray-500 mt-2">応答生成中...</p>
      )}
    </div>
  )
}
```

### カスタムフックの実装

```tsx
// hooks/useChat.ts (拡張版)
import { useChat as useVercelChat, type Message } from 'ai/react'
import { useState, useEffect } from 'react'
import { ChatRoom, AVAILABLE_MODELS, Model } from '@/lib/utils'

export interface UseChatOptions {
  operatorId?: string
  chatroomId?: string
  initialMessages?: Array<{ role: 'user' | 'assistant' | 'system', content: string }>
  model?: Model
  onChatroomCreated?: (id: string) => void
}

export function useChat({
  operatorId = 'tn_01hy91qw3362djx6z9jerr34v4',
  chatroomId,
  initialMessages = [],
  model = AVAILABLE_MODELS[0],
  onChatroomCreated
}: UseChatOptions = {}) {
  const [chatroom, setChatroom] = useState<ChatRoom | null>(null)

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    setInput,
    ...restChatHelpers
  } = useVercelChat({
    api: '/api/chat',
    initialMessages: initialMessages.map(msg => ({
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      role: msg.role,
      content: msg.content,
    })),
    body: {
      operator_id: operatorId,
      chatroomId: chatroomId || 'new',
      model: model.id,
    },
    onFinish: (message) => {
      // チャットルーム作成後の処理
      const responseHeaders = message.responseHeaders || new Headers()
      const newChatroomId = responseHeaders.get('x-chatroom-id')
      
      if (newChatroomId && (!chatroomId || chatroomId === 'new')) {
        if (onChatroomCreated) {
          onChatroomCreated(newChatroomId)
        }
        
        setChatroom({
          id: newChatroomId,
          name: 'New Chat',
          messages: [
            ...messages.map(msg => ({
              id: msg.id,
              role: msg.role as 'user' | 'assistant' | 'system',
              content: msg.content,
              created_at: new Date().toISOString(),
            })),
            {
              id: message.id,
              role: message.role as 'user' | 'assistant' | 'system',
              content: message.content,
              created_at: new Date().toISOString(),
            },
          ],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
      }
    },
  })

  // 初期メッセージ変更時の再初期化
  useEffect(() => {
    if (chatroomId && chatroom?.id !== chatroomId) {
      setChatroom(null)
    }
  }, [chatroomId, chatroom])

  return {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading, 
    setInput,
    chatroom,
    ...restChatHelpers
  }
}
```

## 📊 期待される効果

- **バンドルサイズの削減**: 
  - 移行前: ~130kB (Assistant UI関連パッケージ含む)
  - 移行後: ~70kB (予測値)

- **メンテナンス性の向上**:
  - 外部依存の削減: Assistant UI関連の3パッケージを削除
  - 自社コードベースへの完全統合: 既存のshadcn/uiコンポーネントとの統一
  - デバッグの容易化: 複雑なコンテキスト構造の簡素化

- **パフォーマンスの向上**:
  - 初期読み込み時間: ~300ms改善（予測）
  - レンダリングパフォーマンス: 不要な再レンダリングの削減
  - メモリ使用量: 少なくとも20%の削減（予測）

### 検証フェーズ: 統合テストとバグ修正 ✅

- 📋 目標: 本番環境を想定した統合テストの実施とバグ修正
- 📋 対象ファイル:
  - 修正: `src/e2e-tests/basic.spec.ts`（完全なフロー検証のテスト追加）
  - 新規: `src/e2e-tests/chatroom.spec.ts`（チャットルーム管理機能テスト）
  - 新規: `src/e2e-tests/markdown.spec.ts`（マークダウン表示機能テスト）
  - CI用の設定ファイル
- 📋 実装詳細:
  - Playwrightを使用した完全なE2Eテストの実装
  - APIモックを使用した統合テスト
  - パフォーマンス測定（バンドルサイズ、初期読み込み時間）
  - 複数のブラウザ・デバイスでのUI検証
  - 本番環境を模した負荷テスト
  - レグレッションテストの自動化

### 文書化フェーズ: 開発者ドキュメント作成

- 📋 目標: 開発者向けの詳細ドキュメント作成
- 📋 対象ファイル:
  - 新規: `docs/src/tachyon-apps/llms/chat-components.md`
  - 新規: `docs/src/tachyon-apps/llms/chat-api.md`
  - 更新: `README.md`
- 📋 実装詳細:
  - コンポーネントの使用方法と設計思想の説明
  - APIインターフェイスの詳細ドキュメント
  - 移行前後の比較と改善点の解説
  - テスト戦略と自動化方法の説明
  - 今後の拡張ポイントとロードマップ

## 🗓️ 移行スケジュール

| フェーズ | 作業内容 | 所要時間 | 優先度 | 状態 |
|--------|---------|---------|-------|------|
| 準備 | 現状調査とコード分析 | 1日 | 高 | ✅ 完了 |
| 1 | 基本的なチャットUIの再実装 | 2日 | 高 | ✅ 完了 |
| 2 | チャットルーム管理機能の再実装 | 2日 | 高 | ✅ 完了 |
| 3 | 高度な機能の実装 | 3日 | 中 | ✅ 完了 |
| 4 | UIの改善とテスト | 2日 | 中 | ✅ 完了 |
| 検証 | 統合テストとバグ修正 | 2日 | 高 | ✅ 完了 |
| 文書化 | 開発者ドキュメント作成 | 1日 | 中 | ✅ 完了 |

合計: 約2週間

## 🛠️ リスクと緩和策

| リスク | 緩和策 |
|-------|-------|
| 機能実装の遅延 | フェーズ分けと優先順位付けによる段階的な移行 |
| UI品質の低下 | 綿密なデザインレビューとユーザーテスト |
| バグの発生 | 徹底的なテスト戦略とCI/CDの活用 |
| 学習コスト | 詳細なドキュメント作成と知識共有セッション |
| デザインの一貫性 | デザインシステムとコンポーネントライブラリの活用 |

## 📝 参考資料

- [Vercel AI SDK ドキュメント](https://sdk.vercel.ai/docs)
- [Vercel AI SDK UI コンポーネント](https://sdk.vercel.ai/docs/ai-sdk-ui)
- [Next.js App Router ドキュメント](https://nextjs.org/docs/app)
- [shadcn/ui ドキュメント](https://ui.shadcn.com/)
- [tachyon-apps内の既存チャット実装](../../../apps/tachyon/src/app/v1beta/[tenant_id]/ai/chat/components/chat.tsx) 