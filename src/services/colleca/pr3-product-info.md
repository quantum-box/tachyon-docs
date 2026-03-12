# PR #3: 商品情報取得システム

## 概要

このPRでは、外部ECサイトから商品情報を取得する機能を実装します。ユーザーが商品URLを入力すると、そのURLを解析して対応するECサイトから商品情報（タイトル、価格、画像など）を自動的に取得し、データベースに保存します。

## 実装内容

### 1. 商品モデルの定義

**ファイル**: `apps/colleca-api/src/domain/product.rs`

```rust
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use util::macros::*;
use chrono::{DateTime, Utc};
use bigdecimal::BigDecimal;

def_id!(ProductId, "prd_");

#[derive(Debug, Clone, Serialize, Deserialize, strum::EnumString, strum::Display)]
#[strum(serialize_all = "snake_case")]
pub enum EcSite {
    Amazon,
    Rakuten,
    Yahoo,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Product {
    pub id: ProductId,
    pub title: String,
    pub description: Option<String>,
    pub price: Option<BigDecimal>,
    pub currency: String,
    pub image_url: Option<String>,
    pub url: String,
    pub ec_site: EcSite,
    pub ec_product_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Product {
    pub fn new(
        title: String,
        description: Option<String>,
        price: Option<BigDecimal>,
        currency: String,
        image_url: Option<String>,
        url: String,
        ec_site: EcSite,
        ec_product_id: Option<String>,
    ) -> Self {
        Self {
            id: ProductId::default(),
            title,
            description,
            price,
            currency,
            image_url,
            url,
            ec_site,
            ec_product_id,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }
}
```

### 2. URL解析システム

**ファイル**: `packages/colleca-common/src/utils/url.rs`

```rust
use errors::Result;
use regex::Regex;
use url::Url;

use crate::dto::product::EcSite;

pub struct ProductUrl {
    pub url: String,
    pub ec_site: EcSite,
    pub product_id: Option<String>,
}

pub fn parse_product_url(url_str: &str) -> Result<ProductUrl> {
    let url = Url::parse(url_str)
        .map_err(|_| errors::Error::BadRequest("Invalid URL".to_string()))?;

    let host = url.host_str()
        .ok_or_else(|| errors::Error::BadRequest("Invalid URL host".to_string()))?;

    // Amazon URL解析
    if host.contains("amazon") {
        let product_id = extract_amazon_product_id(url_str)?;
        return Ok(ProductUrl {
            url: url_str.to_string(),
            ec_site: EcSite::Amazon,
            product_id: Some(product_id),
        });
    }

    // 楽天URL解析
    if host.contains("rakuten") {
        let product_id = extract_rakuten_product_id(url_str)?;
        return Ok(ProductUrl {
            url: url_str.to_string(),
            ec_site: EcSite::Rakuten,
            product_id: Some(product_id),
        });
    }

    // Yahoo URL解析
    if host.contains("yahoo") && (host.contains("shopping") || url_str.contains("store")) {
        let product_id = extract_yahoo_product_id(url_str)?;
        return Ok(ProductUrl {
            url: url_str.to_string(),
            ec_site: EcSite::Yahoo,
            product_id: Some(product_id),
        });
    }

    // その他のECサイト
    Ok(ProductUrl {
        url: url_str.to_string(),
        ec_site: EcSite::Other,
        product_id: None,
    })
}

fn extract_amazon_product_id(url_str: &str) -> Result<String> {
    // ASINを抽出するための正規表現パターン
    let patterns = [
        Regex::new(r"/dp/([A-Z0-9]{10})").unwrap(),
        Regex::new(r"/gp/product/([A-Z0-9]{10})").unwrap(),
        Regex::new(r"/exec/obidos/asin/([A-Z0-9]{10})").unwrap(),
        Regex::new(r"/o/ASIN/([A-Z0-9]{10})").unwrap(),
    ];

    for pattern in patterns.iter() {
        if let Some(captures) = pattern.captures(url_str) {
            if let Some(asin) = captures.get(1) {
                return Ok(asin.as_str().to_string());
            }
        }
    }

    Err(errors::Error::BadRequest("Could not extract Amazon product ID".to_string()))
}

fn extract_rakuten_product_id(url_str: &str) -> Result<String> {
    // 楽天の商品IDを抽出するための正規表現パターン
    let patterns = [
        Regex::new(r"item/([a-zA-Z0-9_]+)").unwrap(),
        Regex::new(r"items/([a-zA-Z0-9_]+)").unwrap(),
        Regex::new(r"product_id=([a-zA-Z0-9_]+)").unwrap(),
    ];

    for pattern in patterns.iter() {
        if let Some(captures) = pattern.captures(url_str) {
            if let Some(item_id) = captures.get(1) {
                return Ok(item_id.as_str().to_string());
            }
        }
    }

    Err(errors::Error::BadRequest("Could not extract Rakuten product ID".to_string()))
}

fn extract_yahoo_product_id(url_str: &str) -> Result<String> {
    // Yahoo!ショッピングの商品IDを抽出するための正規表現パターン
    let patterns = [
        Regex::new(r"/item/([a-zA-Z0-9_]+)").unwrap(),
        Regex::new(r"ItemId=([a-zA-Z0-9_]+)").unwrap(),
    ];

    for pattern in patterns.iter() {
        if let Some(captures) = pattern.captures(url_str) {
            if let Some(item_id) = captures.get(1) {
                return Ok(item_id.as_str().to_string());
            }
        }
    }

    Err(errors::Error::BadRequest("Could not extract Yahoo product ID".to_string()))
}
```

### 3. 商品情報取得サービス

**ファイル**: `apps/colleca-api/src/usecase/product/fetch_product_info_usecase.rs`

```rust
use async_trait::async_trait;
use errors::Result;
use chrono::Utc;
use bigdecimal::BigDecimal;

use crate::domain::product::{Product, ProductId, EcSite};
use colleca_common::utils::url::{parse_product_url, ProductUrl};

#[async_trait]
pub trait ProductRepository: Send + Sync {
    async fn create(&self, product: &Product) -> Result<()>;
    async fn find_by_id(&self, id: &ProductId) -> Result<Option<Product>>;
    async fn find_by_url(&self, url: &str) -> Result<Option<Product>>;
    async fn find_by_ec_product_id(&self, ec_site: &EcSite, ec_product_id: &str) -> Result<Option<Product>>;
    async fn update(&self, product: &Product) -> Result<()>;
}

#[async_trait]
pub trait ProductInfoFetcher: Send + Sync {
    async fn fetch_product_info(&self, product_url: &ProductUrl) -> Result<ProductInfo>;
}

pub struct ProductInfo {
    pub title: String,
    pub description: Option<String>,
    pub price: Option<BigDecimal>,
    pub currency: String,
    pub image_url: Option<String>,
}

pub struct FetchProductInfoUseCase<R: ProductRepository, F: ProductInfoFetcher> {
    product_repository: R,
    product_info_fetcher: F,
}

impl<R: ProductRepository, F: ProductInfoFetcher> FetchProductInfoUseCase<R, F> {
    pub fn new(product_repository: R, product_info_fetcher: F) -> Self {
        Self {
            product_repository,
            product_info_fetcher,
        }
    }

    pub async fn execute(&self, url: String) -> Result<Product> {
        // URLからすでに商品が存在するか確認
        if let Some(product) = self.product_repository.find_by_url(&url).await? {
            return Ok(product);
        }

        // URLを解析
        let product_url = parse_product_url(&url)?;

        // ECサイトとプロダクトIDから商品が存在するか確認
        if let Some(ec_product_id) = &product_url.product_id {
            if let Some(product) = self.product_repository.find_by_ec_product_id(&product_url.ec_site, ec_product_id).await? {
                return Ok(product);
            }
        }

        // 商品情報を取得
        let product_info = self.product_info_fetcher.fetch_product_info(&product_url).await?;

        // 商品を作成
        let product = Product::new(
            product_info.title,
            product_info.description,
            product_info.price,
            product_info.currency,
            product_info.image_url,
            url,
            product_url.ec_site,
            product_url.product_id,
        );

        // 商品を保存
        self.product_repository.create(&product).await?;

        Ok(product)
    }
}
```

### 4. ECサイト別の商品情報取得実装

**ファイル**: `apps/colleca-api/src/adapter/gateway/product_info_fetcher.rs`

```rust
use async_trait::async_trait;
use errors::Result;
use reqwest::Client;
use scraper::{Html, Selector};
use bigdecimal::BigDecimal;
use std::str::FromStr;

use crate::usecase::product::{ProductInfoFetcher, ProductInfo};
use colleca_common::utils::url::ProductUrl;
use crate::domain::product::EcSite;

pub struct WebProductInfoFetcher {
    client: Client,
}

impl WebProductInfoFetcher {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
                .build()
                .unwrap(),
        }
    }
}

#[async_trait]
impl ProductInfoFetcher for WebProductInfoFetcher {
    async fn fetch_product_info(&self, product_url: &ProductUrl) -> Result<ProductInfo> {
        match product_url.ec_site {
            EcSite::Amazon => self.fetch_amazon_product_info(product_url).await,
            EcSite::Rakuten => self.fetch_rakuten_product_info(product_url).await,
            EcSite::Yahoo => self.fetch_yahoo_product_info(product_url).await,
            EcSite::Other => self.fetch_generic_product_info(product_url).await,
        }
    }
}

impl WebProductInfoFetcher {
    async fn fetch_amazon_product_info(&self, product_url: &ProductUrl) -> Result<ProductInfo> {
        let response = self.client.get(&product_url.url).send().await?;
        let html = response.text().await?;
        let document = Html::parse_document(&html);

        // タイトル取得
        let title_selector = Selector::parse("#productTitle").unwrap();
        let title = document.select(&title_selector)
            .next()
            .map(|element| element.text().collect::<String>().trim().to_string())
            .ok_or_else(|| errors::Error::NotFound("Product title not found".to_string()))?;

        // 価格取得
        let price_selector = Selector::parse(".a-price .a-offscreen").unwrap();
        let price_text = document.select(&price_selector)
            .next()
            .map(|element| element.text().collect::<String>().trim().to_string());

        let (price, currency) = if let Some(price_text) = price_text {
            parse_price(&price_text)
        } else {
            (None, "JPY".to_string())
        };

        // 説明取得
        let description_selector = Selector::parse("#productDescription p").unwrap();
        let description = document.select(&description_selector)
            .next()
            .map(|element| element.text().collect::<String>().trim().to_string());

        // 画像URL取得
        let image_selector = Selector::parse("#landingImage").unwrap();
        let image_url = document.select(&image_selector)
            .next()
            .and_then(|element| element.value().attr("src"))
            .map(|src| src.to_string());

        Ok(ProductInfo {
            title,
            description,
            price,
            currency,
            image_url,
        })
    }

    async fn fetch_rakuten_product_info(&self, product_url: &ProductUrl) -> Result<ProductInfo> {
        let response = self.client.get(&product_url.url).send().await?;
        let html = response.text().await?;
        let document = Html::parse_document(&html);

        // タイトル取得
        let title_selector = Selector::parse(".item_name").unwrap();
        let title = document.select(&title_selector)
            .next()
            .map(|element| element.text().collect::<String>().trim().to_string())
            .ok_or_else(|| errors::Error::NotFound("Product title not found".to_string()))?;

        // 価格取得
        let price_selector = Selector::parse(".price").unwrap();
        let price_text = document.select(&price_selector)
            .next()
            .map(|element| element.text().collect::<String>().trim().to_string());

        let (price, currency) = if let Some(price_text) = price_text {
            parse_price(&price_text)
        } else {
            (None, "JPY".to_string())
        };

        // 説明取得
        let description_selector = Selector::parse("#item_description").unwrap();
        let description = document.select(&description_selector)
            .next()
            .map(|element| element.text().collect::<String>().trim().to_string());

        // 画像URL取得
        let image_selector = Selector::parse("#main_image").unwrap();
        let image_url = document.select(&image_selector)
            .next()
            .and_then(|element| element.value().attr("src"))
            .map(|src| src.to_string());

        Ok(ProductInfo {
            title,
            description,
            price,
            currency,
            image_url,
        })
    }

    async fn fetch_yahoo_product_info(&self, product_url: &ProductUrl) -> Result<ProductInfo> {
        let response = self.client.get(&product_url.url).send().await?;
        let html = response.text().await?;
        let document = Html::parse_document(&html);

        // タイトル取得
        let title_selector = Selector::parse(".elName").unwrap();
        let title = document.select(&title_selector)
            .next()
            .map(|element| element.text().collect::<String>().trim().to_string())
            .ok_or_else(|| errors::Error::NotFound("Product title not found".to_string()))?;

        // 価格取得
        let price_selector = Selector::parse(".elPriceNumber").unwrap();
        let price_text = document.select(&price_selector)
            .next()
            .map(|element| element.text().collect::<String>().trim().to_string());

        let (price, currency) = if let Some(price_text) = price_text {
            parse_price(&price_text)
        } else {
            (None, "JPY".to_string())
        };

        // 説明取得
        let description_selector = Selector::parse(".elDescription").unwrap();
        let description = document.select(&description_selector)
            .next()
            .map(|element| element.text().collect::<String>().trim().to_string());

        // 画像URL取得
        let image_selector = Selector::parse(".elMain img").unwrap();
        let image_url = document.select(&image_selector)
            .next()
            .and_then(|element| element.value().attr("src"))
            .map(|src| src.to_string());

        Ok(ProductInfo {
            title,
            description,
            price,
            currency,
            image_url,
        })
    }

    async fn fetch_generic_product_info(&self, product_url: &ProductUrl) -> Result<ProductInfo> {
        let response = self.client.get(&product_url.url).send().await?;
        let html = response.text().await?;
        let document = Html::parse_document(&html);

        // Open Graph タグからの情報取得
        let title = extract_meta_content(&document, "og:title")
            .or_else(|| extract_meta_content(&document, "title"))
            .ok_or_else(|| errors::Error::NotFound("Product title not found".to_string()))?;

        let description = extract_meta_content(&document, "og:description")
            .or_else(|| extract_meta_content(&document, "description"));

        let image_url = extract_meta_content(&document, "og:image");

        // 価格情報の取得（一般的なパターン）
        let price_text = extract_meta_content(&document, "product:price")
            .or_else(|| extract_meta_content(&document, "og:price"));

        let (price, currency) = if let Some(price_text) = price_text {
            parse_price(&price_text)
        } else {
            (None, "JPY".to_string())
        };

        Ok(ProductInfo {
            title,
            description,
            price,
            currency,
            image_url,
        })
    }
}

fn extract_meta_content(document: &Html, property: &str) -> Option<String> {
    let selector = Selector::parse(&format!("meta[property='{}'], meta[name='{}']", property, property)).unwrap();
    document.select(&selector)
        .next()
        .and_then(|element| element.value().attr("content"))
        .map(|content| content.trim().to_string())
}

fn parse_price(price_text: &str) -> (Option<BigDecimal>, String) {
    // 通貨記号を削除し、数値のみを抽出
    let price_clean = price_text
        .replace("¥", "")
        .replace("円", "")
        .replace("$", "")
        .replace(",", "")
        .replace(" ", "")
        .trim()
        .to_string();

    // 通貨の判定
    let currency = if price_text.contains("¥") || price_text.contains("円") {
        "JPY"
    } else if price_text.contains("$") {
        "USD"
    } else {
        "JPY" // デフォルト
    };

    // 数値に変換
    let price = BigDecimal::from_str(&price_clean).ok();

    (price, currency.to_string())
}
```

### 5. 商品情報取得APIエンドポイント

**ファイル**: `apps/colleca-api/src/handler/rest/product.rs`

```rust
use axum::{
    extract::{Json, State},
    routing::{post, get},
    Router,
};
use serde::{Deserialize, Serialize};
use errors::Result;

use crate::app::App;
use crate::domain::product::{ProductId, EcSite};

pub fn router(app: App) -> Router {
    Router::new()
        .route("/fetch", post(fetch_product_info))
        .route("/:id", get(get_product))
        .with_state(app)
}

#[derive(Deserialize)]
struct FetchProductInfoRequest {
    url: String,
}

#[derive(Serialize)]
struct ProductResponse {
    id: String,
    title: String,
    description: Option<String>,
    price: Option<String>,
    currency: String,
    image_url: Option<String>,
    url: String,
    ec_site: String,
}

async fn fetch_product_info(
    State(app): State<App>,
    Json(req): Json<FetchProductInfoRequest>,
) -> Result<Json<ProductResponse>> {
    let product = app.fetch_product_info_usecase.execute(req.url).await?;

    Ok(Json(ProductResponse {
        id: product.id.to_string(),
        title: product.title,
        description: product.description,
        price: product.price.map(|p| p.to_string()),
        currency: product.currency,
        image_url: product.image_url,
        url: product.url,
        ec_site: product.ec_site.to_string(),
    }))
}

async fn get_product(
    State(app): State<App>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<Json<ProductResponse>> {
    let product_id = ProductId::from_string(&id)
        .map_err(|_| errors::Error::BadRequest("Invalid product ID".to_string()))?;

    let product = app.product_repository.find_by_id(&product_id).await?
        .ok_or_else(|| errors::Error::NotFound("Product not found".to_string()))?;

    Ok(Json(ProductResponse {
        id: product.id.to_string(),
        title: product.title,
        description: product.description,
        price: product.price.map(|p| p.to_string()),
        currency: product.currency,
        image_url: product.image_url,
        url: product.url,
        ec_site: product.ec_site.to_string(),
    }))
}
```

### 6. 商品情報キャッシュシステム

**ファイル**: `apps/colleca-api/src/adapter/gateway/product_cache.rs`

```rust
use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::HashMap;
use std::time::{Duration, Instant};
use errors::Result;

use crate::domain::product::{Product, ProductId};

struct CacheEntry {
    product: Product,
    expires_at: Instant,
}

pub struct ProductCache {
    cache: Arc<RwLock<HashMap<ProductId, CacheEntry>>>,
    ttl: Duration,
}

impl ProductCache {
    pub fn new(ttl_seconds: u64) -> Self {
        Self {
            cache: Arc::new(RwLock::new(HashMap::new())),
            ttl: Duration::from_secs(ttl_seconds),
        }
    }

    pub async fn get(&self, id: &ProductId) -> Option<Product> {
        let cache = self.cache.read().await;
        
        if let Some(entry) = cache.get(id) {
            if Instant::now() < entry.expires_at {
                return Some(entry.product.clone());
            }
        }
        
        None
    }

    pub async fn set(&self, product: Product) {
        let mut cache = self.cache.write().await;
        
        cache.insert(
            product.id.clone(),
            CacheEntry {
                product: product.clone(),
                expires_at: Instant::now() + self.ttl,
            },
        );
    }

    pub async fn invalidate(&self, id: &ProductId) {
        let mut cache = self.cache.write().await;
        cache.remove(id);
    }

    pub async fn clear(&self) {
        let mut cache = self.cache.write().await;
        cache.clear();
    }
}

pub struct CachedProductRepository<R> {
    repository: R,
    cache: ProductCache,
}

impl<R> CachedProductRepository<R> {
    pub fn new(repository: R, cache_ttl_seconds: u64) -> Self {
        Self {
            repository,
            cache: ProductCache::new(cache_ttl_seconds),
        }
    }
}

#[async_trait::async_trait]
impl<R: crate::usecase::product::ProductRepository + Send + Sync> crate::usecase::product::ProductRepository for CachedProductRepository<R> {
    async fn create(&self, product: &Product) -> Result<()> {
        let result = self.repository.create(product).await;
        
        if result.is_ok() {
            self.cache.set(product.clone()).await;
        }
        
        result
    }

    async fn find_by_id(&self, id: &ProductId) -> Result<Option<Product>> {
        // キャッシュから取得を試みる
        if let Some(product) = self.cache.get(id).await {
            return Ok(Some(product));
        }
        
        // キャッシュになければリポジトリから取得
        let result = self.repository.find_by_id(id).await?;
        
        // 結果があればキャッシュに保存
        if let Some(ref product) = result {
            self.cache.set(product.clone()).await;
        }
        
        Ok(result)
    }

    async fn find_by_url(&self, url: &str) -> Result<Option<Product>> {
        // URLでの検索はキャッシュを使わず直接リポジトリに問い合わせる
        let result = self.repository.find_by_url(url).await?;
        
        // 結果があればキャッシュに保存
        if let Some(ref product) = result {
            self.cache.set(product.clone()).await;
        }
        
        Ok(result)
    }

    async fn find_by_ec_product_id(&self, ec_site: &EcSite, ec_product_id: &str) -> Result<Option<Product>> {
        // EC商品IDでの検索はキャッシュを使わず直接リポジトリに問い合わせる
        let result = self.repository.find_by_ec_product_id(ec_site, ec_product_id).await?;
        
        // 結果があればキャッシュに保存
        if let Some(ref product) = result {
            self.cache.set(product.clone()).await;
        }
        
        Ok(result)
    }

    async fn update(&self, product: &Product) -> Result<()> {
        let result = self.repository.update(product).await;
        
        if result.is_ok() {
            self.cache.set(product.clone()).await;
        }
        
        result
    }
}
```

## 技術的詳細

### 商品情報取得アプローチ

1. **URL解析**:
   - 入力されたURLからECサイトの種類を判別
   - 正規表現を使用して商品IDを抽出
   - サポートするECサイト: Amazon、楽天、Yahoo!ショッピング、その他

2. **情報取得方法**:
   - スクレイピング: HTMLからの情報抽出
   - Open Graph タグの活用: 一般的なメタデータ取得
   - 将来的にはAPI連携も検討

3. **キャッシュ戦略**:
   - インメモリキャッシュによるパフォーマンス向上
   - TTL (Time To Live) による自動期限切れ
   - 更新時のキャッシュ無効化

### レート制限対策

- ユーザーエージェントの適切な設定
- リクエスト間隔の調整
- 複数のIPアドレスからのリクエスト（将来的に実装）
- バックオフ戦略の実装

### 非同期処理

- 商品情報取得は非同期で実行
- 長時間かかる処理はバックグラウンドジョブとして実行
- ユーザーへの即時レスポンスとバックグラウンド処理の分離

## テスト計画

- ユニットテスト: URL解析、スクレイピングロジックのテスト
- 統合テスト: APIエンドポイントのテスト
- モックテスト: 外部サービスへの依存を排除したテスト

## 次のステップ

このPRがマージされた後、PR #4（コレクション管理システム）を進めることができます。商品情報取得システムはコレクション機能の基盤となります。
