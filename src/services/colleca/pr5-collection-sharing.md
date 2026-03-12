# PR #5: コレクション共有システム

## 概要
コレクションの共有機能を実装します。公開/非公開設定、共有URL生成、SNSシェア機能、埋め込みウィジェットなどを提供し、ユーザーが作成したコレクションを簡単に共有できるようにします。

## 実装内容

### 1. 共有設定モデル

```rust
// packages/colleca-common/src/models/sharing.rs
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};

#[derive(Debug, Serialize, Deserialize)]
pub struct ShareSettings {
    pub collection_id: Uuid,
    pub is_public: bool,
    pub share_token: Option<String>,
    pub expires_at: Option<DateTime<Utc>>,
    pub allow_embedding: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ShareLink {
    pub id: Uuid,
    pub collection_id: Uuid,
    pub token: String,
    pub expires_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}
```

### 2. 共有URL生成サービス

```rust
// apps/colleca-api/src/services/sharing_service.rs
use uuid::Uuid;
use rand::{thread_rng, Rng};
use rand::distributions::Alphanumeric;
use crate::models::{ShareSettings, ShareLink};
use crate::repositories::SharingRepository;

pub struct SharingService {
    repository: SharingRepository,
}

impl SharingService {
    pub fn new(repository: SharingRepository) -> Self {
        Self { repository }
    }

    pub async fn generate_share_link(&self, collection_id: Uuid, expires_in_days: Option<i64>) -> Result<ShareLink, Box<dyn std::error::Error>> {
        let token: String = thread_rng()
            .sample_iter(&Alphanumeric)
            .take(32)
            .map(char::from)
            .collect();

        let expires_at = expires_in_days.map(|days| Utc::now() + chrono::Duration::days(days));

        let share_link = ShareLink {
            id: Uuid::new_v4(),
            collection_id,
            token,
            expires_at,
            created_at: Utc::now(),
        };

        self.repository.create_share_link(&share_link).await?;
        Ok(share_link)
    }

    pub async fn update_share_settings(&self, collection_id: Uuid, settings: ShareSettings) -> Result<ShareSettings, Box<dyn std::error::Error>> {
        self.repository.update_share_settings(&settings).await?;
        Ok(settings)
    }
}
```

### 3. 共有API

```rust
// apps/colleca-api/src/handlers/sharing_handler.rs
use axum::{
    extract::{Path, State, Query},
    Json,
    response::IntoResponse,
    http::StatusCode,
};
use uuid::Uuid;
use crate::{
    models::{ShareSettings, ShareLink},
    services::SharingService,
    AppState,
};

pub async fn generate_share_link(
    State(state): State<AppState>,
    Path(collection_id): Path<Uuid>,
    Query(params): Query<GenerateShareLinkParams>,
) -> impl IntoResponse {
    match state.sharing_service.generate_share_link(collection_id, params.expires_in_days).await {
        Ok(share_link) => (StatusCode::CREATED, Json(share_link)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn update_share_settings(
    State(state): State<AppState>,
    Path(collection_id): Path<Uuid>,
    Json(settings): Json<ShareSettings>,
) -> impl IntoResponse {
    match state.sharing_service.update_share_settings(collection_id, settings).await {
        Ok(updated_settings) => (StatusCode::OK, Json(updated_settings)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn get_shared_collection(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> impl IntoResponse {
    match state.sharing_service.get_collection_by_token(&token).await {
        Ok(collection) => (StatusCode::OK, Json(collection)).into_response(),
        Err(e) => (StatusCode::NOT_FOUND, e.to_string()).into_response(),
    }
}
```

### 4. 共有UI

```typescript
// apps/colleca-ui/src/components/ShareModal.tsx
import React, { useState } from 'react';
import { Collection } from '@/types';
import { generateShareLink, updateShareSettings } from '@/api/sharing';

interface ShareModalProps {
  collection: Collection;
  onClose: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({ collection, onClose }) => {
  const [isPublic, setIsPublic] = useState(collection.is_public);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [expiresInDays, setExpiresInDays] = useState<number | null>(null);
  const [allowEmbedding, setAllowEmbedding] = useState(false);

  const handleGenerateLink = async () => {
    try {
      const link = await generateShareLink(collection.id, expiresInDays);
      setShareLink(`${window.location.origin}/shared/${link.token}`);
    } catch (error) {
      console.error('Failed to generate share link:', error);
    }
  };

  const handleUpdateSettings = async () => {
    try {
      await updateShareSettings(collection.id, {
        is_public: isPublic,
        allow_embedding: allowEmbedding,
      });
    } catch (error) {
      console.error('Failed to update share settings:', error);
    }
  };

  const handleCopyLink = () => {
    if (shareLink) {
      navigator.clipboard.writeText(shareLink);
    }
  };

  const handleShareToSNS = (platform: string) => {
    if (!shareLink) return;

    const text = `${collection.title} - Colleca`;
    const encodedUrl = encodeURIComponent(shareLink);
    const encodedText = encodeURIComponent(text);

    const urls = {
      twitter: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      line: `https://social-plugins.line.me/lineit/share?url=${encodedUrl}`,
    };

    window.open(urls[platform], '_blank');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">コレクションを共有</h2>
        
        <div className="mb-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="mr-2"
            />
            公開コレクションにする
          </label>
        </div>

        <div className="mb-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={allowEmbedding}
              onChange={(e) => setAllowEmbedding(e.target.checked)}
              className="mr-2"
            />
            埋め込みを許可する
          </label>
        </div>

        <div className="mb-4">
          <label className="block mb-2">有効期限（日数）</label>
          <input
            type="number"
            value={expiresInDays || ''}
            onChange={(e) => setExpiresInDays(e.target.value ? parseInt(e.target.value) : null)}
            className="w-full border rounded px-3 py-2"
            placeholder="無期限"
          />
        </div>

        <button
          onClick={handleGenerateLink}
          className="w-full bg-blue-500 text-white py-2 rounded hover:bg-blue-600 mb-4"
        >
          共有リンクを生成
        </button>

        {shareLink && (
          <div className="mb-4">
            <div className="flex items-center mb-2">
              <input
                type="text"
                value={shareLink}
                readOnly
                className="flex-grow border rounded-l px-3 py-2"
              />
              <button
                onClick={handleCopyLink}
                className="bg-gray-200 px-4 py-2 rounded-r hover:bg-gray-300"
              >
                コピー
              </button>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => handleShareToSNS('twitter')}
                className="flex-1 bg-blue-400 text-white py-2 rounded hover:bg-blue-500"
              >
                Twitter
              </button>
              <button
                onClick={() => handleShareToSNS('facebook')}
                className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
              >
                Facebook
              </button>
              <button
                onClick={() => handleShareToSNS('line')}
                className="flex-1 bg-green-500 text-white py-2 rounded hover:bg-green-600"
              >
                LINE
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            閉じる
          </button>
          <button
            onClick={handleUpdateSettings}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            設定を保存
          </button>
        </div>
      </div>
    </div>
  );
};
```

### 5. 埋め込みウィジェット

```typescript
// apps/colleca-ui/src/components/EmbedWidget.tsx
import React, { useEffect, useState } from 'react';
import { Collection, CollectionItem } from '@/types';
import { getSharedCollection } from '@/api/sharing';

interface EmbedWidgetProps {
  token: string;
}

export const EmbedWidget: React.FC<EmbedWidgetProps> = ({ token }) => {
  const [collection, setCollection] = useState<Collection | null>(null);
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCollection = async () => {
      try {
        const data = await getSharedCollection(token);
        setCollection(data.collection);
        setItems(data.items);
      } catch (error) {
        console.error('Failed to fetch collection:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCollection();
  }, [token]);

  if (loading) {
    return <div className="p-4">読み込み中...</div>;
  }

  if (!collection) {
    return <div className="p-4">コレクションが見つかりません</div>;
  }

  return (
    <div className="max-w-2xl mx-auto p-4 bg-white rounded-lg shadow">
      <h2 className="text-xl font-bold mb-4">{collection.title}</h2>
      {collection.description && (
        <p className="text-gray-600 mb-4">{collection.description}</p>
      )}
      
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {items.map((item) => (
          <a
            key={item.id}
            href={item.product.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block hover:opacity-80 transition-opacity"
          >
            <img
              src={item.product.image_url}
              alt={item.product.title}
              className="w-full aspect-square object-cover rounded"
            />
            <div className="mt-2">
              <h3 className="font-semibold text-sm truncate">{item.product.title}</h3>
              <p className="text-gray-600 text-sm">¥{item.product.price}</p>
            </div>
          </a>
        ))}
      </div>
      
      <div className="mt-4 text-center">
        <a
          href={`https://colleca.app/shared/${token}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:text-blue-600"
        >
          Collecaで見る
        </a>
      </div>
    </div>
  );
};
```

### 6. データベーススキーマ

```sql
-- migrations/20240426_create_sharing_tables.sql
CREATE TABLE share_settings (
    collection_id UUID PRIMARY KEY REFERENCES collections(id) ON DELETE CASCADE,
    is_public BOOLEAN NOT NULL DEFAULT false,
    share_token VARCHAR(64),
    expires_at TIMESTAMP WITH TIME ZONE,
    allow_embedding BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE share_links (
    id UUID PRIMARY KEY,
    collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    token VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_share_links_token ON share_links(token);
```

## 技術的詳細

### OGP対応
- 共有ページにはOpen Graphメタタグを設定
- コレクションのタイトル、説明、カバー画像を使用
- SNSでのプレビュー表示を最適化

### レスポンシブデザイン
- モバイルファーストのアプローチ
- 画面サイズに応じたレイアウト調整
- タッチ操作に最適化されたUI

### パフォーマンス最適化
- 共有ページの静的生成
- 画像の遅延ロード
- CDNキャッシュの活用

## セキュリティ考慮事項

1. **アクセス制御**
   - 非公開コレクションは共有リンクを持つユーザーのみアクセス可能
   - 有効期限切れのリンクは無効化

2. **トークン生成**
   - 暗号学的に安全な乱数生成器を使用
   - 十分な長さのトークンで推測を防止

3. **埋め込み制限**
   - 許可されたドメインからのみ埋め込み可能
   - CSPヘッダーによる制御

## テスト計画

1. **ユニットテスト**
   - 共有リンク生成ロジック
   - トークン検証ロジック

2. **統合テスト**
   - 共有APIエンドポイント
   - アクセス制御の検証

3. **E2Eテスト**
   - 共有リンク生成フロー
   - SNSシェア機能
   - 埋め込みウィジェットの動作

## 次のステップ

PR #6では、アフィリエイト連携システムを実装します。ECサイトのアフィリエイトプログラムとの連携、収益トラッキング、レポート生成などの機能を追加します。
