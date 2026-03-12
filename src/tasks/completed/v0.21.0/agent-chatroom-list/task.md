---
title: "Agentチャットルーム一覧画面の実装"
type: feature
emoji: "🗂️"
topics:
  - Agent
  - Chatroom
  - Frontend
published: true
targetFiles:
  - apps/tachyon/src/app/v1beta/[tenant_id]/ai/chat
  - apps/tachyon/src/components/agent
  - apps/tachyon/src/lib/agent-api.ts
  - apps/tachyon/src/app/v1beta/[tenant_id]/ai/agent/chatrooms
github: ""
---

# Agentチャットルーム一覧画面の実装

## 概要

TachyonアプリのエージェントUIにチャットルーム履歴を一覧表示する画面を追加し、過去の会話へのアクセスを容易にする。既存の`/v1beta/[tenant_id]/ai/chat/[chatroom_id]`ページへ遷移する前段として、チャットルームの概要と更新情報を確認できるリストを提供する。

## 背景・目的

- Agentチャットが単一画面のみのため履歴の俯瞰が困難。
- 過去チャットを探しづらく、同名チャットが増えるとUXが低下する。
- 一覧画面により、チャット再開・新規作成を明示的に案内し、将来的なフィルタや検索拡張の足場とする。

## 詳細仕様

### 機能要件

1. `/v1beta/[tenant_id]/ai/agent/chatrooms` 配下にチャットルーム一覧ページを追加する。
2. `apps/tachyon/src/app/v1beta/[tenant_id]/ai/chat/api.ts` の `getChatrooms` を用いて一覧を表示する。
3. 各チャットルームには名称、最終更新日時（存在する場合）、最後のメッセージ要約を表示する。
4. チャットルームをクリックすると`/v1beta/[tenant_id]/ai/agent/chat?r=<chatroom_id>`に遷移する。
5. 一覧上部に新規チャット作成導線を設置し、作成後は`/v1beta/[tenant_id]/ai/agent/chat?r=<chatroom_id>`へ遷移する。
6. データ取得中はSkeletonを表示し、API失敗時にはエラーメッセージと再試行ボタンを表示する。
7. 一覧アイテムからチャットルーム名を変更できるようにし、更新後は一覧を再取得して最新状態を反映する。
8. 一覧アイテムからチャットルームを削除できるようにし、削除後は一覧を再取得してページングを調整する。

### 非機能要件

- Client Component か Server Component + Client部品のハイブリッドにするかは既存`chat-list.tsx`を踏襲し、SWRとReact Hooksを利用する。
- ダークモード対応クラスを既存のShadcn UIパターンと揃える。
- レイアウトはレスポンシブ対応。768px未満では各要素を縦に並べ、主要情報が折り返しても読めるようにする。
- 多言語対応（en/ja）を行い、文言は既存の翻訳辞書に追加する。

### コンテキスト別の責務

```yaml
contexts:
  frontend:
    description: "Tachyon Agent UI (Next.js)"
    responsibilities:
      - チャットルーム一覧ページの表示
      - APIクライアント経由のデータ取得とキャッシュ
      - ユーザー操作（再読込・新規作成・遷移）
  llms-api:
    description: "チャットルーム一覧API"
    responsibilities:
      - 既存のGET /v1/llms/chatroomsエンドポイントを提供
      - 一覧情報（name, created_at, operator_id, owner_id）を返却
```

### 仕様のYAML定義

```yaml
ui:
  page: "/v1beta/[tenant_id]/ai/agent/chatrooms"
  sections:
    - id: "header"
      elements:
        - type: "title"
          value: "Agent Chatrooms"
        - type: "description"
          value: "過去のエージェント会話を一覧し、必要に応じて再開・作成する。"
        - type: "actions"
          items:
            - label: "新規チャット"
              action: "create_chatroom_then_redirect"
            - label: "再読み込み"
              action: "refetch_chatrooms"
    - id: "list"
      item:
        fields:
          - id: "name"
            type: "text"
          - id: "actions"
            type: "menu"
          - id: "updatedAt"
            type: "datetime"
            optional: true
          - id: "lastMessage"
            type: "text"
            optional: true
        interactions:
          - type: "navigate"
            to: "/agent/chat?r={chatroom_id}"
          - type: "rename"
            action: "update_chatroom_name"
          - type: "delete"
            action: "delete_chatroom"
```

## 実装方針

### アーキテクチャ設計

- 既存の `ChatList` コンポーネント構造（`apps/tachyon/src/app/v1beta/[tenant_id]/ai/chat/components/chat-list.tsx`）を参照しながら新ページに再配置。
- UIコンポーネントは `apps/tachyon` 側のShadcn UI実装（`@/components/ui`）を活用。
- 新規チャット作成は `apps/tachyon/src/app/v1beta/[tenant_id]/ai/chat/api.ts` の `createChatroom`（必要に応じ追加）経由で実行し、成功後に Router で遷移。
- チャットルーム名変更／削除は `llms-api-extended` にAPIクライアントを追加し、一覧側でSWRの再検証を行う。

### 技術選定

- React + Next.js (App Router)
- SWR（既存UIでも利用）
- date-fns（tachyon内で既に依存済み）で日付フォーマット
- Tailwind CSSユーティリティクラス

### TDD（テスト駆動開発）戦略

#### 既存動作の保証
- 既存の詳細画面（`[chatroom_id]/page.tsx`）に影響がないことを手動確認。
- `getChatrooms` は tachyon フロント側の API wrapper を利用し、既存の GraphQL / REST 呼び出しに合わせる。

#### テストファーストアプローチ
- 初期段階ではSmokeテストを優先し、必要に応じてStorybook/Test Runnerを追加する。
- `useSWR`周りのハンドリングはE2E動作確認で担保。

#### 継続的検証
- `mise run check` / `mise run ci-node` を実行し回帰を検知。
- Playwright MCPでレンダリング結果を確認する。

## タスク分解

### 主要タスク
- [x] 要件定義の明確化
- [x] 技術調査・検証
- [x] 実装
- [ ] テスト・品質確認
- [ ] ドキュメント更新

## Playwright MCPによる動作確認

### 実施タイミング
- [ ] 実装完了後の初回動作確認
- [ ] PRレビュー前の最終確認
- [ ] バグ修正後の再確認

### 動作確認チェックリスト
- [ ] `/agent/chatrooms`が正しくレンダリングされる
- [ ] APIレスポンスに応じてリスト項目が表示される
- [ ] エラー時の再試行ボタンが機能する
- [ ] 新規チャット作成からチャット画面遷移が成功する
- [ ] リスト項目クリックで該当チャット画面へ遷移できる
