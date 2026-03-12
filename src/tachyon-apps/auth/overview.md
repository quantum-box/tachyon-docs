# Auth context overview

## ubiquitous language

- Provider
  - サービス提供者としてのテナント
  - B2Bであればtenantをchildにもち、B2CであればUserに対し提供することになる
- Tenant
  - **Username**: テナントのusernameはparent_tenantに対して一意であり、グローバルでは一意ではない。
  - **TenantId**: テナントのidはグローバルに一意である。

## domain model

```plantuml
left to right direction
hide method
title domain model

class Tenant {
  id
  parent
  username
}
Tenant "1..n"->"0..1" Tenant

class User {
  id
}
Tenant "n"<-->"n" User

class UserAccount {}
UserAccount "n"-->"1" User
```

## usecase

- tenant manager
- user manager

## multi-tenant

### B2B

- parent tenant(provider)
  - many tenant(org)
  - many user(enduser)

### B2C

- tenant(provider)
  - many user(enduser)

toCのCRMどうする問題
tenantのuserとenduserの立ち位置一緒じゃね
でもB2Bでも一緒か

## documents

- [テナントスコープ付きユーザーポリシー管理](./tenant-scoped-user-policies.md)
- [サービスアカウント単体取得フロー](./service-account-detail.md)
- [公開APIキー参照アクション命名統一](./public-api-key-action-standardization.md)
- [APIキー認証の不具合修正](./api-key-auth.md)
- [Libraryサインイン時のポリシー自動付与](./library-sign-in-policy-attach.md)
