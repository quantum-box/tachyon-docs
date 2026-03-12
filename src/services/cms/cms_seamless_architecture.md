---
title: "CMSシームレスアーキテクチャと実装計画"
topics: ["cms", "architecture", "seamless", "implementation", "api"]
type: "tech"
published: false
targetFiles: ["apps/cms"]
---

# CMSシームレスアーキテクチャと実装計画

このドキュメントでは、CMSアプリケーションのシームレスアーキテクチャと実装計画を説明します。Next.jsのUIコンポーネント、APIルートを使用したライブラリAPIへの中間層、およびCloudflareへのデプロイまでを包括的にカバーします。

## 🚀 実装状況

| フェーズ | 内容 | 状態 |
|--------|------|------|
| 準備 | 現状調査とコード分析 | ✅ 完了 |
| 1 | OpenNextによるCloudflareデプロイ | ✅ 完了 |
| 2 | API中間層の基本実装 | 📅 予定 |
| 3 | リポジトリ・コンテンツ管理UI実装 | 📅 予定 |
| 4 | 認証・権限システムの統合 | 📅 予定 |
| 5 | 高度な機能とエディタの実装 | 📅 予定 |
| 検証 | 統合テストとバグ修正 | 📅 予定 |
| 文書化 | 開発者ドキュメント作成 | 📅 予定 |

## 📐 シームレスアーキテクチャ概要

CMSアプリケーションは以下の3層アーキテクチャで構成されます：

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│                 │    │                 │    │                 │
│   Next.js UI    │────▶   API Routes    │────▶   Library API   │
│   Components    │    │   (REST API)    │    │   (GraphQL)     │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
       React               Server-side            External API
     Components           REST Endpoints          Data Source
```

### アーキテクチャの特徴

1. **クライアント層（Next.js UI）**
   - React コンポーネントとカスタムフック
   - SWRを使用したデータフェッチング
   - ユーザーインタラクションとUI状態管理

2. **API中間層（Next.js API Routes）**
   - RESTful APIエンドポイント
   - ライブラリAPIへのプロキシとデータ変換
   - 認証・認可の一元管理
   - キャッシュ戦略の実装

3. **データ層（Library API）**
   - GraphQLベースのコンテンツ管理API
   - データの永続化と取得
   - コンテンツモデルとスキーマ定義

## 📋 フェーズ別詳細実装計画

### 準備フェーズ：現状調査とコード分析

**目標**: アーキテクチャ設計と技術選定を完了する

**主要タスク**:
- ライブラリAPIのスキーマ調査と分析
- 必要なAPIエンドポイントの洗い出し
- UIコンポーネント設計と要件定義
- 技術スタックの確定

**成果物**:
- アーキテクチャ設計書
- APIエンドポイント一覧
- コンポーネント構成図

### フェーズ1：OpenNextによるCloudflareデプロイ

**目標**: パフォーマンスとセキュリティを向上させたデプロイを早期に実現する

**主要タスク**:
- OpenNextパッケージのインストールと設定
- Wranglerの設定
- 静的アセットキャッシングの最適化
- 環境変数の設定
- デプロイパイプラインの構築
- 最小限のアプリケーション機能で初期デプロイ

**実装手順**:
1. 最小限のCMSアプリケーションの準備（基本的なUIのみ）
2. OpenNext/Cloudflareの環境設定
3. CIパイプラインの構築
4. 初期デプロイとテスト
5. 継続的デプロイの自動化

**注**: 詳細な実装手順は[OpenNextを使用したCloudflareデプロイへのマイグレーション](./cms_opennext_migration.md)を参照してください。

**成果物**:
- 基本機能を持つCloudflareにデプロイされたCMSアプリケーション
- 継続的デプロイのパイプライン
- パフォーマンス最適化設定

### フェーズ2：API中間層の基本実装

**目標**: Next.jsのAPIルートを使用してライブラリAPIへの中間層を構築する

**主要タスク**:
- GraphQLクライアントの実装
- 基本的なAPIルート構造の構築：
  ```
  apps/cms/src/app/api/
  ├── repositories/
  │   ├── route.ts                # リポジトリ一覧取得
  │   └── [username]/
  │       ├── route.ts            # 特定リポジトリの情報取得
  │       └── contents/
  │           ├── route.ts        # コンテンツ一覧取得/作成
  │           └── [id]/
  │               └── route.ts    # 特定コンテンツの操作
  ├── content/
  │   └── [id]/
  │       ├── route.ts            # コンテンツ操作
  │       └── publish/
  │           └── route.ts        # 公開状態管理
  └── auth/
      └── route.ts                # 認証関連
  ```
- 基本的なエラーハンドリングメカニズムの実装
- OpenAPIスキーマ定義の作成

**実装アプローチ**:

1. GraphQLクライアントの実装:
```typescript
// src/lib/api-client.ts
import { GraphQLClient } from 'graphql-request';
import { getSdk } from '@/gen/api/$api';

// 環境変数
const API_ENDPOINT = process.env.LIBRARY_API_ENDPOINT || 'http://localhost:8080/graphql';

// クライアントインスタンス
export const createGraphQLClient = (token?: string) => {
  const client = new GraphQLClient(API_ENDPOINT, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return getSdk(client);
};

// サーバーサイド用クライアント
export const serverGraphQLClient = createGraphQLClient(process.env.API_SECRET_KEY);
```

2. APIルートの実装例（リポジトリ一覧）:
```typescript
// src/app/api/repositories/route.ts
import { NextResponse } from 'next/server';
import { serverGraphQLClient } from '@/lib/api-client';
import { getServerSession } from 'next-auth';

export async function GET(request: Request) {
  try {
    const session = await getServerSession();
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const orgUsername = searchParams.get('org') || 'default-org';
    
    const { repositories } = await serverGraphQLClient.GetRepositories({
      orgUsername
    });
    
    return NextResponse.json({ repositories });
  } catch (error) {
    console.error('Error fetching repositories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch repositories' },
      { status: 500 }
    );
  }
}
```

**成果物**:
- 機能するAPIエンドポイント
- GraphQLクライアントライブラリ
- OpenAPIスキーマ定義

### フェーズ3：リポジトリ・コンテンツ管理UI実装

**目標**: コンテンツ管理のためのUIコンポーネントを実装する

**主要タスク**:
- リポジトリ一覧画面の実装
- コンテンツ一覧画面の実装
- コンテンツ編集画面の基本実装
- APIフックの実装

**実装アプローチ**:

1. APIフックの実装:
```typescript
// src/hooks/useRepositories.ts
export function useRepositories() {
  const { data, error, isLoading, mutate } = useSWR('/api/repositories', fetcher);
  
  return {
    repositories: data?.repositories || [],
    isLoading,
    isError: error,
    refresh: mutate
  };
}

// src/hooks/useContents.ts
export function useContents(repositoryId: string) {
  const { data, error, isLoading, mutate } = useSWR(
    repositoryId ? `/api/repositories/${repositoryId}/contents` : null,
    fetcher
  );
  
  return {
    contents: data?.contents || [],
    isLoading,
    isError: error,
    refresh: mutate
  };
}
```

2. コンテンツ一覧コンポーネントの実装:
```tsx
// src/components/content/ContentsList.tsx
import { useContents } from '@/hooks/useContents';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { PlusIcon, MoreHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

export function ContentsList({ repositoryId }: { repositoryId: string }) {
  const { contents, isLoading, isError, refresh } = useContents(repositoryId);
  const router = useRouter();
  
  // カラム定義
  const columns = [
    {
      accessorKey: 'title',
      header: 'Title',
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.getValue('status');
        return (
          <Badge variant={status === 'PUBLISHED' ? 'success' : 'default'}>
            {status}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'updatedAt',
      header: 'Last Updated',
      cell: ({ row }) => {
        return new Date(row.getValue('updatedAt')).toLocaleDateString();
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const content = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                onClick={() => router.push(`/content/${content.id}`)}
              >
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleDeleteContent(content.id)}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
  
  const handleDeleteContent = async (contentId: string) => {
    // 削除APIの呼び出し
    await fetch(`/api/content/${contentId}`, {
      method: 'DELETE',
    });
    refresh();
  };
  
  if (isLoading) return <div>Loading...</div>;
  if (isError) return <div>Error loading contents</div>;
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <h2 className="text-2xl font-bold">Contents</h2>
        <Button onClick={() => router.push(`/content/new?repository=${repositoryId}`)}>
          <PlusIcon className="mr-2 h-4 w-4" />
          New Content
        </Button>
      </div>
      
      <DataTable columns={columns} data={contents} />
    </div>
  );
}
```

**成果物**:
- 基本的なUIコンポーネント
- データフェッチフック
- 画面間のナビゲーションフロー

### フェーズ4：認証・権限システムの統合

**目標**: セキュアなアクセス制御システムを実装する

**主要タスク**:
- NextAuth.jsを使用した認証システムの実装
- APIルートのミドルウェアによる保護
- ロールベースのアクセス制御
- ログインページとユーザープロファイル画面

**実装アプローチ**:

1. NextAuth.jsの実装:
```typescript
// src/app/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { serverGraphQLClient } from '@/lib/api-client';

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        try {
          // ライブラリAPIでの認証
          const result = await serverGraphQLClient.AuthenticateUser({
            username: credentials.username,
            password: credentials.password
          });
          
          if (result.token) {
            return {
              id: result.user.id,
              name: result.user.name,
              email: result.user.email,
              image: result.user.image,
              role: result.user.role,
              token: result.token
            };
          }
          return null;
        } catch (error) {
          console.error('Authentication error:', error);
          return null;
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.accessToken = user.token;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.accessToken = token.accessToken;
      }
      return session;
    }
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error'
  }
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

2. 認証ミドルウェアの実装:
```typescript
// src/middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(request: NextRequest) {
  // APIルートのみ処理
  if (!request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // 認証不要パスはスキップ
  if (
    request.nextUrl.pathname === '/api/auth/signin' ||
    request.nextUrl.pathname === '/api/auth/callback' ||
    request.nextUrl.pathname.startsWith('/api/auth/')
  ) {
    return NextResponse.next();
  }

  const token = await getToken({ req: request as any });

  if (!token) {
    return new NextResponse(
      JSON.stringify({ error: 'Unauthorized' }),
      { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
```

**成果物**:
- 認証フロー
- 保護されたAPI層
- ユーザー権限管理機能

### フェーズ5：高度な機能とエディタの実装

**目標**: コンテンツ編集のための高度な機能を実装する

**主要タスク**:
- マークダウン/リッチテキストエディタの統合
- メディアアップロード機能
- プレビュー機能
- バージョン履歴管理
- タグとカテゴリ管理

**実装アプローチ**:
```typescript
// src/components/editor/ContentEditor.tsx
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { MDXEditor } from '@/components/mdx-editor';
import { Button } from '@/components/ui/button';
import { SaveIcon, EyeIcon } from 'lucide-react';

export function ContentEditor({ 
  content, 
  onSave, 
  onPreview 
}: ContentEditorProps) {
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const { register, handleSubmit, watch, formState } = useForm({
    defaultValues: {
      title: content?.title || '',
      description: content?.description || '',
      body: content?.body || '',
    }
  });
  
  const bodyContent = watch('body');
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <h1 className="text-2xl font-bold">
          {content ? 'Edit Content' : 'Create Content'}
        </h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setIsPreviewMode(!isPreviewMode)}
          >
            <EyeIcon className="mr-2 h-4 w-4" />
            {isPreviewMode ? 'Edit' : 'Preview'}
          </Button>
          <Button 
            onClick={handleSubmit(onSave)}
            disabled={!formState.isDirty || formState.isSubmitting}
          >
            <SaveIcon className="mr-2 h-4 w-4" />
            Save
          </Button>
        </div>
      </div>
      
      {isPreviewMode ? (
        <div className="prose dark:prose-invert max-w-none p-4 border rounded-md">
          <h1>{watch('title')}</h1>
          <p className="text-muted-foreground">{watch('description')}</p>
          <div className="mt-6">
            <MDXEditor.Preview content={bodyContent} />
          </div>
        </div>
      ) : (
        <form className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="title" className="text-sm font-medium">
              Title
            </label>
            <input
              id="title"
              className="w-full p-2 border rounded-md"
              {...register('title', { required: true })}
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="description" className="text-sm font-medium">
              Description
            </label>
            <textarea
              id="description"
              rows={3}
              className="w-full p-2 border rounded-md"
              {...register('description')}
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="body" className="text-sm font-medium">
              Content
            </label>
            <MDXEditor.Edit
              id="body"
              value={bodyContent}
              onChange={(value) => register('body').onChange({ target: { value } })}
            />
          </div>
        </form>
      )}
    </div>
  );
}
```

**成果物**:
- 高機能エディタ
- メディア管理システム
- コンテンツバージョニング

### 検証フェーズ：統合テストとバグ修正

**目標**: 品質と安定性を確保する

**主要タスク**:
- 単体テストの実装（コンポーネント・フック）
- 統合テスト（APIフロー）
- E2Eテスト（ユーザーフロー）
- パフォーマンス測定と最適化
- アクセシビリティチェック

**テスト戦略**:
- ViTestによるコンポーネントテスト
- MSWによるAPI統合テスト
- Playwrightによるエンドツーエンドテスト

**成果物**:
- テストスイート
- パフォーマンスレポート
- バグトラッキングと修正計画

### 文書化フェーズ：開発者ドキュメント作成

**目標**: 開発者とユーザーのためのドキュメントを整備する

**主要タスク**:
- アーキテクチャドキュメントの作成
- API仕様書の作成
- コンポーネントライブラリのドキュメント
- ユーザーガイドの作成

**成果物**:
- 開発者向けドキュメント
- ユーザーマニュアル
- アーキテクチャ図

## 📊 データフロー

シームレスアーキテクチャにおけるデータフローは以下の通りです：

1. **ユーザーアクション**：ユーザーがUIコンポーネントを操作
2. **クライアントフック**：SWRを使用してAPIルートにリクエスト
3. **APIルート処理**：リクエストを検証し、GraphQLクライアントでライブラリAPIにアクセス
4. **データ変換**：ライブラリAPIからのレスポンスをフロントエンド向けに変換
5. **UI更新**：取得したデータでUIを再レンダリング

```
User → React Components → SWR Hooks → API Routes → GraphQL Client → Library API
  ↑                                                                       |
  └───────────────────── Data Flow ────────────────────────────────────────┘
```

## 🧩 コンポーネント構成

UIコンポーネントは以下の階層構造で設計されています：

```
layouts/           # レイアウトコンポーネント
  ├─ MainLayout    # メインアプリケーションレイアウト
  └─ AuthLayout    # 認証ページレイアウト
  
components/        # 共通コンポーネント
  ├─ ui/           # 基本UIコンポーネント
  ├─ repository/   # リポジトリ関連コンポーネント
  ├─ content/      # コンテンツ関連コンポーネント
  ├─ editor/       # エディタコンポーネント
  └─ shared/       # 共有コンポーネント

hooks/             # カスタムフック
  ├─ api/          # APIアクセスフック
  ├─ auth/         # 認証関連フック
  └─ ui/           # UI状態管理フック
```

## 📅 全体スケジュール

| フェーズ | 期間 | 開始 | 終了 |
|---------|------|------|------|
| 準備 | 1週間 | 第1週 | 第1週 |
| 1: Cloudflareデプロイ | 1週間 | 第2週 | 第2週 |
| 2: API中間層 | 2週間 | 第3週 | 第4週 |
| 3: UI実装 | 2週間 | 第4週 | 第5週 |
| 4: 認証・権限 | 2週間 | 第6週 | 第7週 |
| 5: 高度な機能 | 2週間 | 第8週 | 第9週 |
| 検証 | 2週間 | 第10週 | 第11週 |
| 文書化 | 1週間 | 第12週 | 第12週 |

**全体期間**: 約12週間（3ヶ月）

## 📚 参考資料

- [Next.js App Routerドキュメント](https://nextjs.org/docs/app)
- [SWR データフェッチング](https://swr.vercel.app/)
- [GraphQL Code Generator](https://the-guild.dev/graphql/codegen)
- [OpenNext Cloudflare Integration](https://opennext.js.org/cloudflare/get-started)
- [Library API CMS仕様](../../library-api/library-api-cms-spec.md)
- [aiチャット移行計画](../aichat/assistant_ui_migration_plan.md)

## 📝 次のステップ

1. 準備フェーズの完了
2. Cloudflare/OpenNextデプロイ環境の整備
3. API中間層の実装開始
4. コンポーネント設計の詳細化 