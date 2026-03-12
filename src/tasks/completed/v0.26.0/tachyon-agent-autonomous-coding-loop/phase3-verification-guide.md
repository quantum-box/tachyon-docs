# フェーズ3 動作確認ガイド

## 概要
このガイドでは、フェーズ3「動作確認ループ」の実装を手動でテストする手順を説明します。

## 実装内容

### 1. Resume時の検証指示追加
`packages/llms/src/usecase/resume_agent.rs`の`restore_execution_context`メソッドを拡張し、Tool Job完了時に以下の検証指示をLLMに送信するようにしました：

1. **UI/機能テスト**: Playwright MCPツールを使用して変更を検証
2. **シナリオテスト**: `mise run tachyon-api-scenario-test`などのテストコマンドを実行
3. **エラーハンドリング**: 検証失敗時は新しいTool Jobを作成して修正
4. **成功報告**: 検証成功時は詳細なサマリーを提供

### 2. 自律的な改善ループ
この実装により、以下のフローが自動的に動作します：

```
1. Agent実行 → Tool Job作成（async_mode: true）
2. Tool Job完了 → コールバック → agent_tool_job_results保存
3. Resume API呼び出し → 検証指示付きメッセージ生成
4. LLMが検証実行（Playwright MCP使用）
5. 検証失敗 → 新しいTool Job作成（修正タスク）
6. 検証成功 → 完了報告
```

## UI動作確認手順

### 前提条件
- 開発サーバーが起動していること（`mise run dev-backend`と`mise run dev`）
- ブラウザでTachyon UIにアクセス可能: `http://localhost:16000/v1beta/tn_01hjryxysgey07h5jz5wagqj0m`

### 手順1: チャットルームの作成

1. AI Studio > Chatrooms に移動
2. 「新しいチャットルームを作成」をクリック
3. チャットルームIDをメモ（例: `ch_01xxxxx`）

### 手順2: Tool Jobを使用したAgent実行

1. 作成したチャットルームを開く
2. 以下のメッセージを送信：

```
Create a simple HTML page using the create_tool_job tool.

Please use these parameters:
- provider: codex
- prompt: "Create a file named test.html with a simple hello world page that has a button"
- async_mode: true

After creating the tool job, the system will automatically resume and verify the changes.
```

3. Agentが`create_tool_job`ツールを呼び出すのを確認
4. Tool Jobが作成され、job IDが表示されることを確認

### 手順3: Tool Job完了の確認

1. AI Studio > Tool Jobs ページに移動
2. 作成したTool Jobのステータスを確認
3. ステータスが「Succeeded」または「Failed」になるまで待機
4. Job詳細をクリックして結果を確認

### 手順4: 自動Resume動作の確認

Tool Jobが完了すると、以下が自動的に実行されるはずです：

1. コールバックハンドラーが`agent_tool_job_results`テーブルに結果を保存
2. Agent実行状態が更新される
3. （現在の実装では）ユーザーが手動でResumeを実行する必要があります

**Resume手順**:
1. チャットルームに戻る
2. 以下のメッセージを送信（execution_idは実際の値に置き換え）：

```
Resume execution from the previous tool job.
Use execution_id: <実際のexecution_id>
```

3. または、UI上で「Resume」ボタンがあればクリック

### 手順5: 検証指示の確認

Resumeレスポンスに以下の内容が含まれることを確認：

- Tool Job完了結果のサマリー
- **検証ステップの指示**:
  - Playwright MCPを使用したUI/機能テスト
  - シナリオテストの実行
  - エラー時の対応手順
  - 成功時の報告形式

### 手順6: 自律的な検証の観察

LLMが以下のアクションを自動的に実行するか観察：

1. **Playwright MCPツールの使用**:
   - `browser_navigate`: 作成したHTMLページに移動
   - `browser_snapshot`: ページのスナップショット取得
   - `browser_click`: ボタンのクリックテスト

2. **検証結果の報告**:
   - 成功: 詳細なテスト結果とスクリーンショット
   - 失敗: エラー詳細と修正提案

3. **失敗時の自動修正**（オプション）:
   - 新しい`create_tool_job`の呼び出し
   - 修正内容を含むプロンプト
   - `async_mode: true`で反復実行

## Playwright MCPでの手動検証

UIからの操作が複雑な場合、Playwright MCPを直接使用して動作確認できます：

### 準備
```bash
# 開発サーバーが起動していることを確認
mise run dev-backend &
mise run dev &
```

### Playwright MCPでの確認

1. Tool Jobs画面にアクセス:
```
browser_navigate to http://localhost:16000/v1beta/tn_01hjryxysgey07h5jz5wagqj0m/ai/tool-jobs
```

2. ページのスナップショット取得:
```
browser_snapshot
```

3. Tool Job詳細を確認:
```
browser_click on the first job item
browser_snapshot
```

4. ステータスの確認:
スナップショット内で「Succeeded」「Failed」などのステータスを確認

## 期待される動作

### 成功ケース
1. Tool Jobが正常に完了
2. Resumeで検証指示が表示される
3. LLMがPlaywright MCPで検証を実行
4. 検証成功を報告
5. 会話ログに結果が記録される

### 失敗ケース
1. Tool Jobが失敗またはバグのあるコードを生成
2. Resumeで検証指示が表示される
3. LLMがPlaywright MCPで検証を実行
4. **エラーを検出**
5. **自動的に新しいTool Jobを作成**（修正タスク）
6. 修正Tool Job完了後、再度検証
7. 成功するまで繰り返し

## トラブルシューティング

### Tool Jobが作成されない
- `tool_access.create_tool_job`が`true`に設定されているか確認
- ポリシーチェック（`agents:CreateToolJob`）が通っているか確認
- ログで`handle_create_tool_job`の実行を確認

### Resumeが動作しない
- `agent_execution_states`テーブルにレコードがあるか確認
- `agent_tool_job_results`テーブルにTool Job結果があるか確認
- execution_idが正しいか確認

### 検証指示が表示されない
- `restore_execution_context`メソッドの戻り値を確認
- `resume_task`変数の内容をログで確認
- Tool Job完了時の`pending_tool_job_id`が設定されているか確認

### LLMが検証を実行しない
- Playwright MCPサーバーが起動しているか確認
- `mcp_hub_config_json`が正しく設定されているか確認
- LLMのレスポンスでツール呼び出しがあるか確認

## データベース確認クエリ

### Agent実行状態の確認
```sql
SELECT * FROM agent_execution_states
WHERE chatroom_id = 'ch_xxxxx'
ORDER BY created_at DESC LIMIT 10;
```

### Tool Job結果の確認
```sql
SELECT * FROM agent_tool_job_results
ORDER BY created_at DESC LIMIT 10;
```

### 最近のTool Jobの確認
（Tool Jobは`ToolJobManager`のメモリ内で管理されているため、REST APIで確認）
```bash
curl -H "Authorization: Bearer dummy-token" \
     -H "x-operator-id: tn_01hjryxysgey07h5jz5wagqj0m" \
     http://localhost:50054/v1/agent/tool-jobs
```

## まとめ

フェーズ3の実装により、以下が可能になりました：

1. ✅ Tool Job完了後の自動検証指示
2. ✅ Playwright MCPを使用した動作確認の促進
3. ✅ 検証失敗時の自動修正ループの基盤
4. ✅ 検証結果の会話ログへの自動反映

次のステップ：
- [ ] 自動Resume機能の実装（現在は手動Resume）
- [ ] GitHub Webhook連携（フェーズ4）
- [ ] リトライポリシーとバックオフの実装
- [ ] 検証メトリクスの収集とモニタリング
