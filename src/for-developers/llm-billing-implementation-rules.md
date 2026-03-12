# LLMビリングシステム実装ルール

## 概要

本ドキュメントは、Tachyon AppsのLLMビリングシステム実装における重要なルールとパターンをまとめたものです。これらのルールは、クリーンアーキテクチャとドメイン駆動設計の原則に基づいています。

## 基本原則

### 1. 1 usecase 1 public method原則

```rust
// ✅ 良い例
pub struct ExecuteAgent {
    // ...dependencies
}

impl ExecuteAgentInputPort for ExecuteAgent {
    /// 唯一のpublicメソッド
    async fn execute<'a>(
        &self,
        input: ExecuteAgentInputData<'a>,
    ) -> Result<ChatStreamResponse> {
        // 実装
    }
}

// ❌ 悪い例：派生ユースケースを作成しない
pub struct ExecuteAgentWithBilling {
    // これは作成しない
}
```

### 2. PaymentAppインターフェースパターン

AuthAppの`check_policy`パターンに従い、統一されたインターフェースを提供：

```rust
#[async_trait::async_trait]
pub trait PaymentApp: Debug + Send + Sync + 'static {
    /// 課金可能かチェックする（AuthApp::check_policyと同じパターン）
    async fn check_billing<'a>(
        &self,
        input: &CheckBillingInput<'a>,
    ) -> errors::Result<()>;
    
    /// クレジットを消費する
    async fn consume_credits<'a>(
        &self,
        input: &ConsumeCreditsInput<'a>,
    ) -> errors::Result<ConsumeCreditsOutput>;
}
```

#### Order連携API（2025-09）
Orderコンテキストから外部決済プロバイダ連携を行うため、以下のAPIを追加：

- `create_quote_checkout_session(input)`: 見積りのLineItemからCheckoutを生成
- `sync_create_product(input)`: 製品作成の外部プロバイダ同期（画像URL対応）
- `sync_update_product(input)`: 製品更新の外部プロバイダ同期（画像URL対応）
- `sync_delete_product(input)`: 製品削除の外部プロバイダ同期

実装メモ：
- StripeはIAC + StripeClientRegistryでテナント別設定を解決
- ProviderObjectMappingにより社内IDと外部IDを対応付け
- Square対応は今後追加（プロバイダ解決とOAuth連携の設計後）

### 3. コンテキスト境界の明確化

```yaml
contexts:
  llms:
    responsibilities:
      - "LLMプロバイダーとの通信"
      - "使用量の測定と記録"
      - "Agent/Chat実行ロジック"
      - "コスト見積もり計算"
    boundaries:
      - "課金の実行は行わない（Paymentに委譲）"
      - "クレジット残高の管理は行わない"
    
  payment:
    responsibilities:
      - "クレジット残高管理"
      - "取引履歴の記録"
      - "Stripe決済処理"
      - "課金ルールの実行"
    boundaries:
      - "LLM実行ロジックには関与しない"
      - "使用量データは参照のみ（所有しない）"
```

## 実装パターン

### 1. PaymentApp統合パターン

```rust
// LLMsコンテキスト内でPaymentAppを必須依存として受け取る
pub struct ExecuteAgent {
    chat_stream_providers: Arc<ChatStreamProviders>,
    chat_message_repo: Arc<dyn ChatMessageRepository>,
    cost_calculator: Arc<AgentCostCalculator>,
    payment_app: Arc<dyn PaymentApp>, // 必須
}

impl ExecuteAgentInputPort for ExecuteAgent {
    async fn execute<'a>(
        &self,
        input: ExecuteAgentInputData<'a>,
    ) -> Result<ChatStreamResponse> {
        // 1. コスト見積もり
        let estimated_cost = self.cost_calculator.estimate_cost(...);
        
        // 2. 課金チェック（PaymentApp内で課金有効/無効を判断）
        self.payment_app.check_billing(&CheckBillingInput {
            executor: input.executor,
            multi_tenancy: input.multi_tenancy,
            estimated_cost,
            resource_type: "agent_execution",
        }).await?;
        
        // 3. Agent実行
        // ...
        
        // 4. 実際のコスト計算と課金（ストリーム処理内で）
    }
}
```

### 2. BillingPolicyパターン

テナントごとの柔軟な課金ルールを実装：

```rust
pub struct BillingPolicy {
    pub tenant_id: TenantId,
    pub is_billing_enabled: bool,
    pub free_trial_credits: Option<i64>,
    pub allow_negative_balance: bool,
    pub skip_billing_for_internal: bool,
    pub monthly_credit_limit: Option<i64>,
}

impl BillingPolicy {
    pub fn requires_billing(&self) -> bool {
        self.is_billing_enabled
    }
    
    pub fn can_execute(
        &self,
        balance: &CreditBalance,
        estimated_cost: i64,
    ) -> Result<(), BillingError> {
        // 課金ポリシーに基づいた実行可否判定
    }
}
```

### 3. NoOp実装パターン

課金が無効な環境用の実装（packages/payment/src/noop.rsに統合）：

```rust
// packages/payment/src/noop.rs
#[derive(Debug)]
pub struct NoOpPaymentApp;

#[async_trait::async_trait]
impl PaymentApp for NoOpPaymentApp {
    async fn check_billing<'a>(
        &self,
        _input: &CheckBillingInput<'a>,
    ) -> errors::Result<()> {
        Ok(()) // 常にOK
    }
    
    async fn consume_credits<'a>(
        &self,
        _input: &ConsumeCreditsInput<'a>,
    ) -> errors::Result<ConsumeCreditsOutput> {
        Ok(ConsumeCreditsOutput {
            transaction_id: None,
            amount_consumed: 0,
            balance_after: i64::MAX,
            was_billed: false,
        })
    }
    
    // Stripe関連メソッドも全てNoOp実装
    async fn create_checkout_session(...) -> errors::Result<CheckoutSessionOutput> {
        Err(errors::Error::not_supported("Billing is disabled"))
    }
}
```

### 4. GraphQL実装パターン

#### LLMsコンテキスト

LLMsコンテキスト内にResolver/Subscriptionを配置：

```rust
// packages/llms/src/adapter/graphql/agent_subscription.rs
#[Subscription]
impl AgentSubscription {
    async fn execute_agent(
        &self,
        ctx: &Context<'_>,
        // ... parameters
    ) -> Result<Pin<Box<dyn Stream<Item = AgentExecutionEvent> + Send>>> {
        let llms_app = ctx.data::<Arc<crate::App>>()?;
        
        // Agent実行（課金処理はユースケース内で実施）
        let stream_response = llms_app
            .execute_agent()
            .execute(input_data)
            .await?;
        
        // ストリームをGraphQLイベントに変換
        // ...
    }
}
```

#### Paymentコンテキスト

クレジット関連のQuery/MutationはPaymentコンテキストに配置：

```rust
// packages/payment/src/adapter/graphql/query.rs
#[Object]
impl PaymentQuery {
    /// 現在のクレジット残高を取得
    async fn credit_balance(&self, ctx: &Context<'_>) -> Result<CreditBalance> {
        let payment_app = ctx.data::<Arc<dyn PaymentApp>>()?;
        // ...
    }
    
    /// クレジット取引履歴を取得
    async fn credit_transactions(
        &self,
        ctx: &Context<'_>,
        limit: i32,
        offset: i32,
    ) -> Result<CreditTransactionConnection> {
        // ページネーション付きで取引履歴を返す
    }
    
    /// 利用可能なクレジットパッケージ一覧を取得
    async fn credit_packages(&self, ctx: &Context<'_>) -> Result<Vec<CreditPackage>> {
        // ...
    }
}

// packages/payment/src/adapter/graphql/mutation.rs
#[Object]
impl PaymentMutation {
    /// Stripe Checkout Sessionを作成してクレジット購入フローを開始
    async fn create_credit_purchase_session(
        &self,
        ctx: &Context<'_>,
        input: CreateCreditPurchaseSessionInput,
    ) -> Result<CreateCreditPurchaseSessionPayload> {
        // ...
    }
    
    /// 管理者用：手動でクレジットを付与
    // TODO: @hasRole(roles: [ADMIN])ガードの実装
    async fn grant_credits(
        &self,
        ctx: &Context<'_>,
        input: GrantCreditsInput,
    ) -> Result<GrantCreditsPayload> {
        // ...
    }
}
```

#### tachyon-apiでの統合

```rust
// apps/tachyon-api/src/graphql/resolver.rs
#[derive(MergedObject, Default)]
pub struct QueryRoot(
    auth::AuthQuery,
    llms::LLMsQuery,
    order::OrderQuery,
    payment::PaymentQuery,  // Payment Queryを追加
);

#[derive(MergedObject, Default)]
pub struct MutationRoot(
    auth::AuthMutation,
    source_explore::SourceExploreMutation,
    llms::LLMsMutation,
    order::OrderMutation,
    payment::PaymentMutation,  // Payment Mutationを追加
);

// apps/tachyon-api/src/main.rs
let schema: graphql::AppSchema = Schema::build(
    QueryRoot::default(),
    MutationRoot::default(),
    EmptySubscription,
)
.data(auth_app.clone())
.data(source_exlore_context)
.data(llms_context.clone())
.data(payment_app.clone())  // PaymentAppを追加
.finish();
```

## コスト計算ルール

### 1. クレジットレート

```yaml
credit_rates:
  JPY: 1 credit = ¥1
  USD: 1 credit = $0.01
```

### 2. Agent API使用コスト

```yaml
agent_api_costs:
  base_cost: 10  # 10クレジット/実行
  token_costs:
    prompt: 0.01      # クレジット/トークン
    completion: 0.02  # クレジット/トークン
  tool_costs:
    mcp_search: 50    # MCPツール使用料金
    mcp_read: 20
    mcp_write: 30
    mcp_exec: 40
    web_search: 50    # 一般ツール使用料金
    code_execution: 30
    file_operation: 20
```

### 3. コスト計算サービス

```rust
pub struct AgentCostCalculator {
    pub fn estimate_cost(
        &self,
        task_length: usize,
        has_mcp_config: bool,
    ) -> i64 {
        // 見積もりロジック
    }
    
    pub fn calculate_from_stream(
        &self,
        usage_tokens: u32,
        completion_tokens: u32,
        tool_calls: Vec<String>,
    ) -> AgentExecutionCost {
        // 実際のコスト計算
    }
}
```

## Stripe統合パターン

### 1. クレジットパッケージ

```rust
// プリセットパッケージの定義
pub fn preset_packages() -> Vec<CreditPackage> {
    vec![
        CreditPackage {
            name: "Starter Pack",
            credits: 10000,
            price_jpy: Some(10000),    // ¥10,000
            price_usd: Some(10000),    // $100.00 (10000セント)
            bonus_credits: 0,
            // ...
        },
        // Standard: 10%ボーナス、Pro: 20%ボーナス、Enterprise: 30%ボーナス
    ]
}
```

### 2. Checkout Session作成

```rust
// Stripe Checkout URLの生成
pub async fn create_checkout_session(
    &self,
    package_id: String,
    currency: String,
    success_url: String,
    cancel_url: String,
    tenant_id: TenantId,
) -> errors::Result<CheckoutSessionOutput> {
    // メタデータにテナントIDとパッケージ情報を含める
    let mut params = stripe::CreateCheckoutSession::new();
    params.metadata = Some([
        ("tenant_id", tenant_id.to_string()),
        ("package_id", package_id),
        ("total_credits", package.total_credits().to_string()),
    ].into_iter().collect());
    
    // Checkout Sessionを作成
    let session = stripe::CheckoutSession::create(&client, params).await?;
    Ok(CheckoutSessionOutput {
        checkout_url: session.url.unwrap(),
        session_id: session.id.to_string(),
    })
}
```

### 3. Webhook処理

```rust
// Stripe Webhookの処理
pub async fn handle_stripe_webhook(
    &self,
    payload: String,
    signature: String,
    webhook_secret: String,
) -> errors::Result<WebhookOutput> {
    // 署名検証
    let event = stripe::Webhook::construct_event(
        &payload,
        &signature,
        &webhook_secret,
    )?;
    
    match event.type_ {
        stripe::EventType::CheckoutSessionCompleted => {
            // メタデータからテナントIDとクレジット数を取得
            let metadata = session.metadata.unwrap();
            let tenant_id = TenantId::from_str(&metadata["tenant_id"])?;
            let total_credits: i64 = metadata["total_credits"].parse()?;
            
            // クレジットを付与
            let mut balance = self.credit_repository
                .get_or_create(tenant_id.clone())
                .await?;
            balance.add_credits(total_credits)?;
            self.credit_repository.save(&balance).await?;
            
            // トランザクションを記録
            let transaction = CreditTransaction::charge(
                tenant_id,
                total_credits,
                balance.balance,
                session.payment_intent.map(|pi| pi.id().to_string()).unwrap_or_default(),
            );
            self.transaction_repository.save(&transaction).await?;
        }
        _ => {}
    }
}
```

### 4. Stripeクライアント初期化

```rust
// Stripeクライアントの初期化はDebugトレイトがないため、カスタム実装が必要
impl std::fmt::Debug for CreateCheckoutSession {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CreateCheckoutSession")
            .field("package_repository", &self.package_repository)
            .field("stripe_client", &"<stripe::Client>")
            .finish()
    }
}
```

## データモデル設計ルール

### 1. クレジット管理テーブル

```sql
-- 残高管理（Paymentコンテキスト）
CREATE TABLE `credit_balances` (
    `tenant_id` VARCHAR(29) NOT NULL,
    `current_balance` BIGINT NOT NULL DEFAULT 0,
    `reserved_credits` BIGINT NOT NULL DEFAULT 0,
    `currency` ENUM('JPY', 'USD') NOT NULL DEFAULT 'JPY',
    `last_updated` TIMESTAMP NOT NULL,
    PRIMARY KEY (`tenant_id`)
);

-- 取引履歴（Paymentコンテキスト）
CREATE TABLE `credit_transactions` (
    `id` VARCHAR(32) NOT NULL,
    `tenant_id` VARCHAR(29) NOT NULL,
    `transaction_type` ENUM('charge', 'usage', 'refund', 'adjustment') NOT NULL,
    `amount` BIGINT NOT NULL,
    `balance_after` BIGINT NOT NULL,
    -- その他のフィールド
);

-- クレジットパッケージ（Paymentコンテキスト）
CREATE TABLE `credit_packages` (
    `id` VARCHAR(32) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `credits` BIGINT NOT NULL,
    `price_jpy` BIGINT NULL,
    `price_usd` BIGINT NULL,
    `bonus_credits` BIGINT NOT NULL DEFAULT 0,
    `stripe_product_id` VARCHAR(100) NULL,
    `stripe_price_id_jpy` VARCHAR(100) NULL,
    `stripe_price_id_usd` VARCHAR(100) NULL,
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (`id`)
);
```

### 2. 実行コスト記録テーブル

```sql
-- Agent実行コスト（LLMsコンテキスト）
CREATE TABLE `agent_execution_costs` (
    `id` VARCHAR(32) NOT NULL,
    `agent_execution_id` VARCHAR(32) NOT NULL,
    `tenant_id` VARCHAR(29) NOT NULL,
    `base_cost` BIGINT NOT NULL,
    `token_cost` BIGINT NOT NULL,
    `tool_cost` BIGINT NOT NULL,
    `total_cost` BIGINT NOT NULL,
    `tool_usage_details` JSON,
    `created_at` TIMESTAMP NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY (`agent_execution_id`)
);
```

## イベント駆動通信ルール

### 1. イベント定義

```yaml
events:
  - name: AgentExecutedEvent
    producer: LLMs Context
    consumers: [Analytics Context, Audit Context]
    description: "Agent実行完了時の統計・監査用"
    
  - name: CreditConsumedEvent
    producer: Payment Context
    consumers: [Analytics Context]
    description: "クレジット消費の分析用"
    
  - name: LowBalanceEvent
    producer: Payment Context
    consumers: [Notification Context]
    description: "低残高アラート通知"
```

### 2. イベント処理パターン

```rust
// イベントハンドラーは冪等性を保証
impl EventHandler<AgentExecutedEvent> for AgentBillingEventHandler {
    async fn handle(&self, event: AgentExecutedEvent) -> Result<(), EventError> {
        // すでに処理済みの場合はスキップ
        if self.transaction_service
            .exists_for_execution(&event.execution_id)
            .await? 
        {
            return Ok(());
        }
        
        // イベント処理
    }
}
```

## エラーハンドリング

### 1. 課金エラーの扱い

```rust
// API層でのエラーハンドリング
match llms_app.execute_agent().execute(input_data).await {
    Err(errors::Error::PaymentRequired(_)) => {
        yield Ok(Event::default()
            .event("error")
            .data(json!({
                "error": e.to_string(),
                "code": "INSUFFICIENT_CREDITS"
            })));
    }
    // その他のエラー処理
}
```

### 2. HTTPステータスコード

```rust
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        match self {
            ApiError::PaymentRequired(msg) => {
                (StatusCode::PAYMENT_REQUIRED, Json(json!({
                    "error": "payment_required",
                    "message": msg,
                    "code": "INSUFFICIENT_CREDITS"
                }))).into_response()
            }
        }
    }
}
```

## パフォーマンス最適化

### 1. キャッシュ戦略

```rust
// クレジット残高はRedisでキャッシュ
- TTL: 5分
- 予約クレジットは実行完了まで保持（最大30分）
- バッチでのクレジット消費記録（1秒ごと）
```

### 2. ストリーミング処理

```rust
// ストリーム処理中のコスト追跡
tokio::spawn(async move {
    let mut total_tokens = 0u32;
    let mut tool_calls = Vec::new();
    
    while let Some(chunk_result) = stream.next().await {
        // 使用量情報を抽出
        match &chunk {
            StreamChunk::Usage(usage) => { /* ... */ }
            StreamChunk::ToolCall(tool_call) => { /* ... */ }
        }
    }
    
    // ストリーム完了後にコスト計算と課金
});
```

## セキュリティ考慮事項

### 1. アクセス制御

- クレジット付与は管理者権限必須
- テナント間のデータ分離を徹底
- 監査ログの記録

### 2. 異常検知

- 異常な消費パターンの自動検知
- APIレート制限との連携
- 大量ツール使用の監視

## 設定と環境変数

### 1. 課金有効化設定

```rust
// packages/payment/src/app.rs
impl AppBuilder {
    pub fn new(db: Arc<Db>) -> Self {
        // デフォルトでは環境変数から読み取る
        let billing_enabled = std::env::var("BILLING_ENABLED")
            .unwrap_or_else(|_| "false".to_string())
            .parse::<bool>()
            .unwrap_or(false);
            
        Self {
            db,
            stripe_client: None,
            billing_enabled,
        }
    }
    
    pub fn build(self) -> Arc<dyn PaymentApp> {
        // 課金が無効な場合はNoOpPaymentAppを返す
        if !self.billing_enabled {
            return crate::NoOpPaymentApp::new();
        }
        // 通常のPaymentApp実装を返す
    }
}

// apps/tachyon-api/src/main.rs
let payment_db = persistence::Db::new(
    database_url.use_database("tachyon_apps_payment"),
)
.await;
let payment_app: Arc<dyn PaymentApp> = payment::AppBuilder::new(payment_db)
    .build(); // 環境変数BILLING_ENABLEDで自動的に切り替え
```

### 2. 環境ごとの設定

- Development: 課金無効（NoOpPaymentApp使用）
- Staging: 課金有効（テスト用Stripe使用）
- Production: 課金有効（本番Stripe使用）

## まとめ

これらのルールに従うことで、以下を実現します：

1. **クリーンアーキテクチャの維持**: 各コンテキストの責務を明確に分離
2. **柔軟な課金管理**: BillingPolicyによるテナントごとの制御
3. **高い保守性**: 統一されたインターフェースとパターン
4. **スケーラビリティ**: イベント駆動とキャッシュによる最適化

これらのルールは、tachyon-apps全体のアーキテクチャと一貫性を保ちながら、LLMビリングシステムを実装するための指針となります。
