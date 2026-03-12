---
title: セッションからオペレーター一覧を削除してAPI取得に変更
type: refactor
emoji: "🔄"
topics:
  - Refactor
  - Session Management
  - GraphQL
  - Authentication
published: true
targetFiles:
  - apps/tachyon/src/app/v1beta/[tenant_id]/layout.tsx
  - apps/tachyon/src/app/page.tsx
  - apps/tachyon/src/app/auth.ts
  - apps/tachyon/src/components/apollo-provider.tsx
  - apps/tachyon/src/app/signup/actions.ts
  - apps/tachyon/src/app/signup/workspace-setup/page.tsx
  - apps/tachyon/src/types/next-auth.d.ts
github: https://github.com/quantum-box/tachyon-apps
---

# セッションからオペレーター一覧を削除してAPI取得に変更

## 概要

NextAuthのJWTセッションに保持している `operators` / `platforms` 配列を削除し、GraphQL APIから都度取得する設計に変更する。

## 背景・目的

### 現在の問題
- IAM管理画面からオペレーターを追加すると、セッション更新が必要
- セッション更新漏れがあると左上のオペレーター一覧に反映されない
- サーバー側（`updateSession`）とクライアント側（`useSession().update`）の両方で更新が必要
- セッションが肥大化する（operators配列全体をJWTに保存）

### 解決したい課題
- セッション更新の複雑さと漏れを根本的に解決
- 常に最新のオペレーター一覧を表示
- コードの単純化

### 期待される成果
- オペレーター追加後、ページリロードなしで左上の一覧に反映される
- セッション更新のコードが不要になる
- JWTのサイズが縮小される

## 詳細仕様

### 機能要件

1. **サイドバーのオペレーター一覧表示**
   - `layout.tsx` でGraphQL APIから最新のオペレーター一覧を取得
   - セッションではなくAPIレスポンスをサイドバーに渡す

2. **トップページのリダイレクト**
   - `page.tsx` でAPIからデフォルトテナントを取得
   - セッションからの取得を削除

3. **テナントアクセス制御**
   - フロントエンドの `hasAccessToTenant()` チェックを削除
   - バックエンドAPIが403を返したらフロントでリダイレクト

4. **ApolloProviderのヘッダー設定**
   - `x-user-id` ヘッダーは常に `session.user.id` を設定
   - `operators` 配列チェックを削除

5. **セッション設定の削除**
   - `auth.ts` のJWTコールバックから `operators`/`platforms` の保存を削除
   - Signup関連のセッション更新コードを削除

### 非機能要件

- パフォーマンス: サーバーコンポーネントなので追加のクライアント側リクエストは発生しない
- セキュリティ: バックエンドで常にアクセス制御される（フロントエンドチェックは削除）
- 保守性: セッション同期の複雑なコードが不要になる

## 実装方針

### アーキテクチャ設計

```
┌─────────────────────────────────────────────┐
│ layout.tsx (Server Component)               │
│                                             │
│ await sdk.GetMe()                           │
│   ↓                                         │
│ { me: { operators: [...], platforms: [...] } │
│   ↓                                         │
│ <V1BetaSidebar operators={...} />           │
└─────────────────────────────────────────────┘

Session (JWT):
- operators: 削除 ❌
- platforms: 削除 ❌
- id, email, accessToken: 保持 ✅
```

### 技術選定

- **既存のGraphQL `me` クエリを活用**: 新規API不要
- **Server Component**: layout.tsx は既にServer Componentなので追加のfetch不要
- **バックエンドアクセス制御**: 既存の `check_policy` を活用

## タスク分解

### Phase 1: layout.tsx でAPI取得に変更 ✅
- [x] `getGraphqlSdk()` で `GetMe()` を呼び出し
- [x] `operators` と `platforms` をAPIレスポンスから取得
- [x] サイドバーに渡す

### Phase 2: page.tsx でAPI取得に変更 ✅
- [x] トップページでも `GetMe()` を呼び出し
- [x] デフォルトテナントをAPIレスポンスから取得
- [x] リダイレクト処理を更新

### Phase 3: apollo-provider.tsx の簡素化 ✅
- [x] `isOperatorMember` チェックを削除
- [x] 常に `session.user.id` を `x-user-id` に設定

### Phase 4: auth.ts の修正 ✅
- [x] `hasAccessToTenant()` 関数を削除
- [x] `authWithCheck()` からアクセスチェックを削除
- [x] JWTコールバックから `operators`/`platforms` 保存を削除

### Phase 5: signup関連のセッション更新削除 ✅
- [x] `actions.ts` から `updateSession()` 削除
- [x] `workspace-setup/page.tsx` から `useSession().update` 削除

### Phase 6: 型定義更新 ✅
- [x] `next-auth.d.ts` から `operators`/`platforms` を削除

### Phase 7: 動作確認 ✅
- [x] ログイン後に左上ドロップダウンにオペレーター一覧が表示される
- [x] IAM画面からオペレーター追加
- [x] ページリロードなしで左上に新しいオペレーターが表示される
- [x] 新しいオペレーターに切り替えられる

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| APIエラー時にサイドバーが空になる | 中 | エラーハンドリング追加、フォールバック表示 |
| ページ遷移ごとにAPIコールが発生 | 低 | layout.tsx はServer Componentなので問題なし |
| 既存のセッション依存コードが残る可能性 | 中 | grep で `session.user.operators` を全検索 |

## 参考資料

- [NextAuth.js JWT Strategy](https://next-auth.js.org/configuration/options#jwt)
- [Next.js Server Components](https://nextjs.org/docs/app/building-your-application/rendering/server-components)
- 既存実装: `apps/tachyon/src/app/signup/actions.ts` (142-152行目) - セッション更新パターン

## 完了条件

- [x] すべての Phase が完了
- [x] `session.user.operators` への参照がコードベースから削除されている
- [x] 動作確認完了
- [x] PRマージ済み

## 実装記録

### 2026-01-13
- ✅ 全Phase完了（commit: ee55d8b3c）
- ✅ auth.graphqlに`Me`クエリ追加
- ✅ layout.tsx/page.tsxでAPIからoperators/platformsを取得
- ✅ apollo-provider.tsxの簡素化（常にx-user-idを設定）
- ✅ auth.tsのhasAccessToTenant削除、セッション保存削除
- ✅ signup関連のセッション更新削除
- ✅ next-auth.d.tsの型定義からoperators/platforms削除
- ✅ 動作確認完了

### 変更されたファイル（13ファイル）
- `apps/tachyon/src/app/auth.graphql` - Meクエリ追加
- `apps/tachyon/src/app/auth.ts` - hasAccessToTenant削除、セッション管理簡素化
- `apps/tachyon/src/app/cognito.ts` - 型調整
- `apps/tachyon/src/app/page.tsx` - API取得に変更
- `apps/tachyon/src/app/signup/actions.ts` - セッション更新削除
- `apps/tachyon/src/app/signup/workspace-setup/page.tsx` - セッション更新削除
- `apps/tachyon/src/app/v1beta/[tenant_id]/layout.tsx` - API取得に変更
- `apps/tachyon/src/components/apollo-provider.tsx` - 簡素化
- `apps/tachyon/src/types/next-auth.d.ts` - 型定義更新
- その他（codegen、story、gen/）

### バージョン番号の決定基準

**マイナーバージョン（x.X.x）を上げる:**
- [x] アーキテクチャの変更（セッション管理からAPI取得へ）
- [x] 既存機能の大幅な改善

完了時のバージョン: **v0.30.1** 相当
