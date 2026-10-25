# Repzo CLI

The official standalone command-line interface for Repzo Workstation and AI agents.

## Install

macOS, Linux, or WSL:

```bash
curl -fsSL https://raw.githubusercontent.com/Repzo/repzo-cli/main/scripts/install-repzo-cli.sh | bash
```

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/Repzo/repzo-cli/main/scripts/install-repzo-cli.ps1 | iex
```

Then set up your coding agents and authenticate:

```bash
repzo setup agents
repzo auth login
repzo doctor
```

Setup installs two managed skills into detected Codex and Claude homes:

- `$repzo-workstation` for CRM, Inbox, chat, commerce, content, and reporting.
- `$repzo-ai-agents` for Playbook, Knowledge, publishing, and isolated end-to-end agent tests.

Node and npm are not required. The installer downloads the standalone binary for your platform and verifies its SHA-256 checksum. When `cosign` is installed, it also verifies the release's keyless Sigstore signature.

## Use

Discover the complete command surface:

```bash
repzo commands --json
repzo --help
```

Examples:

```bash
repzo contacts list --limit 20
repzo deals get DEAL_ID
repzo chat send CHANNEL_ID --data '{"body":"Hello","bodyFormat":"plain"}' --dry-run
repzo agents get AGENT_ID --json
repzo agents test start AGENT_ID --data '{"sideEffects":"simulate"}' --dry-run
```

The CLI defaults to `https://workstation.repzo.com`. Use `--base-url` or `REPZO_BASE_URL` for a different deployment. Mutations require either `--dry-run` or `--yes`. Credentials are accepted through browser login, stdin, or environment variables—never command-line arguments.

Support agents can sign a separate profile in to a customer workspace that has turned on Support access. The browser asks which workspace and which member to act as; the login ends after 8 hours or as soon as the customer turns support access off:

```bash
repzo auth login --support --profile support-acme
repzo contacts list --profile support-acme
```

Check whether an installer-managed binary has an update available:

```bash
repzo upgrade
```

The check is read-only. To install an available update and verify the installation:

```bash
repzo upgrade --yes
repzo doctor
```

The upgraded CLI refreshes both installed agent skills automatically. Start a new agent thread afterward so it loads the refreshed skills.

See [Releases](https://github.com/Repzo/repzo-cli/releases) for checksummed binaries for macOS, Linux, and Windows.

## Development

```bash
npm ci
npm run check
npm run build -- --target=bun-darwin-arm64
```

The npm package is private by design. Repzo CLI is distributed only as standalone executables from GitHub Releases.

## Bulk updates

Apply shared changes to 1–500 explicit record IDs:

```bash
repzo contacts bulk-update --data @bulk-update.json --dry-run --idempotency-key contact-rating-batch-1
repzo contacts bulk-update --data @bulk-update.json --yes --idempotency-key contact-rating-batch-1
```

The body is `{ "ids": ["UUID", "UUID"], "updates": { "rating": "warm" } }`. Supported resources: contacts, accounts, deals, activities, projects, tickets, invoices, price-offers, campaigns, and products. Inspect the live OpenAPI for each resource's bulk-editable fields.

The summary reports succeeded/total and failures. HTTP 200 and exit code 0 may include partial failures; inspect `data.failed` and `data.results` and verify successful records. Batches are not atomic. Use separate idempotency keys for separate batches; `--if-match` is unsupported. See the [bulk update skill reference](skills/repzo-workstation/references/bulk-updates.md) for selection and retry guidance.

## Duplicates and merging

Review the workspace's duplicate suggestions for accounts or contacts, then merge records into a primary one:

```bash
repzo accounts duplicates list --limit 20
repzo accounts merge preview --data @merge.json
repzo accounts merge --data @merge.json --yes --idempotency-key merge-acme-1
```

The body is `{ "primaryId": "UUID", "mergeIds": ["UUID"], "properties": { "phone": "UUID" }, "versions": { … } }`. `merge preview` runs the full merge and rolls it back, so it needs no `--yes`; send its `versions` with the real merge so a record that changed in between fails with 409. Merged records are archived and there is no unmerge. `repzo accounts duplicates reject <id>` marks a suggestion as not a duplicate. See the [duplicates skill reference](skills/repzo-workstation/references/duplicates.md).

## Email templates

Create and edit the reusable email templates in Settings → Email templates. Send an Unlayer design and the server builds the HTML, or send your own HTML and the server wraps it in a one-block design so the editor can still open it:

```bash
repzo email-templates create --data '{"name":"Welcome","subject":"Hi {{contact.firstName}}","designJson":{…}}' --dry-run
repzo email-templates create --data '{"name":"Order shipped","bodyHtml":"<table role=\"presentation\">…</table>"}' --dry-run
repzo email-templates update TEMPLATE_ID --data @change.json --if-match '"ETAG"' --yes
repzo email-templates clone TEMPLATE_ID --data '{"name":"Welcome (copy)"}' --yes
```

The server builds HTML only for text, heading, button, divider, image, and html blocks, and rejects other block types with 422. Pass the `meta.etag` from `get` as `--if-match` so an edit made in the editor meanwhile is not overwritten. See the [email templates skill reference](skills/repzo-workstation/references/email-templates.md) for a full design and an HTML example.

## WhatsApp Flows

Build and edit the in-chat WhatsApp forms (lead capture, surveys, booking, and ordering) on a WhatsApp channel. Start from a ready-made starter, save a draft, and sync it to Meta when it's ready:

```bash
repzo inbox whatsapp-channels list
repzo inbox whatsapp-flows starters
repzo inbox whatsapp-flows create --data @flow.json --dry-run
repzo inbox whatsapp-flows update FLOW_ID --data '{"revision":3,"name":"Lead form"}' --yes
repzo inbox whatsapp-flows sync FLOW_ID --yes
repzo inbox whatsapp-flows send-test FLOW_ID --data '{"to":"+962790000000","body":"Try our form","cta":"Open form"}' --yes
```

Each Flow response lists `problems` that would stop the sync. Updates need the `revision` from your last read, and published Flows are locked, so duplicate one to change it. See the [WhatsApp Flows skill reference](skills/repzo-workstation/references/whatsapp-flows.md).
