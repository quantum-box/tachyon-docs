# Agent App - Better Auth + Cognito 認証実装

## 概要

agent-app に Better Auth と AWS Cognito を使用した OAuth 認証システムを実装する。データベースを使用せず、クッキーベースのステートレスな認証フローを実現する。

## 背景・目的

- agent-app に認証機能を追加し、ユーザーがログインして tachyon-api にアクセスできるようにする
- データベースを使用しないシンプルな構成で、OAuth トークンをクッキーに保存
- Cognito の OAuth2 フローを活用し、トークンリフレッシュも自動的に行う

## 詳細仕様

### 機能要件

1. **Cognito OAuth 認証**
   - サインインページで「Sign in with Cognito」ボタンをクリック
   - Cognito Hosted UI にリダイレクトして認証
   - 認証成功後、アプリにリダイレクトしてセッションを確立

2. **トークン管理（データベース不要）**
   - アクセストークン、リフレッシュトークン、ID トークンを暗号化クッキーに保存
   - Better Auth の `storeAccountCookie: true` を使用
   - トークン期限切れ時に自動リフレッシュ

3. **オペレーター一覧表示**
   - tachyon-api から GraphQL でオペレーター一覧を取得
   - RSC (React Server Components) でサーバーサイドデータ取得
   - URL パラメーター (`?operator=<id>`) によるオペレーター選択

### 非機能要件

- セッション有効期限: 7日間
- クッキーキャッシュ: 5分間（JWT 戦略）
- トークン自動リフレッシュ: アクセストークン期限切れ時に Better Auth が自動実行

### 技術スタック

```yaml
authentication:
  library: better-auth@1.4.0
  provider: AWS Cognito
  flow: OAuth2 Authorization Code

frontend:
  framework: Next.js 16
  rendering: React Server Components (RSC)
  styling: Tailwind CSS, shadcn/ui

backend_integration:
  api: tachyon-api
  protocol: GraphQL
  authentication: Bearer Token (Cognito Access Token)
```

## 実装内容

### ファイル構成

```
apps/agent-app/src/
├── lib/
│   └── auth.ts                    # Better Auth 設定 + Cognito リフレッシュハンドラー
├── app/
│   ├── page.tsx                   # ホームページ（オペレーター一覧）
│   ├── sign-in/page.tsx           # サインインページ
│   └── api/
│       └── auth/[...all]/route.ts # Better Auth ハンドラー
└── components/
    ├── operator-list.tsx          # オペレーター一覧コンポーネント
    └── sign-out-button.tsx        # サインアウトボタン
```

### Terraform リソース

```
cluster/terraform/
└── cognito/
    └── main.tf                    # Cognito User Pool, Client 定義（dev/prod）
```

### 環境変数

```bash
# Cognito 設定
COGNITO_CLIENT_ID=<client_id>
COGNITO_CLIENT_SECRET=<client_secret>
COGNITO_DOMAIN=<domain>.auth.<region>.amazoncognito.com
COGNITO_REGION=ap-northeast-1
COGNITO_USER_POOL_ID=<user_pool_id>
```

## 実装詳細

### Better Auth 設定

```typescript
// auth.ts
export const auth = betterAuth({
  socialProviders: {
    cognito: {
      clientId: process.env.COGNITO_CLIENT_ID,
      clientSecret: process.env.COGNITO_CLIENT_SECRET,
      domain: process.env.COGNITO_DOMAIN,
      region: process.env.COGNITO_REGION,
      userPoolId: process.env.COGNITO_USER_POOL_ID,
      scope: ["openid", "profile", "email", "aws.cognito.signin.user.admin"],
      refreshAccessToken: async (refreshToken: string) => {
        // Cognito token endpoint にリフレッシュリクエスト
        const refreshed = await refreshCognitoToken(refreshToken);
        return {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken || refreshToken,
          accessTokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000),
        };
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    cookieCache: { enabled: true, maxAge: 60 * 5, strategy: "jwt" },
  },
  account: {
    storeAccountCookie: true,
    updateAccountOnSignIn: true,
  },
  advanced: {
    cookiePrefix: "agent-app",
  },
});
```

### トークンリフレッシュフロー

```
1. RSC が auth.api.getAccessToken() を呼び出し
2. Better Auth が account_data クッキー（JWE 暗号化）を復号
3. アクセストークンの期限を確認
4. 期限切れの場合:
   a. refreshAccessToken ハンドラーを呼び出し
   b. Cognito /oauth2/token エンドポイントにリフレッシュリクエスト
   c. 新しいトークンでクッキーを更新
5. 有効なアクセストークンを返却
```

### オペレーター一覧取得（RSC）

```typescript
// page.tsx
export default async function HomePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const tokenResult = await auth.api.getAccessToken({
    headers: await headers(),
    body: { providerId: "cognito" },
  });

  const operators = await fetchOperators(tokenResult.accessToken);
  // ...
}

async function fetchOperators(accessToken: string) {
  const response = await fetch(TACHYON_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "x-operator-id": "tn_01hjryxysgey07h5jz5wagqj0m",
    },
    body: JSON.stringify({
      query: `query { operators { id name } }`,
    }),
  });
  // ...
}
```

## 動作確認結果

### 確認項目

- [x] Cognito サインイン/サインアウト
- [x] セッションクッキーの作成
- [x] アクセストークンの取得
- [x] tachyon-api からオペレーター一覧取得
- [x] URL パラメーターによるオペレーター選択
- [x] TypeScript 型チェック通過

### クッキー構成

```yaml
cookies:
  - name: agent-app.session_token
    description: セッション識別子
  - name: agent-app.session_data
    description: セッションデータ（JWT）
  - name: agent-app.account_data.0
    description: OAuth トークン（JWE 暗号化、分割1）
  - name: agent-app.account_data.1
    description: OAuth トークン（JWE 暗号化、分割2）
```

## 完了条件

- [x] Cognito OAuth 認証が動作する
- [x] トークンがクッキーに保存される
- [x] トークンリフレッシュハンドラーが設定されている
- [x] オペレーター一覧が RSC で取得・表示される
- [x] TypeScript 型エラーがない

## 備考

- リフレッシュトークンは `getAccessToken` API では返却されない（セキュリティ上の理由）
- Better Auth が内部でリフレッシュトークンを使用してトークンを自動更新
- Cognito のアクセストークン有効期限は約1時間
