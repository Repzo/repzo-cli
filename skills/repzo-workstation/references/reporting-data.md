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
repzo reports execute --data @report-query.json --dry-run
repzo reports execute --data @report-query.json --yes
```

Although report execution returns data, the API uses POST and the CLI classifies it as a mutation requiring confirmation. Follow the CLI safeguard.

Do not reconstruct analytics by downloading all CRM records when the reports API supports the calculation. On validation errors, inspect `details`, saved report configuration, categories, filter values, and OpenAPI rather than changing field names speculatively.

## Imports

The public API exposes import-job status but not file upload. Use the Workstation UI for starting an import.

```bash
repzo imports list --limit 50
repzo imports get IMPORT_ID
```

Do not use internal upload routes or claim the CLI can create imports.

## Exports

Creating an export schedules a job. It does not synchronously return the complete dataset.

```bash
repzo exports create --data @export.json --dry-run
repzo exports create --data @export.json --yes
repzo exports get EXPORT_ID
```

After creation, poll the exact job with reasonable spacing until it reaches a terminal status. Do not repeatedly list every export. Download only through a URL or action exposed by the public response/OpenAPI.

Import upload remains unavailable.
