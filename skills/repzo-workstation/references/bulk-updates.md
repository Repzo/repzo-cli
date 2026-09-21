# Bulk updates

Use `<resource> bulk-update` to apply the same fields to multiple records. Supported resources: contacts, accounts, deals, activities, projects, tickets, invoices, price-offers, campaigns, and products.

Resolve the intended records using list/search and read their current values. Collect explicit IDs and inspect the resource's bulk-update schema in `repzo openapi --quiet`; only fields supported by both the public API and the bulk-edit property registry are accepted. Use property metadata to resolve reference IDs and custom-property names. Filter selections and single-record-only fields are rejected.

Put 1–500 unique UUIDs and the shared changes in a JSON file:

```json
{
  "ids": ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
  "updates": { "rating": "warm", "country": "JO", "customProperties": { "customer_tier": "Gold" } }
}
```

Preview the exact selection and changes, then execute when they match the user's authorized request:

```bash
repzo contacts bulk-update --data @bulk-update.json --dry-run --idempotency-key contact-rating-batch-1
repzo contacts bulk-update --data @bulk-update.json --yes --idempotency-key contact-rating-batch-1
```

`--dry-run` previews the HTTP request locally; it does not check server-side field rules or record access. The server enforces the resource's write scope, live update permissions, visibility, and each record's property rules. `--if-match` is unsupported for bulk updates; use individual updates when ETag protection is required.

Inspect `data.total`, `data.succeeded`, `data.failed`, and every entry in `data.results`. HTTP 200, `ok: true`, and exit code 0 mean the request completed; some or all records may still have failed. Updates are independent and successful records are not rolled back when another record fails. Re-read successful records and report changed IDs plus failures.

For more than 500 records, split the reviewed IDs into batches with a separate stable idempotency key per batch. Reuse a key only when retrying the exact same body. After a completed response, retry only failed IDs once the cause is resolved, with a new key because the body has changed. Do not retry the entire completed selection blindly. If an older CLI lacks the command, use `repzo request POST /contacts/bulk-update` with the same flags only after the live OpenAPI confirms the endpoint exists.
