# Library APIをCMSとして利用するための仕様書

## 概要

Library APIは、コンテンツ管理システム（CMS）として機能し、組織、リポジトリ、プロパティ、データの管理を可能にします。このドキュメントでは、Library APIをCMSとして利用するための仕様と方法について説明します。

## 前提条件

- 組織（Organization）が作成済み
- プロパティ（Property）が定義済み
- リポジトリ（Repo）が作成済み

## アーキテクチャ

Library APIはクリーンアーキテクチャに基づいて設計されており、以下のレイヤーで構成されています：

```plantuml
@startuml
package "Domain" {
  [Organization]
  [Repo]
  [Property]
  [Data]
}

package "Usecase" {
  [CRUD Operations]
}

package "Interface Adapter" {
  [REST API]
}

[Client Applications] --> [REST API]
[REST API] --> [CRUD Operations]
[CRUD Operations] --> [Organization]
[CRUD Operations] --> [Repo]
[CRUD Operations] --> [Property]
[CRUD Operations] --> [Data]
@enduml
```

## コアエンティティ

### 組織（Organization）

組織はテナントとして機能し、複数のリポジトリを所有できます。

```json
{
  "id": "tn_01hkz3700yt46snfewzpakeyj4",
  "name": "サンプル組織",
  "username": "sample-org",
  "description": "サンプル組織の説明",
  "repos": [
    {
      "id": "rp_01hkz3700yt46snfewzpakeyj4",
      "name": "サンプルリポジトリ"
    }
  ],
  "users": [
    {
      "id": "us_01hkz3700yt46snfewzpakeyj4",
      "name": "ユーザー1"
    }
  ]
}
```

### リポジトリ（Repo）

リポジトリはデータの集合を表し、プロパティとデータを含みます。

```json
{
  "id": "rp_01hkz3700yt46snfewzpakeyj4",
  "organizationId": "tn_01hkz3700yt46snfewzpakeyj4",
  "orgUsername": "sample-org",
  "name": "サンプルリポジトリ",
  "username": "sample-repo",
  "description": "サンプルリポジトリの説明",
  "isPublic": true,
  "policies": [
    {
      "userId": "us_01hkz3700yt46snfewzpakeyj4",
      "role": "Owner"
    }
  ],
  "databases": ["db_01hkz3700yt46snfewzpakeyj4"],
  "properties": [
    {
      "id": "pr_01hkz3700yt46snfewzpakeyj4",
      "name": "タイトル"
    }
  ]
}
```

### プロパティ（Property）

プロパティはデータの構造を定義します。様々な型（文字列、整数、Markdown、HTML〈後方互換〉、リレーション、選択肢など）をサポートしています。

```json
{
  "id": "pr_01hkz3700yt46snfewzpakeyj4",
  "tenantId": "tn_01hkz3700yt46snfewzpakeyj4",
  "databaseId": "db_01hkz3700yt46snfewzpakeyj4",
  "name": "タイトル",
  "typ": "STRING",
  "isIndexed": true,
  "propertyNum": 1
}
```

プロパティタイプ：
- STRING: 文字列
- INTEGER: 整数
- MARKDOWN: Markdownコンテンツ
- HTML: HTMLコンテンツ（非推奨・既存データの互換用）
- RELATION: 他のデータへの関連
- SELECT: 単一選択
- MULTI_SELECT: 複数選択
- ID: 識別子
- LOCATION: 位置情報

### データ（Data）

データはプロパティに基づいて構造化された情報を保存します。

```json
{
  "id": "dt_01hkz3700yt46snfewzpakeyj4",
  "tenantId": "tn_01hkz3700yt46snfewzpakeyj4",
  "databaseId": "db_01hkz3700yt46snfewzpakeyj4",
  "name": "サンプルデータ",
  "propertyData": [
    {
      "propertyId": "pr_01hkz3700yt46snfewzpakeyj4",
      "value": {
        "string": "サンプルタイトル"
      }
    },
    {
      "propertyId": "pr_02hkz3700yt46snfewzpakeyj4",
      "value": {
        "number": 42
      }
    }
  ],
  "createdAt": "2023-01-01T00:00:00Z",
  "updatedAt": "2023-01-02T00:00:00Z"
}
```

## REST APIエンドポイント

Library APIは以下のREST APIエンドポイントを提供しています。

### ベースURL

```
https://api.example.com/v1
```

### 認証

すべてのAPIリクエストには認証が必要です。認証には以下の方法を使用します：

```
Authorization: Bearer {API_KEY}
```

APIキーは、APIキー作成エンドポイントを使用して取得できます（後述）。

## 組織（Organization）の操作

### 組織一覧の取得

**エンドポイント**

```
GET /organizations
```

**curlの例**

```bash
curl -X GET "https://api.example.com/v1/organizations" \
  -H "Authorization: Bearer lib_01hkz3700yt46snfewzpakeyj4"
```

**レスポンス例**

```json
[
  {
    "id": "tn_01hkz3700yt46snfewzpakeyj4",
    "name": "サンプル組織1",
    "username": "sample-org-1",
    "description": "サンプル組織1の説明"
  },
  {
    "id": "tn_02hkz3700yt46snfewzpakeyj4",
    "name": "サンプル組織2",
    "username": "sample-org-2",
    "description": "サンプル組織2の説明"
  }
]
```

### 特定の組織の取得

**エンドポイント**

```
GET /organizations/{username}
```

**curlの例**

```bash
curl -X GET "https://api.example.com/v1/organizations/sample-org-1" \
  -H "Authorization: Bearer lib_01hkz3700yt46snfewzpakeyj4"
```

**レスポンス例**

```json
{
  "id": "tn_01hkz3700yt46snfewzpakeyj4",
  "name": "サンプル組織1",
  "username": "sample-org-1",
  "description": "サンプル組織1の説明",
  "repos": [
    {
      "id": "rp_01hkz3700yt46snfewzpakeyj4",
      "name": "サンプルリポジトリ1"
    }
  ],
  "users": [
    {
      "id": "us_01hkz3700yt46snfewzpakeyj4",
      "name": "ユーザー1"
    }
  ]
}
```

### 新しい組織の作成

**エンドポイント**

```
POST /organizations
```

**curlの例**

```bash
curl -X POST "https://api.example.com/v1/organizations" \
  -H "Authorization: Bearer lib_01hkz3700yt46snfewzpakeyj4" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "新しい組織",
    "username": "new-org",
    "description": "新しい組織の説明"
  }'
```

**リクエストボディ**

```json
{
  "name": "新しい組織",
  "username": "new-org",
  "description": "新しい組織の説明"
}
```

**レスポンス例**

```json
{
  "id": "tn_03hkz3700yt46snfewzpakeyj4",
  "name": "新しい組織",
  "username": "new-org",
  "description": "新しい組織の説明"
}
```

## リポジトリ（Repo）の操作

### リポジトリ一覧の取得

**エンドポイント**

```
GET /organizations/{orgUsername}/repositories
```

**curlの例**

```bash
curl -X GET "https://api.example.com/v1/organizations/sample-org-1/repositories" \
  -H "Authorization: Bearer lib_01hkz3700yt46snfewzpakeyj4"
```

**レスポンス例**

```json
[
  {
    "id": "rp_01hkz3700yt46snfewzpakeyj4",
    "name": "サンプルリポジトリ1",
    "username": "sample-repo-1",
    "description": "サンプルリポジトリ1の説明",
    "isPublic": true
  },
  {
    "id": "rp_02hkz3700yt46snfewzpakeyj4",
    "name": "サンプルリポジトリ2",
    "username": "sample-repo-2",
    "description": "サンプルリポジトリ2の説明",
    "isPublic": false
  }
]
```

### 特定のリポジトリの取得

**エンドポイント**

```
GET /organizations/{orgUsername}/repositories/{repoUsername}
```

**curlの例**

```bash
curl -X GET "https://api.example.com/v1/organizations/sample-org-1/repositories/sample-repo-1" \
  -H "Authorization: Bearer lib_01hkz3700yt46snfewzpakeyj4"
```

**レスポンス例**

```json
{
  "id": "rp_01hkz3700yt46snfewzpakeyj4",
  "organizationId": "tn_01hkz3700yt46snfewzpakeyj4",
  "orgUsername": "sample-org-1",
  "name": "サンプルリポジトリ1",
  "username": "sample-repo-1",
  "description": "サンプルリポジトリ1の説明",
  "isPublic": true,
  "policies": [
    {
      "userId": "us_01hkz3700yt46snfewzpakeyj4",
      "role": "Owner"
    }
  ],
  "databases": ["db_01hkz3700yt46snfewzpakeyj4"],
  "properties": [
    {
      "id": "pr_01hkz3700yt46snfewzpakeyj4",
      "name": "タイトル"
    }
  ]
}
```

### 新しいリポジトリの作成

**エンドポイント**

```
POST /organizations/{orgUsername}/repositories
```

**curlの例**

```bash
curl -X POST "https://api.example.com/v1/organizations/sample-org-1/repositories" \
  -H "Authorization: Bearer lib_01hkz3700yt46snfewzpakeyj4" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "新しいリポジトリ",
    "username": "new-repo",
    "description": "新しいリポジトリの説明",
    "isPublic": true
  }'
```

**リクエストボディ**

```json
{
  "name": "新しいリポジトリ",
  "username": "new-repo",
  "description": "新しいリポジトリの説明",
  "isPublic": true
}
```

**レスポンス例**

```json
{
  "id": "rp_03hkz3700yt46snfewzpakeyj4",
  "organizationId": "tn_01hkz3700yt46snfewzpakeyj4",
  "orgUsername": "sample-org-1",
  "name": "新しいリポジトリ",
  "username": "new-repo",
  "description": "新しいリポジトリの説明",
  "isPublic": true,
  "policies": [
    {
      "userId": "us_01hkz3700yt46snfewzpakeyj4",
      "role": "Owner"
    }
  ]
}
```

## プロパティ（Property）の操作

### プロパティ一覧の取得

**エンドポイント**

```
GET /organizations/{orgUsername}/repositories/{repoUsername}/properties
```

**curlの例**

```bash
curl -X GET "https://api.example.com/v1/organizations/sample-org-1/repositories/sample-repo-1/properties" \
  -H "Authorization: Bearer lib_01hkz3700yt46snfewzpakeyj4"
```

**レスポンス例**

```json
[
  {
    "id": "pr_01hkz3700yt46snfewzpakeyj4",
    "tenantId": "tn_01hkz3700yt46snfewzpakeyj4",
    "databaseId": "db_01hkz3700yt46snfewzpakeyj4",
    "name": "タイトル",
    "typ": "STRING",
    "isIndexed": true,
    "propertyNum": 1
  },
  {
    "id": "pr_02hkz3700yt46snfewzpakeyj4",
    "tenantId": "tn_01hkz3700yt46snfewzpakeyj4",
    "databaseId": "db_01hkz3700yt46snfewzpakeyj4",
    "name": "価格",
    "typ": "INTEGER",
    "isIndexed": true,
    "propertyNum": 2
  }
]
```

### 新しいプロパティの作成

**エンドポイント**

```
POST /organizations/{orgUsername}/repositories/{repoUsername}/properties
```

**curlの例**

```bash
curl -X POST "https://api.example.com/v1/organizations/sample-org-1/repositories/sample-repo-1/properties" \
  -H "Authorization: Bearer lib_01hkz3700yt46snfewzpakeyj4" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "説明",
    "typ": "HTML",
    "isIndexed": false
  }'
```

**リクエストボディ**

```json
{
  "name": "説明",
  "typ": "HTML",
  "isIndexed": false
}
```

**レスポンス例**

```json
{
  "id": "pr_03hkz3700yt46snfewzpakeyj4",
  "tenantId": "tn_01hkz3700yt46snfewzpakeyj4",
  "databaseId": "db_01hkz3700yt46snfewzpakeyj4",
  "name": "説明",
  "typ": "HTML",
  "isIndexed": false,
  "propertyNum": 3
}
```

## データ（Data）のCRUD操作

### データの作成

**エンドポイント**

```
POST /organizations/{orgUsername}/repositories/{repoUsername}/data
```

**curlの例**

```bash
curl -X POST "https://api.example.com/v1/organizations/sample-org-1/repositories/sample-repo-1/data" \
  -H "Authorization: Bearer lib_01hkz3700yt46snfewzpakeyj4" \
  -H "Content-Type: application/json" \
  -d '{
    "actor": "us_01hkz3700yt46snfewzpakeyj4",
    "dataName": "サンプルデータ",
    "propertyData": [
      {
        "propertyId": "pr_01hkz3700yt46snfewzpakeyj4",
        "value": {
          "string": "サンプルタイトル"
        }
      },
      {
        "propertyId": "pr_02hkz3700yt46snfewzpakeyj4",
        "value": {
          "number": 42
        }
      }
    ]
  }'
```

**リクエストボディ**

```json
{
  "actor": "us_01hkz3700yt46snfewzpakeyj4",
  "dataName": "サンプルデータ",
  "propertyData": [
    {
      "propertyId": "pr_01hkz3700yt46snfewzpakeyj4",
      "value": {
        "string": "サンプルタイトル"
      }
    },
    {
      "propertyId": "pr_02hkz3700yt46snfewzpakeyj4",
      "value": {
        "number": 42
      }
    }
  ]
}
```

**レスポンス**

```json
{
  "id": "dt_01hkz3700yt46snfewzpakeyj4",
  "name": "サンプルデータ",
  "propertyData": [
    {
      "propertyId": "pr_01hkz3700yt46snfewzpakeyj4",
      "value": {
        "string": "サンプルタイトル"
      }
    },
    {
      "propertyId": "pr_02hkz3700yt46snfewzpakeyj4",
      "value": {
        "number": 42
      }
    }
  ],
  "createdAt": "2023-01-01T00:00:00Z",
  "updatedAt": "2023-01-01T00:00:00Z"
}
```

### データの取得

#### 単一データの取得

**エンドポイント**

```
GET /organizations/{orgUsername}/repositories/{repoUsername}/data/{dataId}
```

**curlの例**

```bash
curl -X GET "https://api.example.com/v1/organizations/sample-org-1/repositories/sample-repo-1/data/dt_01hkz3700yt46snfewzpakeyj4" \
  -H "Authorization: Bearer lib_01hkz3700yt46snfewzpakeyj4"
```

**レスポンス**

```json
{
  "id": "dt_01hkz3700yt46snfewzpakeyj4",
  "name": "サンプルデータ",
  "propertyData": [
    {
      "propertyId": "pr_01hkz3700yt46snfewzpakeyj4",
      "value": {
        "string": "サンプルタイトル"
      }
    },
    {
      "propertyId": "pr_02hkz3700yt46snfewzpakeyj4",
      "value": {
        "number": 42
      }
    }
  ],
  "createdAt": "2023-01-01T00:00:00Z",
  "updatedAt": "2023-01-01T00:00:00Z"
}
```

#### データリストの取得

**エンドポイント**

```
GET /organizations/{orgUsername}/repositories/{repoUsername}/data?page=1&pageSize=10
```

**curlの例**

```bash
curl -X GET "https://api.example.com/v1/organizations/sample-org-1/repositories/sample-repo-1/data?page=1&pageSize=10" \
  -H "Authorization: Bearer lib_01hkz3700yt46snfewzpakeyj4"
```

**レスポンス**

```json
{
  "items": [
    {
      "id": "dt_01hkz3700yt46snfewzpakeyj4",
      "name": "サンプルデータ1",
      "propertyData": [
        {
          "propertyId": "pr_01hkz3700yt46snfewzpakeyj4",
          "value": {
            "string": "サンプルタイトル1"
          }
        }
      ],
      "createdAt": "2023-01-01T00:00:00Z",
      "updatedAt": "2023-01-01T00:00:00Z"
    },
    {
      "id": "dt_02hkz3700yt46snfewzpakeyj4",
      "name": "サンプルデータ2",
      "propertyData": [
        {
          "propertyId": "pr_01hkz3700yt46snfewzpakeyj4",
          "value": {
            "string": "サンプルタイトル2"
          }
        }
      ],
      "createdAt": "2023-01-02T00:00:00Z",
      "updatedAt": "2023-01-02T00:00:00Z"
    }
  ],
  "paginator": {
    "currentPage": 1,
    "itemsPerPage": 10,
    "totalItems": 2,
    "totalPages": 1
  }
}
```

### データの更新

**エンドポイント**

```
PUT /organizations/{orgUsername}/repositories/{repoUsername}/data/{dataId}
```

**curlの例**

```bash
curl -X PUT "https://api.example.com/v1/organizations/sample-org-1/repositories/sample-repo-1/data/dt_01hkz3700yt46snfewzpakeyj4" \
  -H "Authorization: Bearer lib_01hkz3700yt46snfewzpakeyj4" \
  -H "Content-Type: application/json" \
  -d '{
    "actor": "us_01hkz3700yt46snfewzpakeyj4",
    "dataName": "更新されたサンプルデータ",
    "propertyData": [
      {
        "propertyId": "pr_01hkz3700yt46snfewzpakeyj4",
        "value": {
          "string": "更新されたサンプルタイトル"
        }
      },
      {
        "propertyId": "pr_02hkz3700yt46snfewzpakeyj4",
        "value": {
          "number": 43
        }
      }
    ]
  }'
```

**リクエストボディ**

```json
{
  "actor": "us_01hkz3700yt46snfewzpakeyj4",
  "dataName": "更新されたサンプルデータ",
  "propertyData": [
    {
      "propertyId": "pr_01hkz3700yt46snfewzpakeyj4",
      "value": {
        "string": "更新されたサンプルタイトル"
      }
    },
    {
      "propertyId": "pr_02hkz3700yt46snfewzpakeyj4",
      "value": {
        "number": 43
      }
    }
  ]
}
```

**レスポンス**

```json
{
  "id": "dt_01hkz3700yt46snfewzpakeyj4",
  "name": "更新されたサンプルデータ",
  "propertyData": [
    {
      "propertyId": "pr_01hkz3700yt46snfewzpakeyj4",
      "value": {
        "string": "更新されたサンプルタイトル"
      }
    },
    {
      "propertyId": "pr_02hkz3700yt46snfewzpakeyj4",
      "value": {
        "number": 43
      }
    }
  ],
  "createdAt": "2023-01-01T00:00:00Z",
  "updatedAt": "2023-01-02T00:00:00Z"
}
```

### データの削除

**エンドポイント**

```
DELETE /organizations/{orgUsername}/repositories/{repoUsername}/data/{dataId}
```

**curlの例**

```bash
curl -X DELETE "https://api.example.com/v1/organizations/sample-org-1/repositories/sample-repo-1/data/dt_01hkz3700yt46snfewzpakeyj4" \
  -H "Authorization: Bearer lib_01hkz3700yt46snfewzpakeyj4"
```

**レスポンス**

```
204 No Content
```

## 認証と権限

Library APIは認証と権限管理を提供しています。リポジトリには以下の権限レベルがあります：

- Owner: すべての操作が可能
- Manager: 読み取りと書き込みが可能
- General: 読み取りのみ可能

リポジトリのポリシーは以下のように定義されています：

```json
{
  "userId": "us_01hkz3700yt46snfewzpakeyj4",
  "role": "Owner"
}
```

### ポリシーの追加

**エンドポイント**

```
POST /organizations/{orgUsername}/repositories/{repoUsername}/policies
```

**curlの例**

```bash
curl -X POST "https://api.example.com/v1/organizations/sample-org-1/repositories/sample-repo-1/policies" \
  -H "Authorization: Bearer lib_01hkz3700yt46snfewzpakeyj4" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "us_02hkz3700yt46snfewzpakeyj4",
    "role": "Manager"
  }'
```

**リクエストボディ**

```json
{
  "userId": "us_02hkz3700yt46snfewzpakeyj4",
  "role": "Manager"
}
```

**レスポンス**

```json
{
  "userId": "us_02hkz3700yt46snfewzpakeyj4",
  "role": "Manager"
}
```

## APIキーの作成と管理

外部アプリケーションからLibrary APIにアクセスするためのAPIキーを作成できます：

**エンドポイント**

```
POST /organizations/{organizationUsername}/api-keys
```

**curlの例**

```bash
curl -X POST "https://api.example.com/v1/organizations/sample-org-1/api-keys" \
  -H "Authorization: Bearer lib_01hkz3700yt46snfewzpakeyj4" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "フロントエンドアプリケーション",
    "serviceAccountName": "frontend-app"
  }'
```

**リクエストボディ**

```json
{
  "name": "フロントエンドアプリケーション",
  "serviceAccountName": "frontend-app"
}
```

**レスポンス**

```json
{
  "apiKey": {
    "id": "ak_01hkz3700yt46snfewzpakeyj4",
    "value": "lib_01hkz3700yt46snfewzpakeyj4"
  },
  "serviceAccount": {
    "id": "sa_01hkz3700yt46snfewzpakeyj4",
    "name": "frontend-app"
  }
}
```

### APIキー一覧の取得

**エンドポイント**

```
GET /organizations/{organizationUsername}/api-keys
```

**curlの例**

```bash
curl -X GET "https://api.example.com/v1/organizations/sample-org-1/api-keys" \
  -H "Authorization: Bearer lib_01hkz3700yt46snfewzpakeyj4"
```

**レスポンス**

```json
[
  {
    "id": "ak_01hkz3700yt46snfewzpakeyj4",
    "name": "フロントエンドアプリケーション",
    "serviceAccount": {
      "id": "sa_01hkz3700yt46snfewzpakeyj4",
      "name": "frontend-app"
    },
    "createdAt": "2023-01-01T00:00:00Z"
  }
]
```

## 実装例

### データの作成例（JavaScript）

```javascript
const createData = async (
  orgUsername,
  repoUsername,
  dataName,
  propertyData,
  apiKey,
  userId
) => {
  const response = await fetch(
    `https://api.example.com/v1/organizations/${orgUsername}/repositories/${repoUsername}/data`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        actor: userId,
        dataName,
        propertyData,
      }),
    }
  );
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
  }
  
  return await response.json();
};

// 使用例
const createNewData = async () => {
  try {
    const result = await createData(
      'sample-org-1',
      'sample-repo-1',
      'サンプルデータ',
      [
        {
          propertyId: 'pr_01hkz3700yt46snfewzpakeyj4',
          value: {
            string: 'サンプルタイトル'
          }
        },
        {
          propertyId: 'pr_02hkz3700yt46snfewzpakeyj4',
          value: {
            number: 42
          }
        }
      ],
      'lib_01hkz3700yt46snfewzpakeyj4',
      'us_01hkz3700yt46snfewzpakeyj4'
    );
    
    console.log('データが作成されました:', result);
  } catch (error) {
    console.error('データの作成に失敗しました:', error.message);
  }
};
```

### データの取得例（JavaScript）

```javascript
const fetchDataList = async (
  orgUsername,
  repoUsername,
  page = 1,
  pageSize = 10,
  apiKey
) => {
  const response = await fetch(
    `https://api.example.com/v1/organizations/${orgUsername}/repositories/${repoUsername}/data?page=${page}&pageSize=${pageSize}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
    }
  );
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
  }
  
  return await response.json();
};

// 使用例
const getDataList = async () => {
  try {
    const result = await fetchDataList(
      'sample-org-1',
      'sample-repo-1',
      1,
      10,
      'lib_01hkz3700yt46snfewzpakeyj4'
    );
    
    console.log('データリスト:', result.items);
    console.log('ページネーション情報:', result.paginator);
  } catch (error) {
    console.error('データリストの取得に失敗しました:', error.message);
  }
};
```

### データの更新例（JavaScript）

```javascript
const updateData = async (
  orgUsername,
  repoUsername,
  dataId,
  dataName,
  propertyData,
  apiKey,
  userId
) => {
  const response = await fetch(
    `https://api.example.com/v1/organizations/${orgUsername}/repositories/${repoUsername}/data/${dataId}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        actor: userId,
        dataName,
        propertyData,
      }),
    }
  );
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
  }
  
  return await response.json();
};

// 使用例
const updateExistingData = async () => {
  try {
    const result = await updateData(
      'sample-org-1',
      'sample-repo-1',
      'dt_01hkz3700yt46snfewzpakeyj4',
      '更新されたサンプルデータ',
      [
        {
          propertyId: 'pr_01hkz3700yt46snfewzpakeyj4',
          value: {
            string: '更新されたサンプルタイトル'
          }
        },
        {
          propertyId: 'pr_02hkz3700yt46snfewzpakeyj4',
          value: {
            number: 43
          }
        }
      ],
      'lib_01hkz3700yt46snfewzpakeyj4',
      'us_01hkz3700yt46snfewzpakeyj4'
    );
    
    console.log('データが更新されました:', result);
  } catch (error) {
    console.error('データの更新に失敗しました:', error.message);
  }
};
```

### データの削除例（JavaScript）

```javascript
const deleteData = async (
  orgUsername,
  repoUsername,
  dataId,
  apiKey
) => {
  const response = await fetch(
    `https://api.example.com/v1/organizations/${orgUsername}/repositories/${repoUsername}/data/${dataId}`,
    {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
    }
  );
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
  }
  
  return true; // 204 No Content
};

// 使用例
const removeData = async () => {
  try {
    await deleteData(
      'sample-org-1',
      'sample-repo-1',
      'dt_01hkz3700yt46snfewzpakeyj4',
      'lib_01hkz3700yt46snfewzpakeyj4'
    );
    
    console.log('データが削除されました');
  } catch (error) {
    console.error('データの削除に失敗しました:', error.message);
  }
};
```

## エラーハンドリング

Library APIは以下のようなエラーを返す可能性があります：

- 401 Unauthorized: 認証エラー（ユーザーが認証されていない場合）
- 403 Forbidden: 権限エラー（ユーザーに必要な権限がない場合）
- 400 Bad Request: バリデーションエラー（入力データが無効な場合）
- 422 Unprocessable Entity: ビジネスロジックエラー（ビジネスルールに違反している場合）
- 500 Internal Server Error: サーバーエラー

エラーレスポンスの例：

```json
{
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "Access denied. User cannot write to this repo. Check your role."
  }
}
```

### エラーハンドリングの例（JavaScript）

```javascript
try {
  const result = await createData(orgUsername, repoUsername, dataName, propertyData, apiKey, userId);
  // 成功時の処理
  console.log('データが作成されました:', result);
} catch (error) {
  // エラー処理
  console.error('エラー:', error.message);
  
  // エラーの種類に応じた処理
  if (error.message.includes('401')) {
    console.error('認証エラー: APIキーが無効か期限切れです。再認証してください。');
  } else if (error.message.includes('403')) {
    console.error('権限エラー: このリソースにアクセスする権限がありません。');
  } else if (error.message.includes('400')) {
    console.error('入力エラー: リクエストデータが無効です。入力を確認してください。');
  } else if (error.message.includes('422')) {
    console.error('ビジネスロジックエラー: リクエストはビジネスルールに違反しています。');
  } else if (error.message.includes('500')) {
    console.error('サーバーエラー: 後でもう一度お試しください。');
  }
}
```

## まとめ

Library APIはCMSとして強力な機能を提供し、組織、リポジトリ、プロパティ、データの管理を可能にします。REST APIインターフェースを通じて、データのCRUD操作を簡単に行うことができます。認証と権限管理も組み込まれており、セキュアなデータアクセスを実現します。

このドキュメントで説明したエンドポイントとcurl例を使用して、Library APIをCMSとして活用し、独自のアプリケーションを構築できます。

## タスクリスト

✅ Library APIの概要説明
✅ コアエンティティの説明
✅ データのCRUD操作の説明
✅ 認証と権限の説明
✅ APIキーの作成と管理の説明
✅ 実装例の提供
✅ エラーハンドリングの説明
✅ curlの例の提供
