# GitHub Push Auto Build & Deploy

## Overview

GitHub push webhook (`POST /v1/webhooks/github/compute`) is currently a stub that logs and returns a mock response. This task implements the full flow: push event → find matching app → trigger build → auto-deploy on success.

## Current State

- `webhook_handler.rs`: `github_webhook()` accepts `GithubWebhookPayload`, logs repo/SHA, returns "mock mode"
- `TriggerBuild` usecase: works but requires `app_id` (not repo info)
- `CompleteBuild` usecase: already handles auto-deploy for CF Pages on build success
- `ComputeAppRepository`: has `find_by_id`, `find_by_operator`, `find_by_name` — no `find_by_repository`
- `BuildRepository`: has `find_by_app` (all builds) — no status-filtered query
- `BuildTrigger::Push` exists in enum but is never used
- No webhook signature verification on the compute endpoint
- LLMs package has reference HMAC-SHA256 implementation

## Design Decisions

### 1. Branch Filtering
- Default: only trigger when pushed branch matches `ComputeApp.default_branch`
- The `ref` field from GitHub is `refs/heads/<branch>` — strip prefix and compare
- Future: could add `auto_build_branches` field to ComputeApp, but YAGNI for now

### 2. App-Repository Lookup
- Add `find_by_repository` method to `ComputeAppRepository` trait
- Query by `repository_owner` + `repository_name` (both stored on ComputeApp)
- Returns `Vec<ComputeApp>` since multiple apps could theoretically share a repo (monorepo)
- Filter to `Active` status apps only

### 3. Build Deduplication
- Before triggering, check if app already has a `Queued` or `Building` build
- Add `find_active_by_app` to `BuildRepository` — queries `WHERE status IN ('queued', 'building')`
- If active build exists, skip with 200 response (idempotent, not an error)

### 4. Webhook Signature Verification
- GitHub sends `X-Hub-Signature-256: sha256=<hex>` header
- HMAC-SHA256 with webhook secret as key, raw body as message
- Store webhook secret in IaC config (`github` provider, `webhook_secret` field) with `$secret_ref`
- Pass webhook secret through DI to the handler
- Use `axum::body::Bytes` to capture raw body for verification, then deserialize JSON

### 5. Auth Context for Webhook
- Use `Executor::SystemUser` (same pattern as `cloudbuild_webhook`)
- Build `MultiTenancy` with the app's `operator_id`
- No user-level auth needed — webhook is system-to-system

## Implementation Plan

### Step 1: Domain Layer Changes

**`packages/compute/domain/src/repository.rs`**
- Add `find_by_repository(&self, owner: &str, name: &str) -> Result<Vec<ComputeApp>>` to `ComputeAppRepository`
- Add `find_active_by_app(&self, app_id: &ComputeAppId) -> Result<Vec<Build>>` to `BuildRepository`

### Step 2: Repository Implementations

**`packages/compute/src/adapter/gateway/sqlx_compute_app_repository.rs`**
- Implement `find_by_repository`: `SELECT ... WHERE repository_owner = ? AND repository_name = ? AND status != 'deleted'`

**`packages/compute/src/adapter/gateway/sqlx_build_repository.rs`**
- Implement `find_active_by_app`: `SELECT ... WHERE app_id = ? AND status IN ('queued', 'building') ORDER BY created_at DESC`

### Step 3: Webhook Handler Rewrite

**`packages/compute/src/adapter/axum/webhook_handler.rs`**
- Accept `Bytes` body + headers for signature verification
- Extract `X-Hub-Signature-256` and `X-GitHub-Event` headers
- Verify HMAC-SHA256 signature (skip if no secret configured — dev mode)
- Only process `push` events (ignore `ping`, etc.)
- Parse `GithubWebhookPayload` from raw bytes
- Extract branch from `ref` (`refs/heads/main` → `main`)
- Look up apps by `repository.full_name` (split into owner/name)
- For each matching active app:
  - Check branch matches `default_branch`
  - Check no active builds exist (dedup)
  - Call `TriggerBuild::execute` with `BuildTrigger::Push`
- Return summary of triggered builds

### Step 4: TriggerBuild Input Enhancement

**`packages/compute/src/usecase/trigger_build.rs`**
- Add `trigger: Option<BuildTrigger>` to `TriggerBuildInput`
- Default to `Manual` if not provided, use `Push` from webhook handler

### Step 5: DI & Router Wiring

**`packages/compute/src/adapter/axum/mod.rs`**
- Inject `ComputeAppRepository` and `BuildRepository` into webhook handler (via Extension)
- Pass webhook secret as Extension

**`apps/tachyon-api/src/di.rs`**
- Extract `webhook_secret` from IaC GitHub provider config
- Pass to compute router

### Step 6: Scenario Test

**`apps/tachyon-api/tests/scenarios/compute_github_webhook.scenario.md`**
- Test push event to default branch → build triggered
- Test push to non-default branch → ignored
- Test with invalid signature → 401

## Files to Modify

| File | Change |
|------|--------|
| `packages/compute/domain/src/repository.rs` | Add repository query methods |
| `packages/compute/src/adapter/gateway/sqlx_compute_app_repository.rs` | Implement `find_by_repository` |
| `packages/compute/src/adapter/gateway/sqlx_build_repository.rs` | Implement `find_active_by_app` |
| `packages/compute/src/adapter/axum/webhook_handler.rs` | Full rewrite of `github_webhook` |
| `packages/compute/src/adapter/axum/mod.rs` | Add Extensions for webhook deps |
| `packages/compute/src/usecase/trigger_build.rs` | Add `trigger` field to input |
| `packages/compute/src/lib.rs` | Pass webhook secret through App |
| `apps/tachyon-api/src/di.rs` | Extract webhook_secret from IaC |
| `apps/tachyon-api/src/router.rs` | Pass webhook secret to router |
| `scripts/seeds/n1-seed/003-iac-manifests.yaml` | Add webhook_secret field |
| Scenario test | New test file |

## Progress

- [x] Step 1: Domain layer changes
- [x] Step 2: Repository implementations
- [x] Step 3: Webhook handler rewrite
- [x] Step 4: TriggerBuild input enhancement
- [x] Step 5: DI & router wiring
- [x] Step 6: Scenario test — all 6 steps pass (create app, push main, push feature branch, ping, unknown repo, cleanup)

## Implementation Notes

- `HandleGitHubPush` usecase: new orchestrator that receives webhook push data, looks up matching apps, and triggers builds
- Webhook signature verification via HMAC-SHA256 (skipped in dev when no secret configured)
- `WebhookSecret(Option<String>)` extracted from IaC `github` provider config with `GITHUB_COMPUTE_WEBHOOK_SECRET` env fallback
- Build deduplication: skips if app already has queued/building build
- Branch filtering: only triggers when pushed branch matches app's `default_branch`
- Uses `Executor::SystemUser` and app's `operator_id` for multi-tenancy context
