---
name: repzo-ai-agents
description: Inspect, improve, configure, publish, and safely test Repzo Workstation AI agents through the public `repzo` CLI. Use when a user asks to review an agent, improve its Playbook, manage Knowledge sources, inspect Deploy settings, publish reviewed behavior, test an agent end to end in Inbox, or work with Playbook variables, flows, actions, saved replies, handoffs, and tags.
---

# Repzo AI Agents

Manage AI agents through the delegated-user public API. This skill is intentionally narrower than the internal Settings UI: it never exposes raw system prompts, connector secrets, hidden installation config, or unrestricted test actions.

## Start safely

Once at the start of an agent thread, run the read-only update check:

```bash
repzo upgrade
```

If an update is available, report it and ask before `repzo upgrade --yes`. After an approved upgrade, run `repzo doctor` and start a new agent thread so both Repzo skills reload.

AI-agent commands require browser login with a delegated `foxu-*` user token. A Developer App `foxa-*` key is rejected because publishing and testing must remain attributable to the real operator.

```bash
repzo auth login
repzo agents list --json
```

## Choose the workflow

- Inspect or diagnose: read [references/workflows.md](references/workflows.md), then list and get the exact agent. Do not mutate.
- Improve behavior or edit Playbook: also read [references/playbook.md](references/playbook.md). Propose the exact change before writing.
- Add or remove facts: use Knowledge, not Playbook. Follow the Knowledge section in [references/workflows.md](references/workflows.md).
- Test end to end: start a fresh isolated test conversation, send customer-side messages, and poll its messages. Write tools are simulated; read tools and the real Inbox/runtime pipeline still execute.
- Publish: publish only after the user explicitly authorizes it and the draft has been reviewed and tested.
- Troubleshoot a command or payload: read [references/api.md](references/api.md).

## Apply these invariants

1. Read the agent, its Knowledge sources, and deployments before suggesting changes.
2. Separate facts from behavior: product facts, policies, prices, and documentation belong in Knowledge; tone, decision rules, escalation, and procedures belong in Playbook.
3. Never auto-apply an improvement. Present the proposed Playbook diff or Knowledge operation and wait for authorization.
4. Preserve unrelated Playbook sections. Do not replace the whole document when a focused edit is enough.
5. Treat the Playbook as source code. Structured flow blocks compile on save; malformed flows or unknown tools cause the update to fail.
6. Read the latest agent ETag, preview the mutation with `--dry-run`, then execute with both `--if-match ETAG` and `--yes`. On `412`, re-read and rebase instead of overwriting.
7. Test drafts before publish. Every test starts a fresh conversation so procedure state cannot leak between scenarios.
8. Test write actions are always simulated. Never claim a contact, order, ticket, or other record was actually changed during a test; report the simulated action.
9. Publishing creates an immutable behavior snapshot for live runs. Saving a draft is not publishing.
10. Re-read after every change and report the agent ID, published version when relevant, and test conversation ID.

## Discover live commands

```bash
repzo agents --agent --help
repzo commands --json
repzo openapi --quiet
```

Use `$repzo-workstation` alongside this skill when the task also needs ordinary CRM, Content Hub, Inbox, metadata, or media operations.
