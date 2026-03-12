# Agent APIモデル一覧とカタログ同期の設計改善

## 現状の問題

現在の実装では、Agent APIのモデル一覧を返す際に以下の問題があります：

### 1. 二重管理の問題
- **プロバイダー側**: 各プロバイダーのコード（`packages/providers/*/src/chat/stream_v2.rs`）で `get_supported_models()` がハードコードされたモデルリストを返す
- **カタログ側**: `product_usage_pricing` テーブルの `metadata` に `provider` と `model` を手動で登録する必要がある
- 同じ情報を2箇所で管理する必要があり、同期が取れなくなるリスクが高い

### 2. 同期の問題
- プロバイダー側で新しいモデルを追加しても、カタログ側に手動で `product_usage_pricing` レコードを作成しないと、Agent APIのモデル一覧に表示されない
- 新規モデル追加時に複数箇所を更新する必要があり、作業漏れが発生しやすい

### 3. 整合性の問題
- `GetSupportedModels` は両方のソースを照合し、**両方に存在する場合のみ**返す設計
- 片方だけに存在する場合は警告ログのみで、ユーザーには非表示になる
- エラーメッセージが不親切（「カタログに登録されていません」など）

### 4. 運用負荷
- 新規モデル追加時の手順：
  1. プロバイダー側で `get_supported_models()` にモデルを追加
  2. カタログ側で `product_usage_pricing` レコードを作成（シードデータまたはDB直接操作）
  3. 両方の整合性を確認
- モデル削除時も同様に2箇所を更新する必要がある

## 目標

- **Single Source of Truth**: モデル情報を一箇所で管理し、そこから自動的に他システムを更新する
- **自動同期**: プロバイダー側の変更がカタログ側に自動反映される
- **運用の簡素化**: 新規モデル追加時に手動操作を最小限にする

## 改善案: LibraryコンテキストをSingle Source of Truthにする

**概要**: Libraryコンテキストに `anthropic/models`、`openai/models` のようなリポジトリを作成し、モデル情報を管理する

**設計思想**:
- Libraryコンテキストはインターネット上の情報のSingle Source of Truthとして機能している
- モデル情報（context_window, supported_features, descriptionなど）も外部情報であり、Libraryで管理するのが適切
- プロバイダー側とカタログ側は、Libraryからモデル情報を参照する

**メリット**:
- Libraryコンテキストの責務に合致している（外部情報の管理）
- モデル情報を一元管理でき、更新が容易
- GitHub Syncなどでモデル情報をバージョン管理できる
- UIから直接モデル情報を編集・管理できる
- プロバイダー側のコード（実装）と情報（仕様）が分離され、保守性が向上

**実装方針**:
1. Libraryコンテキストに各プロバイダー用のリポジトリを作成
   - `anthropic/models`: Anthropicのモデル情報
   - `openai/models`: OpenAIのモデル情報
   - `google_ai/models`: Google AIのモデル情報
   - など
2. 各モデルをデータとして保存（プロパティ定義）
   ```yaml
   properties:
     model_name: "string (required)"
     provider: "string (required)"
     description: "markdown (optional)"
     context_window: "integer (optional)"
     max_output_tokens: "integer (optional)"
     supported_features: "multi-select (optional)"  # ["agent", "streaming", "vision", ...]
   ```
3. **CI時にLibrary APIからマスタ情報をダンプしてローカルキャッシュとして保持**
   - PRごとにCIで実行
   - Library APIからモデル情報を取得してJSON/YAMLファイルにダンプ
   - リポジトリにコミット（例: `packages/llms/models-registry.json`）
   - ランタイムではこのキャッシュファイルを読み込む
4. ローカルキャッシュからモデル情報を取得するサービスを実装
   - `ModelRegistry::load_from_cache() -> Vec<ModelInfo>`
   - `ModelRegistry::get_model_info(provider: String, model_name: String) -> Option<ModelInfo>`
5. `GetSupportedModels` でローカルキャッシュからモデル情報を取得
6. カタログ側はローカルキャッシュから取得したモデル情報を元に `product_usage_pricing` を自動生成

**メリット（キャッシュ方式）**:
- Library APIへの負荷を削減（ランタイムでは参照しない）
- 高速な読み込み（ローカルファイルから読み込む）
- バージョン管理される（Gitで変更履歴を追跡できる）
- CIで整合性チェックが可能（Libraryの変更を検知できる）

**課題**:
- CIでのダンプ処理が必要（GitHub Actionsでの実装）
- Libraryに新しいモデルを追加した際、PRでキャッシュも更新する必要がある
- 既存のプロバイダー側の `get_supported_models()` との関係
  - オプション1: Libraryをマスターとし、プロバイダー側の実装は削除
  - オプション2: Libraryをマスターとし、プロバイダー側は参照のみ（後方互換性のため）

### 実装手順

#### Phase 1: Libraryコンテキストにモデル情報リポジトリを作成

1. **各プロバイダー用のリポジトリを作成**
   - `anthropic/models` リポジトリを作成
   - `openai/models` リポジトリを作成
   - `google_ai/models` リポジトリを作成
   - など

2. **モデル情報のプロパティ定義**
   ```yaml
   properties:
     model_name:
       type: String
       required: true
     provider:
       type: String
       required: true
     description:
       type: Markdown
       optional: true
     context_window:
       type: Integer
       optional: true
     max_output_tokens:
       type: Integer
       optional: true
     supported_features:
       type: MultiSelect
       options: ["agent", "streaming", "vision", "function_calling", "json_mode", "reasoning"]
       optional: true
   ```

3. **既存モデル情報をLibraryに移行**
   - 各プロバイダーの `get_supported_models()` から情報を取得
   - Library API経由でリポジトリにデータを登録

#### Phase 2: CIでLibrary APIからマスタ情報をダンプする仕組みを実装

1. **ダンプスクリプトの作成**
   - `scripts/dump-library-models.rs` または Node.jsスクリプト
   - Library API（GraphQL/REST）からモデル情報を取得
   - JSON/YAMLファイルにダンプ（例: `packages/llms/models-registry.json`）

2. **GitHub Actionsワークフローに追加**
   - PRごとに実行されるCIジョブを追加
   - Library APIからモデル情報を取得してダンプ
   - キャッシュファイルが変更されていれば、自動的にコミット（またはPRに変更として表示）

3. **ローカルキャッシュから読み込むサービスを実装**
   ```rust
   // packages/llms/src/models_registry.rs
   pub struct ModelRegistry {
       models: Vec<ModelInfo>,
   }
   
   impl ModelRegistry {
       pub fn load_from_cache() -> errors::Result<Self> {
           // packages/llms/models-registry.json を読み込む
           let content = include_str!("../models-registry.json");
           let models: Vec<ModelInfo> = serde_json::from_str(content)?;
           Ok(Self { models })
       }
       
       pub fn get_model_info(
           &self,
           provider: &str,
           model_name: &str,
       ) -> Option<&ModelInfo> {
           self.models.iter()
               .find(|m| m.provider == provider && m.model_name == model_name)
       }
   }
   ```

#### Phase 3: `GetSupportedModels` をローカルキャッシュベースに変更

1. **`GetSupportedModels` のロジックを変更**
   - ローカルキャッシュからモデル情報を取得（`ModelRegistry::load_from_cache()`）
   - カタログ側の `product_usage_pricing` と照合
   - 両方に存在するモデルのみを返す

2. **カタログ側の自動生成**
   - ローカルキャッシュから取得したモデル情報を元に `product_usage_pricing` を自動生成
   - `CatalogAppService::sync_agent_api_models_from_cache()` を実装

#### Phase 4: プロバイダー側の実装を整理

1. **プロバイダー側の `get_supported_models()` を削除またはLibrary参照に変更**
   - オプション1: Library APIを経由してモデル情報を取得（推奨）
   - オプション2: 後方互換性のため残すが、Libraryをマスターとする

2. **既存コードの更新**
   - `ChatStreamProviders::supported_models()` をLibrary参照に変更
   - または、Libraryからモデル情報を取得してプロバイダー側の実装とマージ

### 実装の詳細

#### 1. Libraryコンテキストにモデル情報リポジトリを作成

各プロバイダー用のリポジトリをLibraryコンテキストに作成します。

```yaml
# anthropic/models リポジトリのデータ例
- model_name: "claude-opus-4.1"
  provider: "anthropic"
  description: "Claude 4.1 Opus - Our most capable and intelligent model yet."
  context_window: 200000
  max_output_tokens: 32000
  supported_features: ["agent", "streaming", "function_calling", "vision", "system_prompt", "json_mode"]
```

#### 2. CIでLibrary APIからマスタ情報をダンプするスクリプト

```rust
// scripts/dump-library-models.rs
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let library_api_url = std::env::var("LIBRARY_API_URL")
        .unwrap_or_else(|_| "http://localhost:50053".to_string());
    
    // Library APIからモデル情報を取得
    let providers = vec!["anthropic", "openai", "google_ai", "xai"];
    let mut all_models = Vec::new();
    
    for provider in providers {
        // GraphQLクエリまたはREST APIでリポジトリからデータを取得
        let models = fetch_models_from_library(&library_api_url, provider).await?;
        all_models.extend(models);
    }
    
    // JSONファイルにダンプ
    let output_path = "packages/llms/models-registry.json";
    let json = serde_json::to_string_pretty(&all_models)?;
    std::fs::write(output_path, json)?;
    
    println!("Dumped {} models to {}", all_models.len(), output_path);
    Ok(())
}
```

#### 3. GitHub Actionsワークフロー

```yaml
# .github/workflows/dump-library-models.yml
name: Dump Library Models

on:
  pull_request:
    paths:
      - 'apps/library-api/**'
      - 'packages/llms/**'
  workflow_dispatch:

jobs:
  dump-models:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Rust
        uses: actions-rs/toolchain@v1
      - name: Dump models from Library API
        run: cargo run --bin dump-library-models
        env:
          LIBRARY_API_URL: ${{ secrets.LIBRARY_API_URL }}
      - name: Check for changes
        run: |
          git diff --exit-code packages/llms/models-registry.json || \
            (echo "Models registry has changed" && exit 1)
```

#### 4. ローカルキャッシュから読み込むサービスを実装

```rust
// packages/llms/src/models_registry.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub provider: String,
    pub model_name: String,
    pub description: Option<String>,
    pub context_window: Option<i32>,
    pub max_output_tokens: Option<i32>,
    pub supported_features: Vec<String>,
}

pub struct ModelRegistry {
    models: Vec<ModelInfo>,
}

impl ModelRegistry {
    pub fn load_from_cache() -> errors::Result<Self> {
        // CIでダンプされたJSONファイルを読み込む
        let content = include_str!("../models-registry.json");
        let models: Vec<ModelInfo> = serde_json::from_str(content)
            .map_err(|e| errors::Error::internal_server_error(format!(
                "Failed to parse models registry: {}", e
            )))?;
        Ok(Self { models })
    }
    
    pub fn get_model_info(
        &self,
        provider: &str,
        model_name: &str,
    ) -> Option<&ModelInfo> {
        self.models.iter()
            .find(|m| m.provider == provider && m.model_name == model_name)
    }
    
    pub fn get_all_models_for_provider(
        &self,
        provider: &str,
    ) -> Vec<&ModelInfo> {
        self.models.iter()
            .filter(|m| m.provider == provider)
            .collect()
    }
    
    pub fn get_all_models(&self) -> &[ModelInfo] {
        &self.models
    }
}
```

#### 5. `GetSupportedModels` をローカルキャッシュベースに変更

```rust
// packages/llms/src/usecase/get_supported_models.rs
pub async fn execute(
    &self,
    filter: GetSupportedModelsFilter,
) -> errors::Result<GetSupportedModelsOutput> {
    // ローカルキャッシュからモデル情報を取得
    let registry = ModelRegistry::load_from_cache()?;
    
    // カタログ側のproduct_usage_pricingと照合
    if filter.require_agent_product {
        let catalog_entries = self.catalog_app.list_agent_api_models().await?;
        
        let mut models = Vec::new();
        for AgentCatalogModel { provider, model, .. } in catalog_entries {
            if let Some(model_info) = registry.get_model_info(&provider, &model) {
                // ModelInfoをllms_provider::v2::ModelInfoに変換
                models.push(convert_to_provider_model_info(model_info));
            }
        }
        
        Ok(GetSupportedModelsOutput {
            models,
            total_count: models.len() as i32,
        })
    } else {
        // ローカルキャッシュから取得したモデル情報をそのまま返す
        let models = registry.get_all_models()
            .iter()
            .map(convert_to_provider_model_info)
            .collect();
        
        Ok(GetSupportedModelsOutput {
            models,
            total_count: models.len() as i32,
        })
    }
}
```

#### 6. カタログ側の自動生成（ローカルキャッシュベース）

```rust
// packages/catalog/src/app.rs
async fn sync_agent_api_models_from_cache(
    &self,
    procurement_app: Arc<dyn ProcurementApp>,
    tenant_id: TenantId,
) -> errors::Result<()> {
    // ローカルキャッシュからモデル情報を取得
    let registry = llms::ModelRegistry::load_from_cache()?;
    let all_models = registry.get_all_models();
    
    for model in all_models {
        // 既存レコードを確認
        let product_id = self.get_or_create_product_for_model(&model.provider, &model.model_name).await?;
        
        // 課金レートを取得（procurementから）
        let pricing_info = procurement_app
            .get_model_token_pricing(&model.provider, &model.model_name)
            .await?;
        
        // ProductUsagePricingを作成/更新
        let pricing = ProductUsagePricing::create_for_agent_api(
            product_id,
            tenant_id.clone(),
            model.provider.clone(),
            model.model_name.clone(),
            pricing_info,
        );
        
        self.product_usage_pricing_repository.save(&pricing).await?;
    }
    
    Ok(())
}
```

## 影響範囲

- **Libraryコンテキスト**:
  - 各プロバイダー用のリポジトリを作成（`anthropic/models`、`openai/models` など）
  - モデル情報を取得するGraphQL/REST APIエンドポイント（既存のAPIを使用）

- **CI/スクリプト**:
  - `scripts/dump-library-models.rs`: Library APIからモデル情報をダンプするスクリプト
  - `.github/workflows/dump-library-models.yml`: CIワークフロー

- **LLMsコンテキスト**:
  - `packages/llms/src/models_registry.rs`: ローカルキャッシュから読み込むサービスを追加
  - `packages/llms/models-registry.json`: CIでダンプされたモデル情報のキャッシュファイル

- **Catalogコンテキスト**:
  - `packages/catalog/src/app.rs`: `CatalogAppService` に `sync_agent_api_models_from_library()` を追加
  - `packages/catalog/src/product_usage_pricing/mod.rs`: `create_for_agent_api()` に課金レートパラメータを追加

- **LLMsコンテキスト**:
  - `packages/llms/src/usecase/get_supported_models.rs`: ローカルキャッシュからモデル情報を取得するように変更

- **Providers**:
  - `packages/providers/*/src/chat/stream_v2.rs`: `get_supported_models()` をLibrary参照に変更（オプション、後方互換性のため残す場合もある）

- **Tachyon API**:
  - `apps/tachyon-api/src/main.rs` または `di.rs`: ローカルキャッシュからカタログへの自動同期を実装（起動時または定期実行）

- **シードデータ**:
  - `scripts/seeds/n1-seed/005-order-products.yaml`: モデル情報の手動管理を削除（Libraryから自動生成に移行）

## 移行計画

1. **Phase 1**: Libraryコンテキストにモデル情報リポジトリを作成し、既存データを移行
2. **Phase 2**: CIでLibrary APIからマスタ情報をダンプする仕組みを実装
   - ダンプスクリプトの作成
   - GitHub Actionsワークフローの追加
   - ローカルキャッシュから読み込むサービスを実装
3. **Phase 3**: `GetSupportedModels` をローカルキャッシュベースに変更
4. **Phase 4**: カタログ側の自動生成機能を実装（ローカルキャッシュベース）
5. **Phase 5**: プロバイダー側の実装を整理（Library参照に変更または削除）

## テスト

- ダンプスクリプトがLibrary APIから正しくモデル情報を取得できることを確認
- CIでダンプスクリプトが正しく実行されることを確認
- ローカルキャッシュファイル（`models-registry.json`）が正しく生成されることを確認
- `ModelRegistry::load_from_cache()` が正しくキャッシュを読み込むことを確認
- `GetSupportedModels` がローカルキャッシュからモデル情報を取得することを確認
- カタログ側の自動生成が正しく動作することを確認（新規作成、既存更新）
- 起動時または定期実行でカタログが自動生成されることを確認
- Libraryに新規モデルを追加した際、CIでキャッシュが更新され、カタログに自動反映されることを確認
- 既存の `product_usage_pricing` レコードの `usage_rates` が保持されることを確認

## 関連ドキュメント

- [Agent APIモデルカタログ整合性](../../../tachyon-apps/llms/agent-api/model-catalog-filtering.md)
- [完了タスク: LLMSモデル一覧とカタログ整合性の確保](../../completed/v0.17.0/filter-llms-model-list/task.md)
- [Library Overview](../../../services/library/overview.md)
- [Library API仕様](../../../library-api/library-api-cms-spec.md)

