# Auto Chatroom Naming

## Overview

Agent API経由でchatroomを作成・agent実行した後、チャットの内容をLLMで分析して自動的にchatroomの名前を設定する機能。ユーザー体験を向上させ、複数のchatroomを管理しやすくする。

## Use Cases

- **新規チャット作成時**: 「New Room」というデフォルト名から、会話内容に基づいた意味のある名前に自動更新
- **複数チャット管理**: 一目で会話内容がわかる名前により、履歴からの検索・識別が容易に
- **非同期実行**: メインのストリーミング処理をブロックせず、バックグラウンドで名前生成

## Implementation

### Architecture

```
ExecuteAgent (既存)
    │
    └─→ on_completion() ──→ AutoGenerateChatroomName (新規)
                                   │
                                   ├─→ LLM Name Generation
                                   │
                                   └─→ ChatroomRepository.update()
```

### Key Components

#### AutoGenerateChatroomName Usecase

- **場所**: `packages/llms/src/usecase/auto_generate_chatroom_name.rs`
- **役割**: Chatroomの会話内容からLLMで適切な名前を生成し、更新
- **トリガー条件**:
  - Agent実行が正常完了（COMPLETED状態）
  - Chatroom名が「New Room」（デフォルト名）

#### LLM Name Generation

- **使用モデル**: `gemini-2.5-flash-lite`（コスト最小化）
- **プロンプト**: 会話の最初のメッセージとAssistant応答から30文字以内の名前を生成
- **言語**: 会話言語に合わせて日本語または英語

### Authorization

- **アクション**: `llms:AutoGenerateChatroomName`
- **リソースパターン**: `trn:llms:chat:*`
- **適用ポリシー**: AdminPolicy, DeveloperPolicy, AIAgentExecutorPolicy, TenantAdminPolicy

## Data Flow

```yaml
flow:
  1_agent_execute:
    trigger: "POST /v1/llms/chatrooms/:id/agent/execute"
    actions:
      - agent実行開始
      - ストリームでレスポンス送信
      - agent実行完了（COMPLETED状態）

  2_auto_name_generation:
    trigger: "agent実行完了 && chatroom.name == 'New Room'"
    actions:
      - chatroomのメッセージ取得（最新のUser/Assistantペア）
      - LLMで名前生成（gemini-2.5-flash-lite）
      - chatroom.update(name)
      - ログ出力（成功/失敗）
```

## Technical Details

### Non-blocking Execution

名前生成は`tokio::spawn`で非同期実行され、メインのストリーミングレスポンスをブロックしない。

```rust
tokio::spawn(async move {
    match auto_gen
        .execute(AutoGenerateChatroomNameInputData {
            chatroom_id: chatroom_id.clone(),
            executor: &executor,
            multi_tenancy: &multi_tenancy,
        })
        .await
    {
        Ok(name) => {
            tracing::info!(
                "Successfully auto-generated chatroom name: {}",
                name
            );
        }
        Err(e) => {
            tracing::warn!(
                "Failed to auto-generate chatroom name: {:?}",
                e
            );
        }
    }
});
```

### Error Handling

- 名前生成の失敗はログ出力のみで、メイン処理に影響しない
- LLM API呼び出し失敗時はデフォルト名「New Room」のままとなる
- Policy check失敗時も同様にログ出力のみ

### Idempotency

- 既に名前が設定されているchatroom（「New Room」以外）は再生成されない
- 同一chatroomへの複数Agent実行でも、初回のみ名前生成が発動

## API Integration

### ExecuteAgent Endpoint

```
POST /v1/llms/chatrooms/:id/agent/execute
```

Agent実行完了時に自動的にchatroom名が更新される。クライアント側での追加設定は不要。

### Response Example

Agent実行後、chatroom取得で更新された名前を確認：

```json
{
  "id": "ch_01kf0nndk4mrs0fy08n9rr0hsv",
  "name": "Rust Error Handling Discussion",
  "created_at": "2026-01-15T10:00:00Z",
  "updated_at": "2026-01-15T10:05:30Z"
}
```

## Configuration

特別な設定は不要。機能はデフォルトで有効。

### Cost Considerations

- 名前生成用LLMモデル: `gemini-2.5-flash-lite`
- 推定コスト: 約0.0001 USD/リクエスト（非常に低コスト）
- 実行頻度: 初回Agent実行時のみ

## Related Documentation

- [Agent API Overview](./overview.md) - Agent APIの概要
- [Chatroom Management REST API](../chatroom-management-rest-api.md) - Chatroomの管理API
- Archived taskdoc: `docs/src/tasks/completed/v0.31.0/auto-chatroom-name-generation/`

## Version History

- **v0.31.0** (2026-01-15): Initial implementation
  - Added AutoGenerateChatroomName usecase
  - Integrated with ExecuteAgent completion callback
  - Policy check with llms:AutoGenerateChatroomName action
