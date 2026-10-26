# AI-agent CLI/API notes

All commands call `/api/v1/agents` with a delegated `foxu-*` token (browser login) and `ai_agents:read` or `ai_agents:write` scope. A Developer App `foxa-*` key is rejected. Live RBAC is re-checked on every request.

## Permissions

| Request | Needs |
|---|---|
| Any read, and `agents playbook validate` | `ai_agents.view` |
| `agents unresolved list`, `agents feedback` | `ai_agents.manage_knowledge` |
| `agents create` | `ai_agents.create` |
| `agents delete` | `ai_agents.delete` |
| Knowledge writes, `agents unresolved update` | `ai_agents.manage_knowledge` (Knowledge authoring also needs Content Hub access) |
| `agents publish`, `agents unpublish`, deployment writes | `ai_agents.deploy` |
| `agents versions restore` | `ai_agents.update` and `ai_agents.manage_knowledge` |
| Every other write (agent update, Functions, guidance, procedures, tests) | `ai_agents.update` |

## Commands

| CLI command | Method and path |
|---|---|
| `repzo agents list` | `GET /agents` |
| `repzo agents templates` | `GET /agents/templates` |
| `repzo agents get ID` | `GET /agents/{id}` |
| `repzo agents create` | `POST /agents` |
| `repzo agents update ID` | `PATCH /agents/{id}` |
| `repzo agents delete ID` | `DELETE /agents/{id}` |
| `repzo agents functions list ID` | `GET /agents/{id}/functions` |
| `repzo agents functions get ID NAME` | `GET /agents/{id}/functions/{name}` |
| `repzo agents functions update ID NAME` | `PATCH /agents/{id}/functions/{name}` |
| `repzo agents tools ID` | `GET /agents/{id}/tools` |
| `repzo agents whatsapp-flows ID` | `GET /agents/{id}/whatsapp-flows` |
| `repzo agents playbook validate ID` | `POST /agents/{id}/playbook/validate` (read-only, no `--yes`) |
| `repzo agents versions list ID` | `GET /agents/{id}/versions` |
| `repzo agents versions get ID VERSION` | `GET /agents/{id}/versions/{versionId}` |
| `repzo agents versions restore ID VERSION` | `POST /agents/{id}/versions/{versionId}/restore` |
| `repzo agents publish ID` | `POST /agents/{id}/publish` |
| `repzo agents unpublish ID` | `DELETE /agents/{id}/publish` |
| `repzo agents runs list ID` | `GET /agents/{id}/runs` |
| `repzo agents runs get ID RUN` | `GET /agents/{id}/runs/{runId}` |
| `repzo agents unresolved list ID` | `GET /agents/{id}/unresolved-questions` |
| `repzo agents unresolved update ID GROUP` | `PATCH /agents/{id}/unresolved-questions/{groupId}` |
| `repzo agents feedback ID` | `GET /agents/{id}/answer-feedback` |
| `repzo agents deployments list ID` | `GET /agents/{id}/deployments` |
| `repzo agents deployments targets ID` | `GET /agents/{id}/deployment-targets` |
| `repzo agents deployments create ID` | `POST /agents/{id}/deployments` |
| `repzo agents deployments update ID DEPLOYMENT` | `PATCH /agents/{id}/deployments/{deploymentId}` |
| `repzo agents deployments delete ID DEPLOYMENT` | `DELETE /agents/{id}/deployments/{deploymentId}` |
| `repzo agents guidance list ID` | `GET /agents/{id}/guidance` |
| `repzo agents guidance create ID` | `POST /agents/{id}/guidance` |
| `repzo agents guidance update ID GUIDANCE` | `PATCH /agents/{id}/guidance/{guidanceId}` |
| `repzo agents guidance delete ID GUIDANCE` | `DELETE /agents/{id}/guidance/{guidanceId}` |
| `repzo agents procedures list ID` | `GET /agents/{id}/procedures` |
| `repzo agents procedures get ID PROCEDURE` | `GET /agents/{id}/procedures/{procedureId}` |
| `repzo agents procedures create ID` | `POST /agents/{id}/procedures` |
| `repzo agents procedures update ID PROCEDURE` | `PATCH /agents/{id}/procedures/{procedureId}` |
| `repzo agents procedures delete ID PROCEDURE` | `DELETE /agents/{id}/procedures/{procedureId}` |
| `repzo agents knowledge list ID` | `GET /agents/{id}/knowledge-sources` |
| `repzo agents knowledge add ID` | `POST /agents/{id}/knowledge-sources` |
| `repzo agents knowledge delete ID SOURCE` | `DELETE /agents/{id}/knowledge-sources/{sourceId}` |
| `repzo agents knowledge reindex ID SOURCE` | `POST /agents/{id}/knowledge-sources/{sourceId}/reindex` |
| `repzo agents test start ID` | `POST /agents/{id}/test-conversations` |
| `repzo agents test send ID CONVERSATION` | `POST /agents/{id}/test-conversations/{conversationId}/messages` |
| `repzo agents test messages ID CONVERSATION` | `GET /agents/{id}/test-conversations/{conversationId}/messages` |

The older `repzo agents deployments ID` form still works and runs `agents deployments list`.

Run `repzo agents --agent --help` for each command's body shape and gotchas.

## Bodies

- `agents create`: `{ name (required), description?, templateKey?, playbook?, role?, tone?, languageBehavior?, fallbackBehavior?, visibilityScope?: "org"|"department"|"private", handoffSettings? }`. Always a draft chat agent. Calling (voice) agents are created in the web app, which picks the model and voice.
- `agents update`: any of `name`, `description`, `playbook`, `role`, `tone`, `languageBehavior`, `fallbackBehavior`, `visibilityScope`, `status` (including `"archived"`), `handoffSettings` (object, or `null` for defaults), `chatSettings` (`{ endChatEnabled?, autoCloseMinutes? }`, merged with the current value).
- `handoffSettings`: `{ conditions: string[] (≤10, each ≤300 chars), messageMode: "ai"|"fixed", messageText (required for fixed), routeTo: "inbox"|"user"|"department", routeUserId, routeDepartmentId, afterHandoff: "stop"|"keep_helping", summaryNote: boolean }`. Copy user and department IDs from `repzo metadata users` and `repzo metadata departments`.
- `agents functions update`: see [functions.md](functions.md).
- `agents playbook validate`: `{ "playbook": "…" }`.
- `agents unresolved update`: `{ "status": "new"|"reviewing"|"resolved"|"ignored" }`.
- `agents deployments create`: `{ targetType: "inbox_channel"|"ticket", targetId?: string|null, mode?, enabled? }`. Inbox: `targetId` is a channel from `agents deployments targets`, or `null` for all Inbox channels. Tickets: `targetId` must be `null`. `mode`: `auto_reply`, `suggest_reply`, `internal_note`, `action_only`, `triage_only` (default `auto_reply` for Inbox, `suggest_reply` for tickets).
- `agents deployments update`: `{ mode?, enabled? }`.
- `agents guidance create`: `{ category, title, instruction, channel?, priority?, enabled? }`. `category`: `communication_style`, `clarification`, `content_sources`, `escalation`, `policy`.
- `agents procedures create|update`: `{ name, description?, status?, trigger?, triggerIntents?, channels?, modes?, steps }`. Steps: `{ type: "collect_fields", fields, required? }`, `{ type: "tool", name, required?, requiresApproval?, config? }`, `{ type: "instruction", text }`.

## Query options

- Lists use offset pagination (`--page`, `--limit`, `--all`); test messages use cursor pagination. Functions default to 50 per page, tools to 100.
- `agents unresolved list`: `--query status=new` (or `reviewing`, `resolved`, `ignored`).
- `agents feedback`: `--query days=30` (1–180) and `--limit 10` (clusters, 1–50).

## Errors

Errors use `{ error: { code, message, details? } }`.

- `422` validation: a bad body, an invalid Playbook, a tool step that names a tool that is not allowed. Read `details`; do not guess.
- `409` conflict: disabling a Function still used by a Playbook flow or procedure; editing or deleting a procedure whose `source` is `playbook`.
- `412` stale ETag on `agents update`: re-read, rebase, preview, retry.
- `403` missing permission or a system agent; `404` unknown ID.

For every mutation, run `--dry-run` before `--yes`. Agent updates also take `--if-match` with the latest `meta.etag`.

The public surface is curated. Missing raw prompts, model credentials, connector secrets, and installation config are intentional safety boundaries, not fields to recover from internal endpoints.
