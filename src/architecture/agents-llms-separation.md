# AgentsクレートとLLMsクレートの責務分離

## 概要

`packages/agents`と`packages/llms`の責務を明確に分離し、agentsをステートレスな実行レイヤー、llmsを管理・永続化レイヤーとして再設計しました。これにより、コードの再利用性、テスタビリティ、保守性が大幅に向上しています。

## 背景と課題

### リファクタリング前の問題点

```yaml
問題点:
  データソースの分散:
    - Agent API経由のTool Job: メモリ内HashMap（ToolJobManager）
    - REST API経由のTool Job: ファイルシステム + DB
    - UIでは片方しか表示されない

  責務の不明瞭さ:
    - ToolJobManagerが状態管理、永続化、実行を全て担当
    - agents crateが特定のアプリケーション（tachyon-api）に密結合

  テスタビリティの低下:
    - ステートフルなManagerのテストが複雑
    - 依存関係が多く、モックが困難
```

### 期待される成果

1. **agents crateの再利用性向上**: 純粋なツール実行ライブラリとして他プロジェクトでも利用可能
2. **データの一元管理**: llms crateでAgent実行とTool Jobを統合管理
3. **アーキテクチャの明確化**: 実行（agents）vs 管理（llms）の責務分離
4. **テスタビリティ向上**: agents側は純粋関数的な実行ロジックのみ

## アーキテクチャ設計

### 責務の分離

```yaml
packages/agents:
  description: "ステートレスなツール実行レイヤー"
  responsibilities:
    - ToolRunner trait定義
    - CLI実行と結果正規化
    - ドメインモデル（Request/Result）
  exports:
    - ToolRunner trait
    - CodexRunner / ClaudeCodeRunner / CursorAgentRunner
    - ToolJobCreateRequest / ToolJobResult / NormalizedOutput
  dependencies:
    - codex_provider
    - claude_code
    - value_object
    - errors
  excluded:
    - 状態管理（ToolJobManager削除）
    - 永続化（repository、storage削除）
    - REST APIエンドポイント（axumアダプター削除）

packages/llms:
  description: "Agent & Tool Job管理レイヤー"
  responsibilities:
    - Tool Job状態管理とステートマシン
    - Tool Job永続化（Repository）
    - Usecase層（Create/Get/List/Cancel）
    - Agent実行状態との統合
    - コールバック処理
  dependencies:
    - agents (ToolRunner使用)
    - auth (PolicyCheck)
    - payment (Billing)
    - persistence (Database)

apps/tachyon-api:
  description: "外部APIエントリーポイント"
  responsibilities:
    - REST/GraphQLエンドポイント提供
    - ヘッダー検証とDI
    - llms Usecaseへの委譲
  dependencies:
    - llms
    - agents (型定義のみ)
```

### 依存関係の方向性

```
agents (ステートレス実行)
  ↑ 使用
llms (管理・永続化)
  ↑ 呼び出し
tachyon-api (エントリーポイント)
```

## ディレクトリ構造

### リファクタリング後

```
packages/
├── agents/
│   ├── src/
│   │   ├── lib.rs                # ToolRunner exportのみ
│   │   ├── runner.rs             # trait定義
│   │   ├── codex_runner.rs
│   │   ├── claude_runner.rs
│   │   ├── cursor_agent_runner.rs
│   │   └── job.rs                # Request/Resultドメインモデル
│   └── Cargo.toml                # sqlx依存削除
│
└── llms/
    ├── domain/src/
    │   └── tool_job_repository.rs
    ├── src/
    │   ├── usecase/
    │   │   ├── create_tool_job.rs
    │   │   ├── get_tool_job.rs
    │   │   ├── list_tool_jobs.rs
    │   │   └── cancel_tool_job.rs
    │   ├── interface_adapter/
    │   │   └── gateway/
    │   │       └── sqlx_tool_job_repository.rs
    │   └── adapter/
    │       └── axum/
    │           └── tool_jobs/
    │               ├── mod.rs
    │               ├── create_tool_job_handler.rs
    │               ├── get_tool_job_handler.rs
    │               ├── list_tool_jobs_handler.rs
    │               ├── cancel_tool_job_handler.rs
    │               └── model.rs
    └── Cargo.toml                 # agents依存追加
```

## データフロー

### リファクタリング前

```
User/LLM → REST API → ToolJobManager (HashMap + Filesystem)
                            ↓
                       ToolRunner → External CLI
```

問題: データソースが分散、永続化が不安定

### リファクタリング後

```
User/LLM → REST API → CreateToolJob Usecase → ToolRunner → External CLI
                            ↓
                   SqlxToolJobRepository → agent_tool_jobs table
```

改善: データソースが一元化、永続化が確実

## 主要な変更内容

### 1. agents crateのクリーンアップ

**削除されたコンポーネント:**
- `ToolJobManager` - 状態管理
- `storage.rs` - ファイルシステム永続化
- `repository.rs` - DB永続化
- `adapter/axum.rs` - REST APIハンドラー
- `usecase/` - ユースケース層

**残存コンポーネント:**
- `ToolRunner` trait
- `CodexRunner` / `ClaudeCodeRunner` / `CursorAgentRunner`
- `ToolJobCreateRequest` / `ToolJobResult` / `NormalizedOutput`

### 2. llms crateへの移行

**新規追加:**
- `ToolJobRepository` trait（domain層）
- `SqlxToolJobRepository`（infrastructure層）
- `CreateToolJob` / `GetToolJob` / `ListToolJobs` / `CancelToolJob` Usecase
- REST APIハンドラー群（`adapter/axum/tool_jobs/`）

**データベーステーブル:**
```sql
-- packages/llms/migrations/20251223180000_create_tool_jobs_table.up.sql
CREATE TABLE agent_tool_jobs (
  job_id VARCHAR(32) NOT NULL,
  operator_id VARCHAR(29) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL,
  prompt TEXT NOT NULL,
  result JSON,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  PRIMARY KEY (job_id),
  KEY idx_operator_provider (operator_id, provider),
  KEY idx_user (user_id)
);
```

### 3. API層の切り替え

**tachyon-api/router.rs:**
```rust
// 変更前
use agents::adapter::axum::create_router as create_agents_router;
router = router.merge(create_agents_router(shared_tool_job_manager));

// 変更後
use llms::adapter::axum::tool_jobs::create_router as create_tool_jobs_router;
router = router.merge(create_tool_jobs_router(llms_app));
```

**llms/command_stack/tool_executor.rs:**
```rust
// tool_job_managerをOptional化
pub struct ToolExecutor {
    tool_job_manager: Option<Arc<ToolJobManager>>,  // CLI用など
    // ...
}
```

## テスト戦略

### TDD（テスト駆動開発）

```yaml
既存動作の保証:
  - agent_verification_loop_test.yaml: Agent API統合テスト
  - tool_job_rest.yaml: Tool Job REST APIテスト
  - agent_idempotency_test.yaml: Idempotency-Keyテスト

テストファーストアプローチ:
  - llms側のToolJobUsecaseテスト（Red → Green → Refactor）
  - agents側のToolRunnerテスト（独立実行可能）
  - Repository層のテスト（DB永続化検証）

継続的検証:
  - 各コミットでmise run check成功
  - シナリオテスト全件通過（25件）
  - カバレッジ維持
```

### テスト結果

```yaml
シナリオテスト: 25件全て成功 ✅
mise run check: 成功 ✅
mise run ci-rust: 成功 ✅ (236テスト中235成功、1つはignore)
```

## パフォーマンス

リファクタリング前後でパフォーマンスの劣化はありません：

- Tool Job作成: 同等
- Tool Job取得: DB永続化により若干高速化（メモリ検索からDB検索へ）
- Tool Job一覧: フィルタリングがSQL側で実行されるため高速化

## 将来の拡張

### ToolAccessConfigへの統合

現在、ツール関連の設定が分散しています：

```rust
// 現状
pub struct ExecuteAgentInputData {
    pub tool_access: ToolAccessConfig,
    pub agent_protocol_tool: Option<AgentProtocolToolContext>,
}

// 将来の改善案
pub struct ToolAccessConfig {
    pub filesystem: bool,
    pub command: bool,
    pub create_tool_job: bool,
    pub agent_protocol: bool,
    pub agent_protocol_context: Option<AgentProtocolToolContext>,
}
```

### with_tool_job_usecases パターン

ToolJob UsecaseをDI可能にするBuilderパターン：

```rust
impl ExecuteAgent {
    pub fn with_tool_job_usecases(
        mut self,
        create: Arc<CreateToolJob>,
        get: Arc<GetToolJob>,
        cancel: Arc<CancelToolJob>,
    ) -> Self {
        self.create_tool_job = Some(create);
        self.get_tool_job = Some(get);
        self.cancel_tool_job = Some(cancel);
        self
    }
}
```

**メリット:**
- テスト時にToolJob機能をスキップ可能
- モック不要でテストが簡潔に

## まとめ

このリファクタリングにより：

1. ✅ agents crateがステートレス（ToolRunner traitのみ提供）
2. ✅ llms crateでTool Job管理完結（Repository、Usecase、ステートマシン）
3. ✅ 全シナリオテスト成功（25件通過）
4. ✅ 既存のAgent API、REST APIが同じ動作を維持
5. ✅ UI（`/ai/tool-jobs`）でAgent経由のTool Jobも表示可能

アーキテクチャの明確化により、今後の機能追加や保守が大幅に容易になりました。

## 参考資料

- タスクドキュメント: `docs/src/tasks/completed/v0.26.0/agents-crate-stateless-refactoring/`
- [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Agent Tool Jobs仕様](../tachyon-apps/llms/agent-api/tool-jobs.md)
