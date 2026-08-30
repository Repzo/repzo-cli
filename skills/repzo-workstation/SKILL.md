---
name: repzo-workstation
description: Inspect and operate Repzo Workstation through the bundled `repzo` CLI backed by the public REST API. Use for CRM records, contacts, accounts, deals, activities, search, timelines, comments, attachments, notifications, approvals, products, pipelines, commerce, reports, appointments, projects, tickets, requests, tags, associations, forms, segments, campaigns, content, import/export jobs, Inbox, chat, voice, Send, event subscriptions, metadata, agent setup, or API troubleshooting.
---

# Repzo Workstation

Operate Workstation through the `repzo` CLI and public `/api/v1` contract. From the repository, use `npm run repzo --` if the binary is not installed.

## Apply these invariants

1. Read before writing. Resolve the exact record, its current state, and unfamiliar metadata first.
2. Execute only the mutation the user authorized. Never widen a single-record request into a bulk change.
3. Use `repzo metadata <collection>` for workspace IDs and `repzo metadata properties ENTITY_TYPE` for unfamiliar fields. Never guess IDs or property definitions. Fall back to `repzo request GET /metadata/*` only for metadata paths not yet represented in the command catalog.
4. Put custom values under `customProperties`, keyed by stable property name. Use ISO-2 country codes.
5. For mutations, run `--dry-run` first, inspect the method, URL, and body, then repeat with `--yes` only when they match the request.
6. For a mutation that may be retried, add one stable `--idempotency-key` and reuse that exact key only for the same method, path, query, and body.
7. When protecting a read-modify-write, reuse the exact `meta.etag` from the latest `get` as `--if-match`; on `412`, re-read instead of overwriting.
8. Re-read every changed record and report its ID and meaningful changes.
9. Paginate deliberately. Use `--all` only when the task requires the complete set.
10. Branch on structured `error.code` or CLI exit code. On `422`, inspect details and metadata instead of guessing.
11. Stay within OpenAPI, scopes, visibility, validation, and audit behavior. If coverage is absent, report the smallest missing public endpoint; never call an internal route.

## Discover the live surface

Use the live contract instead of relying on memory:

```bash
repzo commands --json
repzo inbox conversations --agent --help
repzo openapi --quiet
```

Normal CLI output is `{ ok, data, summary, breadcrumbs, meta }`. Follow breadcrumbs for safe next actions. Use `--agent` or `--quiet` when only response data is needed. Never pass credentials in argv or print them.

## Keep the CLI current

Once at the start of an agent thread, check whether a newer standalone CLI is available:

```bash
repzo upgrade
```

This check is read-only. If `updateAvailable` is `true`, report the current and latest versions and ask the user before running `repzo upgrade --yes`. Never upgrade silently during an unrelated Workstation task. Repository or package-manager installations must be updated through their owning workflow instead.

The CLI refreshes its installed skill after its version changes. After upgrading, run `repzo doctor` to verify the installation, then start a new agent thread so the refreshed skill is loaded before continuing.

## Route to the relevant reference

Read only the references needed for the task:

- Contacts, accounts, deals, activities, record search, timelines, comments, attachments, tags, or associations: [references/crm-records.md](references/crm-records.md)
- Products, pipelines, stages, price offers, carts, orders, invoices, or line items: [references/sales-commerce.md](references/sales-commerce.md)
- Tickets, projects, appointments, request types, or approval queues/decisions: [references/service-operations.md](references/service-operations.md)
- Chat messages, Markdown, Slack-style structured blocks, buttons, threads, or idempotent sends: [references/chat-messages.md](references/chat-messages.md)
- Inbox, notifications, voice, Send, or event subscriptions: [references/communications.md](references/communications.md)
- Campaigns, forms, segments, collections, or articles: [references/marketing-content.md](references/marketing-content.md)
- Saved reports, report execution, imports, or exports: [references/reporting-data.md](references/reporting-data.md)
- Authentication, pagination, errors, retries, scopes, and response envelopes: [references/api.md](references/api.md)

## Set up safely

Set up a named profile interactively, then diagnose it:

```bash
repzo setup agents
repzo auth login --profile work --base-url https://workstation.example.com
repzo profiles use work
repzo doctor
```

`repzo setup agents` installs the shared skill and connects detected Codex and Claude installations; start a new agent thread after setup. Browser login opens Workstation, asks the signed-in user to approve a workspace and scopes, and stores rotating credentials in macOS Keychain when available or a mode-0600 credential file. Use `--token-stdin` only for a Developer App key or CI. `REPZO_TOKEN` and `REPZO_BASE_URL` override profiles for ephemeral sessions.

## Keep reads and mutations distinct

For reads, search narrowly, fetch the selected record, and paginate only as required. For writes, prepare one exact body, preview it in CLI mode, execute once, then verify. Treat sending messages, placing calls, approvals, publishing, archiving, association replacement, tag replacement, exports, and subscription changes as mutations even when they are not CRUD updates.
