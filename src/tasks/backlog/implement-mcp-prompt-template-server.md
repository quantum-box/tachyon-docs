---
title: "MCP AgentProtocolサーバーの実装"
type: "feature"
emoji: "🤖"
topics:
  - MCP
  - AgentProtocol
  - Database
  - Agent
  - Workflow
published: true
targetFiles:
  - apps/tachyon-api/src/
  - packages/llms/
  - docs/src/tachyon-apps/llms/
github: https://github.com/quantum-box/tachyon-apps/blob/main/docs/src/tasks/feature/implement-mcp-prompt-template-server.md
---

# MCP AgentProtocolサーバーの実装

## 概要

エージェントが複雑なタスクを体系的に実行するための**AgentProtocol**（エージェントプロトコル）を管理するMCP（Model Context Protocol）サーバーを実装します。AgentProtocolは、特定の領域における最適な作業手順、思考プロセス、品質基準を定義した構造化された指示書です。

## AgentProtocol とは

### 定義
	**AgentProtocol**は、エージェントが特定のドメインや問題類型に対して最適なパフォーマンスを発揮するための構造化された行動指針です。単なる手順書ではなく、以下の要素を含む包括的なプロトコルです：

- **思考フレームワーク**: 問題解決のための体系的な思考プロセス
- **作業手順**: 具体的なステップとアクション
- **品質基準**: 成果物の品質を保証する指標
- **コンテキスト認識**: タスクの状況や制約に応じた適応方法
- **エラーハンドリング**: 想定外の状況への対処法

### 解決したい課題
- エージェントの応答品質にばらつきがある
- 専門領域でのエージェントの知識が不足している
- 複雑なタスクに対する体系的なアプローチが欠如している
- ベストプラクティスの蓄積と再利用ができていない
- エージェントの学習と改善のメカニズムが不十分

### 期待される成果・メリット
- **品質の標準化**: 専門領域でのエージェント応答品質の向上
- **効率の最適化**: 実証済みのプロトコルによる作業効率向上
- **知識の蓄積**: ドメインエキスパートの知見をAgentProtocolとして体系化
- **継続的改善**: 使用データに基づくプロトコルの継続的改善
- **スケーラビリティ**: 新しい領域への迅速な対応能力

## 実装手順

### ステップ1: 既存LLMs Crateへの構造追加

1. **packages/llms/Cargo.toml への依存関係追加**
   ```toml
   # 既存の[dependencies]セクションに追加
   rust-decimal = { version = "1.0", features = ["serde-with-str"] }
   ```

2. **packages/llms/migrations/ にAgentProtocol用のマイグレーションファイル追加**
   ```bash
   # マイグレーションファイルの作成
   cd packages/llms/
   sqlx migrate add agent_protocols
   ```

### ステップ2: データベーススキーマの作成

1. **packages/llms/migrations/[TIMESTAMP]_agent_protocols.up.sql の作成**
   ```sql
   CREATE TABLE agent_protocols (
     id CHAR(36) PRIMARY KEY,
     name VARCHAR(255) NOT NULL,
     description TEXT,
     domain VARCHAR(100),
     thinking_framework TEXT NOT NULL,
     workflow_steps TEXT NOT NULL,
     quality_criteria JSON,
     context_adaptation JSON,
     error_handling TEXT,
     input_schema JSON,
     output_schema JSON,
     tags JSON, -- MySQL/TiDBでは配列型がないのでJSON配列として保存
     complexity_level INTEGER DEFAULT 1,
     estimated_time_minutes INTEGER,
     success_metrics JSON,
     usage_count INTEGER DEFAULT 0,
     effectiveness_score DECIMAL(3,2) DEFAULT 0.0,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
   );

   -- 検索用インデックス
   CREATE FULLTEXT INDEX idx_agent_protocols_search 
     ON agent_protocols(name, description);
   
   -- 通常のインデックス
   CREATE INDEX idx_agent_protocols_domain ON agent_protocols(domain);
   CREATE INDEX idx_agent_protocols_complexity ON agent_protocols(complexity_level);
   CREATE INDEX idx_agent_protocols_effectiveness ON agent_protocols(effectiveness_score DESC);
   ```

2. **packages/llms/migrations/[TIMESTAMP]_agent_protocols.down.sql の作成**
   ```sql
   DROP TABLE IF EXISTS agent_protocols;
   ```

### ステップ3: ドメインモデルの実装

1. **packages/llms/domain/src/agent_protocol.rs の作成**
   ```rust
   use chrono::{DateTime, Utc};
   use serde::{Deserialize, Serialize};
   use uuid::Uuid;
   use rust_decimal::Decimal;

   #[derive(Debug, Clone, Serialize, Deserialize)]
   pub struct AgentProtocol {
       pub id: String, // MySQL/TiDBではCHAR(36)として保存
       pub name: String,
       pub description: Option<String>,
       pub domain: Option<String>,
       pub thinking_framework: String,
       pub workflow_steps: String,
       pub quality_criteria: Option<serde_json::Value>,
       pub context_adaptation: Option<serde_json::Value>,
       pub error_handling: Option<String>,
       pub input_schema: Option<serde_json::Value>,
       pub output_schema: Option<serde_json::Value>,
       pub tags: Option<serde_json::Value>, // JSON配列として保存
       pub complexity_level: i32,
       pub estimated_time_minutes: Option<i32>,
       pub success_metrics: Option<serde_json::Value>,
       pub usage_count: i32,
       pub effectiveness_score: Decimal,
       pub created_at: DateTime<Utc>,
       pub updated_at: DateTime<Utc>,
   }

   impl AgentProtocol {
       /// タグをVec<String>として取得
       pub fn get_tags(&self) -> Vec<String> {
           self.tags
               .as_ref()
               .and_then(|v| v.as_array())
               .map(|arr| {
                   arr.iter()
                       .filter_map(|v| v.as_str().map(|s| s.to_string()))
                       .collect()
               })
               .unwrap_or_default()
       }

       /// Vec<String>をJSON形式でtagsフィールドに設定
       pub fn set_tags(&mut self, tags: Vec<String>) {
           self.tags = Some(serde_json::json!(tags));
       }
   }

   #[derive(Debug, Serialize, Deserialize)]
   pub struct AgentProtocolSearchQuery {
       pub query: String,
       pub domain: Option<String>,
       pub tags: Option<Vec<String>>,
       pub complexity_level: Option<i32>,
       pub min_effectiveness: Option<Decimal>,
       pub limit: Option<i32>,
   }

   #[derive(Debug, Serialize, Deserialize)]
   pub struct ProtocolExecutionContext {
       pub task_description: String,
       pub constraints: Option<serde_json::Value>,
       pub available_tools: Vec<String>,
       pub time_limit: Option<i32>,
       pub quality_requirements: Option<serde_json::Value>,
   }
   ```

2. **packages/llms/domain/src/lib.rs にAgentProtocolを追加**
   ```rust
   // 既存のモジュール定義に追加
   pub mod agent_protocol;

   // 既存のpub use文に追加
   pub use agent_protocol::*;
   ```

### ステップ4: リポジトリ層の実装

1. **packages/llms/src/adapter/gateway/sqlx_agent_protocol_repository.rs の作成**
   ```rust
   use async_trait::async_trait;
   use sqlx::PgPool;
   use uuid::Uuid;
   use rust_decimal::Decimal;
   use anyhow::Result;
   use llms_domain::{AgentProtocol, AgentProtocolSearchQuery, ProtocolExecutionContext};

   #[async_trait]
   pub trait AgentProtocolRepository {
       async fn find_all(&self, limit: Option<i32>) -> Result<Vec<AgentProtocol>>;
       async fn find_by_id(&self, id: &str) -> Result<Option<AgentProtocol>>;
       async fn find_by_domain(&self, domain: &str, limit: Option<i32>) -> Result<Vec<AgentProtocol>>;
       async fn search(&self, query: &AgentProtocolSearchQuery) -> Result<Vec<AgentProtocol>>;
       async fn recommend_for_context(&self, context: &ProtocolExecutionContext) -> Result<Vec<AgentProtocol>>;
       async fn create(&self, protocol: &AgentProtocol) -> Result<AgentProtocol>;
       async fn update(&self, protocol: &AgentProtocol) -> Result<AgentProtocol>;
       async fn increment_usage_count(&self, id: &str) -> Result<()>;
       async fn update_effectiveness_score(&self, id: &str, score: Decimal) -> Result<()>;
   }

   pub struct SqlxAgentProtocolRepository {
       pool: PgPool,
   }

   impl SqlxAgentProtocolRepository {
       pub fn new(pool: PgPool) -> Self {
           Self { pool }
       }
   }

   #[async_trait]
   impl AgentProtocolRepository for SqlxAgentProtocolRepository {
       async fn find_all(&self, limit: Option<i32>) -> Result<Vec<AgentProtocol>> {
           let limit = limit.unwrap_or(50);
           let protocols = sqlx::query_as!(
               AgentProtocol,
               "SELECT * FROM agent_protocols ORDER BY effectiveness_score DESC, usage_count DESC, created_at DESC LIMIT $1",
               limit
           )
           .fetch_all(&self.pool)
           .await?;
           Ok(protocols)
       }

       async fn find_by_id(&self, id: &str) -> Result<Option<AgentProtocol>> {
           let protocol = sqlx::query_as!(
               AgentProtocol,
               "SELECT * FROM agent_protocols WHERE id = ?",
               id
           )
           .fetch_optional(&self.pool)
           .await?;
           Ok(protocol)
       }

       async fn search(&self, query: &AgentProtocolSearchQuery) -> Result<Vec<AgentProtocol>> {
           let limit = query.limit.unwrap_or(10);
           let mut sql = String::from("SELECT * FROM agent_protocols WHERE 1=1");
           let mut bindings = vec![];

           // 全文検索（MySQL FULLTEXT）
           if !query.query.is_empty() {
               sql.push_str(" AND MATCH(name, description) AGAINST (? IN NATURAL LANGUAGE MODE)");
               bindings.push(query.query.clone());
           }

           // ドメインフィルタ
           if let Some(domain) = &query.domain {
               sql.push_str(" AND domain = ?");
               bindings.push(domain.clone());
           }

           // 複雑度フィルタ
           if let Some(complexity) = query.complexity_level {
               sql.push_str(" AND complexity_level <= ?");
               bindings.push(complexity.to_string());
           }

           // 効果スコアフィルタ
           if let Some(min_effectiveness) = query.min_effectiveness {
               sql.push_str(" AND effectiveness_score >= ?");
               bindings.push(min_effectiveness.to_string());
           }

           sql.push_str(" ORDER BY effectiveness_score DESC, usage_count DESC LIMIT ?");
           bindings.push(limit.to_string());

           // 動的クエリの実行
           let mut query = sqlx::query_as::<_, AgentProtocol>(&sql);
           for binding in bindings {
               query = query.bind(binding);
           }

           let protocols = query.fetch_all(&self.pool).await?;
           Ok(protocols)
       }

       async fn recommend_for_context(&self, context: &ProtocolExecutionContext) -> Result<Vec<AgentProtocol>> {
           // MySQLではILIKEが使えないのでLIKEを使用
           let search_pattern = format!("%{}%", context.task_description);
           let protocols = sqlx::query_as!(
               AgentProtocol,
               r#"
               SELECT * FROM agent_protocols 
               WHERE thinking_framework LIKE ? 
                  OR workflow_steps LIKE ?
               ORDER BY effectiveness_score DESC, usage_count DESC
               LIMIT 5
               "#,
               search_pattern,
               search_pattern
           )
           .fetch_all(&self.pool)
           .await?;
           Ok(protocols)
       }

       async fn increment_usage_count(&self, id: &str) -> Result<()> {
           sqlx::query!(
               "UPDATE agent_protocols SET usage_count = usage_count + 1 WHERE id = ?",
               id
           )
           .execute(&self.pool)
           .await?;
           Ok(())
       }

       // 他のメソッドの実装は省略...
   }
   ```

2. **packages/llms/src/adapter/gateway/mod.rs にリポジトリを追加**
   ```rust
   // 既存のモジュール定義に追加
   pub mod sqlx_agent_protocol_repository;

   // 既存のpub use文に追加
   pub use sqlx_agent_protocol_repository::*;
   ```

### ステップ5: ユースケース層の実装

1. **packages/llms/src/usecase/list_agent_protocols.rs の作成**
   ```rust
   use std::sync::Arc;
   use anyhow::Result;
   use llms_domain::AgentProtocol;
   use crate::adapter::gateway::AgentProtocolRepository;

   pub struct ListAgentProtocolsUseCase {
       repository: Arc<dyn AgentProtocolRepository + Send + Sync>,
   }

   impl ListAgentProtocolsUseCase {
       pub fn new(repository: Arc<dyn AgentProtocolRepository + Send + Sync>) -> Self {
           Self { repository }
       }

       pub async fn execute(&self, limit: Option<i32>) -> Result<Vec<AgentProtocol>> {
           self.repository.find_all(limit).await
       }
   }
   ```

2. **packages/llms/src/usecase/get_agent_protocol.rs の作成**
   ```rust
   use std::sync::Arc;
   use uuid::Uuid;
   use anyhow::Result;
   use llms_domain::AgentProtocol;
   use crate::adapter::gateway::AgentProtocolRepository;

   pub struct GetAgentProtocolUseCase {
       repository: Arc<dyn AgentProtocolRepository + Send + Sync>,
   }

   impl GetAgentProtocolUseCase {
       pub fn new(repository: Arc<dyn AgentProtocolRepository + Send + Sync>) -> Self {
           Self { repository }
       }

       pub async fn execute(&self, id: &str) -> Result<Option<AgentProtocol>> {
           let protocol = self.repository.find_by_id(id).await?;
           
           if protocol.is_some() {
               self.repository.increment_usage_count(id).await?;
           }
           
           Ok(protocol)
       }
   }
   ```

3. **packages/llms/src/usecase/recommend_agent_protocols.rs の作成**
   ```rust
   use std::sync::Arc;
   use anyhow::Result;
   use llms_domain::{AgentProtocol, ProtocolExecutionContext};
   use crate::adapter::gateway::AgentProtocolRepository;

   pub struct RecommendAgentProtocolsUseCase {
       repository: Arc<dyn AgentProtocolRepository + Send + Sync>,
   }

   impl RecommendAgentProtocolsUseCase {
       pub fn new(repository: Arc<dyn AgentProtocolRepository + Send + Sync>) -> Self {
           Self { repository }
       }

       pub async fn execute(&self, context: &ProtocolExecutionContext) -> Result<Vec<AgentProtocol>> {
           self.repository.recommend_for_context(context).await
       }
   }
   ```

4. **packages/llms/src/usecase/mod.rs にユースケースを追加**
   ```rust
   // 既存のモジュール定義に追加
   pub mod list_agent_protocols;
   pub mod get_agent_protocol;
   pub mod recommend_agent_protocols;

   // 既存のpub use文に追加
   pub use list_agent_protocols::*;
   pub use get_agent_protocol::*;
   pub use recommend_agent_protocols::*;
   ```

### ステップ6: MCPハブへのAgentProtocol統合

1. **packages/llms/src/usecase/command_stack/mcp/agent_protocol_handler.rs の作成**
   ```rust
   use std::sync::Arc;
   use serde_json::{json, Value};
   use uuid::Uuid;
   use anyhow::Result;
   use llms_domain::{AgentProtocol, AgentProtocolSearchQuery, ProtocolExecutionContext};
   use crate::usecase::{
       ListAgentProtocolsUseCase, 
       GetAgentProtocolUseCase, 
       RecommendAgentProtocolsUseCase
   };

   pub struct AgentProtocolHandler {
       list_protocols: Arc<ListAgentProtocolsUseCase>,
       get_protocol: Arc<GetAgentProtocolUseCase>,
       recommend_protocols: Arc<RecommendAgentProtocolsUseCase>,
   }

   impl AgentProtocolHandler {
       pub fn new(
           list_protocols: Arc<ListAgentProtocolsUseCase>,
           get_protocol: Arc<GetAgentProtocolUseCase>,
           recommend_protocols: Arc<RecommendAgentProtocolsUseCase>,
       ) -> Self {
           Self {
               list_protocols,
               get_protocol,
               recommend_protocols,
           }
       }

       pub async fn handle_tool_call(&self, tool_name: &str, arguments: Option<Value>) -> Result<Value> {
           match tool_name {
               "list_agent_protocols" => self.handle_list_protocols(arguments).await,
               "get_agent_protocol" => self.handle_get_protocol(arguments).await,
               "recommend_agent_protocols" => self.handle_recommend_protocols(arguments).await,
               _ => Err(anyhow::anyhow!("Unknown AgentProtocol tool: {}", tool_name)),
           }
       }

       async fn handle_list_protocols(&self, arguments: Option<Value>) -> Result<Value> {
           let limit = arguments
               .and_then(|args| args.get("limit"))
               .and_then(|l| l.as_i64())
               .map(|l| l as i32);

           let protocols = self.list_protocols.execute(limit).await?;
           Ok(json!(protocols))
       }

       async fn handle_get_protocol(&self, arguments: Option<Value>) -> Result<Value> {
           let args = arguments.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;
           let id = args.get("id")
               .and_then(|id| id.as_str())
               .ok_or_else(|| anyhow::anyhow!("Missing or invalid 'id' parameter"))?;
           
           let protocol = self.get_protocol.execute(id).await?;
           Ok(json!(protocol))
       }

       async fn handle_recommend_protocols(&self, arguments: Option<Value>) -> Result<Value> {
           let args = arguments.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;
           
           let task_description = args.get("task_description")
               .and_then(|desc| desc.as_str())
               .ok_or_else(|| anyhow::anyhow!("Missing 'task_description' parameter"))?;

           let available_tools = args.get("available_tools")
               .and_then(|tools| tools.as_array())
               .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
               .unwrap_or_default();

           let context = ProtocolExecutionContext {
               task_description: task_description.to_string(),
               constraints: args.get("constraints").cloned(),
               available_tools,
               time_limit: args.get("time_limit").and_then(|t| t.as_i64()).map(|t| t as i32),
               quality_requirements: args.get("quality_requirements").cloned(),
           };

           let protocols = self.recommend_protocols.execute(&context).await?;
           Ok(json!(protocols))
       }
   }
   ```

2. **packages/llms/src/usecase/command_stack/mcp/hub.rs にAgentProtocol統合**
   ```rust
   // 既存のインポートに追加
   use crate::usecase::{ListAgentProtocolsUseCase, GetAgentProtocolUseCase, RecommendAgentProtocolsUseCase};
   use crate::adapter::gateway::{SqlxAgentProtocolRepository, AgentProtocolRepository};
   use super::agent_protocol_handler::AgentProtocolHandler;

   // McpHub構造体に新しいフィールドを追加
   pub struct McpHub {
       connections: Arc<Mutex<Vec<McpConnection>>>,
       settings_path: PathBuf,
       workspace_path: PathBuf,
       agent_protocol_handler: Option<Arc<AgentProtocolHandler>>, // 追加
   }

   impl McpHub {
       // 新しいメソッドを追加
       pub async fn initialize_agent_protocol_handler(&mut self, pool: sqlx::PgPool) -> Result<()> {
           let repository = Arc::new(SqlxAgentProtocolRepository::new(pool));
           let list_usecase = Arc::new(ListAgentProtocolsUseCase::new(repository.clone()));
           let get_usecase = Arc::new(GetAgentProtocolUseCase::new(repository.clone()));
           let recommend_usecase = Arc::new(RecommendAgentProtocolsUseCase::new(repository));

           let handler = Arc::new(AgentProtocolHandler::new(
               list_usecase,
               get_usecase,
               recommend_usecase,
           ));

           self.agent_protocol_handler = Some(handler);
           Ok(())
       }

       // call_tool メソッドを拡張してAgentProtocolツールをサポート
       pub async fn call_tool(
           &self,
           server_name: &str,
           tool_name: &str,
           tool_arguments: Option<serde_json::Value>,
       ) -> Result<McpToolCallResponse> {
           // AgentProtocolの内部ツールをチェック
           if let Some(handler) = &self.agent_protocol_handler {
               if tool_name.starts_with("agent_protocol_") || 
                  ["list_agent_protocols", "get_agent_protocol", "recommend_agent_protocols"].contains(&tool_name) {
                   let result = handler.handle_tool_call(tool_name, tool_arguments).await?;
                   return Ok(McpToolCallResponse { result });
               }
           }

           // 既存のMCPサーバーツール処理
           // ... 既存のコードは変更なし
       }
   }
   ```

### ステップ7: 初期AgentProtocolデータの準備

1. **packages/llms/bin/seed_agent_protocols.rs の作成**
   ```rust
   use sqlx::mysql::MySqlPoolOptions;
   use uuid::Uuid;
   use rust_decimal::Decimal;
   use serde_json::json;
   use anyhow::Result;
   use std::env;

   #[tokio::main]
   async fn main() -> Result<()> {
       // 環境変数からデータベースURLを取得
       let database_url = env::var("DATABASE_URL")
           .expect("DATABASE_URL environment variable must be set");

       // データベース接続プールを作成
       let pool = MySqlPoolOptions::new()
           .max_connections(5)
           .connect(&database_url)
           .await?;

       println!("AgentProtocolの初期データを投入しています...");

       // 初期プロトコルデータを定義
       let protocols = vec![
           (
               "深層調査プロトコル",
               Some("複雑なトピックについて体系的で包括的な調査を行うためのプロトコル"),
               Some("research"),
               r#"## 思考フレームワーク
   1. **問題の分解**: 調査対象を構成要素に分解
   2. **多角的視点**: 複数の観点から検証
   3. **批判的思考**: 情報の信頼性と妥当性の検証
   4. **統合的理解**: 断片的情報の関連性を見つけて統合"#,
               r#"## フェーズ1: 調査計画立案
   - 調査目的の明確化
   - 調査範囲の定義
   - 成功指標の設定
   - リソースと制約の確認

   ## フェーズ2: 情報収集
   - 1次情報源の特定と収集
   - 複数の信頼できる情報源からの検証
   - 専門家の見解の収集
   - 最新動向の把握

   ## フェーズ3: 分析と統合
   - 収集した情報の分類と整理
   - パターンと傾向の特定
   - 矛盾点や課題の洗い出し
   - 仮説の構築と検証

   ## フェーズ4: 結論と提案
   - 調査結果の体系的整理
   - 実用的な洞察の抽出
   - 次のアクションの具体的提案"#,
               Some(json!({
                   "information_sources": "最低3つの独立した情報源",
                   "recency": "過去1年以内の情報を70%以上",
                   "logical_consistency": "結論が根拠に基づいている",
                   "actionability": "具体的なアクションプランを含む"
               })),
               vec!["research", "deep_analysis", "comprehensive"],
               3,
               Some(180),
           ),
           (
               "技術評価プロトコル",
               Some("技術選定や評価のための体系的なアプローチ"),
               Some("evaluation"),
               r#"## 思考フレームワーク
   1. **多次元評価**: 技術的、ビジネス的、リスクの観点
   2. **比較分析**: 代替技術との相対評価
   3. **コンテキスト適合性**: 具体的な使用場面での適用性
   4. **将来性**: 長期的な技術トレンドとの整合性"#,
               r#"## フェーズ1: 評価軸の設定
   - 技術要件の定義
   - ビジネス要件の明確化
   - 評価基準の重み付け
   - 成功・失敗条件の設定

   ## フェーズ2: 技術調査
   - 公式ドキュメントの精査
   - 実装例とケーススタディの分析
   - コミュニティとエコシステムの評価
   - パフォーマンスとベンチマークの確認

   ## フェーズ3: 実証検証
   - 概念実証（PoC）の実施
   - 実際の制約下でのテスト
   - スケーラビリティの検証
   - 運用面の課題特定

   ## フェーズ4: 意思決定支援
   - 多次元評価マトリックスの作成
   - ROI分析と投資対効果の算出
   - リスク分析と緩和策の提案
   - 段階的導入プランの提示"#,
               Some(json!({
                   "objectivity": "定量的指標の活用",
                   "fairness": "同一条件での比較",
                   "practicality": "実装可能な推奨事項",
                   "risk_awareness": "潜在的問題の特定"
               })),
               vec!["technology", "evaluation", "comparison", "decision_support"],
               4,
               Some(240),
           ),
           (
               "問題解決プロトコル",
               Some("複雑な問題に対する体系的なアプローチ"),
               Some("problem_solving"),
               r#"## 思考フレームワーク
   1. **根本原因分析**: 表面的な症状ではなく真の原因を特定
   2. **システム思考**: 問題の相互関係と全体像の理解
   3. **創造的思考**: 従来のアプローチにとらわれない解決策
   4. **実装重視**: 実行可能で効果的な解決策の選択"#,
               r#"## フェーズ1: 問題の定義
   - 問題の症状と影響範囲の特定
   - ステークホルダーの識別
   - 制約条件と制限事項の明確化
   - 成功指標の設定

   ## フェーズ2: 原因分析
   - 5 Why分析による根本原因の特定
   - フィッシュボーン図による要因整理
   - データ収集と検証
   - 優先順位付けと重要度評価

   ## フェーズ3: 解決策の立案
   - ブレインストーミングによるアイデア創出
   - 実現可能性の評価
   - リスク・ベネフィット分析
   - 複数の代替案の準備

   ## フェーズ4: 実装と検証
   - 詳細な実装計画の作成
   - パイロット実装での検証
   - 効果測定と調整
   - 継続的改善のメカニズム構築"#,
               Some(json!({
                   "logical_analysis": "因果関係の明確化",
                   "feasibility": "リソースと制約の考慮",
                   "measurability": "定量的指標の設定",
                   "sustainability": "長期的な効果の確保"
               })),
               vec!["problem_solving", "root_cause_analysis", "systematic"],
               3,
               Some(150),
           ),
       ];

       let mut inserted_count = 0;

       for (name, description, domain, thinking_framework, workflow_steps, quality_criteria, tags, complexity_level, estimated_time) in protocols {
           let id = Uuid::new_v4().to_string();
           let tags_json = serde_json::json!(tags);
           
           match sqlx::query!(
               r#"
               INSERT INTO agent_protocols 
               (id, name, description, domain, thinking_framework, workflow_steps, quality_criteria, tags, complexity_level, estimated_time_minutes, usage_count, effectiveness_score) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               "#,
               id,
               name,
               description,
               domain,
               thinking_framework,
               workflow_steps,
               quality_criteria,
               tags_json,
               complexity_level,
               estimated_time,
               0i32, // usage_count
               Decimal::new(75, 2) // effectiveness_score: 0.75
           )
           .execute(&pool)
           .await
           {
               Ok(_) => {
                   println!("✓ プロトコル '{}' を投入しました", name);
                   inserted_count += 1;
               }
               Err(e) => {
                   eprintln!("✗ プロトコル '{}' の投入に失敗しました: {}", name, e);
               }
           }
       }

       println!("完了: {} 個のAgentProtocolを投入しました", inserted_count);
       Ok(())
   }
   ```

2. **packages/llms/Cargo.toml にバイナリターゲットを追加**
   ```toml
   # 既存の[[bin]]セクションに追加
   [[bin]]
   name = "seed_agent_protocols"
   path = "bin/seed_agent_protocols.rs"
   ```

### ステップ8: エージェント実行時の自動統合

1. **packages/llms/src/usecase/command_stack_agent.rs への統合**
   ```rust
   // CommandStackAgent の初期化時にAgentProtocolハンドラーを設定
   impl CommandStackAgent {
       pub async fn new_with_agent_protocols(
           // 既存のパラメータ...
           database_pool: Option<sqlx::PgPool>,
       ) -> Result<Self> {
           // 既存の初期化コード...

           // AgentProtocolハンドラーを初期化
           if let Some(pool) = database_pool {
               if let Some(mcp_hub) = &mut mcp_hub {
                   mcp_hub.initialize_agent_protocol_handler(pool).await?;
               }
           }

           // 既存の返却コード...
       }
   }
   ```

2. **tachyon-api でのエージェント実行時の自動利用**
   ```rust
   // apps/tachyon-api/src/adapter/axum/agent_handler.rs への統合例
   pub async fn execute_agent_with_protocols(
       // 既存のパラメータ...
   ) -> Result<impl Stream<Item = AgentChunk>> {
       // データベース接続プールを取得
       let pool = get_database_pool().await?;

       // CommandStackAgentをAgentProtocol対応で初期化
       let agent = CommandStackAgent::new_with_agent_protocols(
           // 既存のパラメータ...
           Some(pool),
       ).await?;

       // エージェント実行
       agent.execute(task_description).await
   }
   ```

### ステップ9: テストの実装

1. **ユニットテストの作成**
   ```bash
   mkdir tests
   ```

2. **tests/integration_test.rs の実装**
   ```rust
   use mcp_procedure_server::*;
   use sqlx::PgPool;
   use uuid::Uuid;

   #[tokio::test]
   async fn test_procedure_crud() {
       let pool = setup_test_database().await;
       let repository = Arc::new(PgProcedureRepository::new(pool));
       let usecase = GetProcedureUseCase::new(repository);

       // テストの実装...
   }
   ```

### ステップ10: ドキュメント整備

1. **README.md の作成**
   ```markdown
   # MCP手順書サーバー

   ## 概要
   エージェント向けの手順書管理MCPサーバーです。

   ## 使用方法
   ...

   ## API仕様
   ...
   ```

2. **MCP API仕様の追加**
   - 既存のMCP API仕様ドキュメントに新しいツールを追加

## MCP API 仕様

### 利用可能なツール

#### list_agent_protocols
AgentProtocolの一覧を取得
```json
{
  "name": "list_agent_protocols",
  "description": "利用可能なAgentProtocolの一覧を取得",
  "inputSchema": {
    "type": "object",
    "properties": {
      "domain": {
        "type": "string",
        "description": "ドメインでフィルタ（research, analysis, development, problem_solving等）"
      },
      "complexity_level": {
        "type": "integer",
        "description": "複雑度レベル（1-5）"
      },
      "min_effectiveness": {
        "type": "number",
        "description": "最小効果スコア（0.0-1.0）"
      },
      "limit": {
        "type": "integer",
        "default": 20,
        "description": "取得件数"
      }
    }
  }
}
```

#### get_agent_protocol
特定のAgentProtocolを取得
```json
{
  "name": "get_agent_protocol",
  "description": "指定されたIDのAgentProtocolを取得",
  "inputSchema": {
    "type": "object",
    "properties": {
      "id": {
        "type": "string",
        "description": "AgentProtocol ID（UUID）"
      }
    },
    "required": ["id"]
  }
}
```

#### search_agent_protocols
キーワードでAgentProtocolを検索
```json
{
  "name": "search_agent_protocols",
  "description": "キーワードでAgentProtocolを検索",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "検索クエリ"
      },
      "domain": {
        "type": "string",
        "description": "ドメインフィルタ"
      },
      "limit": {
        "type": "integer",
        "default": 10,
        "description": "返却する最大件数"
      }
    },
    "required": ["query"]
  }
}
```

#### recommend_agent_protocols
タスクコンテキストに基づくAgentProtocolの推奨
```json
{
  "name": "recommend_agent_protocols",
  "description": "実行コンテキストに基づいて最適なAgentProtocolを推奨",
  "inputSchema": {
    "type": "object",
    "properties": {
      "task_description": {
        "type": "string",
        "description": "実行したいタスクの説明"
      },
      "available_tools": {
        "type": "array",
        "items": {"type": "string"},
        "description": "利用可能なツールのリスト"
      },
      "constraints": {
        "type": "object",
        "description": "制約条件（時間制限、品質要件等）"
      },
      "limit": {
        "type": "integer",
        "default": 5,
        "description": "推奨する最大件数"
      }
    },
    "required": ["task_description"]
  }
}
```

## 初期AgentProtocol例

### 1. 深層調査プロトコル（Deep Research Protocol）
```markdown
# 深層調査AgentProtocol

## 思考フレームワーク
1. **問題の分解**: 調査対象を構成要素に分解
2. **多角的視点**: 複数の観点から検証
3. **批判的思考**: 情報の信頼性と妥当性の検証
4. **統合的理解**: 断片的情報の関連性を見つけて統合

## ワークフロー
### フェーズ1: 調査計画立案
- 調査目的の明確化
- 調査範囲の定義
- 成功指標の設定
- リソースと制約の確認

### フェーズ2: 情報収集
- 1次情報源の特定と収集
- 複数の信頼できる情報源からの検証
- 専門家の見解の収集
- 最新動向の把握

### フェーズ3: 分析と統合
- 収集した情報の分類と整理
- パターンと傾向の特定
- 矛盾点や課題の洗い出し
- 仮説の構築と検証

### フェーズ4: 結論と提案
- 調査結果の体系的整理
- 実用的な洞察の抽出
- 次のアクションの具体的提案

## 品質基準
- 情報源の多様性（最低3つの独立した情報源）
- 時間的新鮮性（過去1年以内の情報を70%以上）
- 論理的一貫性（結論が根拠に基づいている）
- 実用性（具体的なアクションプランを含む）
```

### 2. 技術評価プロトコル（Technology Assessment Protocol）
```markdown
# 技術評価AgentProtocol

## 思考フレームワーク
1. **多次元評価**: 技術的、ビジネス的、リスクの観点
2. **比較分析**: 代替技術との相対評価
3. **コンテキスト適合性**: 具体的な使用場面での適用性
4. **将来性**: 長期的な技術トレンドとの整合性

## ワークフロー
### フェーズ1: 評価軸の設定
- 技術要件の定義
- ビジネス要件の明確化
- 評価基準の重み付け
- 成功・失敗条件の設定

### フェーズ2: 技術調査
- 公式ドキュメントの精査
- 実装例とケーススタディの分析
- コミュニティとエコシステムの評価
- パフォーマンスとベンチマークの確認

### フェーズ3: 実証検証
- 概念実証（PoC）の実施
- 実際の制約下でのテスト
- スケーラビリティの検証
- 運用面の課題特定

### フェーズ4: 意思決定支援
- 多次元評価マトリックスの作成
- ROI分析と投資対効果の算出
- リスク分析と緩和策の提案
- 段階的導入プランの提示

## 品質基準
- 評価の客観性（定量的指標の活用）
- 比較の公平性（同一条件での比較）
- 実用性（実装可能な推奨事項）
- リスク認識（潜在的問題の特定）
```

### 3. 問題解決プロトコル（Problem Solving Protocol）
```markdown
# 問題解決AgentProtocol

## 思考フレームワーク
1. **根本原因分析**: 表面的な症状ではなく真の原因を特定
2. **システム思考**: 問題の相互関係と全体像の理解
3. **創造的思考**: 従来のアプローチにとらわれない解決策
4. **実装重視**: 実行可能で効果的な解決策の選択

## ワークフロー
### フェーズ1: 問題の定義
- 問題の症状と影響範囲の特定
- ステークホルダーの識別
- 制約条件と制限事項の明確化
- 成功指標の設定

### フェーズ2: 原因分析
- 5 Why分析による根本原因の特定
- フィッシュボーン図による要因整理
- データ収集と検証
- 優先順位付けと重要度評価

### フェーズ3: 解決策の立案
- ブレインストーミングによるアイデア創出
- 実現可能性の評価
- リスク・ベネフィット分析
- 複数の代替案の準備

### フェーズ4: 実装と検証
- 詳細な実装計画の作成
- パイロット実装での検証
- 効果測定と調整
- 継続的改善のメカニズム構築

## 品質基準
- 分析の論理性（因果関係の明確化）
- 解決策の実現可能性（リソースと制約の考慮）
- 効果の測定可能性（定量的指標の設定）
- 持続可能性（長期的な効果の確保）
```

## 検証・テスト手順

### ステップ11: 単体テストの実行
```bash
# 各ユースケースのテスト
cargo test --lib

# 特定のテストのみ実行
cargo test test_get_procedure
```

### ステップ12: 統合テストの実行
```bash
# 統合テストの実行
cargo test --test integration_test

# データベース接続のテスト
cargo test test_database_connection
```

### ステップ13: MCPハブ統合テスト
```bash
# MCPハブとの統合をテスト
cargo test --test mcp_integration_test
```

## デプロイ手順

### ステップ10: 本番環境への準備

1. **環境変数の設定**
   ```bash
   export DATABASE_URL="mysql://user:password@host:port/database"
   export RUST_LOG="info"
   ```

2. **マイグレーションの実行**
   ```bash
   cd packages/llms/
   sqlx migrate run --database-url $DATABASE_URL
   ```

3. **初期AgentProtocolデータの投入**
   ```bash
   cd packages/llms/
   cargo run --bin seed_agent_protocols
   ```

   または、直接実行：
   ```bash
   # packages/llms/ディレクトリから
   DATABASE_URL="mysql://user:password@host:port/database" cargo run --bin seed_agent_protocols
   ```

### ステップ9: テストの実装

1. **packages/llms/tests/agent_protocol_test.rs の作成**
   ```bash
   # テストファイルの作成
   touch packages/llms/tests/agent_protocol_test.rs
   ```

2. **統合テストの実装**
   ```rust
   use sqlx::PgPool;
   use uuid::Uuid;
   use llms_domain::{AgentProtocol, ProtocolExecutionContext};
   use llms::adapter::gateway::{SqlxAgentProtocolRepository, AgentProtocolRepository};
   use llms::usecase::{GetAgentProtocolUseCase, RecommendAgentProtocolsUseCase};

   #[sqlx::test]
   async fn test_agent_protocol_crud(pool: PgPool) {
       let repository = SqlxAgentProtocolRepository::new(pool);
       let usecase = GetAgentProtocolUseCase::new(Arc::new(repository));

       // テストの実装...
   }

   #[sqlx::test]
   async fn test_protocol_recommendation(pool: MySqlPool) {
       let repository = SqlxAgentProtocolRepository::new(pool.clone());
       let usecase = RecommendAgentProtocolsUseCase::new(Arc::new(repository));

       // 初期データの準備（テスト用の簡単なプロトコルを追加）
       let test_protocol_id = Uuid::new_v4().to_string();
       let tags_json = serde_json::json!(["technology", "evaluation"]);
       
       sqlx::query!(
           r#"
           INSERT INTO agent_protocols 
           (id, name, description, domain, thinking_framework, workflow_steps, quality_criteria, tags, complexity_level, estimated_time_minutes, usage_count, effectiveness_score) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           "#,
           test_protocol_id,
           "テスト技術評価プロトコル",
           Some("テスト用プロトコル"),
           Some("evaluation"),
           "テスト思考フレームワーク",
           "テストワークフロー",
           None::<serde_json::Value>,
           tags_json,
           2,
           Some(60),
           0i32,
           Decimal::new(80, 2)
       )
       .execute(&pool)
       .await
       .unwrap();

       // 推奨テスト
       let context = ProtocolExecutionContext {
           task_description: "技術選定を行いたい".to_string(),
           constraints: None,
           available_tools: vec!["web_search".to_string()],
           time_limit: None,
           quality_requirements: None,
       };

       let protocols = usecase.execute(&context).await.unwrap();
       assert!(!protocols.is_empty());
   }
   ```

## 完了条件チェックリスト

### 技術要件
- [ ] packages/llms/Cargo.tomlに必要な依存関係が追加されている
- [ ] データベースマイグレーションファイルが作成されている
- [ ] AgentProtocolドメインモデルがllms/domainに実装されている
- [ ] リポジトリ層がllms/src/adapter/gatewayに実装されている
- [ ] ユースケース層がllms/src/usecaseに実装されている
- [ ] MCPハブにAgentProtocol機能が統合されている

### 機能要件
- [ ] AgentProtocolの一覧取得ツールが動作する
- [ ] 特定のAgentProtocolを取得するツールが動作する
- [ ] コンテキストベースのプロトコル推奨ツールが動作する
- [ ] 使用統計と効果スコアの更新機能が動作する
- [ ] 初期AgentProtocolデータが正常に投入される
- [ ] エージェント実行時にAgentProtocolが自動利用可能

### 品質要件
- [ ] 全ユニットテストがパスしている
- [ ] 統合テストがパスしている
- [ ] packages/llms のビルドが成功する
- [ ] 既存のLLMs機能に影響を与えていない

### 運用要件
- [ ] AgentProtocol機能のドキュメントが整備されている
- [ ] エラーハンドリングが適切に実装されている
- [ ] ログ出力が既存パターンに準拠している
- [ ] 既存のLLMsクレートのCIが通過する

## 参考資料

- [MCP API仕様](../../../tachyon-apps/llms/mcp-api-specification.md)
- [MCP実装ガイド](../../../mcp-implementation.md)
- [Clean Architecture実装例](../../../for-developers/clean-architecture.md)
- [SQLXマイグレーション](https://docs.rs/sqlx/latest/sqlx/migrate/index.html)

## トラブルシューティング

### よくある問題と解決策

1. **データベース接続エラー**
   ```
   解決策: DATABASE_URLの確認、ポート開放状況の確認
   ```

2. **MCPハブ統合エラー**
   ```
   解決策: 依存関係の確認、インターフェース実装の検証
   ```

3. **パフォーマンス問題**
   ```
   解決策: インデックスの確認、クエリの最適化
   ```

## 運用開始後の改善案

### 短期的改善（1-3ヶ月）
- ユーザーフィードバックに基づくAgentProtocolの追加・改善
- 推奨機能の精度向上（機械学習の導入）
- パフォーマンス最適化とキャッシュ機能

### 中長期的改善（3-12ヶ月）
- AgentProtocolのバージョン管理機能
- ユーザーカスタムAgentProtocol作成機能
- AI によるAgentProtocolの自動生成と最適化
- プロトコル実行状況の分析ダッシュボード
- エージェントの学習データとしてのフィードバック統合
- ドメイン特化型AgentProtocolの自動特定機能