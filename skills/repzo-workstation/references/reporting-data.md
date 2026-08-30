# Reporting and data jobs

Use this reference for saved reports, report execution, filter-value discovery, import inspection, and export jobs.

## Reports

List saved reports or categories when the user refers to a report by name. Fetch the exact saved report before execution.

```bash
repzo reports categories
repzo reports list --query 'name=Pipeline health' --limit 20
repzo reports get REPORT_ID
repzo reports filter-values --query 'entity=deals' --query 'field=stageId'
```

Execute a saved or ad hoc aggregate config through the reports endpoint. A saved config can be reused after removing presentation-only `visualization` data.

```bash
repzo reports execute --data @report-query.json
```

Report execution uses POST because its validated query is too structured for a query string, but it is read-only and does not require `--yes`.

Do not reconstruct analytics by downloading all CRM records when the reports API supports the calculation. On validation errors, inspect `details`, saved report configuration, categories, filter values, and OpenAPI rather than changing field names speculatively.

## Imports

Imports are a guarded multi-step workflow: upload, create mappings, validate without writing records, then start only after validation is acceptable. Preview every mutating step.

```bash
repzo imports upload ./contacts.csv --dry-run
repzo imports upload ./contacts.csv --yes
repzo imports create --data @import.json --dry-run
repzo imports create --data @import.json --yes
repzo imports validate IMPORT_ID
repzo imports start IMPORT_ID --dry-run
repzo imports start IMPORT_ID --yes
repzo imports list --limit 50
repzo imports get IMPORT_ID
```

Example `import.json`:

```json
{
  "fileId": "UPLOADED_FILE_ID",
  "moduleName": "contacts",
  "fieldMapping": {
    "First Name": "firstName",
    "Last Name": "lastName",
    "Email": "email"
  },
  "updateStrategy": "create_only",
  "skipEmpty": true
}
```

Do not start an import when dry-run validation reports mapping or row errors unless the user explicitly accepts the consequences. Import start is asynchronous; poll the exact job until it reaches a terminal status.

## Exports

Creating an export schedules a job. It does not synchronously return the complete dataset.

```bash
repzo exports create --data @export.json --dry-run
repzo exports create --data @export.json --yes
repzo exports get EXPORT_ID
```

After creation, poll the exact job with reasonable spacing until it reaches a terminal status. Do not repeatedly list every export. Download only through a URL or action exposed by the public response/OpenAPI.
