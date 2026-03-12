---
title: "チャットコンポーネントドキュメント"
topics: ["chat", "UI", "components", "aichat"]
type: "tech"
published: true
targetFiles: ["apps/aichat/src/components/chat"]
---

# チャットコンポーネントドキュメント

このドキュメントでは、Tachyon Appsチャットコンポーネントの使用方法と設計思想について説明します。

## コンポーネント構成

チャットUIは以下のコンポーネントで構成されています：

- `ChatWindow`: チャットメッセージの表示領域
- `ChatMessage`: 個別のメッセージ表示
- `ChatInput`: メッセージ入力フォーム
- `ChatList`: チャットルーム一覧
- `MarkdownContent`: マークダウン表示
- `CodeBlock`: コードブロック表示

## 基本的な使用方法

```tsx
import { useChat } from '@/hooks/useChat'
import { ChatWindow } from '@/components/chat/chat-window'
import { ChatInput } from '@/components/chat/chat-input'

export default function ChatPage() {
  const { 
    messages, 
    input, 
    handleInputChange, 
    handleSubmit, 
    isLoading 
  } = useChat()

  return (
    <div className="flex flex-col h-screen">
      <ChatWindow messages={messages} isLoading={isLoading} />
      <ChatInput
        input={input}
        handleInputChange={handleInputChange}
        handleSubmit={handleSubmit}
        isLoading={isLoading}
      />
    </div>
  )
}
```

## APIインターフェース

### useChat フック

```tsx
interface UseChatOptions {
  operatorId?: string
  chatroomId?: string
  initialMessages?: Array<{ role: 'user' | 'assistant' | 'system', content: string }>
  model?: Model
  onChatroomCreated?: (id: string) => void
}

function useChat(options?: UseChatOptions): {
  messages: Message[]
  input: string
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  handleSubmit: (e: FormEvent<HTMLFormElement>) => void
  isLoading: boolean
  setInput: (input: string) => void
  chatroom: ChatRoom | null
}
```

### ChatWindow コンポーネント

```tsx
interface ChatWindowProps {
  messages: Message[]
  isLoading: boolean
  className?: string
  title?: string
  onEdit?: (id: string, content: string) => Promise<void>
  onDelete?: (id: string) => Promise<void>
}
```

### ChatInput コンポーネント

```tsx
interface ChatInputProps {
  input: string
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  handleSubmit: (e: FormEvent<HTMLFormElement>) => void
  isLoading: boolean
  className?: string
}
```

## テスト戦略

チャットコンポーネントは以下のテスト戦略に従ってテストされています：

1. **単体テスト**: ViTestによる個別コンポーネントのテスト
2. **インタラクションテスト**: Storybook Play Functionによるコンポーネント操作テスト
3. **E2Eテスト**: Playwrightによる実際のブラウザ環境でのテスト

### テスト実行方法

```bash
# 単体テスト
yarn test --filter=aichat

# インタラクションテスト
yarn build-storybook --filter=aichat
yarn test-storybook:ci --filter=aichat

# E2Eテスト
yarn workspace aichat test:e2e
```

## 移行前後の比較

| 項目 | 移行前（Assistant UI） | 移行後（独自実装） |
|------|----------------------|-----------------|
| バンドルサイズ | ~130kB | ~70kB |
| 初期読み込み時間 | ~800ms | ~500ms |
| メンテナンス性 | 外部依存 | 自社管理 |
| カスタマイズ性 | 制限あり | 高い自由度 |
| UIデザイン | 独自スタイル | shadcn/ui統合 |

## 今後の拡張ポイント

1. **多言語対応**: i18nパッケージを使用した多言語サポート
2. **テーマ切り替え**: ライト/ダークモード以外のカスタムテーマ
3. **AI機能拡張**: ファイルアップロード、画像生成など高度な機能
4. **パフォーマンス最適化**: メッセージの仮想化による大量メッセージの効率的表示
5. **共同編集**: WebSocketを使用したリアルタイムの共同チャット機能 