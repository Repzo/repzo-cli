# Call flows

Use this reference to read, build, or change a call flow: the steps that decide what happens when someone calls a number. It's the same thing as Settings → the call line → Call flows in the web app, and a flow made here opens in the visual builder.

Call flows need a browser login (`repzo auth login`) and the `voice_calls.settings` permission, the same as the web builder. API keys can't use them. If a command says the scope is missing, run `repzo auth login` again.

## Commands

```bash
repzo voice channels
repzo voice flows list --query channelAccountId=CHANNEL_ID
repzo voice flows get FLOW_ID
repzo voice flows create --data @flow.json --dry-run
repzo voice flows update FLOW_ID --data @change.json --dry-run
repzo voice flows validate FLOW_ID
repzo voice flows publish FLOW_ID --data '{"revision":"REVISION"}' --dry-run
repzo voice flows activate FLOW_ID --data '{"revision":"REVISION"}' --dry-run
repzo voice flows discard-draft FLOW_ID --dry-run
repzo voice flows delete FLOW_ID --dry-run
repzo voice flows workflows
```

`list` returns summaries. Use `get` for `graph` (published) and `draftGraph` (unpublished changes). Lists include inactive and system flows.

## What changes real calls

| Step | Effect | Ask first? |
|---|---|---|
| `create`, `update`, `discard-draft` | Only saves a draft. No call changes | No, beyond the user asking for the edit |
| `validate` | Saves nothing | No |
| `publish` on an inactive flow | Saves the published version. No call changes | Confirm |
| `publish` on a live flow | **Real calls change straight away** | Always, and say so |
| `activate` | **Real calls on that number run this flow straight away**, replacing the current live flow | Always, and name the flow being replaced |
| `delete` | Removes the flow. A live flow can't be deleted | Confirm |

`validate` returns `isLive`. Check it before publishing, because `status` decides whether publishing is safe, not the wording of the request. Never run `publish` or `activate` as a side effect of "edit the flow". Stop at a saved draft unless the user asked for it to go live.

## How to change a flow

1. `repzo voice channels` to find the line, then `repzo voice flows list --query channelAccountId=CHANNEL_ID`.
2. `repzo voice flows get FLOW_ID`. Start from `draftGraph` if it isn't null, otherwise `graph`, and keep the `revision`.
3. `repzo voice flows update FLOW_ID --data @change.json --dry-run`, then with `--yes`. The body is `{ "revision": "...", "draftGraph": { ... } }`. Send the whole graph: it replaces the draft. Every read and write returns a new `revision`.
4. `repzo voice flows validate FLOW_ID` and fix every item in `issues`. Tell the user about `warnings`.
5. Only if the user asked: `publish`, then `activate` if the flow isn't already live. Use the newest `revision` each time.

A `409` means someone changed the flow since you read it, possibly in the web builder. Read it again, redo your change on the new version, and tell the user. Never retry with a guessed revision. Someone with the web builder open can still overwrite your draft, so check it again before publishing if time has passed.

`activate` refuses a flow with unpublished changes, and outbound flows can't be set live.

## The flow format

```json
{
  "nodes": [{ "id": "ring", "type": "ring_users", "config": { "ringTimeout": 25 } }],
  "edges": [{ "id": "e2", "source": "ring", "target": "vm", "kind": "missed" }]
}
```

- A flow has at most 50 steps and 80 connections. Each `id` is your own short name, and must be unique.
- Exactly one entry step: `incoming_call` for an inbound flow.
- An edge's `kind` says which outcome it follows. Every required branch must go somewhere, and each branch can only appear once on a step.
- Leave out `position`. The builder arranges the steps. If you're editing an existing flow, keep each step's `position` and `id`.
- Set `"direction": "outbound"` only for an AI outbound flow, which starts with `outbound_call`. Leave it out otherwise.
- Unknown settings are refused, and the error lists the ones allowed.

### Steps

| Step `type` | What it does | Branches (`kind`) | Settings (`config`) |
|---|---|---|---|
| `incoming_call` | Where an inbound call starts | `next` | none |
| `ring_users` | Rings the inbox's members, or chosen people | `missed` | `ringMembers` (default true; false rings only the chosen), `userIds`, `departmentIds`, `skipBusy`, `extraNumbers` (E.164), `ringTimeout` (5–60 s, default 20) |
| `ring_contact_owner` | Rings the CRM owner of the contact calling | `no_answer`, `no_owner` | `ringTimeout`, `skipBusy` |
| `call_queue` | Holds the caller with music and offers the call to free people | `timeout` | `ringMembers`, `userIds`, `departmentIds`, `maxWaitSeconds` (30–900, default 180), `message`, `language`, `announcePosition` |
| `voicemail` | Takes a message and ends the call | none | `greeting`, `language`, `transcribe` |
| `play_audio` | Speaks a message | `next` | `text` (required), `language` |
| `forward_call` | Forwards to a phone number | `no_answer` | `number` (E.164), `timeout` |
| `phone_menu` | "Press 1 for sales" | `digit_1` and so on for each digit, `no_input`, and optional `invalid` | `prompt` (required), `digits` (such as `["1","2"]`), `language`, `invalidMessage` |
| `dial_by_extension` | Caller enters a teammate's extension | `no_answer`, `no_match` | `prompt` (required), `language`, `ringTimeout`, `invalidMessage` |
| `business_hours` | Branches on the line's business hours | `open`, `closed` | none needed |
| `caller_condition` | Branches on who's calling | `matched`, `not_matched` | `mode`: `saved_contact` (is the number saved) or `rules` with `rules` (a segment rule tree) |
| `go_to` | Jumps to another step | `next` | `targetNodeId` |
| `ai_agent` | An AI agent answers | `fallback` | `agentId` (required). Language, voice and greeting come from the agent's published calling setup, so don't set them here |
| `run_workflow` | Starts a workflow and carries on | `next` | `workflowId`, from `repzo voice flows workflows` |
| `hangup` | Ends the call | none | `label` |

Outbound flows also have `outbound_call` (entry, `next`) and `amd_branch` (`human`, `machine`, `unknown`, with `timeoutSeconds`).

### Where IDs come from

- People: `repzo metadata users`. Someone must be an active member with calling on, or they won't ring; `validate` warns about this.
- AI agents: `repzo agents list`. The agent must be active, with a published calling setup.
- Workflows: `repzo voice flows workflows`. Only active workflows with a Call Flow Step trigger can run.

### Not available here

Generating pre-recorded prompt audio stays in the web builder. Without it, messages are read out by the phone system's voice. If you change a message's text, its old recording stops playing until someone generates a new one in the builder, so mention this when you edit a prompt that has `promptAudio`. Keep any existing `promptAudio` and `promptVoice` as they are.

## Examples

Ring the contact's owner, then the team, then voicemail:

```json
{
  "channelAccountId": "CHANNEL_ID",
  "name": "Owner first",
  "draftGraph": {
    "nodes": [
      { "id": "incoming", "type": "incoming_call", "config": {} },
      { "id": "owner", "type": "ring_contact_owner", "config": { "ringTimeout": 20, "skipBusy": true } },
      { "id": "team", "type": "ring_users", "config": { "ringMembers": true, "ringTimeout": 25 } },
      { "id": "vm", "type": "voicemail", "config": { "greeting": "Sorry we missed you. Please leave a message." } }
    ],
    "edges": [
      { "id": "e1", "source": "incoming", "target": "owner", "kind": "next" },
      { "id": "e2", "source": "owner", "target": "team", "kind": "no_answer" },
      { "id": "e3", "source": "owner", "target": "team", "kind": "no_owner" },
      { "id": "e4", "source": "team", "target": "vm", "kind": "missed" }
    ]
  }
}
```

Open hours go to a menu with a queue for sales. After hours goes to voicemail:

```json
{
  "channelAccountId": "CHANNEL_ID",
  "name": "Menu and queue",
  "draftGraph": {
    "nodes": [
      { "id": "incoming", "type": "incoming_call", "config": {} },
      { "id": "hours", "type": "business_hours", "config": {} },
      { "id": "menu", "type": "phone_menu", "config": { "prompt": "Press 1 for sales or 2 for support.", "digits": ["1", "2"], "language": "en" } },
      { "id": "sales", "type": "call_queue", "config": { "maxWaitSeconds": 180, "announcePosition": true, "message": "Please hold. Someone will be with you shortly." } },
      { "id": "support", "type": "ring_users", "config": { "ringMembers": true, "skipBusy": true } },
      { "id": "vm", "type": "voicemail", "config": {} }
    ],
    "edges": [
      { "id": "e1", "source": "incoming", "target": "hours", "kind": "next" },
      { "id": "e2", "source": "hours", "target": "menu", "kind": "open" },
      { "id": "e3", "source": "hours", "target": "vm", "kind": "closed" },
      { "id": "e4", "source": "menu", "target": "sales", "kind": "digit_1" },
      { "id": "e5", "source": "menu", "target": "support", "kind": "digit_2" },
      { "id": "e6", "source": "menu", "target": "vm", "kind": "no_input" },
      { "id": "e7", "source": "sales", "target": "vm", "kind": "timeout" },
      { "id": "e8", "source": "support", "target": "vm", "kind": "missed" }
    ]
  }
}
```

Saved contacts ring their owner. Everyone else gets the AI agent:

```json
{
  "channelAccountId": "CHANNEL_ID",
  "name": "Known callers first",
  "draftGraph": {
    "nodes": [
      { "id": "incoming", "type": "incoming_call", "config": {} },
      { "id": "known", "type": "caller_condition", "config": { "mode": "saved_contact" } },
      { "id": "owner", "type": "ring_contact_owner", "config": {} },
      { "id": "agent", "type": "ai_agent", "config": { "agentId": "AGENT_ID" } },
      { "id": "vm", "type": "voicemail", "config": {} }
    ],
    "edges": [
      { "id": "e1", "source": "incoming", "target": "known", "kind": "next" },
      { "id": "e2", "source": "known", "target": "owner", "kind": "matched" },
      { "id": "e3", "source": "known", "target": "agent", "kind": "not_matched" },
      { "id": "e4", "source": "owner", "target": "agent", "kind": "no_answer" },
      { "id": "e5", "source": "owner", "target": "agent", "kind": "no_owner" },
      { "id": "e6", "source": "agent", "target": "vm", "kind": "fallback" }
    ]
  }
}
```
