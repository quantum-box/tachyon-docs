---
title: "Agent API TodoWrite ツール実装"
type: feature
emoji: "📝"
topics:
  - Agent API
  - Tool
  - LLMs
  - Claude Code
published: true
targetFiles:
  - packages/llms/domain/src/todo_item.rs
  - packages/llms/domain/src/repository/todo_repository.rs
  - packages/llms/domain/src/service/todo_tool.rs
  - packages/llms/src/interface_adapter/gateway/sqlx_todo_repository.rs
  - packages/llms/src/interface_adapter/controller/todo_graphql.rs
  - packages/llms/src/usecase/list_todos.rs
  - packages/llms/src/usecase/update_todos.rs
  - packages/llms/migrations/
  - apps/tachyon/src/app/v1beta/[tenant_id]/ai/chatrooms/
github: https://github.com/quantum-box/tachyon-apps
---

# Agent API TodoWrite ツール実装

## 概要

Tachyon Agent API に Claude Code の TodoWrite ツールと同等の todo リスト管理機能を追加する。エージェントがタスクの進捗を追跡し、ユーザーに可視化できるようにする。

## 背景・目的

- **なぜ必要か**: Claude Code では TodoWrite ツールを使ってタスクの進捗管理を行っており、同様の機能を Tachyon Agent API でも提供したい
- **解決したい課題**:
  - エージェント実行中のタスク進捗がユーザーに見えない
  - 複雑なタスクの分解と追跡ができない
- **期待される成果**:
  - エージェントがタスクを分解して計画を立てられる
  - ユーザーがリアルタイムで進捗を確認できる
  - タスク完了状況を可視化できる

## 詳細仕様

### 機能要件

1. **Todo アイテムの管理**
   - タスクの作成・更新・完了
   - 3つのステータス: `pending`, `in_progress`, `completed`
   - 各アイテムに命令形（content）と進行形（activeForm）の両方を保持

2. **ツール仕様** (Claude Code 互換)
   ```yaml
   tool:
     name: TodoWrite
     description: "Create and manage a structured task list for tracking progress"
     parameters:
       todos:
         type: array
         items:
           type: object
           properties:
             content:
               type: string
               minLength: 1
               description: "Task description in imperative form (e.g., 'Run tests')"
             activeForm:
               type: string
               minLength: 1
               description: "Task description in present continuous form (e.g., 'Running tests')"
             status:
               type: string
               enum: [pending, in_progress, completed]
           required: [content, status, activeForm]
   ```

3. **使用ルール**
   - 同時に `in_progress` は1つのみ推奨
   - タスク完了後は即座に `completed` にマーク
   - タスク開始時に `in_progress` にマーク

### 非機能要件

- **パフォーマンス**: ツール呼び出しは 100ms 以内で応答
- **スレッドセーフ**: 非同期環境での同時アクセスに対応
- **メモリ効率**: セッションごとに適切にクリーンアップ

### コンテキスト別の責務

```yaml
contexts:
  llms:
    description: "LLM サービスでの todo ツール実行"
    responsibilities:
      - TodoWriteTool の実装
      - ツール実行とレスポンス生成
      - セッション内状態管理

  agents:
    description: "エージェント実行フレームワーク"
    responsibilities:
      - Agent への TodoWriteTool 登録
      - 実行コンテキストの管理
```

### データモデル定義

```yaml
# Todo アイテムの構造
todo_item:
  fields:
    content:
      type: String
      description: "タスク内容（命令形: 'Run tests', 'Build the project'）"
      required: true
      min_length: 1
    active_form:
      type: String
      description: "実行中の表現（進行形: 'Running tests', 'Building the project'）"
      required: true
      min_length: 1
    status:
      type: TodoStatus
      description: "タスクの状態"
      required: true

# ステータス列挙型
todo_status:
  variants:
    - Pending      # 未着手
    - InProgress   # 実行中
    - Completed    # 完了

# Todo リスト（ツール入力）
todo_write_input:
  fields:
    todos:
      type: Vec<TodoItem>
      description: "更新後の todo リスト全体"
      required: true
```

## 実装方針

### アーキテクチャ設計

Clean Architecture に従い、以下の構成で実装:

```
packages/llms/
├── domain/src/
│   ├── todo_item.rs          # TodoItem, TodoStatus エンティティ
│   ├── repository/
│   │   └── todo_repository.rs # TodoRepository トレイト
│   └── service/
│       └── todo_tool.rs      # TodoWriteTool 実装
├── src/
│   ├── usecase/
│   │   ├── list_todos.rs     # Todo 一覧取得 Usecase
│   │   └── update_todos.rs   # Todo 更新 Usecase
│   └── interface_adapter/
│       ├── gateway/
│       │   └── sqlx_todo_repository.rs  # MySQL 永続化
│       └── controller/
│           └── todo_graphql.rs          # GraphQL リゾルバー
└── migrations/
    └── YYYYMMDD_create_chatroom_todos.sql

apps/tachyon/
└── src/app/v1beta/[tenant_id]/ai/chatrooms/[chatroom_id]/
    └── components/
        └── todo-list.tsx     # Todo リスト UI コンポーネント
```

### データベーススキーマ

```sql
CREATE TABLE tachyon_apps_llms.chatroom_todos (
    id CHAR(26) NOT NULL PRIMARY KEY,           -- ULID
    chatroom_id CHAR(26) NOT NULL,              -- 所属 chatroom
    content VARCHAR(500) NOT NULL,               -- タスク内容（命令形）
    active_form VARCHAR(500) NOT NULL,           -- 実行中表現（進行形）
    status ENUM('pending', 'in_progress', 'completed') NOT NULL DEFAULT 'pending',
    position INT NOT NULL DEFAULT 0,             -- 表示順序
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    INDEX idx_chatroom_todos_chatroom_id (chatroom_id),
    INDEX idx_chatroom_todos_status (status)
);
```

### 技術選定

| 技術 | 選定理由 |
|------|----------|
| `serde` | JSON シリアライズ/デシリアライズ |
| `tokio::sync::RwLock` | 非同期スレッドセーフな状態管理 |
| 既存 Tool トレイト | 統一インターフェースの維持 |

### 実装詳細

**1. TodoItem エンティティ** (`packages/llms/domain/src/todo_item.rs`)
```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TodoStatus {
    Pending,
    InProgress,
    Completed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoItem {
    pub content: String,
    pub active_form: String,
    pub status: TodoStatus,
}
```

**2. TodoWriteTool** (`packages/llms/domain/src/service/todo_tool.rs`)
```rust
use crate::service::tool::{Tool, Parameter, ToolSchema};
use crate::todo_item::{TodoItem, TodoStatus};
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct TodoWriteTool {
    store: Arc<RwLock<Vec<TodoItem>>>,
}

impl TodoWriteTool {
    pub fn new() -> Self {
        Self {
            store: Arc::new(RwLock::new(Vec::new())),
        }
    }

    pub fn with_store(store: Arc<RwLock<Vec<TodoItem>>>) -> Self {
        Self { store }
    }

    pub async fn get_todos(&self) -> Vec<TodoItem> {
        self.store.read().await.clone()
    }
}

#[async_trait::async_trait]
impl Tool for TodoWriteTool {
    fn name(&self) -> String {
        "TodoWrite".to_string()
    }

    fn description(&self) -> String {
        "Create and manage a structured task list for tracking progress. \
         Use this tool to plan complex tasks, track progress, and show \
         the user what you're working on.".to_string()
    }

    fn parameters(&self) -> Vec<Parameter> {
        vec![Parameter {
            name: "todos".to_string(),
            description: "The updated todo list".to_string(),
            param_type: "array".to_string(),
            required: true,
        }]
    }

    fn json_schema(&self) -> ToolSchema {
        // JSON Schema 実装
    }

    async fn execute(&self, params: serde_json::Value) -> errors::Result<serde_json::Value> {
        let todos: Vec<TodoItem> = serde_json::from_value(params["todos"].clone())
            .map_err(|e| errors::Error::BadRequest(format!("Invalid todos format: {}", e)))?;

        let mut store = self.store.write().await;
        *store = todos;

        Ok(serde_json::json!({
            "success": true,
            "count": store.len()
        }))
    }

    async fn run(&self, params: serde_json::Value) -> errors::Result<serde_json::Value> {
        self.execute(params).await
    }
}
```

## タスク分解

### フェーズ1: ドメインモデル・DB 🔄 (着手中)

- [ ] `TodoStatus` enum 定義 (`packages/llms/domain/src/todo_item.rs`)
- [ ] `TodoItem` エンティティ定義 (`packages/llms/domain/src/todo_item.rs`)
- [ ] `TodoRepository` トレイト定義 (`packages/llms/domain/src/repository.rs` に追加)
- [ ] DBマイグレーション作成 (`chatroom_todos` テーブル)
- [ ] `SqlxTodoRepository` 実装 (`packages/llms/src/interface_adapter/gateway/`)
- [ ] ユニットテスト

### フェーズ2: ツール・Usecase 実装 📝

- [x] `TodoWriteTool` 構造体 (`packages/llms/domain/src/service/todo_tool.rs`)
- [x] Agent tool executor へ `TodoWrite` 追加
- [x] `Tool` トレイト実装
- [x] JSON Schema 生成
- [x] `ListTodos` Usecase (`packages/llms/src/usecase/list_todos.rs`)
- [x] `UpdateTodos` Usecase (`packages/llms/src/usecase/update_todos.rs`)
- [x] StreamCompletionChat へのツール登録 (`packages/llms/src/app.rs`)
- [ ] 統合テスト

### フェーズ3: GraphQL API 📝

- [x] `ChatroomTodo` GraphQL 型定義
- [x] `chatroom_todos` クエリリゾルバー
- [x] `updateChatroomTodos` ミューテーションリゾルバー
- [ ] GraphQL スキーマ更新 (`mise run codegen`)

### フェーズ4: フロントエンド UI 📝

- [x] `TodoList` コンポーネント (`apps/tachyon/src/app/v1beta/[tenant_id]/ai/chatrooms/`)
- [x] Chatroom 画面への統合
- [x] Agent Chat 画面へのTodo UI追加
- [x] リアルタイム更新（ポーリング or Subscription）
- [x] Storybook ストーリー + インタラクションテスト
- [ ] E2E テスト（Playwright）

## テスト計画

### ユニットテスト

```rust
#[tokio::test]
async fn test_todo_write_creates_todos() {
    let tool = TodoWriteTool::new();
    let params = serde_json::json!({
        "todos": [
            {
                "content": "Run tests",
                "activeForm": "Running tests",
                "status": "pending"
            }
        ]
    });

    let result = tool.execute(params).await.unwrap();
    assert_eq!(result["success"], true);
    assert_eq!(result["count"], 1);
}

#[tokio::test]
async fn test_todo_status_transitions() {
    // pending -> in_progress -> completed の遷移テスト
}

#[tokio::test]
async fn test_invalid_todo_format() {
    // 不正な入力のエラーハンドリングテスト
}
```

### 統合テスト

- エージェント実行中の todo 更新
- 複数回のツール呼び出し
- セッション終了時のクリーンアップ

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 既存 Tool トレイトとの互換性問題 | 中 | 既存実装を参考に慎重に実装 |
| メモリリーク（セッション未クリーンアップ） | 中 | セッション終了時のクリーンアップ処理 |
| 同時書き込みによるレースコンディション | 低 | RwLock による排他制御 |

## 参考資料

- [Claude Code TodoWrite 仕様](システムプロンプト内)
- [packages/llms/domain/src/service/tool.rs](../../../packages/llms/domain/src/service/tool.rs) - 既存 Tool トレイト
- [packages/agents/src/job.rs](../../../packages/agents/src/job.rs) - ToolJobStatus など

## 完了条件

- [ ] すべてのフェーズのタスクが完了
- [ ] ユニットテストが全てパス
- [ ] `mise run ci` が成功
- [ ] コードレビュー完了

### バージョン番号の決定基準

**マイナーバージョン（x.X.x）を上げる**:
- [x] 新機能の追加（TodoWrite ツール）
- [x] 新しいドメインモデルの追加（TodoItem）

## 備考

### 決定事項

1. **永続化**: ✅ DB 永続化
   - 履歴参照可能
   - chatroom 終了後も todo 履歴を保持

2. **スコープ**: ✅ Chatroom 単位
   - チャットルーム内で todo を共有
   - chatroom_id をキーとして管理

3. **UI 統合**: ✅ GraphQL + フロントエンド同時実装
   - 完全な機能を一度に提供

### 実装メモ

- `mise run docker-codegen` で `apps/tachyon-api/schema.graphql` と `apps/library-api/schema.graphql` が
  フロントエンドコンテナに反映されるよう、`compose.yml` の `tachyon` サービスに
  schema ファイルのマウントを追加

## 実装状況 (2026-01-10 更新)

### 進捗サマリー

| 領域 | 状況 | 進捗 |
|------|------|------|
| ドメインモデル | 実装完了 | 100% |
| リポジトリ | 実装完了 | 100% |
| DBマイグレーション | 実装完了 | 100% |
| ツール実装 | 実装完了 | 100% |
| Usecase | 実装完了 | 100% |
| GraphQL | 実装完了 | 100% |
| フロントエンド | UI実装 + Storybook済み（手動動作確認済み） | 95% |
| **全体** | **フェーズ3完了 / フェーズ4進行中** | **90%** |

### フェーズ1完了項目 ✅

- ✅ `TodoStatus` enum 定義 (`packages/llms/domain/src/todo_item.rs`)
  - Pending, InProgress, Completed の3状態
  - `as_str()` / `from_str()` メソッド実装
  
- ✅ `TodoItem` エンティティ定義 (`packages/llms/domain/src/todo_item.rs`)
  - `TodoItemId` (ULID, プレフィックス "td_")
  - `ChatRoomId` との関連
  - content (命令形)、active_form (進行形) フィールド
  - position による順序管理
  - 更新メソッド: `update_status()`, `update_content()`, `update_position()`
  - ユニットテスト実装済み

- ✅ `TodoRepository` トレイト定義 (`packages/llms/domain/src/repository.rs`)
  - `save()`, `save_all()` - 保存メソッド
  - `find_by_id()`, `find_by_chatroom()` - 検索メソッド
  - `delete()`, `delete_by_chatroom()` - 削除メソッド

- ✅ DBマイグレーション作成
  - `20260109000000_create_chatroom_todos.up.sql`
  - `20260109000000_create_chatroom_todos.down.sql`
  - テーブル: `tachyon_apps_llms.chatroom_todos`
  - インデックス: chatroom_id, status, (chatroom_id, position)
- ✅ 追加マイグレーション
  - `20260110000000_expand_chatroom_todos_ids.up.sql`
  - `20260110000000_expand_chatroom_todos_ids.down.sql`
  - `chatroom_todos.id` / `chatroom_id` を CHAR(29) に拡張（"td_"/"ch_" プレフィックス対応）

- ✅ `SqlxTodoRepository` 実装 (`packages/llms/src/adapter/gateway/sqlx_todo_repository.rs`)
  - 全メソッド実装済み
  - トランザクション対応 (`save_all`)
  - TodoItemRow によるDB⇔ドメイン変換

- ✅ モジュールエクスポート
  - `packages/llms/domain/src/lib.rs` に `todo_item` 追加
  - `packages/llms/src/adapter/gateway/mod.rs` に `sqlx_todo_repository` 追加

### フェーズ2完了項目 ✅

- ✅ `TodoWriteTool` 実装 (`packages/llms/domain/src/service/todo_tool.rs`)
  - Claude Code 互換の JSON Schema を定義
  - chatroomId は実行時に注入される想定
- ✅ Usecase 実装
  - `ListTodos` / `UpdateTodos` を追加
  - `UpdateTodos` は chatroom 単位で全件置換
- ✅ StreamCompletionChat に TodoWrite を登録
  - `TodoWrite` 実行時に `chatroomId` を自動補完

### フェーズ3進捗 ✅

- ✅ GraphQL 型/リゾルバー追加
  - `ChatroomTodo` 型
  - `chatroom_todos` / `updateChatroomTodos`
- ✅ `mise run docker-codegen` 実施済み

### 付随対応 ✅

- ✅ Todo UI をコンパクトに調整（ボタン/入力/カードの密度を削減）
- ✅ Agent chat のツールパースに TodoWrite を追加
  - <TodoWrite> タグを認識
  - todos 文字列(JSON)を配列として解釈
- ✅ `scripts/seeds/n1-seed/008-auth-policies.yaml` に
  - `llms:ListChatroomTodos`
  - `llms:UpdateChatroomTodos`
  を追加し、主要Policyへ付与
- ✅ Agent system prompt に TodoWrite ツール説明を追加（デフォルト表示）
- ✅ Agent tool executor で TodoWrite を実行
  - chatroomId を自動注入
  - Agent/Resume 両方で有効
- ✅ AGENTS.md に Docker image の rebuild不要ルールを追記

### 動作確認 ✅

- ✅ Playwright でエージェントチャットを確認
  - TodoWrite の tool_call / tool_result が成功
  - Control Panel の Todos に2件（Completed）を表示
  - TodoWrite のタスクリストに基づく実行ログを確認

### テスト実行 📝

- 🔄 `mise run docker-ci` を実行中に DB イメージの pull が長時間継続したため中断（2026-01-10）
- 🔄 `mise run docker-ci` を再実行したが、Rust テストの `llms` ビルドで SIGKILL（OOM疑い）により失敗（2026-01-10）

### 参照すべき既存実装

| ファイル | 用途 |
|----------|------|
| `packages/llms/domain/src/service/tool.rs` | 既存 `Tool` トレイト（TodoWriteTool の参考） |
| `packages/llms/src/agent/tool/mod.rs` | ツール実行のディスパッチパターン |
| `packages/llms/src/adapter/gateway/sqlx_agent_execution_state_repository.rs` | SQLxリポジトリ実装パターン |

### 次のアクション (フェーズ4)

1. ✅ リアルタイム更新（ポーリング）
2. ✅ Storybook ストーリー + インタラクションテスト
3. Playwright E2E (必要なら)
