# Library OGP画像生成機能

## 概要

LibraryのOrganization、Repository、DataページにGitHub風の動的OGP（Open Graph Protocol）画像を生成する機能。SNSでリンクを共有した際に、視覚的に魅力的なプレビューカードを表示する。

## 機能

### OGP画像生成API

| エンドポイント | 用途 | パラメータ |
|---------------|------|------------|
| `/api/[org]/og` | Organization OGP画像 | `name`, `description`, `repos`, `members` |
| `/api/[org]/[repo]/og` | Repository OGP画像 | `name`, `description`, `public`, `data`, `contributors`, `tags` |
| `/api/[org]/[repo]/[dataId]/og` | Data OGP画像 | `title`, `summary`, `updated` |

### メタデータ設定

各ページで`generateMetadata`関数により以下のメタタグが設定される：

- `og:title` - ページタイトル
- `og:description` - 説明文
- `og:image` - 動的生成されるOGP画像URL（1200x630px）
- `og:type` - profile / website / article
- `twitter:card` - summary_large_image
- `twitter:title` - ページタイトル
- `twitter:image` - OGP画像URL

### デザイン仕様

```yaml
design:
  size: 1200x630px
  background: "linear-gradient(135deg, #0d1117 0%, #161b22 50%, #1c2128 100%)"
  font_family: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
  
  elements:
    logo:
      position: top-left
      color: "#58a6ff"
    
    title:
      font_size: 56-64px
      font_weight: 700
      color: "#ffffff"
    
    path:
      font_size: 24px
      color: "#8b949e"
    
    description:
      font_size: 24px
      color: "#c9d1d9"
      max_length: 150 characters
    
    tags:
      background: "#21262d"
      text_color: "#58a6ff"
      border: "1px solid #30363d"
      border_radius: 16px
      max_count: 4
    
    badge:
      public:
        background: "#238636"
        text: "Public"
      private:
        background: "#6e7681"
        text: "Private"
    
    stats:
      font_size: 18px
      color: "#8b949e"
      icons: repositories, members, data, contributors
```

## 技術スタック

- **Next.js `ImageResponse`**: Edge Runtimeで動的画像生成
- **GraphQL**: OGPメタデータ取得用クエリ
- **Server Components**: `generateMetadata`による静的メタデータ生成

## 関連ファイル

### OGP画像生成

- `apps/library/src/app/(open-graph)/components/og-base.tsx` - 共通OGPコンポーネント
- `apps/library/src/app/api/[org]/og/route.tsx` - Organization OGP API
- `apps/library/src/app/api/[org]/[repo]/og/route.tsx` - Repository OGP API
- `apps/library/src/app/api/[org]/[repo]/[dataId]/og/route.tsx` - Data OGP API

### メタデータ生成

- `apps/library/src/app/v1beta/[org]/page.tsx` - Organization generateMetadata
- `apps/library/src/app/v1beta/[org]/[repo]/page.tsx` - Repository generateMetadata
- `apps/library/src/app/v1beta/[org]/[repo]/data/[dataId]/page.tsx` - Data generateMetadata

### GraphQLクエリ

- `apps/library/src/app/v1beta/[org]/ogp.graphql`
- `apps/library/src/app/v1beta/[org]/[repo]/ogp.graphql`
- `apps/library/src/app/v1beta/[org]/[repo]/data/[dataId]/ogp.graphql`

## 環境変数

| 変数名 | 説明 | デフォルト |
|--------|------|-----------|
| `NEXT_PUBLIC_APP_URL` | OGP画像URLのベースURL | `http://localhost:3000` |

## 注意事項

- OGP画像APIは認証不要で公開アクセス可能
- `generateMetadata`でのGraphQL呼び出しに失敗した場合でも、フォールバックとしてOG画像URLが生成される
- OGP画像は`next/og`の`ImageResponse`を使用してEdge Runtimeで生成される

