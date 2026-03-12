---
title: Library GitHub風OGP画像の実装
type: feature
emoji: "🖼️"
topics:
  - Library
  - OGP
  - Next.js
  - SEO
published: true
targetFiles:
  - apps/library/src/app/v1beta/[org]/page.tsx
  - apps/library/src/app/v1beta/[org]/[repo]/page.tsx
  - apps/library/src/app/v1beta/[org]/[repo]/data/[dataId]/page.tsx
  - apps/library/src/app/(open-graph)/api/[org]/[repo]/og/route.tsx
github: https://github.com/quantum-box/tachyon-apps
---

# Library GitHub風OGP画像の実装

## 概要

LibraryのOrganization（組織）、Repository（リポジトリ）、Data（データ）の各ページに、GitHub風の洗練されたOGP（Open Graph Protocol）画像を動的に生成・設定できるようにする。SNS等でリンクを共有した際に、視覚的に魅力的なプレビューカードを表示する。

## 背景・目的

- **なぜこのタスクが必要なのか**
  - Libraryのコンテンツを外部共有する際、現状では汎用的なOGP画像しか表示されない
  - GitHubのように各リポジトリ固有の情報を含んだOGP画像があると、共有時の視認性・クリック率が向上する
  - 組織のブランディングやコンテンツの魅力を伝える機会が失われている

- **解決したい課題**
  - Organization, Repository, Dataそれぞれに適したOGP画像の動的生成
  - メタデータの適切な設定（title, description, og:image等）

- **期待される成果・メリット**
  - SNS共有時の視認性向上とクリック率改善
  - コンテンツの魅力的なプレビュー表示
  - プロフェッショナルな印象の付与

## 詳細仕様

### 機能要件

1. **Organization OGP画像**
   - 組織名の表示
   - 組織のアバター/ロゴ（存在する場合）
   - 説明文（description）
   - リポジトリ数・メンバー数等の統計情報

2. **Repository OGP画像**
   - 組織名 / リポジトリ名のパス表示
   - リポジトリの説明文
   - タグ/ラベル（上位3-5個）
   - データ件数、コントリビューター数等の統計
   - 公開/非公開ステータスのバッジ

3. **Data OGP画像**
   - 組織名 / リポジトリ名 / データ名のパス表示
   - データのタイトル
   - プロパティのサマリー（主要なフィールド値）
   - 最終更新日時

4. **メタデータ設定**
   - 各ページに `generateMetadata` 関数を実装
   - `og:title`, `og:description`, `og:image`, `og:type` の適切な設定
   - Twitter Card (`twitter:card`, `twitter:image`) の設定

### 非機能要件

- **パフォーマンス**: OG画像生成は1秒以内に完了
- **キャッシュ**: 画像はCDNでキャッシュ可能な形式で提供
- **アクセシビリティ**: 適切なalt属性の設定
- **レスポンシブ**: OGP推奨サイズ（1200x630px）での生成

### デザイン仕様

```yaml
ogp_image:
  size:
    width: 1200
    height: 630
  
  design_elements:
    background:
      type: gradient  # GitHub風のグラデーション
      colors: ["#0d1117", "#161b22"]  # ダークテーマベース
    
    logo:
      position: top-left
      size: 48px
      source: Library logo
    
    title:
      font_size: 48-64px
      font_weight: 700
      color: "#ffffff"
    
    path:
      font_size: 24px
      color: "#8b949e"  # muted color
    
    description:
      font_size: 24px
      color: "#c9d1d9"
      max_lines: 2
    
    stats:
      font_size: 18px
      color: "#8b949e"
      icons: true  # データ数、コントリビューター数等
    
    tags:
      background: "#21262d"
      text_color: "#58a6ff"
      border_radius: 12px
      max_count: 4

  variants:
    organization:
      - logo (center or left)
      - organization name (large)
      - description
      - stats: repos count, members count
    
    repository:
      - path: "org / repo"
      - repository name (large)
      - description
      - tags (if any)
      - stats: data count, contributors
      - visibility badge (public/private)
    
    data:
      - path: "org / repo / data"
      - data title (large)
      - property summary (2-3 key values)
      - last updated
```

## 実装方針

### アーキテクチャ設計

```
apps/library/src/app/
├── (open-graph)/
│   └── api/
│       ├── [org]/
│       │   └── og/
│       │       └── route.tsx          # Organization OGP画像生成
│       └── [org]/
│           └── [repo]/
│               ├── og/
│               │   └── route.tsx      # Repository OGP画像生成 (既存を改善)
│               └── [dataId]/
│                   └── og/
│                       └── route.tsx  # Data OGP画像生成
└── v1beta/
    ├── [org]/
    │   ├── page.tsx                   # + generateMetadata
    │   └── [repo]/
    │       ├── page.tsx               # + generateMetadata
    │       └── data/
    │           └── [dataId]/
    │               └── page.tsx       # + generateMetadata
```

### 技術選定

- **OGP画像生成**: `next/og` の `ImageResponse` を使用（Vercel Edge Runtime対応）
- **フォント**: Google Fonts から Inter または Noto Sans JP を動的読み込み
- **スタイリング**: インライン CSS（ImageResponse の制約上）
- **データ取得**: 既存のGraphQL API経由でデータを取得

### OGP画像生成の共通コンポーネント

```tsx
// apps/library/src/app/(open-graph)/components/og-base.tsx
interface OgBaseProps {
  path: string        // e.g., "org / repo / data"
  title: string
  description?: string
  stats?: { label: string; value: string | number; icon?: string }[]
  tags?: string[]
  badge?: { text: string; variant: 'public' | 'private' }
}
```

## タスク分解

### 主要タスク

- [ ] 共通OGPコンポーネントの設計・実装
- [ ] Organization OGP画像APIの実装
- [ ] Repository OGP画像APIの改善（既存実装のリファクタ）
- [ ] Data OGP画像APIの実装
- [ ] 各ページへの `generateMetadata` 追加
- [ ] デザインの調整・最終確認
- [ ] 動作確認・テスト

## Playwright MCPによる動作確認

### 実施タイミング
- [ ] OGP画像API実装完了後
- [ ] generateMetadata実装完了後
- [ ] 最終デザイン確認

### 動作確認チェックリスト

#### Organization OGP
- [ ] `/api/[org]/og` エンドポイントにアクセスし画像が生成される
- [ ] 組織名、説明、統計情報が正しく表示される
- [ ] `/v1beta/[org]` のページメタデータにog:imageが設定されている

#### Repository OGP
- [ ] `/api/[org]/[repo]/og` エンドポイントにアクセスし画像が生成される
- [ ] パス、リポジトリ名、説明、タグ、統計が正しく表示される
- [ ] 公開/非公開バッジが適切に表示される
- [ ] `/v1beta/[org]/[repo]` のページメタデータにog:imageが設定されている

#### Data OGP
- [ ] `/api/[org]/[repo]/[dataId]/og` エンドポイントにアクセスし画像が生成される
- [ ] パス、データタイトル、プロパティサマリーが正しく表示される
- [ ] `/v1beta/[org]/[repo]/data/[dataId]` のページメタデータにog:imageが設定されている

#### 外部ツールでの確認
- [ ] [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/)でOGPを確認
- [ ] [Twitter Card Validator](https://cards-dev.twitter.com/validator)でTwitter Cardを確認
- [ ] [OGP確認ツール](https://ogp.me/)で全メタデータを検証

### 確認時の注意事項
- [ ] 日本語テキストが正しくレンダリングされる
- [ ] 長いテキストが適切に省略される
- [ ] 画像サイズが1200x630pxである
- [ ] Content-Typeが`image/png`である

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 日本語フォントの読み込み失敗 | 中 | フォールバックフォントの設定、Google Fonts CDN利用 |
| OGP画像生成の遅延 | 中 | キャッシュヘッダーの設定、Edge Runtimeの活用 |
| GraphQLデータ取得エラー | 低 | エラー時のデフォルト画像表示、適切なエラーハンドリング |
| 長いテキストのオーバーフロー | 低 | 文字数制限と省略記号の表示 |

## 参考資料

- [Next.js OG Image Generation](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image)
- [Vercel OG (@vercel/og)](https://vercel.com/docs/functions/og-image-generation)
- [GitHub Repository OGP例](https://github.com/vercel/next.js)
- [Open Graph Protocol](https://ogp.me/)
- [Twitter Cards](https://developer.twitter.com/en/docs/twitter-for-websites/cards/overview/abouts-cards)

## 完了条件

- [x] Organization, Repository, Dataの各ページで動的OGP画像が生成される
- [x] 各ページに適切な `generateMetadata` が設定されている
- [x] GitHub風のデザインが実装されている
- [x] SNS共有時に正しくプレビューが表示される
- [x] 動作確認レポートが完成している
- [x] 正式な仕様ドキュメントを作成済み (`docs/src/services/library/ogp-images.md`)
- [x] タスクディレクトリを completed/library-v1.5.0/ に移動済み

### バージョン番号の決定基準

**マイナーバージョン（x.X.x）を上げる場合:**
- [x] 新機能の追加
- [x] 新しいAPIエンドポイントの追加（OGP画像生成API）

このタスクは新機能追加のため、完了時に library-v1.4.0 → library-v1.5.0 にバージョンを上げる。

## 備考

- 既存の `/api/[org]/[repo]/og/route.tsx` は基本的な実装があるため、これを拡張・改善する形で進める
- 将来的にはユーザーがカスタムOGP画像をアップロードできる機能も検討

