# Secrets Context Developer Guide

## Overview

The `secrets` context provides secure management of sensitive information (API keys, tokens, secrets) using AWS Secrets Manager in production and local file storage in development.

## Quick Start

### 1. Create `.secrets.json` for Local Development

Copy the sample file and add your secrets:

```bash
cp .secrets.json.sample .secrets.json
```

Edit `.secrets.json`:

```json
{
  "tn_01hjryxysgey07h5jz5wagqj0m/providers/stripe": {
    "api_key": "sk_test_your_key",
    "webhook_secret": "whsec_your_secret"
  },
  "tn_01hjryxysgey07h5jz5wagqj0m/providers/hubspot": {
    "api_key": "pat-your-token"
  },
  "global/openai": {
    "api_key": "sk-your-openai-key"
  },
  "global/anthropic": {
    "api_key": "sk-ant-your-anthropic-key"
  }
}
```

> **Note**: `.secrets.json` is gitignored and should never be committed.

### 2. Secret Path Format

Secrets are organized by path:

| Path Format | Example | Usage |
|------------|---------|-------|
| `{tenant_id}/providers/{provider}` | `tn_xxx/providers/stripe` | Provider credentials per tenant |
| `global/{name}` | `global/openai` | Shared credentials across all tenants |

### 3. Using Secrets in Code

#### Via `tachyon_apps::secrets::SecretsApp` trait

```rust
use tachyon_apps::secrets::{SecretsApp, SecretPath};

pub struct MyService {
    secrets_app: Arc<dyn SecretsApp>,
}

impl MyService {
    pub async fn get_api_key(&self, tenant_id: &TenantId) -> Result<String> {
        let secret = self.secrets_app
            .get_provider_secret(tenant_id, "stripe")
            .await?;
        secret.value.get_field("api_key")
    }

    pub async fn get_global_key(&self) -> Result<String> {
        let secret = self.secrets_app
            .get_global_secret("openai")
            .await?;
        secret.value.get_field("api_key")
    }
}
```

#### Via IAC Context (Automatic Resolution)

When using `IacConfigurationProvider`, secrets are automatically resolved:

```rust
// Manifest stored in DB:
// { "api_key": { "$secret_ref": "stripe/api_key" } }

// When reading via IacConfigurationProvider.get_config():
// { "api_key": "sk_test_actual_key" }  // Resolved!
```

## Manifest Secret References

### Writing Manifests

When saving manifests with `SaveManifest` usecase:

1. **With SecretExtractor configured**: Plain text secrets are extracted, stored in secrets context, and replaced with `$secret_ref`
2. **Without SecretExtractor**: Plain text secrets are rejected with an error

```json
// Input (plain text - will be extracted or rejected)
{
  "spec": {
    "providers": [{
      "name": "stripe",
      "config": {
        "api_key": "sk_test_xxx"
      }
    }]
  }
}

// Stored in DB (after extraction)
{
  "spec": {
    "providers": [{
      "name": "stripe",
      "config": {
        "api_key": { "$secret_ref": "stripe/api_key" }
      }
    }]
  }
}
```

### Sensitive Fields

The following fields are automatically extracted:

| Provider | Sensitive Fields |
|----------|-----------------|
| stripe | `api_key`, `webhook_secret` |
| hubspot | `api_key`, `client_secret` |
| openai | `api_key` |
| anthropic | `api_key` |
| google_ai | `api_key` |
| xai | `api_key` |
| keycloak | `password` |
| github | `client_secret` |
| linear | `client_secret` |
| square | `api_key`, `client_secret` |
| openlogi | `token` |

## Testing

### Using MockSecretsApp

```rust
use tachyon_apps::secrets::MockSecretsApp;
use serde_json::json;

#[tokio::test]
async fn test_with_secrets() {
    let mock = MockSecretsApp::new()
        .with_secret(
            "tn_test123/providers/stripe",
            json!({ "api_key": "sk_test_xxx" })
        );

    let service = MyService::new(Arc::new(mock));
    let key = service.get_api_key(&tenant_id).await.unwrap();
    assert_eq!(key, "sk_test_xxx");
}
```

### Integration Tests

For integration tests that require real AWS Secrets Manager:

```bash
# Set AWS credentials
export AWS_REGION=ap-northeast-1
export AWS_ACCESS_KEY_ID=xxx
export AWS_SECRET_ACCESS_KEY=xxx

# Run tests
cargo test -p secrets --features aws
```

## Migrating Existing Data

Use the migration tool to migrate plain text secrets from manifests:

```bash
# Dry run (no changes)
cargo run -p iac --example secret_migration -- --dry-run tn_xxx

# Execute migration
cargo run -p iac --example secret_migration -- tn_xxx

# Multiple tenants
cargo run -p iac --example secret_migration -- tn_xxx tn_yyy tn_zzz
```

## Environment Selection

| Environment | Repository | Cache |
|-------------|-----------|-------|
| `prod` / `staging` | AWS Secrets Manager | 5 min TTL |
| `dev` / other | `.secrets.json` file | No cache |

Set via `TACHYON_ENV` environment variable.

## Troubleshooting

### "Secret not found" Error

1. Check the secret path format matches exactly
2. For local dev, verify `.secrets.json` contains the path
3. For AWS, verify the secret exists in Secrets Manager

### "Plaintext secrets are not allowed" Error

This occurs when saving a manifest with plain text secrets and `SecretExtractor` is not configured. Either:

1. Configure `SecretExtractor` in DI
2. Use `$secret_ref` format in your manifest

### Cache Issues

Secrets are cached for 5 minutes in production. To force refresh:

```rust
// If using CachedSecretsRepository
cached_repo.invalidate(&secret_path).await;
// or
cached_repo.invalidate_all().await;
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  tachyon_apps::secrets                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │ SecretsApp  │  │SecretsAppImpl│  │ MockSecretsApp  │ │
│  │  (trait)    │  │   (impl)    │  │    (test)       │ │
│  └─────────────┘  └─────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                    secrets context                       │
│  ┌─────────┐  ┌──────────────────┐  ┌──────────────┐   │
│  │ App     │  │ SecretsRepository │  │  Domain      │   │
│  │(facade) │  │    (trait)       │  │ (Secret etc) │   │
│  └─────────┘  └──────────────────┘  └──────────────┘   │
│                         │                               │
│         ┌───────────────┼───────────────┐               │
│         ▼               ▼               ▼               │
│  ┌────────────┐  ┌────────────┐  ┌────────────────┐    │
│  │ AWS Secrets│  │ LocalFile  │  │ Cached         │    │
│  │ Manager   │  │ Repository │  │ Repository     │    │
│  └────────────┘  └────────────┘  └────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

## Related Documentation

- [Secrets Context Task Document](../../../tasks/in-progress/implement-secrets-encryption/task.md)
- [AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/)
