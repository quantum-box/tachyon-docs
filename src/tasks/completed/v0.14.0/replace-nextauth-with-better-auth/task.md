---
title: "NextAuthからBetter Authへのフロントエンド認証移行"
type: "refactor"
emoji: "🔐"
topics:
  - Next.js
  - Authentication
  - Better Auth
published: true
targetFiles:
  - apps/tachyon
  - apps/bakuure-ui
  - apps/web
  - apps/bakuure-admin-ui
  - packages/library
github: https://github.com/quantum-box/tachyon-apps
---

# NextAuthからBetter Authへのフロントエンド認証移行計画

## 概要

Better Auth を採用して Next.js フロントアプリ群（apps/tachyon, apps/bakuure-ui, apps/web, apps/bakuure-admin-ui 等）の認証基盤を再構成し、セッション管理・多要素統合の複雑性を解消しつつ、多テナント要件と将来のマルチプロバイダー対応に備える計画をまとめる。

## 背景・目的

- NextAuth を用いた現行実装はアプリ毎にバージョンが混在し（`apps/bakuure-ui` は v4、`apps/tachyon` は v5 beta）、型定義の拡張や callback ロジックがファイル毎に肥大化している（例: `apps/tachyon/src/app/auth.ts` の複雑な JWT 再発行処理）ため、保守が困難。
- 既存セッションは `next-auth.session-token` の cookie 依存であり、マルチテナント固有の `operators` / `platforms` 情報注入を複数箇所で重複管理している。Better Auth は型安全なセッションオブジェクトと API クライアント/サーバーの共有ロジックを提供し、コールバックの散逸を防げる。
- NextAuth の pages Router 依存コンポーネント（`apps/web` など）と App Router（`apps/tachyon`）が混在し、ライフサイクル差異によるバグ（セッション更新の遅延、`unstable_update` 乱用など）が発生している。Better Auth は App Router を中心にゼロ設定で API Route と Server Actions 双方に対応し、統一しやすい。
- LLM サービスや CRM 連携など、今後 GraphQL 呼び出しでカスタムヘッダー（`x-operator-id` 等）付与を自動化したい。Better Auth の middleware/handler を共通パッケージ化すれば多アプリ間での拡張が容易。

## 詳細仕様

### 機能要件

1. Better Auth を基盤にした認証モジュール（仮称 `packages/frontend-auth`）を新設し、App Router / Pages Router の双方で `auth()` と `api.auth` エンドポイントを提供する。
2. 各アプリでのログイン・ログアウト・セッション取得・token refresh 処理を Better Auth のハンドラへ移行し、Cognito Hosted UI と USER_PASSWORD_AUTH の双方をサポートする。
3. 多テナント属性（`operators`, `platforms`, `x-user-id`）を含むセッション型を共有し、GraphQL クライアント/フック（`apps/tachyon/src/app/auth.ts`, `apps/web/src/lib/grpc_client.ts` 等）から共通に参照できるよう更新する。
4. サーバーアクション・API Route から `requireAuth`（Better Auth の guard）を利用し、未認証時のリダイレクトと 403 応答を共通化。
5. 既存の NextAuth Cookie を Better Auth のセッションストレージ（encrypted cookie もしくは Redis）へ段階的に移行し、クライアントキャッシュの再認証を自動的に促す。

### 非機能要件

- アプリケーション間でセッション暗号化キーと CSRF 対策を統一する（.env の再整備、`mise run setup` に含める）。
- 認証エンドポイントは 200ms 以下で応答することを目標（Cognito トークンリフレッシュ時を除く）。
- 型安全性: `Session.user` 型を共有 TypeScript 型で保証し、`any` キャスト禁止。
- セキュリティ: HttpOnly + Secure Cookie、SameSite=Lax をデフォルトとし、マルチオリジン展開時の設定をタスク内で検証。
- 可観測性: サインイン／サインアウト／token refresh のログ（structured logging）を共通 util で出力。

### コンテキスト別の責務

```yaml
contexts:
  frontend-platform:
    description: "Next.js アプリ群（tachyon/web/bakuure）"
    responsibilities:
      - Better Auth ハンドラの導入と UI フロー更新
      - セッション/ユーザーデータのフェッチ
      - 多テナント用ヘッダー付与
  shared-auth-package:
    description: "packages/frontend-auth (新規)"
    responsibilities:
      - Better Auth 設定の共通化（providers, session schema）
      - クライアント/サーバーユーティリティ（hooks, middleware）
      - セッション移行スクリプト
  backend-services:
    description: "GraphQL API (apps/tachyon-api 等)"
    responsibilities:
      - Authorization ヘッダー仕様の維持
      - 新セッションフォーマットとの互換性確認
  identity-provider:
    description: "AWS Cognito / 外部 OAuth"
    responsibilities:
      - redirect_uri / client secret の更新
      - refresh token ライフサイクルの検証
```

### 仕様のYAML定義

```yaml
better_auth:
  session:
    cookie_name: "tachyon_session"
    storage: "cookie"        # MVPでは暗号化Cookie、将来的にRedisへ拡張
    lifetime_minutes: 60
    refresh_threshold_minutes: 10
  providers:
    cognito:
      client_id_env: "COGNITO_CLIENT_ID"
      client_secret_env: "COGNITO_CLIENT_SECRET"
      issuer_env: "COGNITO_ISSUER"
      scopes:
        - "email"
        - "openid"
        - "profile"
    credentials:
      endpoint: "https://cognito-idp.${AWS_REGION}.amazonaws.com"
      grant_type: "USER_PASSWORD_AUTH"
  multi_tenancy:
    headers:
      operator: "x-operator-id"
      platform: "x-platform-id"
      user: "x-user-id"
    default_operator: "tn_01hjryxysgey07h5jz5wagqj0m"
    session_fields:
      - "operators"
      - "platforms"
      - "activeOperatorId"
  migration:
    sync_window_days: 7       # 旧cookie有効期間中は併用リダイレクトを許容
    legacy_cookie_names:
      - "next-auth.session-token"
      - "__Secure-next-auth.session-token"
```

## 実装方針

- **Better Auth 採用ポリシー**  
  `better-auth` パッケージと `@better-auth/next` を導入し、App Router 向けに `createAuth()`, Pages Router 向けに API Route ハンドラを用意する。Better Auth の複数 provider/メールテンプレート対応を利用し、Cognito OAuth + Password の双方を `packages/frontend-auth` で宣言する。

- **共通パッケージ化**  
  `packages/frontend-auth` で `createBetterAuth()` ファクトリをエクスポートし、`apps/tachyon` の Server Action から `auth()` を import。Pages Router 採用中の `apps/web` では `app/api/auth/[...route]/route.ts` ないし `pages/api/auth/[...route].ts` を Better Auth の route ハンドラに差し替え、`getSession` 依存を `authClient().session()` に移行する。

- **セッションスキーマと型の整理**  
  Better Auth の session schema/adapter を用い、`User` 型に `operators`, `platforms`, `activeOperatorId`, `accessToken`, `refreshToken`, `expiresAt` を含む Zod スキーマを定義。`apps/library/src/types/next-auth.d.ts` を廃止し、新しい型定義を `packages/frontend-auth` から re-export する。

- **Cognito 連携の再実装**  
  NextAuth callback に埋め込まれている `SignInWithPlatform` 呼び出しを、Better Auth の `eventHooks.signIn` で実行し GraphQL への初回同期を継続。token refresh は `better-auth/fetch` の refresh ミドルウェアで共通化し、`apps/tachyon/src/app/clients.ts` 等で重複しているリフレッシュ処理を削除する。

- **段階的移行戦略**  
  1) 新パッケージを導入し `apps/tachyon` で feature flag 下に切替。2) 同フラグを共有し `apps/bakuure-ui` と `apps/web` に適用。3) NextAuth の cookie を Better Auth cookie に置換するサーバーサイドミドルウェアを一時的に提供し、旧 cookie 検出時は再ログインを促す。4) 旧 NextAuth コードと依存を削除。

- **CI/品質管理**  
  `mise run check`、`yarn lint --filter=apps/web` 等を新型 session 型に合わせて更新。Better Auth 提供のユーティリティに対して Vitest を追加し、`apps/tachyon/src/app/signup/actions.ts` などのサーバーアクションが新 API を用いるかをテスト。

## タスク分解

### フェーズ1: 移行設計と基盤準備 📝
- [ ] Better Auth の PoC（独立ブランチで Cognito 認証確認）
- [ ] `packages/frontend-auth` の雛形作成と ESLint/Vitest 設定
- [ ] 共通セッションスキーマと型定義を策定
- [ ] 既存 NextAuth 利用箇所の棚卸し（apps/web/apps/bakuure-ui/apps/bakuure-admin-ui/apps/tachyon）

### フェーズ2: Tachyon アプリへの導入 📝
- [ ] `apps/tachyon/src/app/auth.ts` を Better Auth 実装に置換
- [ ] Server Actions / Route Handlers の `auth()` 連携を更新
- [ ] セッション更新（`unstable_update` 依存）を Better Auth の `session().update()` に書き換え
- [ ] Playwright シナリオ（`apps/tachyon/src/e2e-tests/agent-chat.spec.ts` 等）のログインヘルパー修正

### フェーズ3: Bakuure 系アプリの更新 📝
- [ ] `apps/bakuure-ui` の API Route を Better Auth に移行
- [ ] `apps/bakuure-admin-ui` の `SessionProvider` を Better Auth hook に置換
- [ ] `apps/library/src/types/next-auth.d.ts` を置換／削除し、共通型に差し替え

### フェーズ4: Web (Pages Router) 移行 📝
- [ ] `apps/web/src/pages/api/auth/[...nextauth].ts` を Better Auth ルーターで再実装
- [ ] `getSession` / `useSession` 依存を `useAuth()` / `getServerSession` 等に更新
- [ ] gRPC/GraphQL クライアントのアクセストークン取得ロジックを改修

### フェーズ5: クリーンアップとリリース準備 📝
- [ ] NextAuth 依存パッケージを削除し `yarn dedupe`
- [ ] 旧 cookie サポートコードと型定義を削除
- [ ] ドキュメント更新（`CLAUDE.md`, multi-tenancy ガイド, signup フロー手順）
- [ ] リグレッションテスト、負荷テスト、リリースノート作成

## テスト計画

- `packages/frontend-auth` 向けユニットテスト（session schema、hook の挙動、token refresh ロジック）
- Tachyon / Bakuure / Web 各アプリでの Vitest / React Testing Library によるガードコンポーネント検証
- Playwright MCP を用いたエンドツーエンドシナリオ（セルフサインアップ、AI チャット、CRM 連携）の再実行
- GraphQL 経由のサインインフロー（`SignInWithPlatform`）と multi-tenancy ヘッダー付与のインテグレーションテスト
- `mise run check` / `mise run ci-node` のパイプラインに Better Auth 専用の静的解析を追加（型の破壊的変更チェック）

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 既存セッション Cookie との非互換で一括ログアウトが発生 | 高 | 移行期間は旧 Cookie 検知時に再ログイン画面へ誘導するミドルウェアを実装し、事前告知を行う |
| Cognito リフレッシュトークンの扱いを誤り 401 連発 | 高 | Better Auth の refresh hook に統一し、クラウド側設定と同期テストを実施 |
| Pages Router での互換性不足 | 中 | `@better-auth/next/pages` サポートを PoC で確認し、必要なら段階的に App Router へ移行 |
| 多テナント情報の漏れ・欠落 | 中 | セッションスキーマを Zod で厳格化し、GraphQL 呼び出し前に型安全なヘッダー付与ユーティリティを共有 |
| ライブラリアップデートの追随 | 低 | Renovate 設定に `better-auth` を追加し、自動アップデート時に互換性テストを必須化 |

## スケジュール（目安）

| フェーズ | 期間 | 説明 |
|---------|------|------|
| フェーズ1 | 1週 | PoC と設計確定、共通パッケージ雛形 |
| フェーズ2 | 1週 | Tachyon アプリ移行とE2Eテスト |
| フェーズ3 | 1週 | Bakuure 系アプリ移行 |
| フェーズ4 | 1週 | Web アプリ移行と互換性確認 |
| フェーズ5 | 0.5週 | クリーンアップ、ドキュメント、リリース準備 |

## 参考資料

- [Better Auth Documentation – Next.js](https://better-auth.com/docs/nextjs)
- [Better Auth Feature Overview](https://better-auth.com/blog/introducing-better-auth)
- [Better Auth Authentication Components Guide](https://better-auth.com/docs/guide/authentication)

## 完了条件

- [ ] 全アプリが Better Auth を用いてサインイン/サインアウト/セッション取得を実現
- [ ] `packages/frontend-auth` が導入され、共通型が参照されている
- [ ] NextAuth に依存するコードと型が repo から削除済み
- [ ] E2E/シナリオテストを含む動作確認レポートが `verification-report.md` に追加されている
- [ ] multi-tenancy ドキュメントと CLAUDE ガイドが Better Auth ベースで更新済み

## 備考

- 移行期間中は staging 環境で 48 時間以上セッション安定性を観測してから本番反映する。
- Playwright MCP を使ったログインフローの再録画を、Better Auth 導入後に必ず実施する。
