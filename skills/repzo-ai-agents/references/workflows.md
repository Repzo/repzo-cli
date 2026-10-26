# AI-agent workflows

## Inspect an agent

```bash
repzo agents list --json
repzo agents get AGENT_ID --json
repzo agents functions list AGENT_ID --all --json
repzo agents tools AGENT_ID --all --json
repzo agents knowledge list AGENT_ID --all --json
repzo agents guidance list AGENT_ID --all --json
repzo agents procedures list AGENT_ID --all --json
repzo agents deployments list AGENT_ID --all --json
repzo agents versions list AGENT_ID --json
```

`agents get` includes `channelMode` (`chat`, `calling`, `both`), `handoffSettings`, and `chatSettings`. The public response intentionally omits system prompts, model credentials, connector secrets, and deployment `config`. If a diagnosis needs one of those hidden values, direct the user to Settings → AI Agents instead of calling internal endpoints.

## Where a change belongs

| The user wants… | Use |
|---|---|
| Facts: products, prices, policies, opening hours, documentation | Knowledge (`agents knowledge add`) |
| A short standing rule: tone, when to clarify, which sources to trust, when to escalate, a policy | Guidance (`agents guidance create`) |
| A step-by-step conversation: collect fields, call actions, reply with saved replies | A Playbook flow (`agents update` with `playbook`) |
| A step-by-step flow kept outside the Playbook, only when the user asks for one | A manual procedure (`agents procedures create`) |
| Letting the agent take a CRM action (book, order, ticket, tag…) | A Function (`agents functions update`), see [functions.md](functions.md) |
| Who gets the conversation on handoff, and what is said | `handoffSettings` on `agents update` |
| Where the agent works and how (auto reply, suggest, note) | Deployments |

Procedures with `source: "playbook"` are compiled from Playbook flows. Editing or deleting them returns `409`: change the Playbook flow instead.

## Create an agent

```bash
repzo agents templates --json
repzo agents create --data '{"name":"Clinic bookings","templateKey":"appointment"}' --dry-run
repzo agents create --data '{"name":"Clinic bookings","templateKey":"appointment"}' --yes --json
repzo agents get NEW_AGENT_ID --json
```

The CLI always creates a draft chat agent. Each template lists the Functions it uses and the setup it still needs; walk the user through those (Functions, Knowledge, deployments). Calling (voice) agents must be created in the web app because they need a model and voice.

## Improve behavior (Playbook)

1. Read the current agent and keep `meta.etag` from `agents get`.
2. Identify the smallest Playbook change. Preserve unrelated Markdown and flow blocks. Read [playbook.md](playbook.md).
3. List tools with `repzo agents tools AGENT_ID --json`. If a flow needs a Function that is not enabled, enable it first (next section).
4. Show the proposed change to the user. Do not apply suggestions automatically.
5. Put the updated Playbook in a JSON file to avoid shell quoting mistakes:

```json
{
  "playbook": "# Role\n..."
}
```

6. Validate, then preview and apply only after approval:

```bash
repzo agents playbook validate AGENT_ID --data @agent-update.json --json
repzo agents update AGENT_ID --data @agent-update.json --if-match '"LATEST_ETAG"' --dry-run
repzo agents update AGENT_ID --data @agent-update.json --if-match '"LATEST_ETAG"' --yes
repzo agents get AGENT_ID --json
```

Validation saves nothing. Fix every error, read the warnings (for example "Saving also allows the agent to use X"), and check the compiled flows. An update also compiles flows; a `422` means nothing was saved.

## Enable and configure Functions

```bash
repzo agents functions list AGENT_ID --all --json
repzo agents functions get AGENT_ID create_order --json
repzo agents functions update AGENT_ID create_order --data @function-update.json --dry-run
repzo agents functions update AGENT_ID create_order --data @function-update.json --yes
repzo agents tools AGENT_ID --json
```

For `send_whatsapp_flow`, first read `repzo agents whatsapp-flows AGENT_ID --json` and put the chosen published Flow IDs in `config.whatsappFlows`. Disabling a Function used by a flow or procedure returns `409`; check `usedIn`. Full details: [functions.md](functions.md).

## Guidance and manual procedures

```bash
repzo agents guidance create AGENT_ID \
  --data '{"category":"escalation","title":"Refund disputes","instruction":"Hand off to a human when a customer disputes a refund."}' \
  --dry-run
repzo agents guidance update AGENT_ID GUIDANCE_ID --data '{"enabled":false}' --dry-run
repzo agents procedures get AGENT_ID PROCEDURE_ID --json
repzo agents procedures update AGENT_ID PROCEDURE_ID --data @procedure.json --dry-run
```

Repeat approved previews with `--yes`. Procedure tool steps must name a tool with `allowed: true`, or the server returns `422`.

## Handoff and chat settings

Update `handoffSettings` or `chatSettings` with `agents update` and the latest ETag. Copy route targets from `repzo metadata users` and `repzo metadata departments`; never guess IDs. `chatSettings` is `null` for calling-only agents.

## Manage Knowledge

Link an existing published Content Hub article:

```bash
repzo agents knowledge add AGENT_ID \
  --data '{"sourceType":"content_hub_article","sourceId":"ARTICLE_ID","title":"Delivery policy"}' \
  --dry-run
```

Add a website sync:

```bash
repzo agents knowledge add AGENT_ID \
  --data '{"sourceType":"website_sync","sourceUrl":"https://example.com/help","title":"Help center","syncFrequency":"weekly"}' \
  --dry-run
```

Convert an already-uploaded media file into a Knowledge article:

```bash
repzo agents knowledge add AGENT_ID \
  --data '{"sourceType":"uploaded_file","sourceId":"MEDIA_ID","title":"Returns handbook"}' \
  --dry-run
```

Repeat an approved preview with `--yes`. Knowledge authoring requires both AI-agent Knowledge permission and Content Hub create/manage access. Existing Content Hub or media IDs must belong to the same workspace.

Reindex or remove an exact source:

```bash
repzo agents knowledge reindex AGENT_ID SOURCE_ID --dry-run
repzo agents knowledge delete AGENT_ID SOURCE_ID --dry-run
```

Reindexing a website queues a resync. Deleting the agent source removes its agent index linkage and vectors; it does not delete the underlying Content Hub article.

## Diagnose live behavior

```bash
repzo agents runs list AGENT_ID --json
repzo agents runs get AGENT_ID RUN_ID --json
repzo agents unresolved list AGENT_ID --query status=new --json
repzo agents feedback AGENT_ID --query days=30 --json
```

- A run shows the reply, `handoffReason`, `noToolReason`, tool calls and results, Knowledge used, procedure runs, and a trace with per-step latency, cost, and errors. The transcript appears only when you can see that Inbox conversation.
- Unresolved questions group what the agent could not answer, with examples (each with a `runId`) and suggestions. Usually the fix is Knowledge. After the fix is saved, and with approval, mark the group: `repzo agents unresolved update AGENT_ID GROUP_ID --data '{"status":"resolved"}' --dry-run`.
- Feedback gives thumbs-up/down stats by reason and clusters of bad answers with conversation IDs.

Turn findings into a proposed change (Knowledge, guidance, Playbook, or Function config). Never apply it without approval; then test it.

## Test the draft end to end

Start every scenario in a fresh conversation:

```bash
repzo agents test start AGENT_ID --data '{"sideEffects":"simulate"}' --dry-run
repzo agents test start AGENT_ID --data '{"sideEffects":"simulate"}' --yes --json
```

Save the returned `conversationId`, then speak as the customer:

```bash
repzo agents test send AGENT_ID CONVERSATION_ID \
  --data '{"body":"Hi, I want to place an order"}' --dry-run
repzo agents test send AGENT_ID CONVERSATION_ID \
  --data '{"body":"Hi, I want to place an order"}' --yes
repzo agents test messages AGENT_ID CONVERSATION_ID --all --json
```

The send enters the real Inbox ingress, identity, dispatcher, draft Playbook, Knowledge retrieval, and Agent 2 pipeline. Replies are asynchronous, so poll messages briefly when the agent reply is not present yet. Read-only tools execute. Mutating tools return a successful result marked `simulated: true`; no live workspace record changes.

Test at least:

- a normal Knowledge answer;
- each important Playbook flow;
- each newly enabled or reconfigured Function;
- missing required information;
- an escalation/handoff;
- a requested write action, confirming it is described as simulated;
- unsupported or adversarial input.

## Publish the reviewed draft

First inspect deployments and repeat the final draft read. Publishing affects the agent's live channels, so it always requires explicit user authorization.

```bash
repzo agents deployments list AGENT_ID --all --json
repzo agents publish AGENT_ID --dry-run
repzo agents publish AGENT_ID --yes --json
repzo agents get AGENT_ID --json
```

Report `versionId` and `versionNumber`.

## Versions and rollback

```bash
repzo agents versions list AGENT_ID --json
repzo agents versions get AGENT_ID VERSION_ID --json
repzo agents versions restore AGENT_ID VERSION_ID --dry-run
repzo agents versions restore AGENT_ID VERSION_ID --yes --json
```

Compare the version's `snapshot` with the current agent and show the user what will change before restoring. Restore copies the version into the draft after saving a backup version (`backupVersionId`); it needs both update and Knowledge permission and returns `warnings` to review. Live runs keep using the published version until you test and publish. Restore only with explicit approval.

`repzo agents unpublish AGENT_ID` clears the published version: live runs immediately use the current draft, and every later draft save goes live at once. Never use it as a rollback; restore and publish instead. Unpublish only when the user explicitly asks for instant mode.

## Deploy

```bash
repzo agents deployments targets AGENT_ID --json
repzo agents deployments create AGENT_ID \
  --data '{"targetType":"inbox_channel","targetId":"CHANNEL_ID","mode":"suggest_reply"}' --dry-run
repzo agents deployments update AGENT_ID DEPLOYMENT_ID --data '{"enabled":false}' --dry-run
repzo agents deployments delete AGENT_ID DEPLOYMENT_ID --dry-run
```

`targetId: null` with `inbox_channel` covers every Inbox channel. Tickets are always available as `{"targetType":"ticket","targetId":null}` and are not listed in targets. Modes: `auto_reply` (answers customers directly), `suggest_reply`, `internal_note`, `action_only`, `triage_only`. Before `auto_reply`, confirm the agent is tested and published. Repeat approved previews with `--yes`, then re-read `agents deployments list`.

## Archive or delete

Archive with `agents update` and `{"status":"archived"}` (with the latest ETag). `repzo agents delete AGENT_ID` soft-deletes the agent; system agents return `403`. Both need explicit approval.
