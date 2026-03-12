# Tachyon AI Studio

Tachyon AI StudioはAI開発のための統合開発環境です。プロンプトの作成・テスト・実行・履歴管理を一つのプラットフォームで提供します。

## 概要

AI Studioは以下の3つの主要な画面で構成されています：

- **Dashboard**: 統計情報と実行履歴の概要
- **Prompt Editor**: プロンプトの作成・編集・実行
- **Execution History**: 過去の実行履歴の確認

## 主要機能

### 1. プロンプト管理

#### 変数システム
- `{{variable}}` 構文による動的変数挿入
- リアルタイムプレビューでの変数置換確認
- 変数パネルでの値入力・管理

#### テンプレート保存
- プロンプトテンプレートのLocalStorage保存
- 変数定義と初期値の保存
- モデル設定の一括保存

### 2. Agent実行

#### 設定オプション
```yaml
model_config:
  model: "anthropic/claude-sonnet-4-5-20250929"
  temperature: 0.7
  max_requests: 10
  auto_approve: false

tools:
  - name: "Code Interpreter"
    enabled: true
  - name: "Web Search" 
    enabled: true
  - name: "File Operations"
    enabled: false
```

#### 実行フロー
1. プロンプト入力・変数設定
2. モデル・ツール設定
3. Agent API実行（SSEストリーミング）
4. 結果表示・履歴保存

### 3. MCP統合

#### 設定管理
- MCPサーバー設定のLocalStorage保存
- 設定エディタでのサーバー管理
- 接続テスト機能

#### Agent実行時統合
```typescript
// MCP設定の自動読み込み
const mcpConfig = loadMcpConfigFromStorage()
const enabledServers = Object.entries(mcpConfig)
  .filter(([_, config]) => !config.disabled)

// Agent APIへの送信
const response = await apiClientExecuteAgentTask(chatRoomId, {
  task: prompt,
  model: selectedModel,
  mcp_hub_config_json: JSON.stringify({
    mcp_servers: enabledServers,
  }),
})
```

### 4. 履歴管理

#### データ構造
```typescript
interface ExecutionRecord {
  id: string
  tenantId: string
  prompt: string
  variables: Record<string, string>
  model: string
  temperature: number
  maxRequests: number
  autoApprove: boolean
  chunks: AgentChunk[]
  startedAt: string
  completedAt: string
  status: 'success' | 'error'
  error?: string
}
```

#### 保存制限
- 最大100件の実行履歴
- テナント別の分離保存
- LocalStorageでの永続化

## UI/UX設計

### レスポンシブレイアウト
```css
/* Prompt Editor Layout */
.grid {
  grid-template-columns: 1fr;
}

@media (min-width: 1280px) {
  .grid {
    grid-template-columns: 2fr 1fr; /* 実行結果2/3, 設定1/3 */
  }
}
```

### 実行結果表示
- 画面高さに対応した動的サイズ調整
- SSEストリーミングでのリアルタイム表示
- ツール呼び出し・結果の詳細表示

### LocalStorage表示
- 「📱 このブラウザにローカル保存されています」の明示
- データ保存場所の透明性確保

## API仕様

### Agent実行エンドポイント
```
POST /v1beta/{tenant_id}/agent/{chatroom_id}/tasks/execute
Content-Type: application/json

{
  "task": "プロンプト内容",
  "user_custom_instructions": "カスタム指示",
  "assistant_name": "AI Assistant",
  "model": "anthropic/claude-sonnet-4-5-20250929",
  "mcp_hub_config_json": "{\"mcp_servers\": {...}}"
}
```

### レスポンス（SSE）
```
data: {"type": "agent_chunk", "chunk": {...}}
data: {"type": "tool_call", "tool": "use_mcp_tool", "args": {...}}
data: {"type": "tool_result", "result": "..."}
data: {"type": "attempt_completion", "result": "..."}
```

## 技術スタック

### フロントエンド
- **Framework**: Next.js App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui
- **State Management**: React useState/useEffect
- **HTTP Client**: custom apiClient

### バックエンド
- **Framework**: Rust axum
- **Agent API**: 専用SSEエンドポイント
- **MCP Integration**: McpHub with JSON config

### データ永続化
- **LocalStorage**: 実行履歴・テンプレート・MCP設定
- **セッション**: チャットルーム状態管理

## セキュリティ

### 認証・認可
- テナントID検証（x-operator-id ヘッダー）
- Bearer認証またはダミートークン（開発時）

### データ保護
- LocalStorageデータのテナント分離
- 機密情報の除外（APIキー等）

## パフォーマンス

### 最適化
- SSEストリーミングによる応答性向上
- LazyLoadingでの初期ロード時間短縮
- LocalStorage使用による高速データアクセス

### 制限
- 履歴保存上限: 100件
- プロンプト長制限: バックエンド依存
- 同時実行制限: 1セッション

## 今後の拡張予定

### 機能拡張
- [ ] プロンプトテンプレートの共有機能
- [ ] 実行結果のエクスポート機能
- [ ] チーム機能とコラボレーション
- [ ] 高度な統計・分析機能

### 技術改善
- [ ] サーバーサイド履歴保存
- [ ] リアルタイム協調編集
- [ ] プラグインシステム
- [ ] パフォーマンス監視

## トラブルシューティング

### よくある問題

#### MCPサーバー接続エラー
```
Error: McpHub call_tool failed: Server not connected
```
**解決策**: MCP設定でサーバーが正しく設定され、有効化されているか確認

#### LocalStorageエラー
```
Error: LocalStorage is not available
```
**解決策**: ブラウザ設定でLocalStorageが有効になっているか確認

#### Agent実行失敗
```
Error: 403 Forbidden
```
**解決策**: 認証ヘッダー（x-operator-id）が正しく設定されているか確認

## ファイル構成

```
apps/tachyon/src/
├── app/v1beta/[tenant_id]/ai/studio/
│   ├── page.tsx                 # Dashboard
│   ├── editor/page.tsx          # Prompt Editor
│   └── history/page.tsx         # Execution History
├── components/ai-studio/
│   ├── StudioDashboard.tsx      # Dashboard UI
│   ├── StudioEditor.tsx         # Editor UI
│   ├── StudioHistory.tsx        # History UI
│   ├── QuickStats.tsx           # 統計表示
│   ├── RecentExecutions.tsx     # 最近の実行
│   └── editor/
│       ├── PromptEditor.tsx     # プロンプト入力
│       ├── VariablePanel.tsx    # 変数管理
│       ├── ModelConfigurator.tsx # モデル設定
│       └── ExecutionOutput.tsx  # 実行結果表示
├── lib/ai-studio-storage.ts     # LocalStorage管理
└── hooks/useAgentStream.ts      # Agent API統合
```