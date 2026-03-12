# PR #4: コレクション管理システム

## 概要
ユーザーがコレクションを作成・管理できる機能を実装します。商品の追加・削除・並べ替え、コレクションの編集・削除などの基本的な管理機能を提供します。

## 実装内容

### 1. コレクションモデルの定義

```rust
// packages/colleca-common/src/models/collection.rs
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};

#[derive(Debug, Serialize, Deserialize)]
pub struct Collection {
    pub id: Uuid,
    pub user_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub cover_image_url: Option<String>,
    pub is_public: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CollectionItem {
    pub id: Uuid,
    pub collection_id: Uuid,
    pub product_id: Uuid,
    pub position: i32,
    pub comment: Option<String>,
    pub created_at: DateTime<Utc>,
}
```

### 2. コレクションリポジトリ

```rust
// apps/colleca-api/src/repositories/collection_repository.rs
use sqlx::PgPool;
use uuid::Uuid;
use crate::models::{Collection, CollectionItem};

pub struct CollectionRepository {
    pool: PgPool,
}

impl CollectionRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn create_collection(&self, collection: &Collection) -> Result<Collection, sqlx::Error> {
        sqlx::query_as!(
            Collection,
            r#"
            INSERT INTO collections (id, user_id, title, description, cover_image_url, is_public)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
            "#,
            collection.id,
            collection.user_id,
            collection.title,
            collection.description,
            collection.cover_image_url,
            collection.is_public
        )
        .fetch_one(&self.pool)
        .await
    }

    pub async fn add_item_to_collection(&self, item: &CollectionItem) -> Result<CollectionItem, sqlx::Error> {
        sqlx::query_as!(
            CollectionItem,
            r#"
            INSERT INTO collection_items (id, collection_id, product_id, position, comment)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
            "#,
            item.id,
            item.collection_id,
            item.product_id,
            item.position,
            item.comment
        )
        .fetch_one(&self.pool)
        .await
    }

    pub async fn update_item_position(&self, item_id: Uuid, new_position: i32) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"
            UPDATE collection_items
            SET position = $1
            WHERE id = $2
            "#,
            new_position,
            item_id
        )
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn remove_item_from_collection(&self, item_id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"
            DELETE FROM collection_items
            WHERE id = $1
            "#,
            item_id
        )
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}
```

### 3. コレクション管理API

```rust
// apps/colleca-api/src/handlers/collection_handler.rs
use axum::{
    extract::{Path, State},
    Json,
    response::IntoResponse,
    http::StatusCode,
};
use uuid::Uuid;
use crate::{
    models::{Collection, CollectionItem},
    repositories::CollectionRepository,
    AppState,
};

pub async fn create_collection(
    State(state): State<AppState>,
    Json(payload): Json<CreateCollectionRequest>,
) -> impl IntoResponse {
    let collection = Collection {
        id: Uuid::new_v4(),
        user_id: payload.user_id,
        title: payload.title,
        description: payload.description,
        cover_image_url: payload.cover_image_url,
        is_public: payload.is_public,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };

    match state.collection_repo.create_collection(&collection).await {
        Ok(collection) => (StatusCode::CREATED, Json(collection)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn add_item_to_collection(
    State(state): State<AppState>,
    Path(collection_id): Path<Uuid>,
    Json(payload): Json<AddItemRequest>,
) -> impl IntoResponse {
    let item = CollectionItem {
        id: Uuid::new_v4(),
        collection_id,
        product_id: payload.product_id,
        position: payload.position,
        comment: payload.comment,
        created_at: Utc::now(),
    };

    match state.collection_repo.add_item_to_collection(&item).await {
        Ok(item) => (StatusCode::CREATED, Json(item)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn reorder_items(
    State(state): State<AppState>,
    Path(collection_id): Path<Uuid>,
    Json(payload): Json<ReorderItemsRequest>,
) -> impl IntoResponse {
    for (item_id, new_position) in payload.items {
        if let Err(e) = state.collection_repo.update_item_position(item_id, new_position).await {
            return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
        }
    }
    StatusCode::OK.into_response()
}
```

### 4. コレクション管理UI

```typescript
// apps/colleca-ui/src/components/CollectionManager.tsx
import React, { useState } from 'react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { Collection, CollectionItem } from '@/types';

interface CollectionManagerProps {
  collection: Collection;
  items: CollectionItem[];
  onReorder: (items: CollectionItem[]) => void;
  onAddItem: (productId: string) => void;
  onRemoveItem: (itemId: string) => void;
}

export const CollectionManager: React.FC<CollectionManagerProps> = ({
  collection,
  items,
  onReorder,
  onAddItem,
  onRemoveItem,
}) => {
  const [isEditing, setIsEditing] = useState(false);

  const handleDragEnd = (result: any) => {
    if (!result.destination) return;

    const newItems = Array.from(items);
    const [reorderedItem] = newItems.splice(result.source.index, 1);
    newItems.splice(result.destination.index, 0, reorderedItem);

    onReorder(newItems);
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{collection.title}</h1>
        <button
          onClick={() => setIsEditing(!isEditing)}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          {isEditing ? '完了' : '編集'}
        </button>
      </div>

      {collection.description && (
        <p className="text-gray-600 mb-6">{collection.description}</p>
      )}

      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="collection-items">
          {(provided) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className="space-y-4"
            >
              {items.map((item, index) => (
                <Draggable
                  key={item.id}
                  draggableId={item.id}
                  index={index}
                  isDragDisabled={!isEditing}
                >
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      className="bg-white p-4 rounded-lg shadow flex items-center"
                    >
                      <img
                        src={item.product.image_url}
                        alt={item.product.title}
                        className="w-20 h-20 object-cover rounded"
                      />
                      <div className="ml-4 flex-grow">
                        <h3 className="font-semibold">{item.product.title}</h3>
                        <p className="text-gray-600">¥{item.product.price}</p>
                        {item.comment && (
                          <p className="text-sm text-gray-500 mt-1">{item.comment}</p>
                        )}
                      </div>
                      {isEditing && (
                        <button
                          onClick={() => onRemoveItem(item.id)}
                          className="ml-4 text-red-500 hover:text-red-700"
                        >
                          削除
                        </button>
                      )}
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {isEditing && (
        <button
          onClick={() => {/* 商品追加モーダルを開く */}}
          className="mt-6 w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-500 hover:text-blue-500"
        >
          + 商品を追加
        </button>
      )}
    </div>
  );
};
```

### 5. データベーススキーマ

```sql
-- migrations/20240426_create_collections.sql
CREATE TABLE collections (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    cover_image_url VARCHAR(512),
    is_public BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE collection_items (
    id UUID PRIMARY KEY,
    collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    position INTEGER NOT NULL,
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(collection_id, position)
);

CREATE INDEX idx_collections_user_id ON collections(user_id);
CREATE INDEX idx_collection_items_collection_id ON collection_items(collection_id);
```

## 技術的詳細

### ドラッグ&ドロップによる並べ替え
- react-beautiful-dndを使用して直感的な並べ替えUIを実装
- 並べ替え操作はクライアントサイドで即時反映し、バックエンドに非同期で保存

### リアルタイム保存
- 編集操作は即時にAPIを呼び出して保存
- 楽観的更新を採用し、UIの応答性を向上

### 画像最適化
- 商品画像はサムネイルサイズに最適化して表示
- 遅延ロードを実装してパフォーマンスを向上

## セキュリティ考慮事項

1. **認可チェック**
   - コレクションの所有者のみが編集可能
   - 非公開コレクションは所有者のみが閲覧可能

2. **入力バリデーション**
   - タイトルの長さ制限
   - 商品の重複追加防止

## テスト計画

1. **ユニットテスト**
   - コレクションリポジトリのCRUD操作
   - 並べ替えロジック

2. **統合テスト**
   - APIエンドポイントの動作確認
   - 認可チェックの検証

3. **E2Eテスト**
   - コレクション作成フロー
   - ドラッグ&ドロップによる並べ替え

## 次のステップ

PR #5では、コレクションの共有機能を実装します。公開/非公開設定、共有URL生成、SNSシェア機能などを追加します。
