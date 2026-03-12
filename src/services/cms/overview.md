---
title: "CMS概要"
topics: ["cms", "documentation", "overview"]
type: "tech"
published: false
targetFiles: ["docs/src/services/cms"]
---

# CMS概要

このドキュメントでは、CMSに関連するドキュメント群の全体像と各ファイルの内容を説明します。

## 📂 ディレクトリ構成

`docs/src/services/cms/` ディレクトリには、CMSアプリケーションに関連する以下のドキュメントが含まれています：

| ファイル名 | サイズ | 行数 | 内容 |
|-----------|-------|------|------|
| cms_architecture.md | 12KB | 347 | CMS基本アーキテクチャとUIコンポーネント設計 |
| cms_seamless_architecture.md | 21KB | 684 | CMSの3層アーキテクチャと実装計画 |
| cms_ui_components.md | 18KB | 593 | CMSのUIコンポーネント設計詳細 |
| cms_api_schema.md | 8.9KB | 438 | CMSのGraphQL API設計 |
| cms_opennext_migration.md | 10KB | 267 | OpenNextによるCloudflareデプロイ手順 |

## 📑 各ドキュメントの概要

### 1. cms_architecture.md

**主な内容**:
- CMSアプリケーションの基本アーキテクチャ
- コンポーネント設計原則
- データフローパターン
- ルーティング設計
- コア機能の実装例

このドキュメントは、CMSの全体像と基本設計を理解するための出発点です。主にフロントエンド（UI）視点でのアーキテクチャを説明しています。

### 2. cms_seamless_architecture.md

**主な内容**:
- 3層アーキテクチャの詳細設計
  - Next.js UIコンポーネント層
  - API Routes中間層
  - Library API連携層
- フェーズ別実装計画
- OpenNextを使用したCloudflareデプロイ
- GraphQLクライアント実装
- 認証・権限システム
- 具体的なコード例

このドキュメントは、CMSの実装計画と技術的な詳細を包括的に説明しています。より具体的な実装方針とコード例が含まれています。

### 3. cms_ui_components.md

**主な内容**:
- UIコンポーネントの階層と分類
- デザインシステムの原則
- スタイリングアプローチ
- 再利用可能なコンポーネントの設計
- アクセシビリティ対応

このドキュメントは、CMSのUIコンポーネント設計に特化しており、フロントエンド開発者向けのガイドラインを提供しています。

### 4. cms_api_schema.md

**主な内容**:
- GraphQL APIスキーマの設計
- クエリとミューテーションの例
- データモデルの説明
- APIの使用方法と例

このドキュメントは、CMSのバックエンドAPIインターフェースに焦点を当てており、フロントエンドとバックエンドの連携方法を説明しています。

### 5. cms_opennext_migration.md

**主な内容**:
- OpenNextを使用したCloudflareデプロイへのマイグレーション手順
- Wrangler設定
- 環境変数設定
- 静的アセットキャッシング
- デプロイパイプライン

このドキュメントは、CMSアプリケーションのデプロイに関する技術的な手順を詳細に説明しています。

## 🔄 ドキュメント間の関係

これらのドキュメントは相互に補完する関係にあります：

```
                      ┌─────────────────────┐
                      │                     │
                      │  cms_architecture   │ ◀───── 基本設計・全体像
                      │                     │
                      └─────────────────────┘
                               │
                               ▼
┌─────────────────┐   ┌─────────────────────┐   ┌─────────────────┐
│                 │   │                     │   │                 │
│  cms_ui_        │◀──┤  cms_seamless_      ├──▶│  cms_api_       │
│  components     │   │  architecture       │   │  schema         │
│                 │   │                     │   │                 │
└─────────────────┘   └─────────────────────┘   └─────────────────┘
                               │
                               ▼
                      ┌─────────────────────┐
                      │                     │
                      │  cms_opennext_      │ ◀───── デプロイ
                      │  migration          │
                      │                     │
                      └─────────────────────┘
```

## 📚 ドキュメントの使い方

1. **初めてCMSを理解する場合**: まず `cms_architecture.md` から読み始め、全体像を把握
2. **実装計画を理解する場合**: `cms_seamless_architecture.md` で詳細設計を確認
3. **UIコンポーネント開発者**: `cms_ui_components.md` で設計原則とガイドラインを参照
4. **API連携を実装する場合**: `cms_api_schema.md` でGraphQL APIの詳細を確認
5. **デプロイを担当する場合**: `cms_opennext_migration.md` でCloudflareデプロイ手順を確認

## 🔄 今後の更新計画

- **実装進捗に合わせたドキュメント更新**
- **コンポーネントライブラリのドキュメント追加**
- **ユーザーマニュアルの作成**
- **トラブルシューティングガイドの追加**

## 📝 その他の関連ドキュメント

- [Library API CMS仕様](../../library-api/library-api-cms-spec.md)
- [aiチャット移行計画](../aichat/assistant_ui_migration_plan.md) 