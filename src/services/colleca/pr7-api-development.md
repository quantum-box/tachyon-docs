# PR #7: API開発

## 概要
外部サービスとの連携のためのAPIを開発します。RESTful APIとGraphQL APIの両方を実装し、認証・認可、レート制限、APIドキュメントなどの機能を提供します。

## 実装内容

### 1. RESTful API設計

```rust
// apps/colleca-api/src/routes/api_v1.rs
use axum::{
    Router,
    routing::{get, post, put, delete},
};
use crate::handlers::{
    collection_handler,
    product_handler,
    user_handler,
    affiliate_handler,
};

pub fn api_v1_routes() -> Router {
    Router::new()
        // コレクション関連
        .route("/collections", post(collection_handler::create_collection))
        .route("/collections/:id", get(collection_handler::get_collection))
        .route("/collections/:id", put(collection_handler::update_collection))
        .route("/collections/:id", delete(collection_handler::delete_collection))
        .route("/collections/:id/items", post(collection_handler::add_item))
        .route("/collections/:id/items/:item_id", delete(collection_handler::remove_item))
        
        // 商品関連
        .route("/products/fetch", post(product_handler::fetch_product_info))
        .route("/products/:id", get(product_handler::get_product))
        
        // ユーザー関連
        .route("/users/me", get(user_handler::get_current_user))
        .route("/users/me", put(user_handler::update_user))
        
        // アフィリエイト関連
        .route("/affiliate/accounts", post(affiliate_handler::register_affiliate_account))
        .route("/affiliate/links", post(affiliate_handler::generate_affiliate_link))
        .route("/affiliate/reports/:year/:month", get(affiliate_handler::get_monthly_report))
}
```

### 2. GraphQL API実装

```rust
// apps/colleca-api/src/graphql/schema.rs
use async_graphql::{Object, Schema, Context, EmptySubscription};
use crate::services::{CollectionService, ProductService, UserService, AffiliateService};

pub struct QueryRoot;

#[Object]
impl QueryRoot {
    async fn collection(&self, ctx: &Context<'_>, id: String) -> Result<Collection, Error> {
        let service = ctx.data::<CollectionService>()?;
        service.get_collection(Uuid::parse_str(&id)?).await
    }
    
    async fn user_collections(&self, ctx: &Context<'_>, user_id: String) -> Result<Vec<Collection>, Error> {
        let service = ctx.data::<CollectionService>()?;
        service.get_user_collections(Uuid::parse_str(&user_id)?).await
    }
    
    async fn product(&self, ctx: &Context<'_>, id: String) -> Result<Product, Error> {
        let service = ctx.data::<ProductService>()?;
        service.get_product(Uuid::parse_str(&id)?).await
    }
}

pub struct MutationRoot;

#[Object]
impl MutationRoot {
    async fn create_collection(&self, ctx: &Context<'_>, input: CreateCollectionInput) -> Result<Collection, Error> {
        let service = ctx.data::<CollectionService>()?;
        service.create_collection(input).await
    }
    
    async fn add_item_to_collection(&self, ctx: &Context<'_>, collection_id: String, product_id: String) -> Result<CollectionItem, Error> {
        let service = ctx.data::<CollectionService>()?;
        service.add_item(Uuid::parse_str(&collection_id)?, Uuid::parse_str(&product_id)?).await
    }
    
    async fn fetch_product_info(&self, ctx: &Context<'_>, url: String) -> Result<Product, Error> {
        let service = ctx.data::<ProductService>()?;
        service.fetch_product_info(&url).await
    }
}

pub type CollecaSchema = Schema<QueryRoot, MutationRoot, EmptySubscription>;

pub fn create_schema(
    collection_service: CollectionService,
    product_service: ProductService,
    user_service: UserService,
    affiliate_service: AffiliateService,
) -> CollecaSchema {
    Schema::build(QueryRoot, MutationRoot, EmptySubscription)
        .data(collection_service)
        .data(product_service)
        .data(user_service)
        .data(affiliate_service)
        .finish()
}
```

### 3. API認証・認可

```rust
// apps/colleca-api/src/middleware/auth.rs
use axum::{
    extract::{State, TypedHeader},
    headers::{authorization::Bearer, Authorization},
    http::StatusCode,
    middleware::Next,
    response::Response,
};
use jsonwebtoken::{decode, DecodingKey, Validation};
use crate::models::Claims;

pub async fn auth_middleware(
    State(state): State<AppState>,
    TypedHeader(auth): TypedHeader<Authorization<Bearer>>,
    mut req: Request<Body>,
    next: Next<Body>,
) -> Result<Response, StatusCode> {
    let token = auth.token();
    
    match decode::<Claims>(
        token,
        &DecodingKey::from_secret(state.jwt_secret.as_ref()),
        &Validation::default(),
    ) {
        Ok(token_data) => {
            req.extensions_mut().insert(token_data.claims);
            Ok(next.run(req).await)
        }
        Err(_) => Err(StatusCode::UNAUTHORIZED),
    }
}

// APIキー認証
pub async fn api_key_middleware(
    State(state): State<AppState>,
    headers: HeaderMap,
    mut req: Request<Body>,
    next: Next<Body>,
) -> Result<Response, StatusCode> {
    if let Some(api_key) = headers.get("X-API-Key") {
        if let Ok(key) = api_key.to_str() {
            if state.api_key_service.validate_key(key).await.is_ok() {
                return Ok(next.run(req).await);
            }
        }
    }
    Err(StatusCode::UNAUTHORIZED)
}
```

### 4. レート制限

```rust
// apps/colleca-api/src/middleware/rate_limit.rs
use axum::{
    extract::State,
    http::StatusCode,
    middleware::Next,
    response::Response,
};
use std::sync::Arc;
use tokio::sync::Mutex;
use std::collections::HashMap;
use std::time::{Duration, Instant};

pub struct RateLimiter {
    requests: Arc<Mutex<HashMap<String, Vec<Instant>>>>,
    limit: usize,
    window: Duration,
}

impl RateLimiter {
    pub fn new(limit: usize, window: Duration) -> Self {
        Self {
            requests: Arc::new(Mutex::new(HashMap::new())),
            limit,
            window,
        }
    }
    
    pub async fn check_rate_limit(&self, key: &str) -> bool {
        let mut requests = self.requests.lock().await;
        let now = Instant::now();
        
        let timestamps = requests.entry(key.to_string()).or_insert_with(Vec::new);
        timestamps.retain(|&time| now.duration_since(time) < self.window);
        
        if timestamps.len() < self.limit {
            timestamps.push(now);
            true
        } else {
            false
        }
    }
}

pub async fn rate_limit_middleware(
    State(rate_limiter): State<Arc<RateLimiter>>,
    req: Request<Body>,
    next: Next<Body>,
) -> Result<Response, StatusCode> {
    let key = req.headers()
        .get("X-API-Key")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("anonymous");
    
    if rate_limiter.check_rate_limit(key).await {
        Ok(next.run(req).await)
    } else {
        Err(StatusCode::TOO_MANY_REQUESTS)
    }
}
```

### 5. APIドキュメント

```rust
// apps/colleca-api/src/docs/openapi.rs
use utoipa::OpenApi;
use crate::handlers::{collection_handler, product_handler, user_handler, affiliate_handler};

#[derive(OpenApi)]
#[openapi(
    paths(
        collection_handler::create_collection,
        collection_handler::get_collection,
        collection_handler::update_collection,
        collection_handler::delete_collection,
        product_handler::fetch_product_info,
        product_handler::get_product,
        user_handler::get_current_user,
        user_handler::update_user,
        affiliate_handler::register_affiliate_account,
        affiliate_handler::generate_affiliate_link,
        affiliate_handler::get_monthly_report,
    ),
    components(
        schemas(Collection, Product, User, AffiliateAccount, AffiliateLink, Revenue)
    ),
    tags(
        (name = "collections", description = "Collection management endpoints"),
        (name = "products", description = "Product information endpoints"),
        (name = "users", description = "User management endpoints"),
        (name = "affiliate", description = "Affiliate management endpoints"),
    ),
    info(
        title = "Colleca API",
        version = "1.0.0",
        description = "API for Colleca - Multi-store Social Shopping Service",
        contact(
            name = "Colleca Support",
            email = "support@colleca.app",
        ),
    ),
)]
pub struct ApiDoc;

// Swagger UIの設定
pub fn swagger_ui() -> SwaggerUi {
    SwaggerUi::new("/swagger-ui").url("/api-docs/openapi.json", ApiDoc::openapi())
}
```

### 6. APIクライアントSDK

```typescript
// packages/colleca-sdk/src/client.ts
import axios, { AxiosInstance } from 'axios';

export class CollecaClient {
  private api: AxiosInstance;
  
  constructor(apiKey: string, baseUrl: string = 'https://api.colleca.app/v1') {
    this.api = axios.create({
      baseURL: baseUrl,
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
    });
  }
  
  // コレクション関連
  async createCollection(data: CreateCollectionInput): Promise<Collection> {
    const response = await this.api.post('/collections', data);
    return response.data;
  }
  
  async getCollection(id: string): Promise<Collection> {
    const response = await this.api.get(`/collections/${id}`);
    return response.data;
  }
  
  async addItemToCollection(collectionId: string, productId: string): Promise<CollectionItem> {
    const response = await this.api.post(`/collections/${collectionId}/items`, { product_id: productId });
    return response.data;
  }
  
  // 商品関連
  async fetchProductInfo(url: string): Promise<Product> {
    const response = await this.api.post('/products/fetch', { url });
    return response.data;
  }
  
  // アフィリエイト関連
  async generateAffiliateLink(productId: string): Promise<AffiliateLink> {
    const response = await this.api.post('/affiliate/links', { product_id: productId });
    return response.data;
  }
  
  async getMonthlyReport(year: number, month: number): Promise<MonthlyReport> {
    const response = await this.api.get(`/affiliate/reports/${year}/${month}`);
    return response.data;
  }
}
```

### 7. GraphQLクライアント

```typescript
// packages/colleca-sdk/src/graphql-client.ts
import { GraphQLClient } from 'graphql-request';
import { gql } from 'graphql-tag';

export class CollecaGraphQLClient {
  private client: GraphQLClient;
  
  constructor(apiKey: string, endpoint: string = 'https://api.colleca.app/graphql') {
    this.client = new GraphQLClient(endpoint, {
      headers: {
        'X-API-Key': apiKey,
      },
    });
  }
  
  async createCollection(input: CreateCollectionInput): Promise<Collection> {
    const mutation = gql`
      mutation CreateCollection($input: CreateCollectionInput!) {
        createCollection(input: $input) {
          id
          title
          description
          isPublic
          createdAt
        }
      }
    `;
    
    const data = await this.client.request(mutation, { input });
    return data.createCollection;
  }
  
  async fetchProductInfo(url: string): Promise<Product> {
    const mutation = gql`
      mutation FetchProductInfo($url: String!) {
        fetchProductInfo(url: $url) {
          id
          title
          price
          imageUrl
          ecSite
        }
      }
    `;
    
    const data = await this.client.request(mutation, { url });
    return data.fetchProductInfo;
  }
}
```

## 技術的詳細

### GraphQLスキーマ設計
- 型安全性を確保するためにasync-graphqlを使用
- DataLoaderを使用してN+1問題を解決
- カスタムディレクティブによる認可制御

### APIキー管理
- APIキーはハッシュ化して保存
- キーのローテーション機能
- 使用状況の監視とアラート

### Swagger/OpenAPIドキュメント
- utoipaを使用して自動生成
- 対話型APIドキュメント
- クライアントコード生成のサポート

## セキュリティ考慮事項

1. **認証・認可**
   - JWTによるユーザー認証
   - APIキーによるサービス認証
   - ロールベースのアクセス制御

2. **レート制限**
   - IPアドレスベースの制限
   - APIキーベースの制限
   - バーストトラフィック対策

3. **入力バリデーション**
   - リクエストボディのスキーマ検証
   - SQLインジェクション対策
   - XSS対策

## テスト計画

1. **ユニットテスト**
   - 各APIエンドポイントのテスト
   - 認証・認可ロジックのテスト

2. **統合テスト**
   - API全体のフローテスト
   - レート制限のテスト

3. **負荷テスト**
   - 同時接続数のテスト
   - レスポンスタイムの測定

## 次のステップ

PR #8では、分析ダッシュボードを実装します。ユーザーとコレクションのパフォーマンス分析、データ集計、レポート生成などの機能を追加します。
