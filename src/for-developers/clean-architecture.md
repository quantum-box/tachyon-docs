# Clean Architecture

Clean Architectureは、ソフトウェアの設計原則の一つで、Robert C. Martin（Uncle Bob）によって提唱されました。このアーキテクチャは、システムの保守性、テスト容易性、および拡張性を高めることを目的としています。

## 基本原則

Clean Architectureは以下の基本原則に基づいています：

1. フレームワーク独立性
2. テスト容易性
3. UI独立性
4. データベース独立性
5. 外部エージェント独立性

## レイヤー構造

Clean Architectureは、以下の4つの同心円レイヤーで構成されています：

```
src/
├── domain/      # Entities
├── usecase/     # Use Cases
├── adapters/   # Interface Adapters
└── infrastructure/  # Frameworks & Drivers
```

1. Entities（エンティティ）
   - ビジネスロジックをカプセル化
   - フレームワークやアプリケーションに依存しない
   - 最も内側のレイヤー

2. Use Cases（ユースケース）
   - アプリケーション固有のビジネスルール
   - エンティティを操作
   - 外部のレイヤーに依存しない

3. Interface Adapters（インターフェースアダプター）
   - プレゼンテーション、データベース、外部サービスなどの変換を担当
   - 内側のレイヤーで使用可能な形式にデータを変換

4. Frameworks & Drivers（フレームワークとドライバー）
   - フレームワーク、ツール、データベースなどの具体的な実装
   - 最も外側のレイヤー

## ユースケースの実装規約

ユースケースレイヤーの実装には、以下の規約を適用します：

### ファイル構造とネーミング

1. ファイル配置
   - ユースケースは `usecase` ディレクトリ直下に配置
   - 機能ごとのサブディレクトリは作成しない（フラットな構造を維持）

2. ファイル命名
   - 動詞を前に置く形式で命名（例: `create_workflow.rs`, `update_user.rs`）
   - 動作を表す動詞 + 対象となるエンティティ名
   - 複数形は必要な場合のみ使用（例: `list_workflows.rs`）

### コード構造

1. Input/Outputの定義
   ```rust
   pub struct CreateWorkflowInput {
       pub name: String,
       pub description: Option<String>,
       pub steps: Value,
   }

   pub struct CreateWorkflowOutput {
       pub workflow: Workflow,
   }
   ```

2. InputPortトレイトの定義
   ```rust
   #[async_trait::async_trait]
   pub trait CreateWorkflowInputPort: Debug + Send + Sync {
       async fn execute(
           &self,
           input: &CreateWorkflowInput,
       ) -> Result<CreateWorkflowOutput>;
   }
   ```

3. ユースケース構造体の実装
   ```rust
   pub struct CreateWorkflow {
       repository: Arc<dyn WorkflowRepository>,
   }

   impl CreateWorkflow {
       pub fn new(repository: Arc<dyn WorkflowRepository>) -> Arc<Self> {
           Arc::new(Self { repository })
       }
   }
   ```

4. InputPortトレイトの実装
   ```rust
   #[async_trait::async_trait]
   impl CreateWorkflowInputPort for CreateWorkflow {
       #[tracing::instrument(skip(self))]
       async fn execute(
           &self,
           input: &CreateWorkflowInput,
       ) -> Result<CreateWorkflowOutput> {
           // ビジネスロジックの実装
       }
   }
   ```

### テスト

1. モックの使用
   ```rust
   mock! {
       WorkflowRepo {}
       #[async_trait::async_trait]
       impl WorkflowRepository for WorkflowRepo {
           // リポジトリメソッドのモック
       }
   }
   ```

2. テストケースの実装
   ```rust
   #[tokio::test]
   async fn test_create_workflow() {
       // テストの準備
       // ユースケースの実行
       // 結果の検証
   }
   ```

## メリット

- 依存関係が明確
- テストが容易
- 変更に強い
- 保守性が高い

## デメリット

- 小規模なプロジェクトでは過剰な可能性がある
- 学習曲線が急

## 参考資料

- [The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Clean Architecture: A Craftsman's Guide to Software Structure and Design](https://www.amazon.com/Clean-Architecture-Craftsmans-Software-Structure/dp/0134494164)