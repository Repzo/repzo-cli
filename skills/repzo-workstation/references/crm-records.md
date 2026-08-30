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

If several records match, present distinguishing fields and ask for the target. Never choose by list position. Fetch the selected record before mutating it:

```bash
repzo contacts get CONTACT_ID
repzo deals get DEAL_ID
```

## Create or update

Read property metadata when fields or validation rules are unfamiliar:

```bash
repzo request GET /metadata/properties/contact
repzo request GET /metadata/properties/deal
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

## Deletes

Treat deletes as exact-record operations. Read the record, state its identity, preview the delete, obtain explicit authorization if it was not already supplied, execute once, then confirm that a subsequent read returns not found.
