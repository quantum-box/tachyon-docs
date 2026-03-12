# Library APIと連携するフロントエンド開発プロンプト

このプロンプトは、v0などのAIツールを使用してLibrary APIと連携するフロントエンドアプリケーションを開発するためのガイドラインです。

## 基本情報

- フレームワーク: Next.js (App Router)
- スタイリング: Tailwind CSS
- UIコンポーネント: Shadcn UI
- 状態管理: React Query
- APIクライアント: REST API (fetch/axios)

## システム概要

Library APIは、組織、リポジトリ、プロパティ、データを管理するためのCMSとして機能します。フロントエンドアプリケーションは、このAPIと連携してデータのCRUD操作を行います。

## 主要な機能要件

1. 組織とリポジトリの一覧表示
2. リポジトリ内のデータ一覧表示
3. データの詳細表示
4. データの作成、編集、削除
5. プロパティに基づいたフォーム生成
6. 認証と権限管理

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

### 主要なエンドポイント

#### 組織

- `GET /organizations` - 組織一覧の取得
- `GET /organizations/{username}` - 特定の組織の取得
- `POST /organizations` - 新しい組織の作成
- `PUT /organizations/{username}` - 組織の更新
- `DELETE /organizations/{username}` - 組織の削除

#### リポジトリ

- `GET /organizations/{orgUsername}/repositories` - リポジトリ一覧の取得
- `GET /organizations/{orgUsername}/repositories/{repoUsername}` - 特定のリポジトリの取得
- `POST /organizations/{orgUsername}/repositories` - 新しいリポジトリの作成
- `PUT /organizations/{orgUsername}/repositories/{repoUsername}` - リポジトリの更新
- `DELETE /organizations/{orgUsername}/repositories/{repoUsername}` - リポジトリの削除

#### プロパティ

- `GET /organizations/{orgUsername}/repositories/{repoUsername}/properties` - プロパティ一覧の取得
- `GET /organizations/{orgUsername}/repositories/{repoUsername}/properties/{propertyId}` - 特定のプロパティの取得
- `POST /organizations/{orgUsername}/repositories/{repoUsername}/properties` - 新しいプロパティの作成
- `PUT /organizations/{orgUsername}/repositories/{repoUsername}/properties/{propertyId}` - プロパティの更新
- `DELETE /organizations/{orgUsername}/repositories/{repoUsername}/properties/{propertyId}` - プロパティの削除

#### データ

- `GET /organizations/{orgUsername}/repositories/{repoUsername}/data` - データ一覧の取得
- `GET /organizations/{orgUsername}/repositories/{repoUsername}/data/{dataId}` - 特定のデータの取得
- `POST /organizations/{orgUsername}/repositories/{repoUsername}/data` - 新しいデータの作成
- `PUT /organizations/{orgUsername}/repositories/{repoUsername}/data/{dataId}` - データの更新
- `DELETE /organizations/{orgUsername}/repositories/{repoUsername}/data/{dataId}` - データの削除

## プロンプト例

### 組織一覧ページの作成

```
Next.jsのApp Routerを使用して、Library APIから組織一覧を取得して表示するページを作成してください。以下の要件を満たす必要があります：

1. `/organizations`のルートで表示される
2. REST APIを使用して組織一覧を取得する
3. 各組織のカードには、名前、ユーザー名、説明を表示する
4. カードをクリックすると、その組織の詳細ページに遷移する
5. ローディング状態とエラー状態を適切に処理する
6. レスポンシブデザインを実装する
7. Shadcn UIのコンポーネントを使用する

APIエンドポイント：
GET https://api.example.com/v1/organizations

レスポンス例：
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

### リポジトリ一覧ページの作成

```
特定の組織に属するリポジトリ一覧を表示するページを作成してください。以下の要件を満たす必要があります：

1. `/organizations/[username]/repositories`のルートで表示される
2. URLパラメータから組織のユーザー名を取得する
3. REST APIを使用してリポジトリ一覧を取得する
4. 各リポジトリのカードには、名前、説明、公開/非公開ステータスを表示する
5. カードをクリックすると、そのリポジトリの詳細ページに遷移する
6. 新しいリポジトリを作成するボタンを追加する
7. ローディング状態とエラー状態を適切に処理する

APIエンドポイント：
GET https://api.example.com/v1/organizations/{username}/repositories

レスポンス例：
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

### データ一覧ページの作成

```
特定のリポジトリに属するデータ一覧を表示するページを作成してください。以下の要件を満たす必要があります：

1. `/organizations/[orgUsername]/repositories/[repoUsername]/data`のルートで表示される
2. URLパラメータから組織とリポジトリのユーザー名を取得する
3. REST APIを使用してデータ一覧を取得する
4. データをテーブル形式で表示し、ページネーションを実装する
5. 各行をクリックすると、そのデータの詳細ページに遷移する
6. 新しいデータを作成するボタンを追加する
7. データを検索するための検索ボックスを実装する
8. ローディング状態とエラー状態を適切に処理する

APIエンドポイント：
GET https://api.example.com/v1/organizations/{orgUsername}/repositories/{repoUsername}/data?page=1&pageSize=10

レスポンス例：
```json
{
  "items": [
    {
      "id": "dt_01hkz3700yt46snfewzpakeyj4",
      "name": "サンプルデータ1",
      "createdAt": "2023-01-01T00:00:00Z",
      "updatedAt": "2023-01-01T00:00:00Z"
    },
    {
      "id": "dt_02hkz3700yt46snfewzpakeyj4",
      "name": "サンプルデータ2",
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

### データ詳細ページの作成

```
特定のデータの詳細を表示するページを作成してください。以下の要件を満たす必要があります：

1. `/organizations/[orgUsername]/repositories/[repoUsername]/data/[dataId]`のルートで表示される
2. URLパラメータから組織、リポジトリのユーザー名、データIDを取得する
3. REST APIを使用してデータの詳細を取得する
4. プロパティの種類に応じて、適切なフォーマットでデータを表示する
5. データを編集するボタンと削除するボタンを追加する
6. ローディング状態とエラー状態を適切に処理する

APIエンドポイント：
GET https://api.example.com/v1/organizations/{orgUsername}/repositories/{repoUsername}/data/{dataId}

レスポンス例：
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

APIエンドポイント（プロパティ情報の取得）：
GET https://api.example.com/v1/organizations/{orgUsername}/repositories/{repoUsername}/properties

### データ作成フォームの作成

```
新しいデータを作成するためのフォームコンポーネントを作成してください。以下の要件を満たす必要があります：

1. プロパティの種類に応じて、適切なフォーム要素を動的に生成する
2. 文字列プロパティにはテキスト入力フィールドを使用する
3. 整数プロパティには数値入力フィールドを使用する
4. HTML プロパティにはリッチテキストエディタを使用する
5. 選択プロパティにはドロップダウンを使用する
6. 複数選択プロパティにはチェックボックスグループを使用する
7. リレーションプロパティには関連データを選択するためのコンポーネントを使用する
8. 位置情報プロパティには緯度と経度の入力フィールドを使用する
9. バリデーションを実装し、エラーメッセージを表示する
10. フォーム送信時にREST APIを呼び出す

APIエンドポイント（プロパティ情報の取得）：
GET https://api.example.com/v1/organizations/{orgUsername}/repositories/{repoUsername}/properties

APIエンドポイント（データの作成）：
POST https://api.example.com/v1/organizations/{orgUsername}/repositories/{repoUsername}/data

リクエスト例：
```json
{
  "actor": "us_01hkz3700yt46snfewzpakeyj4",
  "dataName": "新しいデータ",
  "propertyData": [
    {
      "propertyId": "pr_01hkz3700yt46snfewzpakeyj4",
      "value": {
        "string": "新しいタイトル"
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

### データ編集フォームの作成

```
既存のデータを編集するためのフォームコンポーネントを作成してください。以下の要件を満たす必要があります：

1. 既存のデータ値をフォームに初期値として設定する
2. プロパティの種類に応じて、適切なフォーム要素を動的に生成する
3. 文字列プロパティにはテキスト入力フィールドを使用する
4. 整数プロパティには数値入力フィールドを使用する
5. HTML プロパティにはリッチテキストエディタを使用する
6. 選択プロパティにはドロップダウンを使用する
7. 複数選択プロパティにはチェックボックスグループを使用する
8. リレーションプロパティには関連データを選択するためのコンポーネントを使用する
9. 位置情報プロパティには緯度と経度の入力フィールドを使用する
10. バリデーションを実装し、エラーメッセージを表示する
11. フォーム送信時にREST APIを呼び出す

APIエンドポイント（データの更新）：
PUT https://api.example.com/v1/organizations/{orgUsername}/repositories/{repoUsername}/data/{dataId}

リクエスト例：
```json
{
  "actor": "us_01hkz3700yt46snfewzpakeyj4",
  "dataName": "更新されたデータ",
  "propertyData": [
    {
      "propertyId": "pr_01hkz3700yt46snfewzpakeyj4",
      "value": {
        "string": "更新されたタイトル"
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

## コンポーネント設計

フロントエンド開発では、以下のコンポーネント設計を考慮してください：

### 共通コンポーネント

1. **DataTable**: データを表形式で表示するコンポーネント
   - ソート機能
   - ページネーション
   - 行選択機能

2. **PropertyValueDisplay**: プロパティの種類に応じてデータ値を表示するコンポーネント
   - 文字列、整数、HTMLなど各種タイプに対応
   - リレーションデータの表示

3. **PropertyFormField**: プロパティの種類に応じたフォームフィールドを生成するコンポーネント
   - 文字列、整数、HTMLなど各種タイプに対応
   - バリデーション機能

4. **SearchFilter**: データ検索用のフィルターコンポーネント
   - プロパティに基づいたフィルター条件

### ページコンポーネント

1. **OrganizationListPage**: 組織一覧を表示するページ
2. **OrganizationDetailPage**: 組織の詳細を表示するページ
3. **RepoListPage**: リポジトリ一覧を表示するページ
4. **RepoDetailPage**: リポジトリの詳細を表示するページ
5. **DataListPage**: データ一覧を表示するページ
6. **DataDetailPage**: データの詳細を表示するページ
7. **DataCreatePage**: 新しいデータを作成するページ
8. **DataEditPage**: 既存のデータを編集するページ

## APIクライアントの設定

REST APIと通信するためのAPIクライアントの設定例：

```typescript
// api/client.ts
import axios from 'axios';

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// リクエストインターセプター
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// レスポンスインターセプター
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // エラーハンドリング
    if (error.response) {
      // サーバーからのレスポンスがある場合
      if (error.response.status === 401) {
        // 認証エラー
        localStorage.removeItem('authToken');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
```

## エラーハンドリング

REST APIのエラーを適切に処理するためのユーティリティ関数：

```typescript
import axios, { AxiosError } from 'axios';

export function handleApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ error?: { message?: string, code?: string } }>;
    
    if (axiosError.response) {
      const status = axiosError.response.status;
      const errorData = axiosError.response.data;
      
      // エラーコードに基づいて適切なメッセージを返す
      switch (status) {
        case 401:
          return '認証エラー: ログインしてください';
        case 403:
          return '権限エラー: この操作を実行する権限がありません';
        case 400:
          return `入力エラー: ${errorData?.error?.message || '無効な入力です'}`;
        case 404:
          return 'リソースが見つかりません';
        case 422:
          return `ビジネスロジックエラー: ${errorData?.error?.message || 'リクエストを処理できませんでした'}`;
        case 500:
          return 'サーバーエラー: 後でもう一度お試しください';
        default:
          return `エラー (${status}): ${errorData?.error?.message || '不明なエラーが発生しました'}`;
      }
    }
    
    if (axiosError.request) {
      return 'ネットワークエラー: サーバーに接続できませんでした';
    }
  }
  
  return `エラー: ${error instanceof Error ? error.message : '不明なエラーが発生しました'}`;
}
```

## 認証と権限管理

認証状態を管理するためのカスタムフック：

```typescript
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import apiClient from '../api/client';
import { handleApiError } from '../utils/error';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  
  useEffect(() => {
    // ローカルストレージからユーザー情報を取得
    const storedUser = localStorage.getItem('user');
    
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    
    setLoading(false);
  }, []);
  
  const login = async (email, password) => {
    try {
      const response = await apiClient.post('/auth/login', { email, password });
      const { user, token } = response.data;
      
      // ユーザー情報をローカルストレージに保存
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('authToken', token);
      
      setUser(user);
      return { success: true };
    } catch (error) {
      return { success: false, error: handleApiError(error) };
    }
  };
  
  const logout = () => {
    // ログアウト処理
    localStorage.removeItem('user');
    localStorage.removeItem('authToken');
    
    setUser(null);
    
    // ログインページにリダイレクト
    router.push('/login');
  };
  
  return { user, loading, login, logout };
}
```

## まとめ

このプロンプトを使用して、v0などのAIツールにLibrary APIと連携するフロントエンドアプリケーションの開発を指示できます。プロンプトには、必要なコンポーネント、ページ、APIクライアントの設定、エラーハンドリング、認証と権限管理などの情報が含まれています。

## タスクリスト

✅ 基本情報の提供
✅ システム概要の説明
✅ 主要な機能要件の定義
✅ REST APIエンドポイントの提供
✅ プロンプト例の作成
✅ コンポーネント設計の説明
✅ APIクライアントの設定例の提供
✅ エラーハンドリングの説明
✅ 認証と権限管理の説明
