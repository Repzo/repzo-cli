# Marketing and content

Use this reference for CRM campaigns, forms, segments, content collections, and articles. Repzo Send campaigns are a different surface; use `communications.md` for those.

## Campaigns

Use standard CRUD commands and inspect metadata before unfamiliar fields.

```bash
repzo campaigns list --limit 50
repzo campaigns get CAMPAIGN_ID
repzo campaigns update CAMPAIGN_ID --data @campaign-change.json --dry-run
```

Do not confuse `campaigns` with `send campaigns`. Confirm which product surface the user means when context is ambiguous.

## Forms

Creating or editing a form does not publish it. Treat publish and archive as separate explicit mutations.

```bash
repzo forms get FORM_ID
repzo forms update FORM_ID --data @form-change.json --dry-run
repzo forms publish FORM_ID --dry-run
repzo forms archive FORM_ID --dry-run
```

Verify the returned form state after execution.

## Segments

Read a segment before evaluation or modification. Evaluation is a server-side read-like calculation exposed as an explicit action; pass only documented filters.

```bash
repzo segments get SEGMENT_ID
repzo segments evaluate SEGMENT_ID --query 'limit=50' --dry-run
repzo segments evaluate SEGMENT_ID --query 'limit=50' --yes
repzo segments update SEGMENT_ID --data @segment-change.json --dry-run
```

Use the live OpenAPI schema for rule structure and supported entities; never invent field/operator combinations.

## Collections and articles

Collections organize articles. Read the collection and article before changes. Publication state changes are separate from CRUD updates.

```bash
repzo collections list --limit 50
repzo articles list --query 'collectionId=COLLECTION_ID' --limit 50
repzo articles get ARTICLE_ID
repzo articles publish ARTICLE_ID --dry-run
repzo articles unpublish ARTICLE_ID --dry-run
repzo articles archive ARTICLE_ID --dry-run
```

Do not publish merely because the user asked to draft or edit content.
