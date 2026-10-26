---
name: repzo-ai-agents
description: Create, inspect, improve, configure, publish, deploy, roll back, diagnose, and safely test Repzo Workstation AI agents through the public `repzo` CLI. Use when a user asks to build or review an agent, edit its Playbook, enable or configure Functions (CRM actions such as create_order, create_appointment, send_whatsapp_flow), check which tools it can use, manage Knowledge, guidance, or procedures, change handoff or deployments, publish or restore a version, read runs, unresolved questions, or answer feedback, or test an agent end to end in Inbox.
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

All workflows are in [references/workflows.md](references/workflows.md). Command paths, bodies, permissions, and errors are in [references/api.md](references/api.md).

- Inspect or review: get the agent, then its Functions, tools, Knowledge, guidance, procedures, deployments, and versions. Do not mutate.
- Create: read `repzo agents templates`, then `repzo agents create` (always a draft chat agent; voice agents are created in the web app).
- Edit behavior: read [references/playbook.md](references/playbook.md). Validate with `repzo agents playbook validate`, then save with `repzo agents update`.
- Let the agent take CRM actions: read [references/functions.md](references/functions.md). Enable and configure with `repzo agents functions update`; check names with `repzo agents tools`.
- Pick the right place for a change: facts go in Knowledge; short standing rules go in guidance; step-by-step conversations go in Playbook flows; manual procedures only when the user asks for one.
- Diagnose live behavior: `repzo agents runs list`, `repzo agents unresolved list`, and `repzo agents feedback`, then propose a fix.
- Test end to end: start a fresh isolated test conversation, send customer-side messages, and poll its messages. Write tools are simulated; read tools and the real Inbox/runtime pipeline still execute.
- Publish, roll back, deploy: publish only after review and testing; restore a version only with approval; change deployments with `repzo agents deployments`.
- Troubleshoot a command or payload: run `repzo agents --agent --help` and read [references/api.md](references/api.md).

## Apply these invariants

1. Read the agent, its Functions, tools, Knowledge sources, and deployments before suggesting changes.
2. Separate facts from behavior: product facts, policies, prices, and documentation belong in Knowledge; tone, decision rules, escalation, and procedures belong in Playbook or guidance.
3. Never auto-apply an improvement. Present the proposed Playbook diff, Function config, guidance, or Knowledge operation and wait for authorization.
4. Preserve unrelated Playbook sections. Do not replace the whole document when a focused edit is enough.
5. Treat the Playbook as source code. Run `repzo agents playbook validate` before every `repzo agents update` that changes it; fix all errors and report warnings to the user.
6. Never guess a tool name. Read `repzo agents tools AGENT_ID --json` and use only names with `allowed: true`. If a needed action is a Function that is off, enable it with `repzo agents functions update` before a `[[tool]]` step or procedure uses it. Helper read tools come only with their Function.
7. Read the latest agent ETag, preview every mutation with `--dry-run`, then execute with `--yes` (and `--if-match ETAG` for `agents update`). On `412`, re-read and rebase instead of overwriting.
8. Test drafts before publish. Every test starts a fresh conversation so procedure state cannot leak between scenarios.
9. Test write actions are always simulated. Never claim a contact, order, ticket, or other record was actually changed during a test; report the simulated action.
10. Publishing creates an immutable behavior snapshot for live runs. Saving a draft, enabling a Function, or restoring a version is not publishing.
11. Restore a version, unpublish, delete an agent, or change deployments only with explicit approval. Unpublish makes live runs use the draft immediately, so never use it as a rollback.
12. Re-read after every change and report the agent ID, published version when relevant, and test conversation ID.

## Discover live commands

```bash
repzo agents --agent --help
repzo commands --json
repzo openapi --quiet
```

Use `$repzo-workstation` alongside this skill when the task also needs ordinary CRM, Content Hub, Inbox, metadata, WhatsApp Flow authoring, or media operations.
