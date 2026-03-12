---
title: "Library OGP画像URLの修正"
type: "bug"
emoji: "🔗"
topics:
  - Library
  - OGP
  - Next.js
  - メタデータ
published: true
targetFiles:
  - apps/library/src/app/v1beta/_lib/get-base-url.ts
  - apps/library/src/app/v1beta/[org]/page.tsx
  - apps/library/src/app/v1beta/[org]/[repo]/page.tsx
  - apps/library/src/app/v1beta/[org]/[repo]/data/[dataId]/page.tsx
github: https://github.com/quantum-box/tachyon-apps/pull/924
---

# Library OGP画像URLの修正

## 概要

LibraryのOGP画像URLが `http://localhost:3000` になっており、本番環境でOGP画像が正しく表示されない問題を修正する。

## 背景・目的

- **問題**: OGP画像のURLが `http://localhost:3000/api/quantum-box/og` のようにlocalhostを指しており、SNSでシェアした際にOGP画像が表示されない
- **原因**: `NEXT_PUBLIC_APP_URL` 環境変数がビルド時に設定されていないか、フォールバックのlocalhostが使用されている
- **影響**: SNSでのシェア時にOGP画像が表示されず、ブランディングやクリック率に悪影響

## 詳細仕様

### 機能要件

1. OGP画像URLがリクエストのホスト情報から動的に生成されること
2. 環境変数が設定されていない場合でも正しいURLが生成されること
3. フォールバックの優先順位: リクエストヘッダー → 環境変数 → localhost

### 非機能要件

- パフォーマンス: `headers()` の呼び出しによるオーバーヘッドは最小限
- 互換性: Edge Runtimeでも動作すること

## 実装方針

### アーキテクチャ設計

```
getBaseUrl()
├── 1. headers() からhost取得を試行
│   ├── host ヘッダー
│   └── x-forwarded-proto ヘッダー（プロトコル判定）
├── 2. NEXT_PUBLIC_APP_URL 環境変数にフォールバック
└── 3. 最終フォールバック: http://localhost:3000
```

### 技術選定

- Next.js `headers()` 関数: サーバーコンポーネントでリクエストヘッダーにアクセス
- `x-forwarded-proto` ヘッダー: プロキシ経由のリクエストでもHTTPSを正しく判定

## タスク分解

### 主要タスク

- [x] 問題の特定と原因調査
- [x] `getBaseUrl()` ユーティリティの実装
- [x] 3つのページファイルへの適用
- [x] PR作成
- [x] タスクドキュメント作成
- [x] 動作確認（デプロイ後）

## 動作確認チェックリスト

### デプロイ後の確認

- [ ] https://library.n1.tachy.one/v1beta/quantum-box のOGP確認
  - [ ] `og:image` が `https://library.n1.tachy.one/api/quantum-box/og` になっている
  - [ ] Twitter Card Validatorでプレビュー確認
- [ ] リポジトリページのOGP確認
- [ ] データページのOGP確認

### 確認ツール

- [Twitter Card Validator](https://cards-dev.twitter.com/validator)
- [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/)
- curlでのmetaタグ確認: `curl -s URL | grep 'og:image'`

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| headers()がEdge Runtimeで動作しない | 中 | try-catchで囲み、フォールバックを維持 |
| x-forwarded-protoが設定されていない | 低 | デフォルトでhttpsを使用 |

## 参考資料

- [Next.js headers() ドキュメント](https://nextjs.org/docs/app/api-reference/functions/headers)
- [Open Graph Protocol](https://ogp.me/)

## 完了条件

- [x] すべての機能要件を満たしている
- [x] コードレビューが完了
- [x] 本番環境でOGP画像が正しく表示される
- [x] タスクドキュメント完成

### バージョン番号の決定基準

**パッチバージョン（x.x.X）を上げる場合:**
- [x] バグ修正

このタスクはバグ修正のため、パッチバージョンを上げる。
例: Library v1.5.0 → v1.5.1

