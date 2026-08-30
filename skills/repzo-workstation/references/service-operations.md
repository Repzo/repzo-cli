# Service operations

Use this reference for tickets, projects, appointments, request types, requests, and approval actions.

## Tickets, projects, and appointments

Search narrowly and respect visibility from the active Developer App. Empty results do not prove that no workspace record exists outside the app's visibility.

```bash
repzo tickets list --query 'status=open' --limit 50
repzo projects list --query 'ownerUserId=USER_ID' --limit 50
repzo appointments list --query 'from=2026-08-26T00:00:00Z' --query 'to=2026-08-27T00:00:00Z'
```

Read property metadata before unfamiliar custom fields, and resolve users or channels before assignment. Use ISO-8601 timestamps with an explicit timezone for appointments.

For changes, fetch the exact record, preview the smallest patch, execute, then re-read it:

```bash
repzo tickets get TICKET_ID
repzo tickets update TICKET_ID --data '{"priority":"high"}' --dry-run
repzo projects update PROJECT_ID --data @project-change.json --dry-run
repzo appointments update APPOINTMENT_ID --data @appointment-change.json --dry-run
```

## Request types and requests

Read the request type before creating a request so the submitted fields match its definition.

```bash
repzo request-types get REQUEST_TYPE_ID
repzo requests create --data @request.json --dry-run
repzo requests get REQUEST_ID
```

Submission, approval, and rejection are explicit workflow mutations:

```bash
repzo requests submit REQUEST_ID --dry-run
repzo requests submit REQUEST_ID --yes
repzo requests approve REQUEST_ID --dry-run
repzo requests approve REQUEST_ID --yes
repzo requests reject REQUEST_ID --data '{"reason":"Missing receipt"}' --dry-run
repzo requests reject REQUEST_ID --data '{"reason":"Missing receipt"}' --yes
```

Do not combine state transitions. Read the current request immediately before the action and verify it after execution. Rejection requires a user-provided or explicitly authorized reason; do not invent one.

## Approval queue

The approval queue covers configured multi-step workflows for requests and price offers. It returns only items awaiting the authenticated user's current decision. Fetch the exact approval request before acting and preserve any explanation supplied by the user.

```bash
repzo approvals pending
repzo approvals get APPROVAL_ID
repzo approvals approve APPROVAL_ID --data '{"comments":"Reviewed and approved."}' --dry-run
repzo approvals reject APPROVAL_ID --data '{"comments":"Budget owner sign-off is missing."}' --dry-run
```

Approve or reject only after explicit authorization. Use one stable idempotency key if retrying a decision. A successful action may advance to another approver instead of completing the whole workflow; inspect the returned `status` and `currentNodeIndex`.

## Complete-list requests

Use `--all` only for language such as “all open tickets” or when computing a complete aggregate that the reports API cannot provide. Otherwise return one bounded page and say that more results may exist.
