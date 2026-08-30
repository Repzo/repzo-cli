# Public API, authentication, and errors

## Contract

- Base path: `/api/v1`.
- Authentication: `Authorization: Bearer foxa-*` for Developer Apps or short-lived `foxu-*` access tokens issued by CLI browser login.
- Public schema: `GET /api/v1/openapi.json`.
- List pagination: `page` defaults to 1; `limit` defaults to 20 and is capped at 200 for API clients.
- List envelope: `{ "data": [...], "meta": { "page", "limit", "total", "totalPages", "hasNextPage", "hasPrevPage" } }`.
- Error envelope: `{ "error": { "code", "message", "details"? } }`.

Use OpenAPI for exact methods, filters, sort keys, body fields, and response schemas. Unknown fields, filters, sort keys, enum values, and malformed dates return `422`.

## Authentication

Configure a named CLI profile with browser login:

```bash
repzo setup agents
repzo auth login --profile work --base-url https://workstation.example.com
repzo profiles use work
repzo auth status --profile work
repzo doctor
```

On a remote machine, use `repzo auth login --no-browser` and open the printed URL on the same machine that can reach the loopback callback.

The browser flow uses PKCE, asks the signed-in user to choose scopes, and stores a rotating refresh credential. The resulting access remains limited by that user's live workspace role and visibility. Use `--token-stdin` for a `foxa-*` Developer App key in CI or other non-browser environments:

```bash
printf '%s' "$REPZO_DEVELOPER_APP_TOKEN" | repzo auth login --profile ci --token-stdin
```

Never print, log, commit, paste into a command argument, or return a token. Use `REPZO_TOKEN` and `REPZO_BASE_URL` only as environment overrides.

## Pagination

Use one bounded page for discovery. Use `--all` only when completeness is required. Preserve the original filters on every next-page request. Stop on `hasNextPage: false` for offset pagination or a missing next cursor for cursor pagination.

Do not silently describe the first page as “all.” Do not fetch all pages merely to find one record when an exact filter exists.

## Data conventions

- Use ISO 3166-1 alpha-2 country values, not database IDs.
- Resolve `ownerUserId`, `pipelineId`, `stageId`, `industryId`, `sourceId`, and `channelId` from the workspace.
- Put custom values in `customProperties`, keyed by stable property name.
- Treat connector-owned sync fields as readable but not writable.
- Expect API-created records to remain unassigned unless `ownerUserId` is supplied.

## CLI results

Normal success output is `{ "ok": true, "data": ..., "summary": "...", "breadcrumbs": [...], "meta": {...} }`. `--quiet` and `--agent` return only `data`. Errors are written to stderr as `{ "ok": false, "error": { "code", "message", "hint"?, "retryable", "status"?, "details"? } }`.

Handle exit codes as follows:

- `0` / success: continue.
- `1` / `usage`: correct local command, flag, or input.
- `2` / `not_found`: verify the profile, resource, and ID.
- `3` / `auth`: run status/doctor without exposing credentials.
- `4` / `forbidden`: report the missing permission or scope; do not bypass it.
- `5` / `rate_limit`: stop after bounded retries and honor the retry window.
- `6` / `network`: diagnose connectivity and base URL.
- `7` / `api`: inspect status, details, metadata, and OpenAPI.
- `8` / `ambiguous`: narrow the query or ask the user to choose.

The CLI retries `429`, `502`, `503`, and `504` with bounded exponential backoff. Use `--no-retry` only when observing the first failure is important. Never retry non-idempotent mutations manually unless the response proves the server did not accept them.

## Coverage boundary

Standard resources include contacts, accounts, deals, activities, campaigns, projects, tickets, invoices, carts, orders, line items, price offers, products, pipelines, reports, appointments, requests, request types, tags, forms, segments, collections, and articles. Additional public surfaces include Send, metadata, event subscriptions, Inbox, chat, voice, associations, imports, and exports.

If the requested operation is missing from OpenAPI, report the gap. Do not import server internals, query the database, use session-only UI routes, or mint broader credentials.
