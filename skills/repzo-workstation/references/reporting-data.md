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

## KPI goals

| Command family | Read | Change |
|---|---|---|
| `kpi-definitions` | list, get, goal-counts | create, update, delete, preview-impact |
| `kpi-goals` | list, get, my, dashboard, leaderboard, report, report drilldown, snapshots | create, update, delete, recalculate |
| `kpi-goal-groups` | list, get, breakdown | create, update, delete |

- Needs the KPI Plus plan module (except `kpi-goals my`). Goals follow data visibility: a member sees their own and their team's goals.
- A definition that goals use can't be deleted unless you say what happens to them: `--query goalAction=delete_all` or `delete_active` (409 otherwise). `preview-impact` shows what a definition change would do before you make it.
- Assignees must be members or teams of this workspace. Goals inside a goal group are changed through the group, not one by one.

## Commissions

| Command family | Read | Change |
|---|---|---|
| `commission-plans` | list, get | create, update, delete, recalculate |
| `commission-statements` | list, get | approve, pay, void, reopen, adjust |

- Needs the KPI Plus plan module. A plan pays on the records one goal counts, so create the goal first (`repzo kpi-goal-groups create`) and pass its id as `sourceGoalId`.
- Statements go open or pending, then approved, then paid. A statement can be approved only after its period has ended, and `pay` records a payment without sending any money.
- Non-approvers see only their own statements and those in their KPI Goals data visibility.
- `update` sends the whole plan. Leaving out `isActive` keeps it as it is. Saving recalculates open and pending statements and drops those the new dates no longer cover; approved and paid ones keep their amounts.
- `adjust` replaces any earlier adjustment, and `--data '{"adjustment":0}'` removes it. Use a negative amount to take back commission on a refunded deal.
- In a rate card, name custom properties as `customProperties.<key>`. Amounts must be JSON numbers and dates must be `YYYY-MM-DD`.

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
