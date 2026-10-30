# Agent Functions and tools

Functions are the CRM actions an agent is allowed to take: create an order, book an appointment, open a ticket, send a WhatsApp Flow, and so on. Each Function is off until someone enables it on that agent, and each one can carry instructions and field bindings that shape how the agent fills it in.

This page is orientation only. The server is authoritative and may already have newer Functions, different labels, or different helpers. Always read the live catalog first:

```bash
repzo agents functions list AGENT_ID --all --json
repzo agents tools AGENT_ID --all --json
```

## Functions, tools, and helpers

- A **Function** is a configurable action (`create_order`). Enabling it makes its tool name usable by the agent.
- Each Function has **helpers**: read-only tools that are enabled together with it (`create_order` brings `search_products`, `search_carts`, `search_orders`). The agent uses helpers to look things up before it acts.
- Helper tools cannot be switched on by themselves. A helper becomes allowed only when a Function that lists it in `helpers` is enabled. To get `search_products`, enable a Function such as `add_to_cart`, `create_order`, `create_price_offer`, or `create_invoice`.
- **Core** tools are always on: `search_articles`, `read_article_file`, `read_article_file_visual`, `send_inbox_message`.
- **External** tools come from connected apps and are named with an `mcp_` prefix. They are managed by the connection in the web app, not through Functions.

`repzo agents tools AGENT_ID --json` lists every tool name with `kind` (`core`, `function`, `helper`, `external`), `readOnly`, `allowed`, the owning `function`, and `connectorName`. Only names with `allowed: true` may appear in a Playbook `[[tool name="…"]]` step or a procedure tool step. Never guess a tool name.

## Catalog (orientation)

| Function | What it does | Helper read tools | Channels |
|---|---|---|---|
| `send_whatsapp_flow` | Sends a published WhatsApp Flow (in-chat form, booking, order) | `list_whatsapp_flows` | chat only (WhatsApp) |
| `upsert_contact` | Creates or updates the customer's contact details | — | chat, calling |
| `update_conversation_profile` | Saves customer details on the conversation | — | chat, calling |
| `add_contact_note` | Adds a note to the customer's contact | — | chat, calling |
| `send_inbox_macro` | Sends a saved reply (macro) | `list_inbox_macros` | chat only |
| `send_whatsapp_template` | Sends an approved WhatsApp template | — | chat only |
| `create_activity` | Creates a task, call, or other activity | `search_activities` | chat, calling |
| `update_activity` | Updates an activity | `search_activities` | chat, calling |
| `manage_reminders` | Adds or changes reminders | `search_activities` | chat, calling |
| `create_appointment` | Books an appointment | `search_appointments`, `get_availability_slots` | chat, calling |
| `update_appointment` | Reschedules or changes an appointment | `search_appointments`, `get_availability_slots` | chat, calling |
| `delete_appointment` | Cancels an appointment | `search_appointments`, `get_availability_slots` | chat only |
| `add_to_cart` | Adds products to the customer's cart | `search_products`, `search_carts`, `search_orders` | chat, calling |
| `create_order` | Places an order | `search_products`, `search_carts`, `search_orders` | chat, calling |
| `update_order` | Changes an order | `search_products`, `search_carts`, `search_orders` | chat, calling |
| `create_ticket` | Opens a support ticket | `search_tickets`, `get_sla_status` | chat, calling |
| `update_ticket` | Updates a ticket | `search_tickets`, `get_sla_status` | chat, calling |
| `manage_tags` | Adds or removes tags | `search_tags` | chat, calling |
| `create_account` | Creates a company account | `search_contacts`, `search_accounts`, `search_deals` | chat, calling |
| `create_deal` | Creates a deal | `search_contacts`, `search_accounts`, `search_deals` | chat, calling |
| `create_price_offer` | Creates a quote (price offer) | `search_products`, `search_price_offers` | chat, calling |
| `create_invoice` | Creates an invoice | `search_products`, `search_invoices` | chat, calling |
| `create_request` | Submits a request | `search_requests`, `search_request_types` | chat, calling |
| `update_request` | Updates a request | `search_requests`, `search_request_types` | chat, calling |
| `send_email` | Sends an email | `search_contacts` | chat only |
| `create_project` | Creates a project | `search_projects` | chat, calling |

`check_my_loyalty` is a read capability (the customer's own loyalty balance), not an action. Like other helpers it cannot be enabled on its own; read `helpers` in the Function list to see which Function brings it.

Each item's `channels` field (`chat`, `calling`) says where the Function works; the table shows today's values. Phone-call agents never get sending or destructive Functions (saved replies, WhatsApp templates and Flows, email, cancelling appointments), so those are chat only. `send_whatsapp_flow` also only works on WhatsApp conversations.

## Read one Function

```bash
repzo agents functions get AGENT_ID create_appointment --json
```

The response adds `fields`: the Function's inputs, each with `key`, `label`, `description`, `type`, `required`, `options` (allowed values), and `referenceEntity`. These keys are what `config.bindings` accepts. `usedIn` lists the Playbook flows and procedures that depend on the Function.

## Configure a Function

The update body is `{ "enabled": true|false, "config": { "instructions", "bindings", "whatsappFlows" } }`. `config` is optional.

- `instructions` (up to 2,000 characters): when the agent should use this Function and how. Example: "Only book after the customer has picked a slot from get_availability_slots. Confirm the date and time back to them first."
- `bindings`: per input field key, where the value comes from:
  - `{ "source": "agent" }` — the AI fills it in from the conversation. Add `"instructions"` to guide it ("Use the branch the customer named; ask if unclear").
  - `{ "source": "fixed", "value": … }` — always this value. Use for things like a fixed pipeline, owner, or status. Copy real IDs from metadata; never guess.
  - `{ "source": "variable", "variable": "contact.phone" }` — taken from a Playbook variable path.
  - `"allowBackward": true` can be added to the `stageId` binding of `upsert_contact` only (see below). Any other field returns `422`.
- `whatsappFlows` (only for `send_whatsapp_flow`, required there): 1–20 published Flows as `[{ "flowId": "…", "instructions": "When to send this Flow" }]`. Get IDs from `repzo agents whatsapp-flows AGENT_ID --json` and use only those with `available: true`.

Example file `function-update.json`:

```json
{
  "enabled": true,
  "config": {
    "instructions": "Book only after the customer confirms a slot from get_availability_slots.",
    "bindings": {
      "serviceId": { "source": "agent", "instructions": "Match the service the customer asked for." },
      "statusId": { "source": "fixed", "value": "STATUS_ID" },
      "phone": { "source": "variable", "variable": "contact.phone" }
    }
  }
}
```

```bash
repzo agents functions update AGENT_ID create_appointment --data @function-update.json --dry-run
repzo agents functions update AGENT_ID create_appointment --data @function-update.json --yes
repzo agents functions get AGENT_ID create_appointment --json
```

### Contact stage and owner (`upsert_contact`)

`upsert_contact` (Create or Update Contact) can move the conversation's own contact to a stage and set who owns it. It never takes a contact id; it always acts on the contact linked to the chat (or the one it creates and links).

- `stageId`: a stage of one of the workspace's **contact** pipelines. Add `pipelineId` only when the stage is in a different contact pipeline than the contact's current one. Take IDs from the `options` of the `stageId` and `pipelineId` fields in `repzo agents functions get AGENT_ID upsert_contact --json`; never guess them.
- `ownerUserId`: a `user_reference` field. It must be an active member of the workspace; its `options` list the members.
- A stage from another pipeline type, another workspace, or an inactive owner makes the call fail with a clear error and nothing is saved.
- The contact is never moved back to an earlier stage of the same pipeline (for example Customer back to MQL). The call still saves the other details and its result says `skipped: contact already at <stage>`. Add `"allowBackward": true` to the `stageId` binding only if the workspace really wants backward moves.
- An owner is never cleared. An existing owner changes only when the call gives an owner.
- The write goes through the normal contact update, so the agent's user needs `contacts.update` (or `contacts.update_own` on a contact it owns), and the audit log, workflows and webhooks (`contact.stage_changed`, `contact.owner_changed`) fire as usual.

Typical setup: a fixed stage, and the owner chosen by the agent from its instructions.

```json
{
  "enabled": true,
  "config": {
    "instructions": "Save the contact after the customer books a meeting.",
    "bindings": {
      "stageId": { "source": "fixed", "value": "STAGE_ID" },
      "ownerUserId": { "source": "agent", "instructions": "SFA leads go to USER_A; Workstation leads go to USER_B." }
    }
  }
}
```

In `repzo agents test` conversations the call is simulated: its result reports the stage and owner it would set (or that the stage would be skipped) without changing the contact.

Rules:

- Enable a Function before a Playbook flow or procedure uses its tool. Then re-read `repzo agents tools AGENT_ID --json` and confirm `allowed: true`.
- Disabling a Function that a Playbook flow or procedure still uses returns `409`. Check `usedIn`, edit the Playbook (or the manual procedure) first, then disable.
- A `422` names the invalid field: an unknown binding key, a value outside `options`, an unpublished Flow, or instructions that are too long.
- Function changes are draft changes. Test the draft, then publish with explicit approval.
- Function writes run simulated during `repzo agents test` conversations; they never change real records there.
