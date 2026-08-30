# AI-agent CLI/API notes

All commands call `/api/v1/agents` with a delegated `foxu-*` token and `ai_agents:read` or `ai_agents:write` scope. Live RBAC is checked again on each request:

- reads require `ai_agents.view`;
- Playbook updates and tests require `ai_agents.update`;
- Knowledge mutations require `ai_agents.manage_knowledge` plus relevant Content Hub permission;
- publishing requires `ai_agents.deploy`.

Key commands and paths:

| CLI command | Method and path |
|---|---|
| `repzo agents list` | `GET /agents` |
| `repzo agents get ID` | `GET /agents/{id}` |
| `repzo agents update ID` | `PATCH /agents/{id}` |
| `repzo agents knowledge list ID` | `GET /agents/{id}/knowledge-sources` |
| `repzo agents knowledge add ID` | `POST /agents/{id}/knowledge-sources` |
| `repzo agents knowledge reindex ID SOURCE` | `POST /agents/{id}/knowledge-sources/{sourceId}/reindex` |
| `repzo agents deployments ID` | `GET /agents/{id}/deployments` |
| `repzo agents publish ID` | `POST /agents/{id}/publish` |
| `repzo agents test start ID` | `POST /agents/{id}/test-conversations` |
| `repzo agents test send ID CONVERSATION` | `POST /agents/{id}/test-conversations/{conversationId}/messages` |
| `repzo agents test messages ID CONVERSATION` | `GET /agents/{id}/test-conversations/{conversationId}/messages` |

Lists are paginated. Agent and Knowledge lists use offset pagination; test messages use cursor pagination. Use `--all` only when the full collection is needed.

For every mutation, use `--dry-run` before `--yes`. Agent updates support `--if-match` with the latest `meta.etag`. A `412` is a concurrency conflict: re-read, rebase, preview, and retry. A `422` is a contract or Playbook validation error: use structured error details, not guesswork.

The public surface is curated. Missing raw prompts, model credentials, connectors, action catalogs, and installation config are intentional safety boundaries, not fields to recover from internal endpoints.
