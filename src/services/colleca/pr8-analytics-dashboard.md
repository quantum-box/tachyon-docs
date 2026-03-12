# PR #8: 分析ダッシュボード

## 概要
ユーザーとコレクションのパフォーマンス分析機能を実装します。データ集計システム、ダッシュボードUI、レポート生成、エクスポート機能などを提供し、ユーザーが自身のコレクションの成果を把握できるようにします。

## 実装内容

### 1. 分析データモデル

```rust
// packages/colleca-common/src/models/analytics.rs
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};

#[derive(Debug, Serialize, Deserialize)]
pub struct CollectionAnalytics {
    pub collection_id: Uuid,
    pub date: DateTime<Utc>,
    pub views: i64,
    pub unique_visitors: i64,
    pub clicks: i64,
    pub conversions: i64,
    pub revenue: i64,
    pub avg_time_spent: f32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UserAnalytics {
    pub user_id: Uuid,
    pub date: DateTime<Utc>,
    pub total_collections: i64,
    pub total_views: i64,
    pub total_clicks: i64,
    pub total_revenue: i64,
    pub top_performing_collections: Vec<Uuid>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProductPerformance {
    pub product_id: Uuid,
    pub date: DateTime<Utc>,
    pub impressions: i64,
    pub clicks: i64,
    pub conversion_rate: f32,
    pub revenue: i64,
}
```

### 2. データ集計サービス

```rust
// apps/colleca-api/src/services/analytics_service.rs
use uuid::Uuid;
use chrono::{DateTime, Utc, Duration};
use crate::models::{CollectionAnalytics, UserAnalytics, ProductPerformance};
use crate::repositories::AnalyticsRepository;

pub struct AnalyticsService {
    repository: AnalyticsRepository,
}

impl AnalyticsService {
    pub fn new(repository: AnalyticsRepository) -> Self {
        Self { repository }
    }

    pub async fn aggregate_collection_data(&self, collection_id: Uuid, date: DateTime<Utc>) -> Result<CollectionAnalytics, Box<dyn std::error::Error>> {
        // コレクションの日次データを集計
        let views = self.repository.count_collection_views(collection_id, date).await?;
        let unique_visitors = self.repository.count_unique_visitors(collection_id, date).await?;
        let clicks = self.repository.count_collection_clicks(collection_id, date).await?;
        let conversions = self.repository.count_conversions(collection_id, date).await?;
        let revenue = self.repository.calculate_revenue(collection_id, date).await?;
        let avg_time_spent = self.repository.calculate_avg_time_spent(collection_id, date).await?;

        let analytics = CollectionAnalytics {
            collection_id,
            date,
            views,
            unique_visitors,
            clicks,
            conversions,
            revenue,
            avg_time_spent,
        };

        self.repository.save_collection_analytics(&analytics).await?;
        Ok(analytics)
    }

    pub async fn aggregate_user_data(&self, user_id: Uuid, date: DateTime<Utc>) -> Result<UserAnalytics, Box<dyn std::error::Error>> {
        // ユーザーの日次データを集計
        let total_collections = self.repository.count_user_collections(user_id).await?;
        let total_views = self.repository.count_user_views(user_id, date).await?;
        let total_clicks = self.repository.count_user_clicks(user_id, date).await?;
        let total_revenue = self.repository.calculate_user_revenue(user_id, date).await?;
        let top_performing_collections = self.repository.get_top_performing_collections(user_id, 5).await?;

        let analytics = UserAnalytics {
            user_id,
            date,
            total_collections,
            total_views,
            total_clicks,
            total_revenue,
            top_performing_collections,
        };

        self.repository.save_user_analytics(&analytics).await?;
        Ok(analytics)
    }

    pub async fn get_collection_trend(&self, collection_id: Uuid, start_date: DateTime<Utc>, end_date: DateTime<Utc>) -> Result<Vec<CollectionAnalytics>, Box<dyn std::error::Error>> {
        self.repository.get_collection_analytics_range(collection_id, start_date, end_date).await
    }

    pub async fn get_user_trend(&self, user_id: Uuid, start_date: DateTime<Utc>, end_date: DateTime<Utc>) -> Result<Vec<UserAnalytics>, Box<dyn std::error::Error>> {
        self.repository.get_user_analytics_range(user_id, start_date, end_date).await
    }
}
```

### 3. ダッシュボードAPI

```rust
// apps/colleca-api/src/handlers/analytics_handler.rs
use axum::{
    extract::{Path, State, Query},
    Json,
    response::IntoResponse,
    http::StatusCode,
};
use uuid::Uuid;
use chrono::{DateTime, Utc};
use crate::{
    models::{CollectionAnalytics, UserAnalytics},
    services::AnalyticsService,
    AppState,
};

pub async fn get_collection_analytics(
    State(state): State<AppState>,
    Path(collection_id): Path<Uuid>,
    Query(params): Query<AnalyticsParams>,
) -> impl IntoResponse {
    match state.analytics_service.get_collection_trend(
        collection_id,
        params.start_date,
        params.end_date,
    ).await {
        Ok(analytics) => (StatusCode::OK, Json(analytics)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn get_user_analytics(
    State(state): State<AppState>,
    Path(user_id): Path<Uuid>,
    Query(params): Query<AnalyticsParams>,
) -> impl IntoResponse {
    match state.analytics_service.get_user_trend(
        user_id,
        params.start_date,
        params.end_date,
    ).await {
        Ok(analytics) => (StatusCode::OK, Json(analytics)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn export_analytics(
    State(state): State<AppState>,
    Path(user_id): Path<Uuid>,
    Query(params): Query<ExportParams>,
) -> impl IntoResponse {
    match state.analytics_service.export_user_data(
        user_id,
        params.start_date,
        params.end_date,
        params.format,
    ).await {
        Ok(data) => {
            let content_type = match params.format.as_str() {
                "csv" => "text/csv",
                "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                _ => "application/octet-stream",
            };
            
            (
                StatusCode::OK,
                [
                    ("Content-Type", content_type),
                    ("Content-Disposition", &format!("attachment; filename=\"analytics.{}\"", params.format)),
                ],
                data,
            ).into_response()
        },
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}
```

### 4. ダッシュボードUI

```typescript
// apps/colleca-ui/src/components/AnalyticsDashboard.tsx
import React, { useState, useEffect } from 'react';
import { Line, Bar, Pie } from 'react-chartjs-2';
import { CollectionAnalytics, UserAnalytics } from '@/types';
import { getCollectionAnalytics, getUserAnalytics } from '@/api/analytics';

interface AnalyticsDashboardProps {
  userId: string;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ userId }) => {
  const [timeRange, setTimeRange] = useState('7d');
  const [userAnalytics, setUserAnalytics] = useState<UserAnalytics[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [collectionAnalytics, setCollectionAnalytics] = useState<CollectionAnalytics[]>([]);

  useEffect(() => {
    const fetchAnalytics = async () => {
      const endDate = new Date();
      const startDate = new Date();
      
      switch (timeRange) {
        case '7d':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(endDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(endDate.getDate() - 90);
          break;
      }

      const userData = await getUserAnalytics(userId, startDate, endDate);
      setUserAnalytics(userData);

      if (selectedCollection) {
        const collectionData = await getCollectionAnalytics(selectedCollection, startDate, endDate);
        setCollectionAnalytics(collectionData);
      }
    };

    fetchAnalytics();
  }, [userId, timeRange, selectedCollection]);

  const revenueChartData = {
    labels: userAnalytics.map(data => new Date(data.date).toLocaleDateString()),
    datasets: [
      {
        label: '収益',
        data: userAnalytics.map(data => data.total_revenue),
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1,
      },
    ],
  };

  const performanceChartData = {
    labels: userAnalytics.map(data => new Date(data.date).toLocaleDateString()),
    datasets: [
      {
        label: '閲覧数',
        data: userAnalytics.map(data => data.total_views),
        backgroundColor: 'rgba(54, 162, 235, 0.5)',
      },
      {
        label: 'クリック数',
        data: userAnalytics.map(data => data.total_clicks),
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
      },
    ],
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">分析ダッシュボード</h1>
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          className="border rounded px-3 py-2"
        >
          <option value="7d">過去7日間</option>
          <option value="30d">過去30日間</option>
          <option value="90d">過去90日間</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-2">総収益</h3>
          <p className="text-3xl font-bold">
            ¥{userAnalytics.reduce((sum, data) => sum + data.total_revenue, 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-2">総閲覧数</h3>
          <p className="text-3xl font-bold">
            {userAnalytics.reduce((sum, data) => sum + data.total_views, 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-2">総クリック数</h3>
          <p className="text-3xl font-bold">
            {userAnalytics.reduce((sum, data) => sum + data.total_clicks, 0).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">収益推移</h3>
          <Line data={revenueChartData} />
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">パフォーマンス</h3>
          <Bar data={performanceChartData} />
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow mb-8">
        <h3 className="text-lg font-semibold mb-4">トップパフォーマンスコレクション</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  コレクション名
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  閲覧数
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  クリック数
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  収益
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {/* コレクションデータをここに表示 */}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => {/* エクスポート処理 */}}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          レポートをエクスポート
        </button>
      </div>
    </div>
  );
};
```

### 5. データエクスポート機能

```rust
// apps/colleca-api/src/services/export_service.rs
use uuid::Uuid;
use chrono::{DateTime, Utc};
use csv::Writer;
use calamine::{Workbook, Xlsx};
use crate::models::{UserAnalytics, CollectionAnalytics};
use crate::repositories::AnalyticsRepository;

pub struct ExportService {
    repository: AnalyticsRepository,
}

impl ExportService {
    pub fn new(repository: AnalyticsRepository) -> Self {
        Self { repository }
    }

    pub async fn export_to_csv(&self, user_id: Uuid, start_date: DateTime<Utc>, end_date: DateTime<Utc>) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
        let analytics = self.repository.get_user_analytics_range(user_id, start_date, end_date).await?;
        
        let mut wtr = Writer::from_writer(vec![]);
        wtr.write_record(&["日付", "コレクション数", "閲覧数", "クリック数", "収益"])?;
        
        for data in analytics {
            wtr.write_record(&[
                data.date.format("%Y-%m-%d").to_string(),
                data.total_collections.to_string(),
                data.total_views.to_string(),
                data.total_clicks.to_string(),
                data.total_revenue.to_string(),
            ])?;
        }
        
        wtr.flush()?;
        Ok(wtr.into_inner()?)
    }

    pub async fn export_to_excel(&self, user_id: Uuid, start_date: DateTime<Utc>, end_date: DateTime<Utc>) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
        let analytics = self.repository.get_user_analytics_range(user_id, start_date, end_date).await?;
        
        // Excelファイルの生成ロジック
        // rust_xlsxwriterなどのライブラリを使用
        
        Ok(vec![]) // 実際のExcelデータを返す
    }
}
```

### 6. データベーススキーマ

```sql
-- migrations/20240426_create_analytics_tables.sql
CREATE TABLE collection_analytics (
    id UUID PRIMARY KEY,
    collection_id UUID NOT NULL REFERENCES collections(id),
    date DATE NOT NULL,
    views BIGINT NOT NULL DEFAULT 0,
    unique_visitors BIGINT NOT NULL DEFAULT 0,
    clicks BIGINT NOT NULL DEFAULT 0,
    conversions BIGINT NOT NULL DEFAULT 0,
    revenue BIGINT NOT NULL DEFAULT 0,
    avg_time_spent FLOAT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(collection_id, date)
);

CREATE TABLE user_analytics (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    date DATE NOT NULL,
    total_collections BIGINT NOT NULL DEFAULT 0,
    total_views BIGINT NOT NULL DEFAULT 0,
    total_clicks BIGINT NOT NULL DEFAULT 0,
    total_revenue BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, date)
);

CREATE TABLE product_performance (
    id UUID PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES products(id),
    date DATE NOT NULL,
    impressions BIGINT NOT NULL DEFAULT 0,
    clicks BIGINT NOT NULL DEFAULT 0,
    conversion_rate FLOAT NOT NULL DEFAULT 0,
    revenue BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, date)
);

CREATE INDEX idx_collection_analytics_date ON collection_analytics(collection_id, date);
CREATE INDEX idx_user_analytics_date ON user_analytics(user_id, date);
CREATE INDEX idx_product_performance_date ON product_performance(product_id, date);
```

## 技術的詳細

### データウェアハウス連携
- 大規模データ分析のためにBigQueryやRedshiftと連携
- ETLパイプラインによるデータ同期
- リアルタイム分析のためのストリーミング処理

### グラフ・チャート表示
- Chart.jsを使用した対話的なグラフ表示
- レスポンシブデザイン対応
- カスタマイズ可能なダッシュボードレイアウト

### 定期レポート自動生成
- 日次・週次・月次レポートの自動生成
- メール配信機能
- カスタムレポートテンプレート

## セキュリティ考慮事項

1. **データアクセス制御**
   - ユーザーは自身のデータのみアクセス可能
   - 管理者向けの集計データは匿名化

2. **パフォーマンス最適化**
   - 集計データのキャッシュ
   - インデックスの最適化
   - クエリの最適化

3. **データ保護**
   - 個人情報の暗号化
   - アクセスログの記録
   - データ保持ポリシーの適用

## テスト計画

1. **ユニットテスト**
   - データ集計ロジックのテスト
   - エクスポート機能のテスト

2. **統合テスト**
   - APIエンドポイントのテスト
   - ダッシュボード表示のテスト

3. **パフォーマンステスト**
   - 大量データでの集計処理
   - 同時アクセス時の応答性

## 今後の拡張計画

1. **AIによる分析機能**
   - トレンド予測
   - 異常検知
   - 最適化提案

2. **カスタムダッシュボード**
   - ウィジェットのドラッグ&ドロップ
   - カスタムメトリクスの追加
   - 共有可能なダッシュボード

3. **外部ツール連携**
   - Google Analytics連携
   - Slack通知
   - データ可視化ツール連携
