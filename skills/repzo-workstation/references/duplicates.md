# Duplicates and merging

Use this reference to find duplicate accounts or contacts and merge them. Both resources have the same commands; examples use accounts.

## Find duplicates

The workspace's duplicate scan suggests pairs that share an email, phone, company domain, or name (or an admin's custom rule). Each suggestion includes both full records and a `versions` map.

```bash
repzo accounts duplicates list --limit 20
repzo contacts duplicates list --query 'reason=email' --query 'q=Acme' --limit 20
```

`--query status=rejected` or `status=merged` lists resolved suggestions. With `--json`, `meta.response.scan` shows the latest scan; start a fresh one when it is missing or old, then list again once `scan.status` is `complete`:

```bash
repzo accounts duplicates scan --dry-run
repzo accounts duplicates scan --yes
```

Suggestions are hints, not decisions. Compare the records' names, domains, emails, phones, owners, and addresses. When they are clearly different companies or people, mark the pair as not a duplicate so scans stop suggesting it:

```bash
repzo accounts duplicates reject SUGGESTION_ID --dry-run
repzo accounts duplicates reject SUGGESTION_ID --yes
```

When it is unclear, report the pair to the user instead of merging or rejecting it.

## Merge

Merging works on any records, whether or not the scan suggested them. Pick the primary record: the one that stays, keeps its ID, and receives everything linked to the others (contacts, deals, invoices, tickets, activity and email links, comments, files, tags). Prefer the record the user names; otherwise the more complete or more active one, and say why. The other one to four records are archived. There is no unmerge.

Property values come from the primary. When the primary's value is empty, the first non-empty value from the merged records is used. To take a specific value from another record, map the property to that record's ID. System properties use API field names (`country` takes the record whose country to keep), and custom properties use stable names:

```json
{
  "primaryId": "11111111-1111-4111-8111-111111111111",
  "mergeIds": ["22222222-2222-4222-8222-222222222222"],
  "properties": { "phone": "22222222-2222-4222-8222-222222222222" },
  "customProperties": { "customer_tier": "22222222-2222-4222-8222-222222222222" }
}
```

Always preview first. The preview runs the real merge, including every validation and conflict check, then rolls it back. Nothing is saved:

```bash
repzo accounts merge preview --data @merge.json
```

Check `data.record` (the primary after the merge), `data.sources` (which record each value comes from), and `data.movedRecords` (linked rows that will move, by table). An error here means the merge would fail too: `404` for a missing or hidden record, `409` for linked-record conflicts such as two contacts with loyalty balances, and `422` for an unknown property or a value that fails the workspace's property rules. The `422` details list the mergeable properties.

Add the preview's `data.versions` to the body as `versions`, then merge once. A record changed since the preview fails with `409` instead of merging stale data; re-read and preview again.

```bash
repzo accounts merge --data @merge.json --dry-run --idempotency-key merge-acme-1
repzo accounts merge --data @merge.json --yes --idempotency-key merge-acme-1
repzo accounts get PRIMARY_ID
```

Merge pairs one at a time. Report the primary ID, the merged IDs, and the moved-record counts. Reviewing suggestions needs view and update permission on the resource; merging also needs delete.

If an older CLI lacks these commands, use `repzo request POST /accounts/merge/preview` and `repzo request POST /accounts/merge` with the same flags only after `repzo openapi --quiet` confirms the endpoints exist.
