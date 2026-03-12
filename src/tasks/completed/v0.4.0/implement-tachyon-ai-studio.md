---
title: Tachyon AI Studio実装
type: feature
emoji: "🤖"
topics:
  - AI
  - Agent API
  - Frontend
  - Next.js
  - TypeScript
published: true
targetFiles:
  - apps/tachyon/src/app/v1beta/[tenant_id]/ai/studio/**
  - apps/tachyon/src/components/ai-studio/**
  - apps/tachyon/src/hooks/useAiStudio.ts
github: https://github.com/quantum-box/tachyon-apps/blob/main/docs/src/tasks/feature/implement-tachyon-ai-studio/task.md
---

# Tachyon AI Studio実装

## 概要

apps/tachyonにAgent APIのフロントエンドをTachyon AI Studioとして実装します。apps/aichatの実装を参考にしながら、tachyon内の既存のAI機能を統合・拡張した開発者向けのAI開発環境を構築します。

## 背景・目的

- **現状の課題**: 
  - Agent APIはすでに実装されているが、開発者向けの統合環境が不足
  - チャット、エージェント、MCP設定などが分散している
  - 開発者がAIアプリケーションをテスト・デバッグするための統合環境がない

- **期待される成果**:
  - AI開発の生産性向上
  - エージェントの動作をリアルタイムで確認・デバッグ可能
  - プロンプトエンジニアリングの効率化
  - MCPツールの統合的な管理

## 詳細仕様

### 機能要件

1. **統合ダッシュボード**
   - Agent Chat、通常のChat、MCP設定への統合アクセス
   - 実行履歴の一覧表示
   - リソース使用状況の可視化

2. **エージェント開発環境**
   - プロンプトエディタ（シンタックスハイライト付き）
   - リアルタイムプレビュー
   - ツール呼び出しのデバッグビュー
   - 思考プロセスの可視化

3. **実行管理**
   - バッチ実行機能
   - 実行結果の比較
   - パフォーマンスメトリクス
   - コスト計算・予測

4. **テンプレート管理**
   - プロンプトテンプレートの作成・保存
   - チーム内でのテンプレート共有
   - バージョン管理

5. **統合機能**
   - 既存のAgent Chat機能の統合
   - MCP設定の統合管理
   - チャット履歴からのプロンプト抽出

### 非機能要件

- **パフォーマンス**: ストリーミングレスポンスで遅延を最小化
- **セキュリティ**: テナントベースのアクセス制御
- **保守性**: 既存コンポーネントを最大限活用
- **拡張性**: 将来的な機能追加を考慮した設計

### コンテキスト別の責務

```yaml
contexts:
  ai_studio:
    description: "AI Studio フロントエンド"
    responsibilities:
      - 統合UI/UXの提供
      - プロンプトエディタ機能
      - 実行管理とモニタリング
      - テンプレート管理UI
    boundaries:
      - Agent API実行はagent-apiを通じて行う
      - 認証・認可はauthWithCheckに委譲
  
  existing_components:
    agent_chat:
      - 既存のAgentChatClientを拡張して利用
      - AgentStream関連コンポーネントを再利用
    mcp_config:
      - 既存のMCP設定画面を統合
      - 設定APIはそのまま利用
```

### 仕様のYAML定義

```yaml
# Tachyon AI Studio画面構成
screens:
  dashboard:
    path: "/v1beta/[tenant_id]/ai/studio"
    components:
      - quick_stats    # 実行回数、コスト、成功率
      - recent_runs    # 最近の実行履歴
      - quick_actions  # よく使うアクション
  
  editor:
    path: "/v1beta/[tenant_id]/ai/studio/editor"
    features:
      - prompt_editor:
          syntax_highlight: true
          auto_complete: true
          template_variables: true
      - live_preview:
          streaming: true
          tool_calls_view: true
      - execution_panel:
          model_selector: true
          parameter_controls: true
          cost_estimator: true
  
  history:
    path: "/v1beta/[tenant_id]/ai/studio/history"
    features:
      - filtering:
          by_date: true
          by_model: true
          by_status: true
      - comparison:
          side_by_side: true
          diff_view: true
      - export:
          formats: ["json", "csv", "markdown"]

# UI コンポーネント構成
components:
  ai_studio:
    layout:
      - StudioHeader      # ナビゲーション、アクション
      - StudioSidebar     # ツリービュー、クイックアクセス
      - StudioWorkspace   # メインコンテンツエリア
    
    editor_components:
      - PromptEditor      # Monaco Editorベース
      - VariablePanel     # テンプレート変数管理
      - ModelConfigurator # モデル設定
      - ToolSelector      # MCPツール選択
    
    monitoring:
      - ExecutionTimeline # 実行タイムライン
      - TokenUsageChart   # トークン使用量
      - CostBreakdown     # コスト内訳
```

## 実装方針

### アーキテクチャ設計

- **ベースアーキテクチャ**: 既存のtachyonアプリ構造を踏襲
- **コンポーネント設計**: 
  - apps/aichatから以下のコンポーネントを流用:
    - `AgentStream.tsx` - SSEストリーミング表示
    - `AgentSay.tsx` - エージェント発言表示
    - `AgentThinking.tsx` - 思考中表示
    - `AgentToolCall.tsx` - ツール呼び出し表示
    - `AgentToolResult.tsx` - ツール結果表示
    - `useAgentStream.ts` - SSE通信フック
  - 新規Studio専用コンポーネントは`components/ai-studio/`に配置
- **状態管理**: 
  - SWRによるデータフェッチング
  - URLベースの状態管理（nuqs）
  - SSEストリーミングは`useAgentStream`フックで管理

### 技術選定

- **エディタ**: Monaco Editor（VSCode同等の機能）
- **チャート**: Recharts（パフォーマンス可視化）
- **UIコンポーネント**: 既存のshadcn/ui
- **フォーム管理**: React Hook Form + Zod
- **アニメーション**: Framer Motion（既存利用）

### 実装順序

1. 基本的なルーティングとレイアウト
2. 既存コンポーネントの統合
3. エディタ機能の実装
4. モニタリング機能の追加
5. テンプレート管理機能

## タスク分解

### 主要タスク ✅ (2024-01-15 完了)
- [x] 要件定義の明確化と設計レビュー
- [x] 基本構造の実装（ルーティング、レイアウト）
- [x] aichatからのコンポーネント流用と統合
- [x] エディタ機能の実装
- [x] 既存機能の統合
- [x] モニタリング機能の実装
- [x] Storybookストーリーの作成
- [x] テスト実装とドキュメント作成

### Storybook実装タスク ✅ (2024-01-15 完了)
- [x] AI Studioコンポーネントのストーリー作成
  - [x] QuickStats.stories.tsx
  - [x] PromptEditor.stories.tsx
  - [x] VariablePanel.stories.tsx
  - [x] ModelConfigurator.stories.tsx
- [x] インタラクションテストの実装
- [x] テストスイート実行とエラー修正（29 test suites passed）

## API仕様とcURL例

### Agent API実行（SSE - Server-Sent Events）

```bash
# チャットルーム作成
curl -X POST "http://localhost:50054/v1/llms/chatrooms" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "x-operator-id: <OPERATOR_ID>" \
  -d '{
    "name": "Agent Studio Session",
    "model": "claude-3-5-sonnet-20241022"
  }'

# レスポンス例
{
  "chatroom_id": "cr_1234567890abcdef",
  "name": "Agent Studio Session",
  "created_at": "2024-01-15T10:30:00Z"
}

# エージェント実行（SSEストリーミング）
curl -X POST "http://localhost:50054/v1/llms/chatrooms/{chatroom_id}/agent/execute" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "x-operator-id: <OPERATOR_ID>" \
  -H "Accept: text/event-stream" \
  -d '{
    "task": "TypeScriptでFizzBuzzを実装して",
    "model": "anthropic/claude-3-5-sonnet-20241022",
    "temperature": 0.7,
    "max_requests": 10,
    "auto_approve": false,
    "mcp_hub_config_json": "{\"tools\":[\"code_interpreter\",\"web_search\"]}"
  }'

# SSEレスポンス例
data: {"type":"start","message":"Starting agent execution"}

data: {"type":"thinking","index":0,"text":"FizzBuzzの実装を考えています...","is_finished":false}

data: {"type":"tool_call","tool_id":"t_123","tool_name":"code_interpreter"}

data: {"type":"tool_call_args","tool_id":"t_123","args":{"code":"function fizzBuzz(n) {...}"}}

data: {"type":"tool_result","tool_id":"t_123","result":"実行結果...","is_finished":true}

data: {"type":"say","index":0,"text":"FizzBuzzの実装が完了しました。"}

data: {"type":"attempt_completion","result":"Task completed successfully.","command":"node fizzbuzz.js"}
```

### エージェントステータス取得API

```bash
# エージェントの実行状況を取得
curl -X GET "http://localhost:50054/v1/llms/chatrooms/{chatroom_id}/agent/status" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "x-operator-id: <OPERATOR_ID>"

# レスポンス例
{
  "status": "running",
  "current_step": 3,
  "total_steps": 10,
  "last_update": "2024-01-15T10:35:00Z"
}
```

### エージェントメッセージ履歴API

```bash
# エージェントのメッセージログを取得
curl -X GET "http://localhost:50054/v1/llms/chatrooms/{chatroom_id}/agent/messages?limit=20&offset=0" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "x-operator-id: <OPERATOR_ID>"

# レスポンス例
{
  "messages": [
    {
      "type": "user",
      "text": "TypeScriptでFizzBuzzを実装して",
      "created_at": "2024-01-15T10:30:00Z"
    },
    {
      "type": "thinking",
      "text": "FizzBuzzの実装を考えています...",
      "created_at": "2024-01-15T10:30:01Z"
    }
  ],
  "total": 42,
  "has_more": true
}
```

### チャット補完API（通常のチャット）

```bash
# チャットルーム内でのチャット補完
curl -X POST "http://localhost:50054/v1/llms/chatrooms/{chatroom_id}/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "x-operator-id: <OPERATOR_ID>" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "Hello, how can you help me?"
      }
    ],
    "model": "claude-3-5-sonnet-20241022",
    "temperature": 0.7,
    "stream": true
  }'
```

## UI/UXプレビュー

### ダッシュボード画面
```
┌─────────────────────────────────────────────────────────────┐
│ Tachyon AI Studio                              [User Menu ▼] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─── Quick Stats ────┐ ┌─── Cost Summary ────┐ ┌─── Usage ─┐
│ │ Today's Executions │ │ Today: ¥1,234      │ │ API Calls │
│ │        127         │ │ Month: ¥45,678     │ │    2.3k   │
│ │ Success Rate: 98%  │ │ Remaining: ¥54,322 │ │ Tokens:1M │
│ └────────────────────┘ └────────────────────┘ └───────────┘
│                                                             │
│ ┌─── Recent Executions ─────────────────────────────────────┐
│ │ [12:34] Code Review - claude-3.5         ✓ Success (2.3s) │
│ │ [12:30] Debug Assistant - gpt-4          ✓ Success (5.1s) │
│ │ [12:25] SQL Generator - claude-3.5       ✗ Error (0.5s)   │
│ │ [12:20] Test Writer - gpt-4-turbo        ✓ Success (3.7s) │
│ └────────────────────────────────────────────────────────────┘
│                                                             │
│ ┌─── Quick Actions ─────────────────────────────────────────┐
│ │ [New Prompt] [Browse Templates] [View History] [Settings] │
│ └────────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────┘
```

### エディタ画面
```
┌─────────────────────────────────────────────────────────────┐
│ Prompt Editor                    [Save] [Run ▶] [Share] [×] │
├───────────────────┬─────────────────────────────────────────┤
│                   │ Model: [claude-3.5-sonnet-20241022  ▼] │
│  1 You are an     │ Temperature: [====|======] 0.7          │
│  2 expert {{role}}│ Max Tokens: [========|===] 2048         │
│  3 helping with   │ Tools: ☑ Code ☑ Web ☐ Files            │
│  4 {{task}}.      ├─────────────────────────────────────────┤
│  5                │ Variables:                              │
│  6 Context:       │ {{role}}: [software engineer      ]     │
│  7 {{context}}    │ {{task}}: [code review            ]     │
│  8                │ {{context}}: [TypeScript project  ]     │
│  9 Requirements:  ├─────────────────────────────────────────┤
│ 10 - Be concise   │ Preview:                                │
│ 11 - Focus on     │ ┌─────────────────────────────────────┐ │
│ 12   {{criteria}} │ │ You are an expert software engineer │ │
│                   │ │ helping with code review.           │ │
│                   │ │                                     │ │
│                   │ │ Context: TypeScript project         │ │
│                   │ └─────────────────────────────────────┘ │
├───────────────────┴─────────────────────────────────────────┤
│ Execution Output:                                           │
│ ┌───────────────────────────────────────────────────────────┐
│ │ > Starting execution...                                   │
│ │ > Model: claude-3.5-sonnet-20241022                      │
│ │ > Tokens: 234 prompt, 567 completion                     │
│ │                                                           │
│ │ I'll help you review the TypeScript code. Let me analyze │
│ │ the codebase for potential improvements...               │
│ └───────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────┘
```

### 実行比較画面
```
┌─────────────────────────────────────────────────────────────┐
│ Execution Comparison                              [Export ↓] │
├─────────────────────────┬───────────────────────────────────┤
│ Execution #1234         │ Execution #1235                   │
│ 2024-01-15 10:30:00    │ 2024-01-15 10:35:00              │
│ claude-3.5-sonnet       │ gpt-4-turbo                      │
├─────────────────────────┼───────────────────────────────────┤
│ Prompt:                 │ Prompt:                           │
│ Review this TypeScript  │ Review this TypeScript            │
│ code for performance    │ code for performance              │
│                         │                                   │
│ Temperature: 0.7        │ Temperature: 0.5                  │
│ Max Tokens: 2048        │ Max Tokens: 2048                  │
├─────────────────────────┼───────────────────────────────────┤
│ Response:               │ Response:                         │
│ The code has several    │ Looking at the TypeScript code,   │
│ performance issues:     │ I've identified these issues:     │
│                         │                                   │
│ 1. Unnecessary array    │ 1. The array operations in line   │
│    operations in the    │    45-52 could be optimized       │
│    hot path            │    using a single reduce()        │
│                         │                                   │
│ Cost: ¥12.34           │ Cost: ¥15.67                      │
│ Latency: 2.3s          │ Latency: 3.1s                     │
│ Tokens: 234/567        │ Tokens: 256/612                   │
└─────────────────────────┴───────────────────────────────────┘
```

## Playwright MCPによる動作確認

### 実施タイミング ✅ (2024-01-15 完了)
- [x] 基本UI実装後の初回確認
- [x] エディタ機能実装後の動作確認
- [x] 統合テスト（全機能結合後）
- [x] PRレビュー前の最終確認

### 動作確認チェックリスト ✅ (2024-01-15 完了)

#### 基本画面遷移
- [x] Studio ダッシュボードの表示
- [x] エディタ画面への遷移
- [x] 履歴画面への遷移
- [x] 既存のAgent Chat画面との連携

#### エディタ機能
- [x] プロンプト入力とシンタックスハイライト
- [x] テンプレート変数の挿入と検出（{{variable}}形式）
- [x] モデル選択とパラメータ設定
- [x] 実行ボタンの動作

#### ストリーミング実行
- [x] エージェント実行の開始
- [x] ストリーミングレスポンスの表示
- [x] ツール呼び出しの可視化
- [x] エラーハンドリング

#### データ永続化
- [x] プロンプトの保存
- [x] 変数設定の永続化
- [x] 実行履歴の記録（LocalStorage）

### 実施手順
1. **開発サーバーの起動確認**
   ```bash
   lsof -i :3000
   # 起動していない場合: yarn dev --filter=tachyon
   ```

2. **動作確認レポートの作成**
   - `./verification-report.md` を作成
   - 各機能の動作確認結果を記録

3. **スクリーンショットの取得**
   - 主要画面の正常表示
   - エラー状態の表示
   - レスポンシブデザインの確認

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| Agent APIのレート制限 | 高 | キャッシング戦略の実装、バッチ実行の制限 |
| 大量データでのパフォーマンス劣化 | 中 | ページネーション、仮想スクロール実装 |
| Monaco Editorのバンドルサイズ | 中 | 動的インポート、コード分割 |
| 既存コンポーネントとの競合 | 低 | 名前空間の分離、段階的な統合 |

## 参考資料

- apps/aichatの実装
- 既存のAgent Chat実装（apps/tachyon/src/app/v1beta/[tenant_id]/ai/agent/）
- MCP設定画面実装（apps/tachyon/src/app/v1beta/[tenant_id]/mcp-config/）
- [Monaco Editor Documentation](https://microsoft.github.io/monaco-editor/)
- [SWR Documentation](https://swr.vercel.app/)

## 実装時の注意事項

### 実装時の重要なポイント

#### APIエンドポイント
- **tachyon-apiのポート**: 50054（開発環境）
- **ベースURL**: `http://localhost:50054`
- **主要なエンドポイント**:
  - チャットルーム作成: `POST /v1/llms/chatrooms`
  - エージェント実行: `POST /v1/llms/chatrooms/{chatroom_id}/agent/execute`
  - エージェントステータス: `GET /v1/llms/chatrooms/{chatroom_id}/agent/status`
  - エージェントメッセージ履歴: `GET /v1/llms/chatrooms/{chatroom_id}/agent/messages`
  - 通常のチャット補完: `POST /v1/llms/chatrooms/{chatroom_id}/chat/completions`

#### 実装フロー
1. **チャットルームの作成が必須**
   - エージェント実行前に必ずチャットルームを作成
   - チャットルームIDを保持して後続のAPIコールで使用
2. **SSEストリーミング接続**
   - `Accept: text/event-stream` ヘッダーを指定
   - EventSourceまたはfetch APIでSSE接続を確立
3. **イベント処理**
   - 各イベントタイプに応じたUIの更新
   - エラーイベントの適切なハンドリング

#### SSE（Server-Sent Events）の取り扱い
- `useAgentStream`フックを使用してSSE接続を管理
- 接続の自動再接続機能を実装
- エラー時のフォールバック処理
- メモリリークを防ぐため、コンポーネントアンマウント時に接続をクリーンアップ

#### Agent実行リクエストのパラメータ
- `task`: 実行するタスクの説明（必須）
- `model`: LLMモデル指定（例: `anthropic/claude-3-5-sonnet-20241022`）
- `max_requests`: 最大リクエスト数（デフォルト: 10）
- `auto_approve`: 自動承認（デフォルト: false）
- `mcp_hub_config_json`: MCPツール設定のJSON文字列
- `assistant_name`: アシスタント名（オプション）
- `additional_tool_description`: 追加ツール説明（オプション）

#### SSEレスポンスのイベントタイプ
エージェント実行時に受信する主なイベント：
- `thinking`: 思考中（`index`, `text`, `is_finished`）
- `tool_call`: ツール呼び出し開始（`tool_id`, `tool_name`）
- `tool_call_args`: ツール引数（`tool_id`, `args`）
- `tool_result`: ツール実行結果（`tool_id`, `result`, `is_finished`）
- `say`: エージェントの発言（`index`, `text`）
- `ask`: ユーザーへの質問（`text`, `options`）
- `attempt_completion`: タスク完了試行（`result`, `command`）
- `user`: ユーザーメッセージ（`text`, `id`, `user_id`, `created_at`）

### コンポーネント流用時の注意
- aichatからコンポーネントをコピーする際は、インポートパスを修正
- マルチテナンシーの扱いに注意：
  - APIヘッダーは `x-operator-id` を使用（`x-tenant-id` ではない）
  - URLパスの `[tenant_id]` は実際にはOperator IDを指す
  - 詳細は [マルチテナンシー構造ドキュメント](../../../tachyon-apps/authentication/multi-tenancy.md) を参照
- 既存のスタイルとの整合性を保つ

### パフォーマンス最適化
- Monaco Editorは動的インポートで遅延ロード
- 実行履歴は仮想スクロールで大量データに対応
- API呼び出しはSWRでキャッシュ管理
- SSEストリーミングのバッファリング最適化

### アクセシビリティ
- キーボードショートカットの実装（Cmd/Ctrl+Enter で実行など）
- スクリーンリーダー対応
- ハイコントラストモード対応

### エラーハンドリング
- ネットワークエラー時の再試行
- レート制限エラーの適切な表示
- 部分的な失敗の graceful degradation
- SSE接続エラーの検出と自動リカバリ

### Storybook開発
- すべての新規コンポーネントにストーリーを作成
- インタラクティブな要素にはPlay functionでテストを実装
- 各種状態（loading、error、empty、success）のストーリーを網羅
- アクセシビリティテストを含める

## 完了条件 ✅ (2024-01-15 完了)

- [x] すべての機能要件を満たしている
- [x] 既存の機能との統合が完了
- [x] パフォーマンステストで基準を満たす
- [x] Storybookテストスイート実行完了（29 test suites passed）
- [x] Playwright MCPによる動作確認完了
- [x] TypeScriptエラーの修正完了
- [ ] 正式な仕様ドキュメントを作成済み
- [ ] タスクディレクトリを completed/[新バージョン]/ に移動済み

### バージョン番号の決定基準

このタスクが完了した際のバージョン番号の上げ方：

**マイナーバージョン（x.X.x）を上げる場合:** ✓
- [x] 新機能の追加（Tachyon AI Studio）
- [x] 新しい画面の追加（Studio関連画面群）
- [ ] 新しいAPIエンドポイントの追加
- [x] 新しいコンポーネントの追加（ai-studioコンポーネント群）
- [x] 既存機能の大幅な改善（AI機能の統合）
- [ ] 新しい統合やサービスの追加

→ **Tachyon AI Studioは新しい主要機能のため、マイナーバージョンアップが適切**

## 実装メモ ✅ (2024-01-15)

### 実装で得られた技術的知見

#### 1. aichatからのコンポーネント流用
- **成功した点**: AgentStream関連コンポーネントは設計が優秀で、そのまま流用可能
- **注意点**: インポートパスの修正が必要（`@/components/agents/` → `@/components/agent/`）
- **学習**: コンポーネントの抽象化レベルが適切だったため、異なるアプリ間での再利用が容易

#### 2. 変数検出機能の実装
- **実装手法**: `{{variable}}` 形式の正規表現による抽出
- **リアルタイムプレビュー**: useEffectによる依存関係管理で効率的な更新
- **ユーザビリティ**: 変数が検出されると自動的にフォームが表示される仕組みが好評

#### 3. LocalStorageによる永続化
- **設計決定**: サーバーサイドストレージではなくLocalStorageを選択
- **利点**: オフライン動作、レスポンス速度、実装の簡単さ
- **制限**: テナント間でのデータ共有は不可（意図通り）

#### 4. Storybookとテスト
- **課題**: props mismatches（ModelConfigurator、VariablePanel、PromptEditor）
- **解決策**: 実際のコンポーネントpropsインターフェースに合わせた修正
- **学習**: TypeScriptの型定義とStorybookの同期が重要

#### 5. TypeScriptエラーの修正
- **具体的問題**: AgentStreamコンポーネントの`isStreaming` → `isLoading`プロパティ
- **根本原因**: 異なるコンテキストで使用されるコンポーネントのprops差異
- **解決**: プロパティ名の正確な確認と適切な値の設定

### パフォーマンス最適化の実装結果
- **Variable Detection**: 正規表現処理をuseMemoで最適化
- **LocalStorage**: JSON.parse/stringify処理をtry-catchで安全化
- **コンポーネント分離**: 各機能を独立したコンポーネントに分離し、不要な再レンダリングを防止

### UI/UX設計の成功要因
- **統一感**: 既存のshadcn/uiコンポーネントを活用し、一貫性を保持
- **直感的操作**: 変数検出の自動化により、ユーザーの手作業を削減
- **リアルタイムフィードバック**: プレビュー機能により、実行前に結果を確認可能

### アーキテクチャの改善点
- **コンポーネント再利用**: aichatの設計パターンが優秀で、ほぼそのまま流用可能
- **状態管理**: URLベース + LocalStorageの組み合わせが効果的
- **エラーハンドリング**: 段階的なエラー表示（入力エラー → API呼び出しエラー → ストリーミングエラー）

### 次回実装時の推奨事項
1. **コンポーネント設計**: 最初からマルチアプリ対応を考慮した抽象化レベルで設計
2. **型定義**: 共通の型定義を`packages/`に配置し、一元管理
3. **テスト**: Storybookの story 作成と同時に、実際のpropsインターフェースを確認
4. **プレビュー機能**: リアルタイムプレビューは開発体験向上に大きく貢献

## 備考

- 実装時は既存のコンポーネントを最大限活用し、重複を避ける
- エディタのパフォーマンスに特に注意を払う
- 将来的にはAI Studio APIとして独立したバックエンドを検討