# Library Mobile Responsive & API Page Fix

## Overview
Library の Organization ページとリポジトリ API (Developer Portal) ページのモバイル対応修正。

## Branch
`fix/library-org-tabs-mobile-overflow`

## Tasks

### 1. Organization ページ タブ overflow 修正 ✅
- タブが多すぎてモバイルで横にはみ出す問題を修正
- `overflow-x-auto` + `scrollbar-hide` でタブを横スクロール可能に
- Viewport meta で `maximumScale: 1` を設定
- `globals.css` に `overflow-x-hidden` を追加

**変更ファイル:**
- `apps/library/src/app/globals.css`
- `apps/library/src/app/v1beta/[org]/_components/organization-page-ui.tsx`
- `apps/library/src/app/layout.tsx`
- `apps/library/src/app/v1beta/[org]/_components/organization-page-ui.stories.tsx`

### 2. API ページ ドキュメントURL修正 ✅
- Documentation links が `/swagger-ui` 等を指していたが、実際のバックエンドは `/v1beta/swagger-ui` で提供
- `${apiBaseUrl}/swagger-ui` → `${apiBaseUrl}/v1beta/swagger-ui` に修正
- `${apiBaseUrl}/redoc` → `${apiBaseUrl}/v1beta/redoc` に修正
- `${apiBaseUrl}/api-docs/openapi.json` → `${apiBaseUrl}/v1beta/api-docs/openapi.json` に修正

**変更ファイル:**
- `apps/library/src/app/v1beta/[org]/[repo]/api/_components/api-page-ui.tsx`

### 3. API ページ モバイルレスポンシブ対応 ✅
- エンドポイントパス表示に `truncate` + `min-w-0` を適用してoverflowを防止
- HTTP メソッドバッジとChevronアイコンに `shrink-0` を追加
- ヘッダーに `flex-wrap` を追加
- コンテナに `overflow-hidden` を追加
- CodeSnippet のタブとコピーボタンに `shrink-0` を追加

**変更ファイル:**
- `apps/library/src/app/v1beta/[org]/[repo]/api/_components/api-page-ui.tsx`
- `apps/library/src/app/v1beta/[org]/[repo]/api/_components/api-endpoint-section.tsx`
- `apps/library/src/app/v1beta/[org]/[repo]/api/_components/code-snippet.tsx`

### 4. SDK セクション対応 ✅
- コードとi18n翻訳を確認したが、SDKセクションは現在のコードに存在しない
- 対応不要

### 5. ドキュメントリンク動作確認 ✅
- Storybook で全ドキュメントリンクの URL が正しいことを確認
- Playwright MCP でモバイル (375px) とデスクトップ (1280px) の両方でスクリーンショット撮影
- モバイルで横スクロールが発生しないことを確認 (`scrollWidth === clientWidth === 375`)

## Screenshots
- `screenshots/api-page-desktop.png` - デスクトップ表示
- `screenshots/api-page-mobile.png` - モバイル表示 (375px)

## Notes
- PR #1103 で Developer Portal (API tab) が追加された
- バックエンドの OpenAPI ドキュメントは `apps/library-api/src/handler/openapi.rs` で定義
  - `/v1beta/swagger-ui` - Swagger UI
  - `/v1beta/redoc` - ReDoc
  - `/v1beta/rapidoc` - RapiDoc
  - `/v1beta/api-docs/openapi.json` - OpenAPI JSON spec
- Mobile story を `api-page-ui.stories.tsx` に追加
