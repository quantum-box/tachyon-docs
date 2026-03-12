# Markdown Property Type

Library Database supports Markdown as the primary rich-text property type. This page documents the
server-side behaviour, API responses, and the migration plan away from legacy HTML fields.

## Overview

- `PropertyType::Markdown` is now a first-class database type for Library repositories.
- The legacy `HTML` property type remains readable for backwards compatibility but is marked as
  **deprecated**.
- New repositories and sample seed data use Markdown by default.

## API Behaviour

### GraphQL

- `PropertyType` enum exposes `MARKDOWN` as the preferred rich-text variant.
- `HTML` remains available but carries a schema-level deprecation message. Client toolchains will
  surface warnings when generating code or executing queries that rely on `HTML`.

### REST

- `POST /v1beta/repos/{org}/{repo}/properties` accepts `property_type="markdown"` for new fields.
- Responses now include an optional `deprecation` field. When a property is still defined as HTML,
  the API returns:
  
  ```json
  {
    "property_type": "HTML",
    "deprecation": "HTML property type is deprecated. Please migrate to MARKDOWN."
  }
  ```

- Server logs emit the same message whenever an HTML property is created or updated.

## Migration Guidance

1. Prefer creating new properties as Markdown.
2. Audit existing datasets using `PropertyType::Html` and schedule conversion to Markdown.
3. Frontend clients should render Markdown content and surface the REST deprecation message to
   administrators.
4. A dedicated migration task will handle bulk conversion and the eventual removal of the HTML
   variant.

## References

- Task record: `docs/src/tasks/completed/library-v1.2.0/add-markdown-property-type/task.md`
- Domain implementation: `packages/database/domain/src/property/property_type.rs`
- REST handler: `apps/library-api/src/handler/property.rs`
