---
title: Tachyonアプリのテナント権限チェック実装
emoji: "🔐"
topics:
  - Security
  - Authorization
  - Next.js
  - Tachyon
published: true
relatedFiles:
  - apps/tachyon/src/app/**/*.tsx
  - apps/tachyon/src/lib/auth.ts
---

# Tachyonアプリのテナント権限チェック実装

## 概要

Tachyonアプリケーションの全ページに対して、ユーザーのoperators権限に基づくアクセス制御を実装します。

## 背景

Tachyonアプリケーションでは、マルチテナント環境でユーザーが複数のテナント（operator）に所属する可能性があります。各ページへのアクセス時に、ユーザーが対象テナントへのアクセス権限を持っているかを確認する必要があります。

## 実装仕様

### 権限チェックの仕様

```yaml
permission_check:
  type: "operators"
  implementation:
    - location: "server_component"  # Server Componentで実装
    - no_middleware: true  # Middlewareは使用しない
  
  check_flow:
    1. page_level:
        - file: "各page.tsx"
        - session_check: "authWithCheck()でセッション確認"
        - operators_check: "hasAccessToTenant()で権限確認"
        - tenant_id_validation: "URLパラメータとoperators配列の照合"
    
    2. no_layout_check:
        - reason: "layoutとpageは非同期レンダリングのため"
        - description: "layoutでのチェックは効果がない可能性"
  
  error_handling:
    no_session:
      action: "redirect"
      destination: "/sign_in"
    
    no_permission:
      action: "error_page"
      destination: "/403"
      message: "このテナントへのアクセス権限がありません"
```

## アーキテクチャ方針

### Next.js Middlewareを使用しない理由

1. **非同期レンダリング問題**: layout.tsxとpage.tsxは非同期でレンダリングされるため、Middlewareでのチェックが効果的でない
2. **柔軟性**: 各ページで個別に権限チェックすることで、ページごとの要件に対応可能
3. **デバッグ容易性**: 各ページでの権限チェックは追跡とデバッグが容易

### 実装パターン

```typescript
// 各page.tsxでの実装
export default async function Page({
  params,
}: { params: { tenant_id: string } }) {
  await authWithCheck(params.tenant_id)
  // ページのコンテンツ
}
```

## 実装詳細

### 権限チェック関数

```typescript
// apps/tachyon/src/app/auth.ts

// ページ用の権限チェック（リダイレクトあり）
export async function authWithCheck(tenantId?: string) {
  const session = await auth()
  if (!session?.user) {
    redirect('/sign_in')
  }
  
  if (tenantId && !hasAccessToTenant(session, tenantId)) {
    redirect('/403')
  }
  
  return session
}

// API用の権限チェック（nullを返す）
export async function authWithCheckApi(tenantId?: string) {
  const session = await auth()
  if (!session?.user) {
    return null
  }
  
  if (tenantId && !hasAccessToTenant(session, tenantId)) {
    return null
  }
  
  return session
}

// 権限確認ヘルパー
export function hasAccessToTenant(session: Session, tenantId: string): boolean {
  if (!session?.user?.operators) {
    return false
  }
  
  return session.user.operators.some(operator => operator.id === tenantId)
}
```

### 実装範囲

- **Server Components**: 12ページに実装完了
- **APIルート**: 2エンドポイントに実装完了
- **クライアントコンポーネント**: 別途対応が必要（4ページ）

## セキュリティ考慮事項

1. **Server Componentでの実装**: クライアントサイドでの権限情報露出を防ぐ
2. **セッション管理**: NextAuth.jsのセッション管理に依存
3. **エラーハンドリング**: 403ページで適切なメッセージを表示

## 今後の課題

1. **クライアントコンポーネント対応**: Server Componentでラップするか、APIレベルでの権限チェックを強化
2. **細かい権限管理**: 将来的にRBAC（Role-Based Access Control）への移行を検討
3. **パフォーマンス最適化**: 権限チェックのキャッシュ機構の導入

## 関連ドキュメント

- [Next.js App Router Documentation](https://nextjs.org/docs/app)
- [NextAuth.js Documentation](https://next-auth.js.org/)
- CLAUDE.md: プロジェクト全体のアーキテクチャガイドライン