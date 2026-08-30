# Sales and commerce

Use this reference for products, pipelines and stages, price offers, carts, orders, invoices, and line items.

## Resolve catalog and pipeline IDs

Never guess product, pipeline, stage, account, contact, or owner IDs. Resolve them through list/get calls or metadata.

```bash
repzo products list --query 'name=Implementation' --limit 20
repzo pipelines list --limit 100
repzo pipelines stages list PIPELINE_ID
repzo metadata users
```

## Pipeline stages

List stages before creating, editing, or deleting one. Deleting a stage can require `reassignToStageId`; determine the destination from the user rather than choosing it.

```bash
repzo pipelines stages create PIPELINE_ID --data @stage.json --dry-run
repzo pipelines stages update PIPELINE_ID STAGE_ID --data @stage-change.json --dry-run
repzo pipelines stages delete PIPELINE_ID STAGE_ID --query 'reassignToStageId=OTHER_STAGE_ID' --dry-run
```

Moving a deal is a deal update, not a pipeline-stage update:

```bash
repzo deals get DEAL_ID
repzo deals update DEAL_ID --data '{"pipelineId":"PIPELINE_ID","stageId":"STAGE_ID"}' --dry-run
```

## Documents and line items

Read the parent document and referenced product before changing commercial records. Keep money, currency, quantity, tax, and discount values exactly as supplied by the user or returned by the public schema.

```bash
repzo price-offers get PRICE_OFFER_ID
repzo carts get CART_ID
repzo invoices get INVOICE_ID
repzo orders get ORDER_ID
repzo line-items list --query 'invoiceId=INVOICE_ID' --limit 100
```

Use `repzo openapi --quiet` or focused agent help to confirm the strict body schema before creating a cart, order, invoice, price offer, or line item. Do not infer required commercial terms.

Price-offer item replacement is a replace-all operation. Read the current items, retain every intended line, and preview the complete body. The server recalculates totals and commits the items plus header totals atomically.

```bash
repzo price-offers items list PRICE_OFFER_ID
repzo price-offers items replace PRICE_OFFER_ID --data @offer-items.json --dry-run
repzo price-offers items replace PRICE_OFFER_ID --data @offer-items.json --yes --idempotency-key offer-PRICE_OFFER_ID-items-v2
```

Never send only one changed line unless the intended result is to remove all other lines.

Invoice opening and voiding are guarded workflows, not ordinary status patches. Opening validates required tax data and may schedule fiscal submission; voiding performs the configured reversal work.

```bash
repzo invoices get INVOICE_ID
repzo invoices open INVOICE_ID --dry-run
repzo invoices void INVOICE_ID --dry-run
```

Never write `status` directly when the user means open or void. Execute the workflow command once with a stable idempotency key, then re-read the invoice.

## Mutation sequence

1. Read the parent and related records.
2. Resolve all workspace IDs.
3. Prepare the smallest strict JSON body.
4. Run the exact command with `--dry-run`.
5. Repeat with `--yes` after authorization.
6. Re-read the parent and affected child records.

Deleting products, stages, documents, or line items can affect downstream records. Require explicit target authorization and surface any API conflict instead of attempting cascading internal operations.
