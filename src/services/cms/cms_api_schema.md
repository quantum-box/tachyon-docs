---
title: "CMSアプリケーションGraphQL API設計"
topics: ["cms", "GraphQL", "API", "schema"]
type: "tech"
published: false
targetFiles: ["apps/cms/src/graphql"]
---

# CMSアプリケーションGraphQL API設計

このドキュメントでは、CMSアプリケーションのGraphQL APIスキーマとその使用方法について説明します。

## 📊 スキーマ概要

CMSアプリケーションのバックエンドAPIは、GraphQLを使用してデータの取得と操作を行います。APIスキーマは主に以下のエンティティで構成されています：

1. **リポジトリ（Repository）**
   - コンテンツを論理的にグループ化する単位
   - 名前、説明、公開設定などの属性を持つ

2. **コンテンツ（Content）**
   - リポジトリに属する実際のコンテンツ項目
   - タイトル、説明、本文、ステータスなどの属性を持つ

3. **プロパティ（Property）**
   - コンテンツのメタデータやカスタムフィールドを定義
   - 様々な型（文字列、数値、選択肢など）をサポート

## 🔍 クエリ

### リポジトリ関連クエリ

#### リポジトリ一覧の取得

```graphql
query GetRepositories {
  repositories {
    id
    name
    description
    isPublic
    createdAt
    updatedAt
  }
}
```

#### 特定のリポジトリの取得

```graphql
query GetRepository($id: ID!) {
  repository(id: $id) {
    id
    name
    description
    isPublic
    createdAt
    updatedAt
  }
}
```

### コンテンツ関連クエリ

#### リポジトリに属するコンテンツ一覧の取得

```graphql
query GetContents($repositoryId: ID!) {
  contents(repositoryId: $repositoryId) {
    id
    title
    description
    status
    createdAt
    updatedAt
  }
}
```

#### 特定のコンテンツの取得

```graphql
query GetContent($id: ID!) {
  content(id: $id) {
    id
    title
    description
    body
    status
    createdAt
    updatedAt
  }
}
```

## ✏️ ミューテーション

### コンテンツ操作

#### コンテンツの作成

```graphql
mutation CreateContent($input: CreateContentInput!) {
  createContent(input: $input) {
    id
    title
    description
    body
    status
    createdAt
    updatedAt
  }
}
```

入力パラメータ:
```typescript
interface CreateContentInput {
  repositoryId: string;
  title: string;
  description?: string;
  body: string;
  status?: ContentStatus; // デフォルトは「下書き」
}
```

#### コンテンツの更新

```graphql
mutation UpdateContent($id: ID!, $input: UpdateContentInput!) {
  updateContent(id: $id, input: $input) {
    id
    title
    description
    body
    status
    createdAt
    updatedAt
  }
}
```

入力パラメータ:
```typescript
interface UpdateContentInput {
  title?: string;
  description?: string;
  body?: string;
  status?: ContentStatus;
}
```

#### コンテンツの削除

```graphql
mutation DeleteContent($id: ID!) {
  deleteContent(id: $id)
}
```

#### コンテンツの公開

```graphql
mutation PublishContent($id: ID!) {
  publishContent(id: $id) {
    id
    status
    updatedAt
  }
}
```

#### コンテンツの非公開

```graphql
mutation UnpublishContent($id: ID!) {
  unpublishContent(id: $id) {
    id
    status
    updatedAt
  }
}
```

## 📚 型定義

### 主要な型

#### ContentStatus

コンテンツの公開状態を表す列挙型:

```typescript
enum ContentStatus {
  DRAFT      // 下書き
  PUBLISHED  // 公開済み
  ARCHIVED   // アーカイブ済み
}
```

#### Repository

リポジトリを表すオブジェクト型:

```typescript
type Repository {
  id: ID!
  name: String!
  description: String
  isPublic: Boolean!
  contents: [Content!]!
  createdAt: DateTime!
  updatedAt: DateTime!
}
```

#### Content

コンテンツを表すオブジェクト型:

```typescript
type Content {
  id: ID!
  repositoryId: ID!
  title: String!
  description: String
  body: String!
  status: ContentStatus!
  properties: [PropertyData!]!
  createdAt: DateTime!
  updatedAt: DateTime!
}
```

#### PropertyData

コンテンツのプロパティデータを表すオブジェクト型:

```typescript
type PropertyData {
  propertyId: ID!
  value: PropertyValue!
}
```

#### PropertyValue

プロパティの値を表すユニオン型:

```typescript
union PropertyValue = 
  | StringValue 
  | IntegerValue 
  | HtmlValue
  | SelectValue
  | MultiSelectValue
  | RelationValue
  | IdValue
  | LocationValue
```

## 🔄 コード生成

GraphQLスキーマから型安全なTypeScript型定義とAPI関数を自動生成するためのcodegenを使用しています。

```yaml
# codegen.yml
schema: http://localhost:8080/graphql
documents: ./src/graphql/**/*.graphql
generates:
  ./src/gen/api/$api.ts:
    plugins:
      - typescript
      - typescript-operations
      - typescript-graphql-request
    config:
      scalars:
        DateTime: string
        UUID: string
      skipTypename: true
      avoidOptionals: true
```

## 📡 APIの使用方法

### クライアントの初期化

```typescript
import { GraphQLClient } from 'graphql-request';
import { getSdk } from '@/gen/api/$api';

const client = new GraphQLClient('http://localhost:8080/graphql');
const sdk = getSdk(client);
```

### クエリの実行

```typescript
// リポジトリ一覧の取得
const { repositories } = await sdk.GetRepositories();

// 特定のリポジトリの取得
const { repository } = await sdk.GetRepository({ id: 'repo_123' });

// リポジトリに属するコンテンツの取得
const { contents } = await sdk.GetContents({ repositoryId: 'repo_123' });
```

### ミューテーションの実行

```typescript
// コンテンツの作成
const { createContent } = await sdk.CreateContent({
  input: {
    repositoryId: 'repo_123',
    title: '新しいコンテンツ',
    description: 'これは新しいコンテンツの説明です',
    body: '# コンテンツ本文\nこれはマークダウン形式で書かれたコンテンツです。'
  }
});

// コンテンツの公開
const { publishContent } = await sdk.PublishContent({ id: 'content_123' });
```

## 🔐 認証と認可

APIへのアクセスは認証と認可のメカニズムによって保護されています：

1. **認証**: JWT（JSON Web Token）を使用してユーザーを認証
2. **認可**: ユーザーロールとパーミッションに基づいてアクセス制御

認証ヘッダーの設定:

```typescript
const client = new GraphQLClient('http://localhost:8080/graphql', {
  headers: {
    Authorization: `Bearer ${token}`
  }
});
```

## 📋 エラーハンドリング

GraphQLエラーは統一された形式で返されます：

```typescript
{
  "errors": [
    {
      "message": "エラーメッセージ",
      "locations": [{ "line": 2, "column": 3 }],
      "path": ["mutation", "createContent"],
      "extensions": {
        "code": "FORBIDDEN",
        "exception": {
          "stacktrace": [...]
        }
      }
    }
  ],
  "data": null
}
```

アプリケーション内でのエラーハンドリング例:

```typescript
try {
  const { createContent } = await sdk.CreateContent({
    input: { /* ... */ }
  });
} catch (error) {
  if (error.response?.errors) {
    // GraphQLエラーの処理
    const graphqlError = error.response.errors[0];
    const errorCode = graphqlError.extensions?.code;
    const errorMessage = graphqlError.message;
    
    switch (errorCode) {
      case 'FORBIDDEN':
        // 権限エラーの処理
        break;
      case 'BAD_USER_INPUT':
        // 入力検証エラーの処理
        break;
      default:
        // その他のエラーの処理
        break;
    }
  } else {
    // ネットワークエラーなどの処理
  }
}
```

## 📈 パフォーマンス最適化

### クエリの最適化

1. **必要なフィールドのみ取得**: 必要なフィールドのみをクエリに含めることでレスポンスサイズを削減
2. **ページネーション**: 大量のデータを取得する場合はページネーションを使用
3. **キャッシング**: SWRによるクライアントサイドキャッシングの活用

### バッチ処理

複数の操作を一度に実行することで、ネットワークリクエストを削減:

```graphql
mutation BatchOperations {
  createContent(input: { ... }) {
    id
  }
  updateContent(id: "content_456", input: { ... }) {
    id
  }
  publishContent(id: "content_789") {
    id
  }
}
```

## 📝 今後の拡張予定

1. **リアルタイム更新**:
   - GraphQLサブスクリプションによるリアルタイム更新機能

2. **高度なフィルタリングとソート**:
   - より柔軟なフィルタリングとソートオプション
   - 全文検索機能

3. **バージョン管理**:
   - コンテンツの変更履歴の取得と復元
   - バージョン間の差分表示

4. **バッチ処理とインポート/エクスポート**:
   - 複数コンテンツの一括処理
   - コンテンツのインポート/エクスポート機能 