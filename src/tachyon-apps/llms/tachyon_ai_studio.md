# Tachyon AI Studio

Tachyon AI Studioは、LLMとの対話を可能にするWebアプリケーションです。

## 現状の機能

### ディレクトリ構造
```
apps/tachyon/src/app/v1beta/[tenant_id]/ai/
├── memory/
├── history/
├── data/
├── components/
├── chat/
├── chat-temporary/
└── chat-stream/
```

### 主要機能
1. チャット機能
   - OpenAI互換のChat Completion API
   - メッセージの永続化
   - Markdownサポート（コードブロック、Mermaid図など）
   - ストリーミングレスポンス

2. モデル選択
   - 複数のLLMプロバイダー対応
    - Google AI (Gemini)
    - OpenAI (GPT-5)
     - Anthropic (Claude)
     - Groq
     - Perplexity AI

3. パラメータ設定
   - Temperature
   - Top-p
   - Max length
   - System prompt

## ストリーミング対応の実装プラン

### Phase 1: バックエンド実装

#### 1.1 型定義の追加
- ✅ `packages/llms/src/adapter/axum/types.rs`の拡張
  - `ChatCompletionWithChatroomStreamRequest`の追加
    - `stream: Option<bool>`フィールドの追加
  - `ChatCompletionWithChatroomStreamResponse`の追加
    - OpenAI互換のストリーミングレスポンス形式
  - `ChunkChoice`と`DeltaMessage`の追加

#### 1.2 ストリーミングハンドラーの実装
- ✅ `packages/llms/src/adapter/axum/chat_completion_on_chatroom_handler.rs`の修正
  - ストリーミングエンドポイントの追加
  - SSE対応のレスポンスハンドラー
  - エラーハンドリングの実装
  - メモリ管理の最適化

#### 1.3 ユースケースの実装
- ✅ `packages/llms/src/usecase/chat_completion_on_chatroom.rs`の拡張
  - ストリーミング用のユースケース追加
  - トークン単位の出力制御
  - 非同期ストリーム処理の実装

#### 1.4 データベース操作の最適化
- 📝 チャットルームのメッセージ保存処理
  - ストリーミング中のメッセージ保存戦略
  - トランザクション管理
  - パフォーマンス最適化

### Phase 2: フロントエンド実装

#### 2.1 APIクライアントの実装
- 📝 `apps/tachyon/src/app/v1beta/[tenant_id]/ai/chat/api.ts`の作成
  - EventSourceを使用したストリーミングクライアント
  - エラーハンドリングとリトライロジック
  - タイムアウト処理

#### 2.2 チャットコンポーネントの拡張
- 📝 `apps/tachyon/src/app/v1beta/[tenant_id]/ai/chat/[chatroomId]/chat.tsx`の修正
  - ストリーミングメッセージの表示
  - タイピングアニメーション
  - 途中キャンセル機能
  - エラー表示UI

#### 2.3 状態管理の実装
- 📝 ストリーミング状態の管理
  - メッセージの部分更新
  - ローディング状態
  - エラー状態
  - 接続状態

#### 2.4 UI/UXの改善
- 📝 ユーザーインターフェースの拡張
  - プログレスインジケータ
  - キャンセルボタン
  - エラー通知
  - 再接続UI

### Phase 3: テストとデバッグ

#### 3.1 ユニットテスト
- 📝 バックエンドテスト
  - ストリーミングハンドラーのテスト
  - メッセージ分割ロジックのテスト
  - エラーケースのテスト
- 📝 フロントエンドテスト
  - コンポーネントテスト
  - ストリーミング処理のテスト
  - 状態管理のテスト

#### 3.2 統合テスト
- 📝 APIエンドポイントテスト
  - ストリーミングレスポンスのテスト
  - 長時間接続のテスト
  - エラーハンドリングのテスト
- 📝 フロントエンド統合テスト
  - E2Eテスト
  - パフォーマンステスト


### 実装スケジュール

1. Phase 1: バックエンド実装 (2週間)
   - Week 1: 型定義とハンドラー実装
   - Week 2: ユースケースとDB最適化

2. Phase 2: フロントエンド実装 (2週間)
   - Week 3: APIクライアントと基本UI実装
   - Week 4: 状態管理とUX改善

3. Phase 3: テストとデバッグ (1週間)
   - Week 5: テスト実装と最適化

### 成功基準

1. 機能要件
   - ストリーミングレスポンスの正常動作
   - メッセージの永続化の正確性
   - エラーハンドリングの完全性

2. 非機能要件
   - レイテンシ: 初回レスポンスまで500ms以内
   - スループット: 同時接続100以上
   - エラーレート: 0.1%以下

3. UX要件
   - スムーズなメッセージ表示
   - 直感的なエラー表示
   - レスポンシブな操作感

## AI Agent対応に向けた実装タスク

### 1. エージェントの基本機能実装
- 📝 Function Callingのサポート追加
  - ツール定義インターフェースの実装
  - ツール実行環境の構築
  - ツール実行結果のハンドリング

- 📝 メモリシステムの実装
  - 短期メモリ（会話履歴）
  - 長期メモリ（ベクトルDB）
  - メモリの永続化

### 2. UI/UX拡張
- 📝 エージェント設定UI
  - エージェントの役割定義
  - 利用可能なツールの選択
  - メモリ設定

- 📝 実行状態の可視化
  - ツール実行のプログレス表示
  - エラーハンドリングUI
  - デバッグ情報の表示

### 3. ツール統合
- 📝 基本ツールセットの実装
  - ファイル操作
  - Web検索
  - 計算機能
  - APIリクエスト

- 📝 カスタムツール作成機能
  - ツール定義エディタ
  - テスト環境
  - バージョン管理

### 4. セキュリティと制御
- 📝 アクセス制御の実装
  - ツール使用権限
  - リソース制限
  - 監査ログ

- 📝 サンドボックス環境
  - 安全なツール実行
  - リソース分離
  - タイムアウト制御

### 5. モニタリングと分析
- 📝 使用状況の分析
  - ツール使用統計
  - エラー分析
  - パフォーマンス計測

- 📝 デバッグ機能
  - 実行ログ
  - ステップ実行
  - 状態検査

## 実装の優先順位

1. 🔄 Function Callingのサポート追加
2. 📝 エージェント設定UI
3. 📝 基本ツールセットの実装
4. 📝 メモリシステムの実装
5. 📝 実行状態の可視化


### 追加タスク1.1

```shell
data: {"id":"msg_01HCfwdAAeN1P6Mi3GKADqYp","object":"chat.completion.chunk","model":"anthropic:claude-sonnet-4-5-20250929","choices":[{"delta":{"role":"assistant"},"index":0}]}

data: {"id":"msg_01HCfwdAAeN1P6Mi3GKADqYp","object":"chat.completion.chunk","model":"anthropic:claude-sonnet-4-5-20250929","choices":[{"delta":{"role":"assistant","content":"仙台の"},"index":0}]}

data: {"id":"msg_01HCfwdAAeN1P6Mi3GKADqYp","object":"chat.completion.chunk","model":"anthropic:claude-sonnet-4-5-20250929","choices":[{"delta":{"role":"assistant","content":"天気を確認します。"},"index":0}]}

data: {"id":"msg_01HCfwdAAeN1P6Mi3GKADqYp","object":"chat.completion.chunk","model":"anthropic:claude-sonnet-4-5-20250929","choices":[{"delta":{"role":"assistant","tool_calls":[{"id":"toolu_0152R6fnndxk8N6T6tAVhv37","type":"function","function":{"name":"get_weather","arguments":""},"index":0}]},"index":0}]}

data: {"id":"msg_01HCfwdAAeN1P6Mi3GKADqYp","object":"chat.completion.chunk","model":"anthropic:claude-sonnet-4-5-20250929","choices":[{"delta":{"role":"assistant","tool_calls":[{"function":{"arguments":"{\"locati"},"index":0}]},"index":0}]}

data: {"id":"msg_01HCfwdAAeN1P6Mi3GKADqYp","object":"chat.completion.chunk","model":"anthropic:claude-sonnet-4-5-20250929","choices":[{"delta":{"role":"assistant","tool_calls":[{"function":{"arguments":"on\": \"Send"},"index":0}]},"index":0}]}

data: {"id":"msg_01HCfwdAAeN1P6Mi3GKADqYp","object":"chat.completion.chunk","model":"anthropic:claude-sonnet-4-5-20250929","choices":[{"delta":{"role":"assistant","tool_calls":[{"function":{"arguments":"ai\"}"},"index":0}]},"index":0}]}

data: {"id":"msg_01HCfwdAAeN1P6Mi3GKADqYp","object":"chat.completion.chunk","model":"anthropic:claude-sonnet-4-5-20250929","choices":[{"delta":{"content":"{\"weather\":\"sunny\"}"},"index":0}]}

data: {"id":"msg_01HCfwdAAeN1P6Mi3GKADqYp","object":"chat.completion.chunk","model":"anthropic:claude-sonnet-4-5-20250929","choices":[{"delta":{},"index":0,"finish_reason":"stop"}]}

data: [DONE]
```
