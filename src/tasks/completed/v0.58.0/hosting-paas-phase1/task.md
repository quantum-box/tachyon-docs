# Tachyon Cloud Compute PaaS - Phase 1: Domain + CRUD

## Overview
Phase 1 of the Compute PaaS feature. Create the `packages/compute/` context with domain models, repository traits, provider traits, SqlxRepository implementations, and REST API for ComputeApp CRUD.

## Scope
- [x] `packages/compute/domain/` crate (entities, repository traits, provider traits)
- [x] `packages/compute/` crate (App facade, usecases, SqlxRepository, REST adapter)
- [x] DB migrations (5 tables: compute_apps, builds, deployments, environment_variables, custom_domains)
- [x] Auth policy seed (compute actions + policies)
- [x] REST API: ComputeApp CRUD (`/v1/compute/apps`)
- [x] `router.rs` + `di.rs` integration
- [x] Scenario test: app CRUD (all 9 steps passing)

## Key Design Decisions
- ComputeApp is the aggregate root (prefix: `app_`)
- Build (prefix: `bld_`), Deployment (prefix: `dep_`), EnvironmentVariable (prefix: `env_`), CustomDomain (prefix: `dom_`)
- Provider traits: BuildProvider, ContainerRuntime, DnsProvider (defined in domain, implemented in Phase 2-3)
- Database: `tachyon_apps_compute`
- URL pattern: `{app-name}.txcloud.app`

## Implementation Notes
- Following integration package pattern for App facade
- REST handlers use auth::Executor + auth::MultiTenancy extractors
- All usecases call check_policy() first
- Renamed from `hosting` to `compute` context
- DB migrations registered in mise.toml (docker-sqlx-migrate + docker-migrate) and run_tests.rs
- Scenario test uses `{{vars.timestamp}}` for unique app names (idempotent)
- Step references use `{{steps.<id>.outputs.<field>}}` (not `.body.`)

## Files Created/Modified

### New files
- `packages/compute/domain/` - Domain crate (entities, repository traits, provider traits)
- `packages/compute/` - Main crate (App facade, usecases, SqlxRepository, REST adapter)
- `packages/compute/migrations/` - 5 migration files (up + down)
- `apps/tachyon-api/tests/scenarios/compute_rest.scenario.md` - Scenario test

### Modified files
- `Cargo.toml` (workspace) - Added compute crate members
- `apps/tachyon-api/Cargo.toml` - Added compute dependency
- `apps/tachyon-api/src/router.rs` - Merged compute router
- `apps/tachyon-api/src/di.rs` - Compute App initialization
- `apps/tachyon-api/src/main.rs` - Pass compute_app to router
- `apps/tachyon-api/bin/lambda.rs` - Pass compute_app to router
- `apps/tachyon-api/tests/util.rs` - Pass compute_app to router
- `apps/tachyon-api/tests/run_tests.rs` - Add compute migration to test setup
- `mise.toml` - Add compute DB creation + migration commands
- `scripts/seeds/n1-seed/008-auth-policies.yaml` - Compute actions + policies
