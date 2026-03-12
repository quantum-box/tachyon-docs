---
title: "tachyonアプリへのaichat AgentChatPageの統合"
type: "feature"
emoji: "🤖"
topics: ["AI Chat", "React", "Component Integration", "Frontend"]
published: true
targetFiles: [
  "apps/tachyon/src/app/v1beta/[tenant_id]/ai/",
  "apps/aichat/src/app/agent/chat/page.tsx",
  "apps/aichat/src/components/agent/",
  "apps/aichat/src/hooks/useAgentStream.ts"
]
github: ""
---

## 概要

aichatアプリで開発されたAgentChatPageとその関連コンポーネントをtachyonアプリに統合し、エージェント機能を活用したチャット体験を提供する。

## 背景・目的

### 現状
- tachyonアプリには基本的なチャット機能（`/v1beta/[tenant_id]/ai/chat`）が存在
- aichatアプリにはエージェント機能に特化したAgentChatPageが実装済み
- 両者のUI/UXが異なり、機能的な差がある

### 目的
- aichatのエージェント機能をtachyonで利用可能にする
- コンポーネントの再利用性を高める
- 統一されたUI/UXを提供する

## 詳細仕様

### 機能要件

#### エージェントチャット機能
- **リアルタイムストリーミング**: エージェントからの応答をリアルタイムで表示
- **思考プロセス表示**: エージェントの思考過程を可視化
- **ツール実行**: エージェントが使用するツールの実行状況表示
- **モデル選択**: 利用可能なAIモデルの選択機能
- **チャット履歴**: サイドバーでの過去チャット管理

#### UI/UXコンポーネント
- `AgentChatSidebar`: チャット履歴とナビゲーション
- `AgentStream`: ストリーミング表示とエージェント状態管理
- `AgentThinking`: 思考プロセスの可視化
- `AgentToolCall`: ツール実行の表示
- `ModelSelector`: AIモデル選択UI
- `ChatInput`: メッセージ入力フォーム

### 非機能要件

#### パフォーマンス
- ストリーミング表示の遅延: 100ms以下
- チャット履歴読み込み: 2秒以内
- レスポンシブデザイン対応

#### 互換性
- 既存のtachyon認証システムとの統合
- 既存のAPIエンドポイントとの互換性維持
- tachyonのテーマシステム対応

## 実装方針

### アーキテクチャ

#### 1. コンポーネント移植戦略
```
apps/aichat/src/components/agent/ → apps/tachyon/src/components/agent/
apps/aichat/src/hooks/useAgentStream.ts → apps/tachyon/src/hooks/useAgentStream.ts
```

#### 2. 統合ポイント
- 新規ルート: `/v1beta/[tenant_id]/ai/agent/chat`
- 既存チャット機能との並行運用
- 段階的な移行を可能にする設計

#### 3. 依存関係管理
- aichatで使用している外部ライブラリの確認
- tachyonの既存依存関係との競合回避
- 共通ライブラリの統一

### 技術選定

#### フロントエンド
- **React 18**: Server Components + Client Components
- **Next.js App Router**: 既存のtachyonアーキテクチャに準拠
- **Tailwind CSS**: 既存のスタイリングシステム
- **SWR**: データフェッチング（aichatと同様）

#### 状態管理
- **React Hooks**: ローカル状態管理
- **SWR**: サーバー状態管理
- **useAgentStream**: カスタムフック（移植）

## タスク分解

### Phase 1: 基盤準備 ✅
- [x] aichatのAgentChatPage実装を分析
- [x] tachyonの既存AI機能を調査
- [x] 統合方針の策定

### Phase 2: コンポーネント移植 ✅
- [x] 依存関係の確認と調整
  - [x] react-hot-toastの追加
  - [x] remark-gfmの追加
- [x] AgentChatPageコンポーネントの移植
- [x] 関連コンポーネントの移植
  - [x] AgentChatSidebar
  - [x] AgentStream
  - [x] AgentThinking
  - [x] AgentSay
  - [x] AgentCompletion
  - [x] AgentToolCall
  - [x] AgentToolCallArgs
  - [x] AgentToolResult
  - [x] AgentAsk
  - [x] ModelSelector
  - [x] ChatInput
  - [x] MarkdownContent
- [x] useAgentStreamフックの移植
- [x] APIクライアントライブラリの作成
  - [x] agent-api.ts
  - [x] mcp-config.ts

### Phase 3: 統合とルーティング ✅
- [x] 新規ルートの作成（`/v1beta/[tenant_id]/ai/agent/chat`）
- [x] tachyonの認証システムとの統合
  - [x] サーバーコンポーネントでセッション取得
  - [x] テナントアクセス権限のチェック
  - [x] クライアントコンポーネントへの認証情報渡し
- [x] 本番用APIクライアントの調整
  - [x] エージェント実行APIのエンドポイント確認
  - [x] AgentChunk型の本番仕様への更新
  - [x] 認証コンテキスト機能の追加
- [x] エラーハンドリングの実装
  - [x] AgentErrorクラスの作成
  - [x] エラートースト表示機能
  - [x] リトライ可能エラー判定
- [x] 品質保証
  - [x] TypeScriptエラーの解決
  - [x] Lintエラーの修正
  - [x] コードフォーマットの適用

### Phase 4: UI/UX調整 ✅
- [x] tachyonのデザインシステムへの適合
  - [x] セマンティックカラーの使用
  - [x] ボタン・リンクのスタイル統一
- [x] レスポンシブデザインの調整
  - [x] モバイル表示の最適化
  - [x] ヘッダーのボタン配置調整
  - [x] ModelSelectorの幅調整
- [x] アクセシビリティの確保
  - [x] ARIA属性の追加
  - [x] セマンティックHTMLの使用
  - [x] スクリーンリーダー対応
- [x] ダークモード対応
  - [x] 既存コンポーネントの確認
  - [x] CSS変数ベースのスタイリング

### Phase 5: テストと検証 ✅
- [x] コンポーネントテストの作成
  - [x] AgentStreamコンポーネントのテスト
  - [x] ChatInputコンポーネントのテスト
  - [x] useAgentStreamフックのテスト
- [x] 統合テストの実装
  - [x] agent-apiライブラリのテスト
  - [x] 認証コンテキストのテスト
- [x] E2Eテストの作成
  - [x] エージェントチャットページのシナリオテスト
  - [x] レスポンシブデザインのテスト
  - [x] アクセシビリティのテスト
- [x] パフォーマンステスト
  - [x] レンダリングパフォーマンス
  - [x] SSEストリーミングパフォーマンス
  - [x] メモリ使用量のテスト

### Phase 6: ドキュメント整備 📝
- [ ] 実装ドキュメントの作成
- [ ] ユーザーガイドの更新
- [ ] 開発者向けドキュメントの作成

## テスト計画

### テスト戦略

#### 単体テスト
- 各Agentコンポーネントのテスト
- useAgentStreamフックのテスト
- ユーティリティ関数のテスト

#### 統合テスト
- エージェントチャットフローの統合テスト
- 認証連携のテスト
- API通信のテスト

#### E2Eテスト
- チャット送信〜応答受信のフロー
- モデル選択機能
- チャット履歴機能

### テストツール
- **Vitest**: 単体テスト
- **Storybook**: コンポーネントテスト
- **Playwright**: E2Eテスト

## リスクと対策

### 技術的リスク

#### リスク1: 依存関係の競合
- **影響度**: 中
- **対策**: 事前の依存関係調査と段階的統合

#### リスク2: 認証システムの非互換性
- **影響度**: 高
- **対策**: 既存認証フローの詳細調査と適応層の実装

#### リスク3: パフォーマンス劣化
- **影響度**: 中
- **対策**: ストリーミング最適化とメモリ使用量の監視

### ビジネスリスク

#### リスク1: 既存機能への影響
- **影響度**: 中
- **対策**: 既存チャット機能との並行運用

#### リスク2: ユーザー体験の一貫性
- **影響度**: 中
- **対策**: UI/UXガイドラインの策定と準拠

## スケジュール

### マイルストーン

| フェーズ | 期間 | 完了予定日 | 主要成果物 |
|---------|------|------------|------------|
| Phase 1 | 1日 | ✅ 完了 | 分析レポート |
| Phase 2 | 3-4日 | ✅ 完了 | 移植済みコンポーネント |
| Phase 3 | 2-3日 | ✅ 完了 | 統合済みルーティング |
| Phase 4 | 2-3日 | ✅ 完了 | UI/UX調整完了 |
| Phase 5 | 2-3日 | ✅ 完了 | テスト完了 |
| Phase 6 | 1-2日 | 📝 TODO | ドキュメント完成 |

**実績**: Phase 1-5を約2.5日で完了
**残作業期間**: 約1-2日

### 重要な依存関係
- tachyonアプリのデプロイメント環境
- 既存API仕様の理解
- デザインシステムの確定

## 完了条件

### 機能要件
- [ ] aichatのAgentChatPageがtachyonで正常動作
- [ ] エージェント機能（思考、ツール実行）が正常表示
- [ ] モデル選択とチャット履歴機能が動作
- [ ] 既存チャット機能に影響なし

### 品質要件
- [ ] すべてのテストがパス（カバレッジ80%以上）
- [ ] レスポンス時間要件をクリア
- [ ] アクセシビリティ基準を満たす
- [ ] クロスブラウザ対応確認

### ドキュメント要件
- [ ] 技術ドキュメント完成
- [ ] 運用ガイド作成
- [ ] ユーザーガイド更新

## 実装メモ

### Phase 5で作成したテストファイル

#### テスト環境セットアップ
- `/apps/tachyon/vitest.config.ts` - Reactコンポーネントテスト用設定
- `/apps/tachyon/src/test-setup.ts` - テスト用グローバル設定
- `/apps/tachyon/playwright.config.ts` - E2Eテスト設定

#### コンポーネントテスト
- `/apps/tachyon/src/components/agent/AgentStream.test.tsx`
- `/apps/tachyon/src/components/agent/ChatInput.test.tsx`
- `/apps/tachyon/src/hooks/useAgentStream.test.ts`

#### 統合テスト
- `/apps/tachyon/src/lib/agent-api.test.ts`

#### E2Eテスト
- `/apps/tachyon/src/e2e-tests/agent-chat.spec.ts`

#### パフォーマンステスト
- `/apps/tachyon/src/lib/performance.test.ts`

### 注意事項

テストを実行するには、以下の依存関係を追加する必要があります：

```bash
yarn add -D @testing-library/react @testing-library/jest-dom @testing-library/user-event @vitejs/plugin-react jsdom playwright
```

### Phase 4での主な変更

#### UI/UX改善
- **デザインシステム適用**
  - MCP Settingsリンク: tachyonのセマンティックカラー使用
  - エラーメッセージ: destructiveカラーを使用

- **レスポンシブデザイン**
  - ヘッダータイトル: `text-lg sm:text-2xl`
  - New Chatボタン: モバイルでアイコンのみ表示
  - MCP Settings: モバイルでアイコンボタン化
  - ModelSelector: `w-32 sm:w-64`で幅調整

- **アクセシビリティ**
  - `<main>`, `<section>`, `<article>`のセマンティックタグ使用
  - aria-label属性の追加
  - role属性の適切な使用（重複除去）
  - コピーボタンにaria-label追加

### Phase 3で作成したファイル

#### 認証関連
- `/apps/tachyon/src/app/v1beta/[tenant_id]/ai/agent/chat/client.tsx` - クライアントコンポーネント（認証情報を受け取る）
- `/apps/tachyon/src/lib/agent-error.ts` - エラーハンドリングユーティリティ

### 作成したファイル一覧（Phase 1-2）

#### APIクライアント
- `/apps/tachyon/src/lib/agent-api.ts` - エージェントAPI用のクライアントライブラリ
- `/apps/tachyon/src/lib/mcp-config.ts` - MCP設定管理

#### フック
- `/apps/tachyon/src/hooks/useAgentStream.ts` - エージェントストリーミング用カスタムフック

#### コンポーネント
- `/apps/tachyon/src/components/agent/AgentStream.tsx` - メインストリーミング表示
- `/apps/tachyon/src/components/agent/AgentThinking.tsx` - 思考プロセス表示
- `/apps/tachyon/src/components/agent/AgentSay.tsx` - エージェントメッセージ表示
- `/apps/tachyon/src/components/agent/AgentCompletion.tsx` - タスク完了表示
- `/apps/tachyon/src/components/agent/AgentToolCall.tsx` - ツール実行表示
- `/apps/tachyon/src/components/agent/AgentToolCallArgs.tsx` - ツール引数表示
- `/apps/tachyon/src/components/agent/AgentToolResult.tsx` - ツール結果表示
- `/apps/tachyon/src/components/agent/AgentAsk.tsx` - エージェント質問表示
- `/apps/tachyon/src/components/agent/AgentChatSidebar.tsx` - チャット履歴サイドバー
- `/apps/tachyon/src/components/agent/ModelSelector.tsx` - AIモデル選択
- `/apps/tachyon/src/components/agent/ChatInput.tsx` - メッセージ入力
- `/apps/tachyon/src/components/agent/MarkdownContent.tsx` - Markdown表示

#### ページ
- `/apps/tachyon/src/app/v1beta/[tenant_id]/ai/agent/chat/page.tsx` - エージェントチャットページ

### 主な変更点

1. **アイコンライブラリの変更**
   - aichat: `@heroicons/react` → tachyon: `lucide-react`
   - `ClipboardDocumentIcon` → `Clipboard`

2. **依存関係の追加**
   - `react-hot-toast` - トースト通知
   - `remark-gfm` - GitHub Flavored Markdown

3. **型定義の簡略化**
   - aichatのOpenAPI型定義の代わりに、必要最小限の型を`agent-api.ts`に定義
   - tachyon-apiの実際のAPIスキーマに合わせて調整完了

4. **認証統合**
   - Cognitoベースの認証システムに対応
   - セッションからアクセストークンとテナントIDを取得
   - APIリクエストに必要なヘッダーを設定

5. **エラーハンドリング**
   - 専用のAgentErrorクラスを実装
   - HTTPステータスコードに基づくエラー分類
   - トースト通知によるユーザーフィードバック

## 関連リソース

### 参考ドキュメント
- [tachyon AI機能概要](../../../services/tachyon-apps/llms/overview.md)
- [aichat実装詳細](../../../services/aichat/overview.md)
- [コンポーネント設計指針](../../../codebase/value_object.md)

### 関連Issue/PR
- TBD: GitHub IssueとPRのリンクを追加
