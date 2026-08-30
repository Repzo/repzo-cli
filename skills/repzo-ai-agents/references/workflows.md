# AI-agent workflows

## Inspect an agent

```bash
repzo agents list --json
repzo agents get AGENT_ID --json
repzo agents knowledge list AGENT_ID --all --json
repzo agents deployments AGENT_ID --all --json
```

The public response intentionally omits system prompts, model credentials, connector secrets, and deployment `config`. If a diagnosis needs one of those hidden values, direct the user to Settings → AI Agents instead of calling internal endpoints.

## Improve behavior

1. Read the current agent and retain `meta.etag` from `agents get`.
2. Identify the smallest Playbook change. Preserve unrelated Markdown and flow blocks.
3. Show the proposed change to the user. Do not apply suggestions automatically.
4. Put the updated Playbook in a JSON file to avoid shell quoting mistakes:

```json
{
  "playbook": "# Role\n..."
}
```

5. Preview and apply only after approval:

```bash
repzo agents update AGENT_ID --data @agent-update.json --if-match '"LATEST_ETAG"' --dry-run
repzo agents update AGENT_ID --data @agent-update.json --if-match '"LATEST_ETAG"' --yes
repzo agents get AGENT_ID --json
```

An update compiles structured flows synchronously. A validation error means the Playbook was not saved; fix the reported flow/tool issue and retry from a fresh read.

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
- missing required information;
- an escalation/handoff;
- a requested write action, confirming it is described as simulated;
- unsupported or adversarial input.

## Publish the reviewed draft

First inspect deployments and repeat the final draft read. Publishing affects the agent's live installed channels, so it always requires explicit user authorization.

```bash
repzo agents deployments AGENT_ID --all --json
repzo agents publish AGENT_ID --dry-run
repzo agents publish AGENT_ID --yes --json
repzo agents get AGENT_ID --json
```

Report `versionId` and `versionNumber`. The CLI deliberately cannot unpublish into legacy instant-draft mode or edit arbitrary installation config. Use Settings → AI Agents for deployment target changes.
