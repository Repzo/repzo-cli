# CRM records

Use this reference for contacts, accounts, deals, activities, tags, and activity/email associations. Lead-management fields such as pipeline, stage, status, source, and channel live on contacts; there is no separate Leads public resource.

## Resolve records

Search with the narrowest public filter available. Use a small page first; do not download every record to find one match.

```bash
repzo contacts list --query 'email=maya@example.com' --limit 20
repzo accounts list --query 'name=Acme' --limit 20
repzo deals list --query 'pipelineId=PIPELINE_ID' --limit 20
repzo activities list --query 'ownerUserId=USER_ID' --limit 20
```

When the entity type is unknown or the user gives only a name/phrase, use scoped global search. Narrow `entityTypes` whenever possible; results include only resources granted to the active credential.

```bash
repzo search records --query 'q=Acme' --query 'entityTypes=account,deal' --limit 10
```

If several records match, present distinguishing fields and ask for the target. Never choose by list position. Fetch the selected record before mutating it:

```bash
repzo contacts get CONTACT_ID
repzo deals get DEAL_ID
```

## Create or update

Read property metadata when fields or validation rules are unfamiliar:

```bash
repzo metadata properties contact
repzo metadata properties deal
```

Use native API field names at the top level and stable custom-property names under `customProperties`:

```bash
repzo contacts create --data '{"firstName":"Maya","country":"JO","customProperties":{"Customer tier":"Gold"}}' --dry-run
repzo contacts create --data @contact.json --yes
repzo deals update DEAL_ID --data '{"stageId":"STAGE_ID"}' --dry-run
repzo deals update DEAL_ID --data @deal-change.json --yes
```

After execution, run the matching `get` command. Do not reuse a stale read as verification.

## Tags

List tag definitions before assigning them. Entity tag replacement is replace-all, so read existing assignments and preserve any tags that should remain.

```bash
repzo tags list --limit 100
repzo tags entity list contact CONTACT_ID
repzo tags entity replace contact CONTACT_ID --data '{"tagIds":["TAG_ID"]}' --dry-run
```

## Associations

Associations support `activity` and `email` sources linked to contacts, accounts, or deals. Replacement is replace-all and accepts at most 100 associations. Read the current set first and retain every intended link.

```bash
repzo associations list --query 'sourceType=activity' --query 'sourceId=ACTIVITY_ID'
repzo associations by-entity --query 'associatedType=contact' --query 'associatedId=CONTACT_ID'
repzo associations replace --data @associations.json --dry-run
```

Use direct foreign-key fields for normal one-to-one links. Do not invent polymorphic associations for unsupported resources.

## Record timeline

Use the timeline when the user asks what happened to one known record. Both `entityType` and `entityId` are required, so resolve the record first. Discover available source names instead of guessing them.

```bash
repzo timeline sources
repzo timeline list --query 'entityType=deal' --query 'entityId=DEAL_ID' --limit 30
repzo timeline list --query 'entityType=contact' --query 'entityId=CONTACT_ID' --query 'sources=activity,email_send'
```

Follow `meta.nextCursor` with `--query 'cursor=...'` only when more history is required. Timeline reads obey the record scope and the signed-in user's visibility.

## Comments

Comments are scoped to one exact record. Read the record and its existing thread before posting. Mentions are workspace user IDs discovered through `repzo metadata users`; replies use an existing comment ID from the same record.

```bash
repzo comments list deal DEAL_ID
repzo comments create deal DEAL_ID --data '{"content":"Commercial terms approved.","mentions":["USER_ID"]}' --dry-run
repzo comments create deal DEAL_ID --data @comment.json --yes --idempotency-key deal-DEAL_ID-comment-1
repzo comments create deal DEAL_ID --data '{"content":"Following up.","parentId":"COMMENT_ID"}' --dry-run
repzo comments update COMMENT_ID --data '{"content":"Updated wording."}' --dry-run
repzo comments delete COMMENT_ID --dry-run
```

A delegated user can update or delete only their own comments. Never reuse a `parentId` from another record.

## Attachments

Attachments are private by default and inherit access from their exact CRM record. List first, upload only a supported document/image type, and request a short-lived URL only when the file must be consumed.

```bash
repzo media list deal DEAL_ID
repzo media upload deal DEAL_ID ./proposal.pdf --dry-run
repzo media upload deal DEAL_ID ./proposal.pdf --yes --idempotency-key deal-DEAL_ID-proposal-v1
repzo media url MEDIA_ID
repzo media delete MEDIA_ID --dry-run
```

Do not expose a returned temporary URL in a public message; it grants time-limited access to the private file.

## Deletes

Treat deletes as exact-record operations. Read the record, state its identity, preview the delete, obtain explicit authorization if it was not already supplied, execute once, then confirm that a subsequent read returns not found.
