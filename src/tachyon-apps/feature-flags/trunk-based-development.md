# Feature Flags for Trunk-Based Development

## Overview

Feature flags allow incomplete or experimental features to be merged into `main` safely.
The flag hides the feature from users until it is ready for release.

## Flag Key Naming Conventions

| Pattern | Purpose | Example |
|---------|---------|---------|
| `feature.<domain>.<name>` | In-development feature gate | `feature.storage.ui` |
| `context.<name>` | Context-level gating (existing) | `context.llms` |
| `experiment.<name>` | A/B tests | `experiment.new-onboarding` |

## Workflow

### 1. Create the flag

Add a row to `scripts/seeds/n1-seed/009-feature-flags.yaml`:

- **Production platform** (`tn_01hjjn348rn3t49zz6hvmfq67p`): `enabled: 0`
- **Dev platform** (`tn_01hjryxysgey07h5jz5wagqj0m`): `enabled: 1`

Run `mise run docker-seed` to apply.

Alternatively, create the flag through the management UI (Feature Flags page).

### 2. Register the key (frontend)

Add the key to `apps/tachyon/src/lib/feature-flags/keys.ts`:

```ts
export const FEATURE_FLAG_KEYS = {
  'feature.storage.ui': 'feature.storage.ui',
} as const satisfies Record<string, string>
```

This ensures the flag is fetched in a single batch request on page load.

### 3. Use the flag in code

#### Frontend (React)

```tsx
import { useFeatureFlag, FeatureFlag } from '@/lib/feature-flags'

// Hook
function MyComponent() {
  const { enabled } = useFeatureFlag('feature.storage.ui')
  if (!enabled) return null
  return <NewFeature />
}

// Component
function MyPage() {
  return (
    <FeatureFlag flag="feature.storage.ui" fallback={<OldView />}>
      <NewView />
    </FeatureFlag>
  )
}
```

#### Backend (Rust)

```rust
use tachyon_apps::feature_flag::FeatureFlagApp;

let enabled = feature_flag_app
    .is_enabled("feature.storage.ui", &tenant_id)
    .await?;

if enabled {
    // new behaviour
}
```

### 4. Merge to main

Because the flag defaults to `false` for production tenants,
the feature is hidden even though the code is on `main`.

### 5. Gradually enable

Toggle the flag per tenant through the management UI or by updating the seed.

### 6. Graduate the flag

Once the feature is fully rolled out:

1. Remove the flag check from code.
2. Remove the key from `keys.ts`.
3. Optionally delete the flag row from the seed / management UI.

## API Reference

### GraphQL

```graphql
query GetFeatureFlagValues($keys: [String!]!) {
  featureFlagValues(keys: $keys) {
    key
    enabled
  }
}
```

### Rust trait methods

```rust
// Single key
async fn is_enabled(&self, key: &str, tenant_id: &TenantId) -> Result<bool>;

// Batch
async fn is_enabled_batch(&self, keys: &[&str], tenant_id: &TenantId) -> Result<HashMap<String, bool>>;
```

Both methods return `false` for unknown keys (safe default).

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Unknown flags return `false` | Code can be merged before the flag exists in the DB |
| Delegates to `EvaluateFeatureFlag` | Reuses tenant inheritance and strategy evaluation |
| Own React hook instead of OpenFeature | Simpler API; existing OpenFeature stub is untouched |
| Centralised key registry (`keys.ts`) | Single batch fetch; easy to audit which flags are in use |
