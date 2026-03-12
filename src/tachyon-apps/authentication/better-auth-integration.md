# Better Auth Integration

> ⚠️ **2025-10-12 更新**: Better Auth への全面移行は feature/release-v0.15 でロールバックされ、Tachyon は NextAuth ベースの実装に戻りました。本ドキュメントは過去のアーキテクチャ記録としてのみ参照してください。

## Overview

TachyonアプリケーションではBetter Authを統一的な認証基盤として採用しています。従来のNextAuthからの完全移行を完了し、マルチテナント環境における認証・認可処理を一元管理しています。

## Architecture

### Core Components

```yaml
packages:
  frontend-auth:
    description: Better Auth共通設定とスキーマ定義
    exports:
      - authServerConfig: サーバー側Better Auth設定ヘルパー
      - createAuthClient: クライアント初期化器
      - schema: Zodベースのセッションスキーマ

apps:
  tachyon:
    auth_implementation:
      - "@/app/auth/server": サーバー側Better Authインスタンス
      - "@/app/auth/client": クライアント側認証ヘルパー
      - "@/app/api/auth/[...all]/route.ts": Better Auth APIルート
      - "@/app/api/auth/tachyon/sign-in/route.ts": カスタムサインインエンドポイント
```

### Session Schema

```typescript
// packages/frontend-auth/src/schema.ts
export const sessionSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    image: z.string().optional(),
    emailVerified: z.boolean(),
  }),
  session: z.object({
    id: z.string(),
    userId: z.string(),
    expiresAt: z.string(),
    ipAddress: z.string().optional(),
    userAgent: z.string().optional(),
  }),
  operators: z.array(z.object({
    id: z.string(),
    name: z.string(),
    accessUrl: z.string().optional(),
  })).optional(),
  platforms: z.array(z.object({
    id: z.string(),
    name: z.string(),
  })).optional(),
  accessToken: z.string().optional(),
});
```

## Authentication Flow

### 1. Sign In (Credentials)

```mermaid
sequenceDiagram
    participant User
    participant UI as Sign In Page
    participant Client as Auth Client
    participant API as Tachyon Sign In API
    participant Cognito
    participant GraphQL as SignInWithPlatform

    User->>UI: Enter credentials
    UI->>Client: signIn({ email, password })
    Client->>API: POST /api/auth/tachyon/sign-in
    API->>Cognito: InitiateAuth (USER_PASSWORD_AUTH)
    Cognito-->>API: Authentication Result
    API->>GraphQL: SignInWithPlatform mutation
    GraphQL-->>API: operators[], platforms[], accessToken
    API-->>Client: Set session + custom fields
    Client-->>UI: Redirect to /v1beta/{tenant_id}
```

### 2. Session Management

```typescript
// Server Component
import { auth } from '@/app/auth/server'

export default async function Page() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    redirect('/sign_in')
  }

  // Access operators/platforms
  const operators = session.operators || []
  const platforms = session.platforms || []
}

// Client Component
'use client'
import { useSession } from '@/app/auth/client'

export function UserProfile() {
  const { data: session, isLoading } = useSession()

  if (isLoading) return <div>Loading...</div>
  if (!session) return <div>Not authenticated</div>

  return <div>Welcome, {session.user.name}</div>
}
```

### 3. Sign Out

```typescript
// Client-side
import { signOut } from '@/app/auth/client'

await signOut()

// Server Action
import { auth } from '@/app/auth/server'

export async function logoutAction() {
  await auth.api.signOut({
    headers: await headers(),
  })
}
```

## Custom Sign In Endpoint

### Purpose

Better AuthのデフォルトCredentials認証ではCognito連携とGraphQL統合が不可能なため、カスタムエンドポイントを実装しています。

### Implementation

```typescript
// apps/tachyon/src/app/api/auth/tachyon/sign-in/route.ts
export async function POST(request: Request) {
  const { email, password } = await request.json()

  // 1. Cognito認証
  const cognitoResult = await initiateAuth(email, password)

  // 2. SignInWithPlatform GraphQL呼び出し
  const { operators, platforms, accessToken } = await signInWithPlatform(cognitoResult.idToken)

  // 3. Better Authセッション作成 + カスタムフィールド注入
  await auth.api.signInEmail({
    email,
    password,
    body: request,
  })

  // 4. 追加フィールドをセッションに書き込み
  await updateSession({
    operators,
    platforms,
    accessToken,
  })

  return Response.json({ success: true })
}
```

### Usage in UI

```typescript
// 既存のsignIn('credentials')呼び出しをそのまま利用
import { signIn } from '@/app/auth/client'

await signIn({ email, password })
// → 内部で /api/auth/tachyon/sign-in を呼び出し
```

## Migration from NextAuth

### Completed Changes

1. **Dependency Removal**
   - `next-auth` package完全削除
   - `@auth/core` 削除
   - 既存の型定義ファイル (`types/next-auth.d.ts`) 削除

2. **Driver Architecture**
   - `@/lib/driver-nextauth.ts` 削除
   - `@/lib/driver-better-auth.ts` を唯一の実装に統一
   - `@/lib/frontend-auth.ts` で自動選択していたロジックを削除

3. **API Routes**
   - `pages/api/auth/[...nextauth].ts` 削除
   - Better Auth専用 `app/api/auth/[...all]/route.ts` のみ維持

4. **Client Integration**
   - `SessionProvider` をBetter Auth版に差し替え
   - `useSession` をSWRベースに再実装
   - `signIn` / `signOut` をBetter Auth APIに統合

### Breaking Changes

- **Cookie名変更**: `next-auth.session-token` → `better-auth.session_token`
- **セッション取得API**: `/api/auth/session` → `/api/auth/get-session`
- **型定義**: `NextAuth.Session` → `FrontendAuthSession`

## Configuration

### Environment Variables

```env
# Better Auth
DATABASE_URL="mysql://user:pass@localhost:3306/db"
BETTER_AUTH_SECRET="your-secret-key"
BETTER_AUTH_URL="http://localhost:16000"

# Cognito (for Tachyon custom sign-in)
COGNITO_REGION="ap-northeast-1"
COGNITO_CLIENT_ID="your-cognito-client-id"
COGNITO_CLIENT_SECRET="your-cognito-client-secret"
COGNITO_ISSUER="https://cognito-idp.ap-northeast-1.amazonaws.com/your-user-pool-id"

# GraphQL Backend
NEXT_PUBLIC_BACKEND_API_URL="http://localhost:50054/v1/graphql"
```

### Cookie Settings

```typescript
// packages/frontend-auth/src/server.ts
export const authServerConfig = (config) => ({
  ...config,
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5分
    },
  },
  advanced: {
    cookiePrefix: 'better-auth',
    defaultCookieAttributes: {
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      path: '/',
    },
  },
})
```

## Security Considerations

### Session Storage

- **Cookie-based**: HTTPOnly + Secure + SameSite=Lax
- **Database**: `better_auth_session` テーブルでサーバー側セッション管理
- **Expiration**: デフォルト7日間、リフレッシュトークンで延長可能

### CSRF Protection

Better Authは内部的にCSRFトークンを自動生成・検証します。

### Rate Limiting

カスタムサインインエンドポイントには独自のレート制限実装を推奨します（未実装）。

## Testing

### Unit Tests

```typescript
// packages/frontend-auth/src/__tests__/schema.test.ts
import { sessionSchema } from '../schema'

test('validates valid session', () => {
  const result = sessionSchema.safeParse({
    user: { id: '1', email: 'test@example.com', name: 'Test', emailVerified: true },
    session: { id: 's1', userId: '1', expiresAt: '2025-01-01T00:00:00Z' },
    operators: [{ id: 'op1', name: 'Operator 1' }],
  })
  expect(result.success).toBe(true)
})
```

### Integration Tests

Playwright MCPを用いたE2Eテストを推奨（サインイン→セッション取得→リダイレクト→サインアウト）。

## Troubleshooting

### Session Not Found

- **原因**: Cookie名の不一致、セッションテーブル未作成
- **対策**: マイグレーション実行、Cookie削除後再ログイン

### Cognito Authentication Failed

- **原因**: `SECRET_HASH` 不一致、クライアントシークレット誤り
- **対策**: `apps/tachyon/src/app/cognito.ts` の `generateSecretHash` 確認

### GraphQL SignInWithPlatform Error

- **原因**: バックエンドAPI未起動、ネットワークエラー
- **対策**: `mise run dev-backend` でAPI起動確認

## Future Enhancements

- [ ] OAuth Provider統合（Google, GitHub等）
- [ ] MFA (Multi-Factor Authentication) サポート
- [ ] Rate Limiting実装
- [ ] セッション監査ログ
- [ ] デバイス管理機能

## References

- [Better Auth Documentation](https://www.better-auth.com)
- [packages/frontend-auth README](../../packages/frontend-auth/README.md)
- [Multi-Tenancy Structure](./multi-tenancy.md)
- [Cognito Integration](./cognito-integration.md)

---

**Last Updated**: 2025-10-08
**Version**: 0.13.0
