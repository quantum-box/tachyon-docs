---
title: "AiChatアプリケーションへの認証機能実装"
type: "feature"
emoji: "🔐"
topics: ["NextAuth", "Cognito", "認証", "Next.js", "GraphQL"]
published: true
targetFiles: [
  "apps/aichat/src/app/auth.ts",
  "apps/aichat/src/app/cognito.ts",
  "apps/aichat/src/app/api/auth/",
  "apps/aichat/src/app/(auth)/",
  "apps/aichat/src/app/auth.graphql"
]
github: ""
---

# AiChatアプリケーションへの認証機能実装

## 概要

AiChatアプリケーションに、TachyonおよびLibraryアプリケーションで実装されている認証システムを参考に、NextAuthとAWS Cognitoを使用した認証機能を実装します。新規ユーザー登録、ログイン、ログアウト、セッション管理、およびGraphQL APIとの統合を含む包括的な認証システムを構築します。

## 背景・目的

### 解決したい課題
- AiChatアプリケーションは現在認証機能がなく、誰でもアクセス可能な状態
- ユーザーごとのチャット履歴管理や権限制御ができない
- セキュアなAPI通信ができない

### 期待される効果
- ユーザーごとの安全なチャット履歴管理
- 適切なアクセス制御による情報保護
- 統一された認証基盤による管理の簡素化

## 詳細仕様

### 機能要件

#### 1. 認証機能
- **ログイン機能**
  - ユーザー名/パスワード認証
  - OAuth認証（Cognito経由）
  - 自動トークンリフレッシュ

- **新規登録機能**
  - メールアドレス、ユーザー名、パスワードによる登録
  - メール確認機能
  - 登録後の自動ログイン

- **セッション管理**
  - JWTベースのセッション管理
  - 30日間のセッション有効期限
  - セキュアなトークン保存

- **ログアウト機能**
  - セッションの適切なクリア
  - リダイレクト処理

#### 2. 認証保護されたページ
- チャット画面への認証要求
- 未認証時のリダイレクト
- 認証状態の表示

#### 3. GraphQL統合
- 認証トークンの自動付与
- APIリクエストへのヘッダー設定
- トークン検証エンドポイント

### 非機能要件
- **セキュリティ**
  - HTTPS通信の強制
  - トークンの安全な保存
  - CSRF対策

- **パフォーマンス**
  - トークンリフレッシュの非同期処理
  - セッション情報のキャッシング

- **互換性**
  - 既存のtachyon-apiとの互換性
  - packages/authとの統合

## 実装方針

### アーキテクチャ

```
apps/aichat/
├── src/
│   ├── app/
│   │   ├── (auth)/                # 認証関連ページ
│   │   │   ├── sign_in/          # ログインページ
│   │   │   ├── sign_up/          # 新規登録ページ
│   │   │   └── layout.tsx        # 認証ページレイアウト
│   │   ├── api/
│   │   │   └── auth/[...nextauth]/  # NextAuth APIルート
│   │   ├── auth.ts               # NextAuth設定
│   │   ├── cognito.ts            # Cognitoプロバイダー
│   │   └── auth.graphql          # GraphQLスキーマ
│   └── components/
│       └── auth/                 # 認証関連コンポーネント
│           ├── LoginForm.tsx
│           ├── SignUpForm.tsx
│           └── UserMenu.tsx
```

### 技術選定
- **認証ライブラリ**: NextAuth.js v5
- **認証プロバイダー**: AWS Cognito
- **API通信**: GraphQL (urql)
- **フォーム管理**: React Hook Form + Zod
- **UI**: Shadcn/ui コンポーネント

### 実装参考元
- **Tachyon**: OAuth認証、トークンリフレッシュ、GraphQL統合
- **Library**: 新規登録フロー、資格情報認証、フォーム実装

## タスク分解

### フェーズ1: 基本設定 📝 TODO
- [ ] NextAuth設定ファイル（auth.ts）の作成
- [ ] Cognitoプロバイダー（cognito.ts）の実装
- [ ] 環境変数の設定（.env.local）
- [ ] NextAuth APIルートの設定

### フェーズ2: 認証ページ実装 📝 TODO
- [ ] ログインページの実装
  - [ ] ログインフォームコンポーネント
  - [ ] サーバーアクション
  - [ ] エラーハンドリング
- [ ] 新規登録ページの実装
  - [ ] 登録フォームコンポーネント
  - [ ] Cognito SignUpの実装
  - [ ] メール確認フロー
- [ ] 認証ページレイアウトの作成

### フェーズ3: GraphQL統合 📝 TODO
- [ ] GraphQLスキーマ（auth.graphql）の作成
- [ ] verify mutationの実装
- [ ] APIクライアントへの認証ヘッダー追加
- [ ] トークン自動リフレッシュの実装

### フェーズ4: UI統合 📝 TODO
- [ ] ユーザーメニューコンポーネントの作成
- [ ] 認証状態の表示
- [ ] ログアウト機能の実装
- [ ] 認証保護されたページの設定

### フェーズ5: チャット機能との統合 📝 TODO
- [ ] チャットページへの認証要求
- [ ] ユーザーごとのチャット履歴管理
- [ ] APIリクエストへのユーザー情報付与

## テスト計画

### 単体テスト
- 認証プロバイダーのテスト
- フォームバリデーションのテスト
- GraphQL mutationのテスト

### 統合テスト
- ログインフローのE2Eテスト
- 新規登録フローのE2Eテスト
- トークンリフレッシュのテスト

### セキュリティテスト
- 未認証アクセスのテスト
- トークン有効期限のテスト
- CSRF対策のテスト

## リスクと対策

### 技術的リスク
- **Cognito設定の複雑さ**
  - 対策：既存のTachyon/Libraryの設定を参考に実装
  - ドキュメント化による知識共有

- **既存APIとの互換性**
  - 対策：tachyon-apiの認証仕様を厳密に確認
  - 段階的な実装とテスト

### セキュリティリスク
- **トークン漏洩**
  - 対策：HTTPOnlyクッキーの使用
  - セキュアなストレージの実装

## スケジュール

- **フェーズ1-2**: 2日間（基本的な認証機能）
- **フェーズ3**: 1日間（GraphQL統合）
- **フェーズ4-5**: 2日間（UI統合とチャット連携）
- **テスト・修正**: 1日間

合計: 約6日間

## 完了条件

- [ ] ユーザーが新規登録・ログイン・ログアウトできる
- [ ] 認証が必要なページで未認証ユーザーがリダイレクトされる
- [ ] GraphQL APIリクエストに認証トークンが自動的に付与される
- [ ] トークンの自動リフレッシュが動作する
- [ ] すべてのテストがパスする
- [ ] セキュリティ要件を満たしている

## 参考資料

### 内部リソース
- `/apps/tachyon/src/app/auth.ts` - Tachyonの認証実装
- `/apps/library/src/app/(auth)/` - Libraryの認証ページ実装
- `/packages/auth/` - 共通認証パッケージ

### 外部リソース
- [NextAuth.js Documentation](https://next-auth.js.org/)
- [AWS Cognito Developer Guide](https://docs.aws.amazon.com/cognito/latest/developerguide/)
- [GraphQL Authentication Best Practices](https://graphql.org/learn/authorization/)