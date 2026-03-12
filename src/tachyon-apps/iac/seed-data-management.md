# Seed Data IaC Management

## Overview

SeedData manifests allow database seed data to be managed through the IaC (Infrastructure as Code) system.
This enables API-driven, idempotent data management with audit trails.

## SeedData Manifest Format

```yaml
apiVersion: apps.tachy.one/v1alpha
kind: SeedData
metadata:
  name: auth-actions-core
  tenantId: tn_01jcjtqxah6mhyw4e5mahg02nd
spec:
  tables:
    - name: tachyon_apps_auth.actions
      mode: upsert  # upsert | replace | skip
      primary_keys: [id]
      rows:
        - id: act_01hjryxysgey07h5jz5w00001
          context: auth
          name: UpdatePolicy
          description: Update policy configuration
          resource_pattern: "trn:auth:policy:*"
```

## Apply Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| `upsert` | INSERT or UPDATE based on primary keys | Default. Safe for incremental updates |
| `replace` | DELETE all + INSERT (transactional) | Full table replacement |
| `skip` | Skip if any data exists in table | Initial data only |

## API Usage

### Save Manifest

```graphql
mutation SaveManifest($input: SaveManifestInput!) {
  saveManifest(input: $input) {
    apiVersion
    metadata {
      name
      tenantId
    }
  }
}
```

### Apply Manifest

```graphql
mutation ApplyManifest($input: ApplyManifestInput!) {
  applyManifest(input: $input) {
    success
    seedDataTables {
      tableName
      created
      updated
      skipped
    }
  }
}
```

### Dry Run

Set `dryRun: true` to preview changes without modifying the database:

```graphql
mutation ApplyManifest($input: ApplyManifestInput!) {
  applyManifest(input: $input) {
    success
    seedDataTables {
      tableName
      created  # Would be created
      updated  # Would be updated
      skipped  # Would be skipped
    }
  }
}

# Variables
{
  "input": {
    "kind": "SeedData",
    "name": "auth-actions-core",
    "dryRun": true
  }
}
```

## yaml-seeder Coexistence

### Current Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Data Sources                            │
├─────────────────────────────────────────────────────────────┤
│  yaml-seeder (scripts/seeds/)     IaC Manifests (API)       │
│         │                               │                    │
│         ▼                               ▼                    │
│  ┌─────────────┐                 ┌─────────────┐            │
│  │ Direct DB   │                 │ manifests   │            │
│  │ Insert      │                 │ table       │            │
│  └─────────────┘                 └─────────────┘            │
│         │                               │                    │
│         │                               │ applyManifest      │
│         ▼                               ▼                    │
│  ┌─────────────────────────────────────────────────────────┐│
│  │              Target Tables (e.g., auth.actions)         ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Coexistence Rules

1. **Bootstrap Phase** (Server not running)
   - Use yaml-seeder for initial data load
   - Includes IaC manifests themselves (`tachyon_apps_iac.manifests`)

2. **Runtime Phase** (Server running)
   - Use `saveManifest` + `applyManifest` APIs
   - Changes are audited in `manifest_apply_logs`

3. **Migration Path**
   - Gradually move tables from yaml-seeder to SeedData manifests
   - Keep yaml-seeder for bootstrap-only data
   - Use IaC for data that changes frequently

### Recommended Data Ownership

| Data Type | Recommended Method | Reason |
|-----------|-------------------|--------|
| Tenants, Users (initial) | yaml-seeder | Bootstrap, rarely changes |
| Service Accounts | yaml-seeder | Bootstrap |
| IaC Manifests (definitions) | yaml-seeder | Meta-bootstrap |
| auth.actions | **SeedData manifest** | Frequently updated, needs audit |
| auth.policies | **SeedData manifest** | Frequently updated |
| Feature Flags | **SeedData manifest** | Runtime toggles |
| Products, Pricing | yaml-seeder or SeedData | Depends on update frequency |

## Security

### SQL Injection Prevention

Table and column names are validated:
- Table names: `schema.table` format only (alphanumeric, underscore, dot)
- Column names: alphanumeric and underscore only

### Transaction Safety

- `replace` mode wraps DELETE + INSERT in a transaction
- Failure rolls back all changes
- `upsert` mode is row-by-row (partial success possible)

## Audit Trail

All apply operations are logged to `tachyon_apps_iac.manifest_apply_logs`:

| Column | Description |
|--------|-------------|
| id | Log entry ID |
| tenant_id | Tenant context |
| manifest_name | Applied manifest name |
| manifest_kind | "SeedData", "ProjectConfig", etc. |
| manifest_hash | SHA256 of manifest content |
| status | applied, failed, skipped, dry_run |
| dry_run | Whether it was a dry run |
| summary | JSON with created/updated/skipped counts |
| error_message | Error details if failed |
| applied_at | Timestamp |

## Migration Guide

### Step 1: Create SeedData Manifest

Convert yaml-seeder data to SeedData manifest format:

```yaml
# Before (yaml-seeder format)
version: 1
tables:
- name: tachyon_apps_auth.actions
  mode: upsert-update
  rows:
  - id: act_01xxx
    context: auth
    name: CreateUser
    ...

# After (SeedData manifest)
apiVersion: apps.tachy.one/v1alpha
kind: SeedData
metadata:
  name: auth-actions
  tenantId: tn_01jcjtqxah6mhyw4e5mahg02nd
spec:
  tables:
    - name: tachyon_apps_auth.actions
      mode: upsert
      primary_keys: [id]
      rows:
        - id: act_01xxx
          context: auth
          name: CreateUser
          ...
```

### Step 2: Register Manifest

```bash
# Via GraphQL
curl -X POST http://localhost:50054/v1/graphql \
  -H "Authorization: Bearer dummy-token" \
  -H "x-operator-id: tn_01hjryxysgey07h5jz5wagqj0m" \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { saveManifest(input: { tenantId: \"...\", manifest: \"...\" }) { ... }}"}'
```

### Step 3: Apply with Dry Run

```graphql
mutation {
  applyManifest(input: {
    kind: "SeedData"
    name: "auth-actions"
    dryRun: true
  }) {
    success
    seedDataTables { tableName created updated skipped }
  }
}
```

### Step 4: Apply for Real

```graphql
mutation {
  applyManifest(input: {
    kind: "SeedData"
    name: "auth-actions"
    dryRun: false
  }) {
    success
    seedDataTables { tableName created updated skipped }
  }
}
```

### Step 5: Remove from yaml-seeder

Once IaC management is working, remove the table from yaml-seeder files.
