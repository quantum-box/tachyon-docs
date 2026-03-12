# LLMOps

code: Rust
architecture: Clean Architecture
crate: packages/llms

## API提供モデルを利用したLLMOps機能の設計

API提供されているLLM（Large Language Model）を活用したLLMOps機能の設計について説明します。この設計は、モデルの学習・再学習を自社で行わず、外部のAPIを通してモデルを利用することを前提としています。技術スタックに依存しない、より抽象的な機能要素を中心に説明します。

**LLMOpsの主要機能**

API提供モデルを利用する場合、従来のMLOpsとは異なる点に焦点を当てる必要があります。主な機能は以下の通りです。

1. **モデル管理:**
   - **モデル情報カタログ:** 利用可能なAPIモデルに関する情報（提供元、モデル名、バージョン、料金体系、得意なタスクなど）を一元的に管理する機能。
   - **モデル評価システム:** 提供されているモデルの性能を、自社のユースケースにおける評価指標（精度、応答速度、コストなど）に基づいて評価し、比較検討する仕���み。
   - **モデルバージョン追跡:** 利用するAPIモデルのバージョンを記録し、変更があった場合に影響を把握できるようにする機能。

2. **データ管理:**
   - **入力データ管理基盤:** APIに送信する入力データ（プロンプト）を管理する基盤。
     - **プロンプトテンプレート機能:** よく使うプロンプトをテンプレートとして保存し、再利用を促進する機能。
     - **プロンプトバージョン管理機能:** プロンプトの変更履歴を記録し、再現性を確保する機能。
     - **プロンプトパラメータ管理機能:** プロンプト内で可変なパラメータを定義・管理し、柔軟性を高める機能。
   - **出力データ管理基盤:** APIから返却される出力データを管理する基盤。
     - **出力ログ記録機能:** 入力データと対応する出力データを紐付けて記録し、分析やデバッグに利用する機能。
     - **出力データ品質評価機能:** 出力データの品質を評価する仕組み（例：人手による評価インターフェース、ルールベースの自動評価）。

3. **パイプライン管理:**
   - **API連携ワークフロー定義・実行システム:** APIを呼び出す一連の処理をワークフ���ーとして定義・実行・管理するシステム。
     - **データ変換処理:** 入力データをAPIが受け付けられる形式に変換したり、APIから返却されたデータを必要な形式に変換したりする処理を定義する機能。
     - **API呼び出し処理:** 定義されたAPIエンドポイントに対してリクエストを送信する処理を定義する機能。
   - **処理オーケストレーション機能:** 複数のAPI呼び出しや他のシステムとの連携を管理する機能。

4. **モニタリング:**
   - **APIパフォーマンス監視:** APIの応答時間、エラー率、リクエスト数などを継続的に監視する機能。
   - **コスト監視:** APIの利用料金を継続的に監視し、予算超過をアラートする機能。
   - **出力品質監視:** 出力データの品質の変化を自動または半自動で検知する機能（例：特定のタスクにおける性能低下を検知）。
   - **プロンプト利用状況監視:** 特定のプロンプトの実行頻度や性能を監視する機能。

5. **デプロイメント:**
   - **APIエンドポイント管理機能:** 利用するAPIのエンドポイント情報を安全に管理する機能。
   - **認証・認可管理機能:** APIキーや認証情報を安全に管理���、アクセス制御を行う機能。
   - **レート制限管理機能:** APIのレート制限を考慮した呼び出し制御を行う機能。

6. **評価:**
   - **オフライン評価システム:** 蓄積された入力データと出力データを用いて、モデルの性能やプロンプトの効果を評価するシステム。
   - **オンライン評価システム（A/Bテスト基盤など）:** 複数のプロンプトやAPIモデルを実際に運用環境で比較し、効果を検証するシステム。

**具体的な機能要素**

上記を踏まえ、具体的な機能要素として以下が考えられます。

* **モデルレジストリ:** 利用可能なAPIモデルの情報を一元管理する場所。
* **プロンプト管理ツール:** プロンプトの作成、編集、バージョン管理、テストを支援するツール。
* **ワークフローエンジン:** API連携を含む処理フローを定義・実行・管理するエンジン。
* **モニタリングダッシュボード:** APIパフォーマンス、コスト、出力品質などを可視化するインターフェース。
* **評価基盤:** オフライン評価やオンライン評価を実行するための仕組み。
* **データストレージ:** 入力データ、出力データ、評価結果などを保管する場所。
* **アラートシステム:** 異なるAPIパフォーマンスや出力品質の低下を検知し、関係者に通知するシステム。
* **セキュリティ機能:** APIキーの安全な管理、アクセス制御などを実現する仕組み。

**設計における考慮事項**

* **API提供元の依存性:** APIの仕様変更や提供終了に柔軟に対応できる設計にする必要があります。
* **コスト効率:** APIの利用料金を常に意識し、効率的な利用方法を検討する必要があります。
* **情報セキュリティ:** APIキーの漏洩防止、出力データの適切な管理など、セキュリティ対策は重要です。
* **システム拡張性:** リクエスト数の増加に対応できる柔軟なシステム設計が必要です。
* **エラー処理:** APIエラー発生時の適切な処理フローを設計する必要があります。
* **知識の共有と標準化:** プロンプトやワークフローを共有・管理しやすい仕組みを構築し、属人化を防ぐことが重要です。

**まとめ**

API提供モデルを利用したLLMOpsは、モデル自体の開発・管理に比べると負担は少ないものの、プロンプトエンジニアリング、API連携、出力データの管理・評価が重要な要素となり���す。上記を参考に、技術スタックに依存しない抽的機能要素を理解し、自社のニーズ合ったLLMOps機能設計構築してください。

より具体的な設計のためには、利用するAPIモデルの種類、ユースケース、データ量、チーム体制などの情報が必要になります。これらの情報に基づいて、上記の機能要素をより詳細に落とし込んでいくことになります。

## 実装タスク

### タスクステータス
- ✅ DONE: 完了済み
- 🔄 IN_PROGRESS: 実装中
- 📝 TODO: 未着手

### モデル管理基盤
- ✅ モデル情報カタログの設計と実装
  - ✅ モデル情報のスキーマ設計（提供元、モデル名、バージョン、料金体系など）
  - ✅ モデル情報のCRUD API実装（OpenAPI仕様に基づく）
  - 📝 モデル情報管理画面の実装
  - 📝 各プロバイダー（OpenAI, Anthropic, Google AI, Perplexity AI, Groq）の情報管理

- 🔄 モデル評価システムの構築
  - ✅ 評価指標の定義（精度、応答速度、コストなど）
  - ✅ 評価実行基盤の実装
  - 🔄 評価結果の保存機能の実装
  - 📝 評価結果の可視化機能
  - 📝 プロバイダー間の性能比較機能

### データ管理基盤
- ✅ プロンプト管理システムの実装
  - ✅ プロンプトテンプレートのスキーマ設計
  - ✅ プロンプトバージョン管理機能の実装
  - ✅ プロンプトパラメータ管理機能の実装
  - 📝 プロンプト編集・テストUI実装
  - 📝 プロバイダー固有のプロンプト最適化機能

- 🔄 出力データ管理システムの構築
  - ✅ 出力データのスキーマ設計
  - 🔄 出力ログ記録機能の実装（トレーシング対応）
  - ✅ 出力データ品質評価機能の実装
  - 📝 出力データ分析ダッシュボードの実装
  - 📝 プロバイダー別の出力フォーマット正規化

### パイプライン管理
- 🔄 APIワークフローエンジンの実装
  - ✅ ワークフロー定義スキーマの設計
  - 🔄 データ変換処理の実装
  - 🔄 API呼び出し処理の実装（非同期処理対応）
  - ✅ エラーハンドリング機能の実装（errors::Result対応）
  - 📝 プロバイダー固有の制限対応

- 📝 オーケストレーション機能の実装
  - 📝 ワークフロー実行エンジンの実装
  - 📝 依存関係管理機能の実装
  - 📝 実行状態管理機能の実装
  - 📝 プロバイダー間のフェイルオーバー機能

### モニタリング基盤
- 🔄 パフォーマンスモニタリングの実装
  - 🔄 メトリクス収集機能の実装（応答時間、エラー率など）
  - 📝 メトリクスストレージの設計と実装
  - 📝 リアルタイムメトリクス集計機能の実装
  - 📝 アラート設定機能の実装
  - 📝 モニタリングダッシュボードの実装
  - 📝 プロバイダー別のパフォーマンス分析
  - 📝 異常検知機能の実装
    - 📝 レスポンスタイムの異常検知
    - 📝 エラー率の異常検知
    - 📝 トークン使用量の異常検知

- 🔄 コスト監視システムの実装
  - ✅ コスト計算ロジックの実装（プロバイダー別料金体系対応）
  - 🔄 コストメトリクスの収集と集計
  - 📝 予算管理機能の実装
    - 📝 予算設定機能
    - 📝 使用量予測機能
    - 📝 予算超過アラート
  - 📝 コスト最適化レコメンデーション機能
    - 📝 モデル選択の最適化提案
    - 📝 バッチ処理の最適化提案
    - 📝 キャッシュ戦略の提案

### 評価基盤
- 🔄 オフライン評価システムの実装
  - 🔄 テストデータ管理機能の実装
    - 🔄 テストケースの作成と管理
    - 🔄 期待値の定義と管理
  - ✅ 評価実行機能の実装（mockall対応）
  - 📝 評価結果レポート機能の実装
    - 📝 精度評価レポート
    - 📝 パフォーマンス評価レポート
    - 📝 コスト評価レポート
  - 📝 プロバイダー別のベンチマーク機能
    - 📝 標準ベンチマークの実装
    - 📝 カスタムベンチマークの作成機能

- 🔄 A/Bテスト基盤の実装（feature_flag crateと連携）
  - 🔄 feature_flag crateとの統合
  - 📝 テスト設定管理機能の実装
    - 📝 実験グループの定義
    - 📝 トラフィック配分の設定
    - 📝 実験期間の管理
  - 📝 トラフィック制御機能の実装
    - 📝 ユーザーセグメンテーション
    - 📝 実験グループへの振り分け
  - 📝 結果分析機能の実装
    - 📝 実験データの収集
    - 📝 統計的有意性の検定
    - 📝 実験レポートの生成
  - 📝 プロバイダー間の比較実験機能
    - 📝 複数プロバイダー間での性能比較
    - 📝 コスト効率の分析

### ドキュメント
- 🔄 技術ドキュメントの作成
  - ✅ アーキテクチャ設計書
  - 🔄 API仕様書（OpenAPI/GraphQL）
  - 📝 運用マニュアル
  - 📝 開発者ガイド
  - 📝 プロバイダー別の実装ガイド
  - 📝 セキュリティガイドライン
  - 📝 パッケージ連携ガイド

### 優先度低タスク
#### 他パッケージとの連携
- 📝 notification crateとの連携
  - 📝 アラート通知機能の実装
  - 📝 コスト超過通知機能の実装
  - 📝 メトリクス異常値通知機能の実装

- 📝 process_manager crateとの連携
  - 📝 ワークフロー実行状態管理の統合
  - 📝 プロセス監視機能の統合
  - 📝 メトリクス収集・集計機能の統合
  - 📝 パフォーマンス分析機能の統合
  - 📝 コスト分析機能の統合

## タスク詳細設計

### モデル情報カタログ

#### データモデル
```rust
pub struct ModelInfo {
    pub id: ModelId,
    pub provider: ProviderId,
    pub name: String,
    pub version: String,
    pub capabilities: Vec<ModelCapability>,
    pub pricing: ModelPricing,
    pub performance_metrics: ModelPerformanceMetrics,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub struct ModelPricing {
    pub input_price_per_1k_tokens: Decimal,
    pub output_price_per_1k_tokens: Decimal,
    pub currency: Currency,
}

pub struct ModelPerformanceMetrics {
    pub average_latency_ms: i32,
    pub p95_latency_ms: i32,
    pub error_rate: Decimal,
    pub throughput: i32,
}
```

#### API エンドポイント
- `GET /api/v1/models` - モデル一覧取得
- `GET /api/v1/models/{model_id}` - モデル詳細取得
- `POST /api/v1/models` - モデル登録
- `PUT /api/v1/models/{model_id}` - モデル更新
- `DELETE /api/v1/models/{model_id}` - モデル削除
- `GET /api/v1/models/{model_id}/metrics` - モデルのメトリクス取得

#### データベーススキーマ
```sql
CREATE TABLE models (
    id VARCHAR(26) PRIMARY KEY,
    provider_id VARCHAR(26) NOT NULL,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL,
    capabilities JSON NOT NULL,
    input_price_per_1k_tokens DECIMAL(10,6) NOT NULL,
    output_price_per_1k_tokens DECIMAL(10,6) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_id) REFERENCES providers(id)
);

CREATE TABLE model_metrics (
    id VARCHAR(26) PRIMARY KEY,
    model_id VARCHAR(26) NOT NULL,
    average_latency_ms INT NOT NULL,
    p95_latency_ms INT NOT NULL,
    error_rate DECIMAL(5,4) NOT NULL,
    throughput INT NOT NULL,
    measured_at TIMESTAMP NOT NULL,
    FOREIGN KEY (model_id) REFERENCES models(id)
);
```

### プロンプト管理システム

#### データモデル
```rust
pub struct Prompt {
    pub id: PromptId,
    pub name: String,
    pub description: String,
    pub template: String,
    pub parameters: Vec<PromptParameter>,
    pub version: i32,
    pub tags: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub struct PromptParameter {
    pub name: String,
    pub description: String,
    pub parameter_type: ParameterType,
    pub required: bool,
    pub default_value: Option<String>,
}

pub enum ParameterType {
    String,
    Integer,
    Float,
    Boolean,
    Array,
    Object,
}
```

#### API エンドポイント
- `GET /api/v1/prompts` - プロンプト一覧取得
- `GET /api/v1/prompts/{prompt_id}` - プロンプト詳細取得
- `POST /api/v1/prompts` - プロンプト登録
- `PUT /api/v1/prompts/{prompt_id}` - プロンプト更新
- `DELETE /api/v1/prompts/{prompt_id}` - プロンプト削除
- `POST /api/v1/prompts/{prompt_id}/test` - プロンプトテスト実行
- `GET /api/v1/prompts/{prompt_id}/versions` - プロンプトバージョン履歴取得

#### データベーススキーマ
```sql
CREATE TABLE prompts (
    id VARCHAR(26) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    template TEXT NOT NULL,
    parameters JSON NOT NULL,
    version INT NOT NULL,
    tags JSON,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE prompt_versions (
    id VARCHAR(26) PRIMARY KEY,
    prompt_id VARCHAR(26) NOT NULL,
    version INT NOT NULL,
    template TEXT NOT NULL,
    parameters JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (prompt_id) REFERENCES prompts(id)
);
```

### APIワークフローエンジン

#### データモデル
```rust
pub struct Workflow {
    pub id: WorkflowId,
    pub name: String,
    pub description: String,
    pub steps: Vec<WorkflowStep>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub struct WorkflowStep {
    pub id: WorkflowStepId,
    pub name: String,
    pub step_type: StepType,
    pub config: StepConfig,
    pub dependencies: Vec<WorkflowStepId>,
}

pub enum StepType {
    LLMCall,
    DataTransformation,
    Conditional,
    Parallel,
    Aggregation,
}

pub struct StepConfig {
    pub model_id: Option<ModelId>,
    pub prompt_id: Option<PromptId>,
    pub transformation_script: Option<String>,
    pub condition: Option<String>,
    pub retry_config: Option<RetryConfig>,
}
```

#### API エンドポイント
- `GET /api/v1/workflows` - ワークフロー一覧取得
- `GET /api/v1/workflows/{workflow_id}` - ワークフロー詳細取得
- `POST /api/v1/workflows` - ワークフロー登録
- `PUT /api/v1/workflows/{workflow_id}` - ワークフロー更新
- `DELETE /api/v1/workflows/{workflow_id}` - ワークフロー削除
- `POST /api/v1/workflows/{workflow_id}/execute` - ワークフロー実行
- `GET /api/v1/workflows/{workflow_id}/executions` - 実行履歴取得

#### データベーススキーマ
```sql
CREATE TABLE workflows (
    id VARCHAR(26) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    steps JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE workflow_executions (
    id VARCHAR(26) PRIMARY KEY,
    workflow_id VARCHAR(26) NOT NULL,
    status VARCHAR(20) NOT NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    result JSON,
    error TEXT,
    FOREIGN KEY (workflow_id) REFERENCES workflows(id)
);
```

### モニタリング基盤

#### データモデル
```rust
pub struct MetricsRecord {
    pub id: MetricsId,
    pub model_id: ModelId,
    pub timestamp: DateTime<Utc>,
    pub request_count: i32,
    pub error_count: i32,
    pub total_tokens: i32,
    pub total_cost: Decimal,
    pub average_latency_ms: i32,
    pub p95_latency_ms: i32,
}

pub struct Alert {
    pub id: AlertId,
    pub name: String,
    pub condition: AlertCondition,
    pub notification_channels: Vec<NotificationChannel>,
    pub enabled: bool,
}

pub struct AlertCondition {
    pub metric: String,
    pub operator: AlertOperator,
    pub threshold: f64,
    pub window_minutes: i32,
}
```

#### API エンドポイント
- `GET /api/v1/metrics` - メトリクス一覧取得
- `GET /api/v1/metrics/{model_id}` - モデル別メトリクス取得
- `GET /api/v1/alerts` - アラート一覧取得
- `POST /api/v1/alerts` - アラート登録
- `PUT /api/v1/alerts/{alert_id}` - アラート更新
- `DELETE /api/v1/alerts/{alert_id}` - アラート削除

#### データベーススキーマ
```sql
CREATE TABLE metrics (
    id VARCHAR(26) PRIMARY KEY,
    model_id VARCHAR(26) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    request_count INT NOT NULL,
    error_count INT NOT NULL,
    total_tokens INT NOT NULL,
    total_cost DECIMAL(10,6) NOT NULL,
    average_latency_ms INT NOT NULL,
    p95_latency_ms INT NOT NULL,
    FOREIGN KEY (model_id) REFERENCES models(id)
);

CREATE TABLE alerts (
    id VARCHAR(26) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    condition JSON NOT NULL,
    notification_channels JSON NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### 評価基盤

#### データモデル
```rust
pub struct EvaluationTest {
    pub id: TestId,
    pub name: String,
    pub description: String,
    pub test_cases: Vec<TestCase>,
    pub evaluation_criteria: Vec<EvaluationCriterion>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub struct TestCase {
    pub id: TestCaseId,
    pub input: String,
    pub expected_output: String,
    pub metadata: HashMap<String, String>,
}

pub struct EvaluationResult {
    pub id: ResultId,
    pub test_id: TestId,
    pub model_id: ModelId,
    pub scores: Vec<CriterionScore>,
    pub executed_at: DateTime<Utc>,
}
```

#### API エンドポイント
- `GET /api/v1/tests` - テスト一覧取得
- `POST /api/v1/tests` - テスト登録
- `GET /api/v1/tests/{test_id}/results` - テスト結果取得
- `POST /api/v1/tests/{test_id}/execute` - テスト実行
- `GET /api/v1/models/{model_id}/evaluations` - モデル評価結果取得

#### データベーススキーマ
```sql
CREATE TABLE evaluation_tests (
    id VARCHAR(26) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    test_cases JSON NOT NULL,
    evaluation_criteria JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE evaluation_results (
    id VARCHAR(26) PRIMARY KEY,
    test_id VARCHAR(26) NOT NULL,
    model_id VARCHAR(26) NOT NULL,
    scores JSON NOT NULL,
    executed_at TIMESTAMP NOT NULL,
    FOREIGN KEY (test_id) REFERENCES evaluation_tests(id),
    FOREIGN KEY (model_id) REFERENCES models(id)
);
```
