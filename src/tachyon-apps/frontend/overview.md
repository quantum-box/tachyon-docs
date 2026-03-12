# Frontend Overview

Tachyon's frontend architecture is built on Next.js 14+ with App Router, React Server Components, and TypeScript.

## Core Technologies

- **Next.js**: App Router with Server Components and Server Actions
- **React**: Latest features with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui components
- **State Management**: React Context, SWR, Apollo Client
- **Form Handling**: React Hook Form with Zod validation
- **Authentication**: NextAuth (v0.15.0 rollback from Better Auth)

## Key Features

### [i18n (Internationalization)](./i18n-internationalization.md)

Multi-language support system with Japanese and English locales:

- Server Components-based locale detection
- Cookie-based preference persistence
- Type-safe translation keys
- Dynamic language switching

See full documentation: [i18n (Internationalization)](./i18n-internationalization.md)

### [Platform Dashboard Metrics](./platform-dashboard-metrics.md)

Server-rendered dashboard cards that surface real usage data for operators:

- Aggregates AI executions over rolling 24-hour windows with day-over-day deltas
- Converts NanoDollar balances to locale-aware USD amounts with relative timestamps
- Counts pricing policies by status to highlight draft items that need publication

See full documentation: [Platform Dashboard Metrics](./platform-dashboard-metrics.md)

### [Billing Transaction History Page](./billing-transaction-history-page.md)

Stand-alone billing ledger page with SSR bootstrapping and client-side pagination:

- `/v1beta/{tenant_id}/billing/transactions` renders via Server Components and preloads the latest 20 credit transactions
- Client pagination reuses the shared `TransactionHistory` card with limit/offset GraphQL queries and empty-state fallbacks
- Sidebar navigation and Billing overview CTA point to the page, ensuring operators can drill down from the dashboard

See full documentation: [Billing Transaction History Page](./billing-transaction-history-page.md)

### [Agentチャットルーム一覧](./agent-chatroom-list.md)

バックエンドのチャットルーム更新/削除APIを活用し、エージェント会話履歴を俯瞰できる一覧画面を提供：

- `/v1beta/[tenant_id]/ai/agent/chatrooms` を Server Component で初期化し、SWR でチャットルーム一覧を取得
- Rename/Delete アクションはダイアログから REST (`PATCH`/`DELETE`) を呼び出して `mutate()` で再検証
- 新規チャット作成は Server Action 経由でルーム生成後に `/ai/agent/chat?r=...` へ遷移

See full documentation: [Agentチャットルーム一覧](./agent-chatroom-list.md)

### [Procurement & CRM Navigation](./procurement-crm-navigation.md)

Feature flag-aware sidebar groups that recover the Procurement and CRM menus:

- Maps each menu item to `featureFlagActionAccess` results (`featureEnabled && policyAllowed`)
- Requires `context.procurement` / `context.crm` flags and corresponding policy grants
- Provides graceful fallbacks when GraphQL access checks fail mid-render

See full documentation: [Procurement & CRM Navigation](./procurement-crm-navigation.md)

### [Storybookテストランナー安定化](./storybook-test-runner-hardening.md)

Storybook インタラクションテストの失敗要因を排除し、静的ビルドを用いた安定実行フローを整備：

- `scripts/run-storybook-tests.js` でビルド・公開・テストの一連を自動化
- SWR / Apollo Client ベースのストーリーへフェイクデータを供給し外部依存を遮断
- Turbo 経由の `yarn test-storybook --filter=tachyon` が 467 件のテストを再現性高く完走

See full documentation: [Storybookテストランナー安定化](./storybook-test-runner-hardening.md)

### [バックエンドエンドポイント統一](./backend-endpoint-resolution.md)

GraphQL / REST / LLMS クライアントが `NEXT_PUBLIC_BACKEND_API_URL` を単一のソースとして参照するよう整理：

- `getBackendBaseUrl` ユーティリティで環境変数未設定時のフォールバックと警告を一元管理
- Apollo / OpenFeature / REST / LLMS クライアントが共通ヘルパー経由で URL を生成
- Playwright MCP と `mise run ci-node` で実リクエスト先とユニットテストを検証

See full documentation: [バックエンドエンドポイント統一](./backend-endpoint-resolution.md)

## Component Patterns

### Server Components First

Default to Server Components for:
- Data fetching
- Layout composition
- Static content rendering
- Initial page state

### Client Components

Use `'use client'` only when needed for:
- Interactive UI elements
- Event handlers
- Browser APIs
- Real-time updates (SWR)

### Shared UI Library

Reusable components in `packages/ui`:
- shadcn/ui base components
- Custom business components
- Consistent design system

## Routing Structure

```
apps/tachyon/src/app/
├── (public)/              # Public pages (landing, signup)
├── v1beta/[tenant_id]/    # Multi-tenant dashboard
│   ├── ai/                # AI features (Studio, Chat, Agent)
│   ├── billing/           # Billing management
│   └── settings/          # Settings pages
└── api/                   # API routes (auth, webhooks)
```

## Best Practices

1. **Type Safety**: Full TypeScript coverage with strict mode
2. **Accessibility**: ARIA labels, semantic HTML, keyboard navigation
3. **Performance**: Server-side rendering, code splitting, optimized images
4. **Testing**: Storybook for components, Playwright for E2E
5. **Code Quality**: Biome for linting/formatting

## Related Documentation

- [i18n (Internationalization)](./i18n-internationalization.md)
- [Better Auth Integration (Legacy)](../authentication/better-auth-integration.md)
- [Component Development Guide](../../for-developers/overview.md)
