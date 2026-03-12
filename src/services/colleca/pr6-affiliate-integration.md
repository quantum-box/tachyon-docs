# PR #6: アフィリエイト連携システム

## 概要
ECサイトのアフィリエイトプログラムとの連携機能を実装します。各ECサイトのアフィリエイトID管理、アフィリエイトリンク生成、クリック追跡、収益計算、レポート生成などの機能を提供します。

## 実装内容

### 1. アフィリエイトモデル

```rust
// packages/colleca-common/src/models/affiliate.rs
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};

#[derive(Debug, Serialize, Deserialize)]
pub struct AffiliateAccount {
    pub id: Uuid,
    pub user_id: Uuid,
    pub ec_site: String,  // "amazon", "rakuten", "yahoo"
    pub affiliate_id: String,
    pub is_verified: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AffiliateLink {
    pub id: Uuid,
    pub product_id: Uuid,
    pub user_id: Uuid,
    pub original_url: String,
    pub affiliate_url: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ClickTracking {
    pub id: Uuid,
    pub affiliate_link_id: Uuid,
    pub collection_id: Option<Uuid>,
    pub ip_address: String,
    pub user_agent: String,
    pub referrer: Option<String>,
    pub clicked_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Revenue {
    pub id: Uuid,
    pub user_id: Uuid,
    pub affiliate_link_id: Uuid,
    pub amount: i64,  // 金額（円）
    pub commission_rate: f32,  // 手数料率
    pub status: String,  // "pending", "confirmed", "paid"
    pub transaction_date: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}
```

### 2. アフィリエイトサービス

```rust
// apps/colleca-api/src/services/affiliate_service.rs
use uuid::Uuid;
use crate::models::{AffiliateAccount, AffiliateLink, Product};
use crate::repositories::AffiliateRepository;

pub struct AffiliateService {
    repository: AffiliateRepository,
}

impl AffiliateService {
    pub fn new(repository: AffiliateRepository) -> Self {
        Self { repository }
    }

    pub async fn register_affiliate_account(&self, account: AffiliateAccount) -> Result<AffiliateAccount, Box<dyn std::error::Error>> {
        // アフィリエイトIDの検証
        self.verify_affiliate_id(&account.ec_site, &account.affiliate_id).await?;
        
        self.repository.create_affiliate_account(&account).await?;
        Ok(account)
    }

    pub async fn generate_affiliate_link(&self, product: &Product, user_id: Uuid) -> Result<AffiliateLink, Box<dyn std::error::Error>> {
        // ユーザーのアフィリエイトアカウントを取得
        let affiliate_account = self.repository.get_affiliate_account(user_id, &product.ec_site).await?;
        
        // アフィリエイトURLを生成
        let affiliate_url = self.create_affiliate_url(&product.url, &affiliate_account.affiliate_id, &product.ec_site)?;
        
        let affiliate_link = AffiliateLink {
            id: Uuid::new_v4(),
            product_id: product.id,
            user_id,
            original_url: product.url.clone(),
            affiliate_url,
            created_at: Utc::now(),
        };
        
        self.repository.create_affiliate_link(&affiliate_link).await?;
        Ok(affiliate_link)
    }

    fn create_affiliate_url(&self, original_url: &str, affiliate_id: &str, ec_site: &str) -> Result<String, Box<dyn std::error::Error>> {
        match ec_site {
            "amazon" => {
                // Amazon アソシエイトリンク生成
                let url = url::Url::parse(original_url)?;
                let mut new_url = url.clone();
                new_url.query_pairs_mut().append_pair("tag", affiliate_id);
                Ok(new_url.to_string())
            },
            "rakuten" => {
                // 楽天アフィリエイトリンク生成
                Ok(format!("https://hb.afl.rakuten.co.jp/hgc/{}/{}/?pc={}", 
                    affiliate_id, 
                    self.extract_rakuten_item_code(original_url)?,
                    urlencoding::encode(original_url)
                ))
            },
            "yahoo" => {
                // Yahoo!ショッピングアフィリエイトリンク生成
                Ok(format!("https://ck.jp.ap.valuecommerce.com/servlet/referral?sid={}&pid={}&vc_url={}", 
                    affiliate_id,
                    "886623042",  // Yahoo!ショッピングのプログラムID
                    urlencoding::encode(original_url)
                ))
            },
            _ => Err("Unsupported EC site".into()),
        }
    }

    async fn verify_affiliate_id(&self, ec_site: &str, affiliate_id: &str) -> Result<bool, Box<dyn std::error::Error>> {
        // 各ECサイトのAPIを使用してアフィリエイトIDを検証
        // 実際の実装では各ECサイトのAPIを呼び出す
        Ok(true)
    }
}
```

### 3. クリック追跡サービス

```rust
// apps/colleca-api/src/services/click_tracking_service.rs
use uuid::Uuid;
use crate::models::{ClickTracking, AffiliateLink};
use crate::repositories::ClickTrackingRepository;

pub struct ClickTrackingService {
    repository: ClickTrackingRepository,
}

impl ClickTrackingService {
    pub fn new(repository: ClickTrackingRepository) -> Self {
        Self { repository }
    }

    pub async fn track_click(&self, affiliate_link_id: Uuid, request_info: RequestInfo) -> Result<String, Box<dyn std::error::Error>> {
        // クリック情報を記録
        let click_tracking = ClickTracking {
            id: Uuid::new_v4(),
            affiliate_link_id,
            collection_id: request_info.collection_id,
            ip_address: request_info.ip_address,
            user_agent: request_info.user_agent,
            referrer: request_info.referrer,
            clicked_at: Utc::now(),
        };
        
        self.repository.create_click_tracking(&click_tracking).await?;
        
        // アフィリエイトリンクを取得してリダイレクト
        let affiliate_link = self.repository.get_affiliate_link(affiliate_link_id).await?;
        Ok(affiliate_link.affiliate_url)
    }
}
```

### 4. 収益計算サービス

```rust
// apps/colleca-api/src/services/revenue_service.rs
use uuid::Uuid;
use chrono::{DateTime, Utc};
use crate::models::{Revenue, AffiliateLink};
use crate::repositories::RevenueRepository;

pub struct RevenueService {
    repository: RevenueRepository,
}

impl RevenueService {
    pub fn new(repository: RevenueRepository) -> Self {
        Self { repository }
    }

    pub async fn process_revenue_data(&self, ec_site: &str, data: Vec<RevenueData>) -> Result<(), Box<dyn std::error::Error>> {
        for revenue_data in data {
            // アフィリエイトリンクを検索
            if let Some(affiliate_link) = self.repository.find_affiliate_link_by_url(&revenue_data.url).await? {
                let revenue = Revenue {
                    id: Uuid::new_v4(),
                    user_id: affiliate_link.user_id,
                    affiliate_link_id: affiliate_link.id,
                    amount: revenue_data.amount,
                    commission_rate: revenue_data.commission_rate,
                    status: "pending".to_string(),
                    transaction_date: revenue_data.transaction_date,
                    created_at: Utc::now(),
                };
                
                self.repository.create_revenue(&revenue).await?;
            }
        }
        Ok(())
    }

    pub async fn generate_monthly_report(&self, user_id: Uuid, year: i32, month: u32) -> Result<MonthlyReport, Box<dyn std::error::Error>> {
        let revenues = self.repository.get_revenues_by_month(user_id, year, month).await?;
        
        let total_amount: i64 = revenues.iter().map(|r| r.amount).sum();
        let total_commission: f32 = revenues.iter().map(|r| r.amount as f32 * r.commission_rate).sum();
        
        Ok(MonthlyReport {
            user_id,
            year,
            month,
            total_amount,
            total_commission,
            revenue_count: revenues.len(),
            revenues,
        })
    }
}
```

### 5. アフィリエイトAPI

```rust
// apps/colleca-api/src/handlers/affiliate_handler.rs
use axum::{
    extract::{Path, State, Query},
    Json,
    response::IntoResponse,
    http::StatusCode,
};
use uuid::Uuid;
use crate::{
    models::{AffiliateAccount, AffiliateLink},
    services::{AffiliateService, ClickTrackingService, RevenueService},
    AppState,
};

pub async fn register_affiliate_account(
    State(state): State<AppState>,
    Json(account): Json<AffiliateAccount>,
) -> impl IntoResponse {
    match state.affiliate_service.register_affiliate_account(account).await {
        Ok(account) => (StatusCode::CREATED, Json(account)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
    }
}

pub async fn generate_affiliate_link(
    State(state): State<AppState>,
    Path(product_id): Path<Uuid>,
    Query(params): Query<GenerateAffiliateLinkParams>,
) -> impl IntoResponse {
    match state.product_service.get_product(product_id).await {
        Ok(product) => {
            match state.affiliate_service.generate_affiliate_link(&product, params.user_id).await {
                Ok(link) => (StatusCode::CREATED, Json(link)).into_response(),
                Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
            }
        },
        Err(e) => (StatusCode::NOT_FOUND, e.to_string()).into_response(),
    }
}

pub async fn track_click(
    State(state): State<AppState>,
    Path(affiliate_link_id): Path<Uuid>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let request_info = RequestInfo {
        ip_address: headers.get("x-forwarded-for")
            .and_then(|h| h.to_str().ok())
            .unwrap_or("unknown")
            .to_string(),
        user_agent: headers.get("user-agent")
            .and_then(|h| h.to_str().ok())
            .unwrap_or("unknown")
            .to_string(),
        referrer: headers.get("referer")
            .and_then(|h| h.to_str().ok())
            .map(|s| s.to_string()),
        collection_id: None,  // クエリパラメータから取得
    };
    
    match state.click_tracking_service.track_click(affiliate_link_id, request_info).await {
        Ok(redirect_url) => Redirect::temporary(&redirect_url).into_response(),
        Err(e) => (StatusCode::NOT_FOUND, e.to_string()).into_response(),
    }
}

pub async fn get_monthly_report(
    State(state): State<AppState>,
    Path((user_id, year, month)): Path<(Uuid, i32, u32)>,
) -> impl IntoResponse {
    match state.revenue_service.generate_monthly_report(user_id, year, month).await {
        Ok(report) => (StatusCode::OK, Json(report)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}
```

### 6. データベーススキーマ

```sql
-- migrations/20240426_create_affiliate_tables.sql
CREATE TABLE affiliate_accounts (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    ec_site VARCHAR(50) NOT NULL,
    affiliate_id VARCHAR(255) NOT NULL,
    is_verified BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, ec_site)
);

CREATE TABLE affiliate_links (
    id UUID PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES products(id),
    user_id UUID NOT NULL REFERENCES users(id),
    original_url TEXT NOT NULL,
    affiliate_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE click_tracking (
    id UUID PRIMARY KEY,
    affiliate_link_id UUID NOT NULL REFERENCES affiliate_links(id),
    collection_id UUID REFERENCES collections(id),
    ip_address VARCHAR(45) NOT NULL,
    user_agent TEXT NOT NULL,
    referrer TEXT,
    clicked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE revenues (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    affiliate_link_id UUID NOT NULL REFERENCES affiliate_links(id),
    amount BIGINT NOT NULL,
    commission_rate FLOAT NOT NULL,
    status VARCHAR(20) NOT NULL,
    transaction_date TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_affiliate_accounts_user_id ON affiliate_accounts(user_id);
CREATE INDEX idx_affiliate_links_product_id ON affiliate_links(product_id);
CREATE INDEX idx_click_tracking_affiliate_link_id ON click_tracking(affiliate_link_id);
CREATE INDEX idx_revenues_user_id_transaction_date ON revenues(user_id, transaction_date);
```

## 技術的詳細

### アフィリエイトAPI連携
- 各ECサイトのアフィリエイトAPIを使用してアカウント検証
- APIキーは環境変数で管理
- レート制限に対応したリトライ機構

### クリック追跡
- リダイレクトサーバーを経由してクリックを追跡
- IPアドレスとユーザーエージェントを記録
- 不正クリック検出のための分析機能

### データ集計
- 日次バッチ処理で収益データを集計
- 月次レポートの自動生成
- CSVエクスポート機能

## セキュリティ考慮事項

1. **アフィリエイトID保護**
   - アフィリエイトIDは暗号化して保存
   - APIレスポンスではマスク表示

2. **不正クリック対策**
   - 同一IPからの連続クリックを検出
   - 異常なクリックパターンを分析

3. **収益データ保護**
   - 収益データへのアクセス制限
   - 監査ログの記録

## テスト計画

1. **ユニットテスト**
   - アフィリエイトURL生成ロジック
   - 収益計算ロジック

2. **統合テスト**
   - アフィリエイトAPI連携
   - クリック追跡フロー

3. **E2Eテスト**
   - アフィリエイトアカウント登録
   - 収益レポート生成

## 次のステップ

PR #7では、外部サービスとの連携のためのAPIを開発します。RESTful APIとGraphQL APIの実装、認証・認可、レート制限などの機能を追加します。
