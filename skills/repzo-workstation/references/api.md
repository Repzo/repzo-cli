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

### Support login

Platform support agents can sign the CLI in to a customer's workspace when that workspace has turned on Support access:

```bash
repzo auth login --support --profile support-acme
repzo contacts list --profile support-acme --limit 20
repzo auth logout --profile support-acme
```

- The browser asks the agent to pick the customer workspace and the member to act as. Every command runs as that member, with their role and record visibility, and the customer's activity log marks each change as made by support.
- It always uses its own profile (`--profile` is required), so it never replaces the agent's own login. Pass that `--profile` on every command and never mix it with the agent's own profile in one task.
- While a support login is live, the CLI refuses any change that doesn't name its profile, and it can't become the default profile. Never work around that refusal by guessing: pass `--profile support-…` when the change is for the customer, or the agent's own profile only when the user clearly asked for a change in their own workspace. If unsure which, ask.
- Each command prints its target on stderr, for example `→ Acme Trading · SUPPORT · acting as sara@acme.com · profile support-acme`, and the response `meta.target` names the same workspace. Check it before and after each change; if it isn't the workspace the user means, stop.
- It cannot post in team chat or place calls as the member.
- It ends after 8 hours, or immediately when the customer turns support access off, the agent leaves the support roster, or the member loses access. A request then fails with "This support login has ended": stop and tell the user. Don't try to get back in another way.
- Use it only for the support request the user is working on. Log out when done.

For retry-safe writes, generate one non-secret operation key and keep it stable across retries of the identical request:

```bash
repzo contacts create --data @contact.json --dry-run --idempotency-key contact-import-row-42
repzo contacts create --data @contact.json --yes --idempotency-key contact-import-row-42
```

Never reuse an idempotency key for different request data. The API returns `409 conflict` when a key is reused with a different method, path, query, or body.

Direct record reads expose the current version as a strong `meta.etag` in normal CLI output. The CLI removes a proxy-added `W/` prefix from the response ETag and from each `--if-match` candidate, preserving the quoted digest. With older CLI versions, strip only a leading `W/` yourself. Use the tag when a write depends on the state you just inspected:

```bash
repzo deals get DEAL_ID
repzo deals update DEAL_ID --data @deal-change.json --dry-run --if-match '"ETAG_FROM_GET"'
repzo deals update DEAL_ID --data @deal-change.json --yes --if-match '"ETAG_FROM_GET"' --idempotency-key deal-DEAL_ID-change-1
```

`412 precondition_failed` means another actor changed the record. Fetch it again and reconsider the patch; never automatically substitute the new ETag and overwrite their change.

On a remote machine, use `repzo auth login --no-browser` and open the printed URL on the same machine that can reach the loopback callback.

The browser flow uses PKCE, asks the signed-in user to choose scopes, and stores a rotating refresh credential. The resulting access remains limited by that user's live workspace role and visibility. Scopes are per area; for example, Send events and event types need `tracking:read` / `tracking:write` (keys that already have `send:read` / `send:write` keep working), while sending messages needs `send:*`. Use `--token-stdin` for a `foxa-*` Developer App key in CI or other non-browser environments:

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

The public API allows 120 requests per minute per credential. For many records or events, use a batch or bulk command (`repzo send events batch`, `bulk-update`) instead of a loop of single calls. The CLI retries `429`, `502`, `503`, and `504` with bounded exponential backoff. Use `--no-retry` only when observing the first failure is important. Never retry non-idempotent mutations manually unless the response proves the server did not accept them.

## Coverage boundary

Standard resources include contacts, accounts, deals, activities, campaigns, projects, tickets, invoices, carts, orders, line items, price offers, products, pipelines, reports, appointments, requests, request types, tags, forms, segments, collections, and articles. Additional public surfaces include search, timelines, comments, media, approvals, notifications, Send, metadata, event subscriptions, Inbox, chat, voice, associations, imports, and exports.

If the requested operation is missing from OpenAPI, report the gap. Do not import server internals, query the database, use session-only UI routes, or mint broader credentials.
