# WhatsApp Flows

Use this reference for WhatsApp Flows: the native in-chat forms customers fill in without leaving WhatsApp (lead capture, surveys, sign-ups, appointment booking, product orders). In Workstation they live under Settings → Inbox → Channels → WhatsApp channel → Manage Flows. These are not WhatsApp message templates.

A Flow belongs to one WhatsApp channel. Workstation keeps the editable definition and compiles it into Meta's Flow JSON when you sync.

## Commands

```bash
repzo inbox whatsapp-channels list
repzo inbox whatsapp-flows starters
repzo inbox whatsapp-flows list --query channelAccountId=CHANNEL_ID
repzo inbox whatsapp-flows get FLOW_ID
repzo inbox whatsapp-flows create --data @flow.json --dry-run
repzo inbox whatsapp-flows update FLOW_ID --data @change.json --dry-run
repzo inbox whatsapp-flows duplicate FLOW_ID --dry-run
repzo inbox whatsapp-flows flow-json FLOW_ID
repzo inbox whatsapp-flows sync FLOW_ID --dry-run
repzo inbox whatsapp-flows sync FLOW_ID --data '{"publish":true}' --dry-run
repzo inbox whatsapp-flows send-test FLOW_ID --data '{"to":"+962790000000","body":"Try our form","cta":"Open form"}' --dry-run
repzo inbox whatsapp-flows delete FLOW_ID --dry-run
repzo inbox whatsapp-flows objects
repzo inbox whatsapp-flows properties contact
```

`list` returns summaries. Use `get` for `definition`, `problems`, and `metaValidationErrors`.

## What reaches Meta and customers

| Step | Effect | Ask first? |
| --- | --- | --- |
| `create`, `update`, `duplicate` | Draft in Workstation only | Authorized edit is enough |
| `sync` | Uploads the draft to the channel's WhatsApp Business Account and returns Meta's validation errors and a `previewUrl` | Yes, it changes the business's Meta account |
| `sync` with `publish: true` | Publishes at Meta and locks the Flow for good | Only when the user explicitly asks to publish |
| `send-test` | Sends a real WhatsApp message to `to` | Only to a number the user gave you |
| `delete` | Deletes the Meta draft, or deprecates a published Flow so customers can no longer open it | Yes, it can't be undone |

Published Flows can't be edited (`update` returns 409). To change one, `duplicate` it, edit the draft copy, sync, and publish the copy when the user asks.

## Build a Flow

1. `repzo inbox whatsapp-channels list` and pick the channel. `readyForFlows: false` means someone must reconnect it in Inbox first; you can still build drafts.
2. `repzo inbox whatsapp-flows starters` and copy the closest starter's `category` and `definition`. Starters cover lead capture, support, quotes, onboarding, feedback, preferences, date ranges, appointment booking, and product orders.
3. Edit the definition, then `create` with `{ channelAccountId, name, category, definition }` (`--dry-run` first, then `--yes`).
4. Read `problems` in the response. It lists everything that would stop the sync. Fix them with `update` until it is empty.
5. Sync only when the user wants it at Meta. Report `metaValidationErrors` and `previewUrl` from the result.

Categories: `LEAD_GENERATION`, `APPOINTMENT_BOOKING`, `CUSTOMER_SUPPORT`, `SURVEY`, `SIGN_UP`, `OTHER`.

## Edit a Flow

`update` takes `{ revision, name?, category?, definition? }`:

- `revision` is required: send the value from your latest `get`. A 409 that says the Flow was updated elsewhere means someone saved in between: `get` again, reapply your change, and retry.
- `definition` replaces the whole definition, so start from the one you just read and change only what was asked.
- The kind (`form`, `appointment`, `order`) can't change; create a new Flow instead.
- After a successful sync, any edit makes `syncedToMeta` false until you sync again.

## Definition

```json
{
  "kind": "form",
  "entryScreen": "NEEDS",
  "bookingLinkId": null,
  "screens": [
    {
      "id": "NEEDS",
      "title": "How can we help?",
      "description": "Tell us what you need.",
      "buttonLabel": "Continue",
      "position": { "x": 0, "y": 0 },
      "fields": [
        { "id": "interest", "type": "RadioButtonsGroup", "label": "I'm interested in", "required": true, "options": [
          { "id": "demo", "title": "A product demo" },
          { "id": "pricing", "title": "Pricing" },
          { "id": "other", "title": "Something else" }
        ] },
        { "id": "details", "type": "TextArea", "label": "Tell us more", "required": true, "helperText": "A sentence or two",
          "visibility": { "fieldId": "interest", "operator": "==", "value": "other" } },
        { "id": "team_size", "type": "Dropdown", "label": "Team size", "required": false, "options": [
          { "id": "1_10", "title": "1-10" },
          { "id": "11_50", "title": "11-50" },
          { "id": "51_plus", "title": "51+" }
        ] }
      ]
    },
    {
      "id": "CONTACT",
      "title": "Your details",
      "description": "",
      "buttonLabel": "Send",
      "position": { "x": 320, "y": 80 },
      "fields": [
        { "id": "first_name", "type": "TextInput", "inputType": "text", "label": "First name", "required": true },
        { "id": "email", "type": "TextInput", "inputType": "email", "label": "Email", "required": true,
          "propertyBinding": { "entityType": "contact", "propertyKey": "email" } },
        { "id": "marketing", "type": "OptIn", "label": "Send me product news by email", "required": false }
      ]
    }
  ],
  "edges": [{ "source": "NEEDS", "target": "CONTACT" }]
}
```

### Screens

- `id`: letters, digits, and underscores, starting with a letter; unique; never `SUCCESS`. `title` up to 30 characters, `buttonLabel` up to 35, `description` optional body text.
- `position` is only where the screen sits on the builder canvas; space screens about 320 apart on `x`.
- `edges` must form one forward path: every screen reachable from `entryScreen`, at most one next screen each, no loops. Up to 20 screens.
- Optional `footer`: `{ "center": "..." }` or `{ "left": "...", "right": "..." }`, 15 characters each.

### Fields

Every field has `id` (same rules as screen IDs, unique across the whole Flow), `type`, `label`, and `required`. Label limits depend on the type: 20 characters for `TextInput`, `TextArea`, and `Dropdown`; 25 for links; 30 for single and multiple choice; 40 for dates; 80 for display text, images, and uploads; 120 for consent.

| Type | Use | Main options |
| --- | --- | --- |
| `TextInput` | Short answer | `inputType`: `text`, `email`, `phone`, `number`, `password`, `passcode`; `helperText`, `minChars`, `maxChars`, `pattern` (needs `helperText`) |
| `TextArea` | Long answer | `helperText`, `maxChars` |
| `Dropdown` | Pick one from a list | `options` (1–200) |
| `RadioButtonsGroup` | Pick one | `options` (1–20) |
| `CheckboxGroup` | Pick several | `options` (1–20), `minSelected`, `maxSelected` |
| `OptIn` | Consent tick box | optional `url` to the terms; at most 5 per screen |
| `DatePicker` | One date | `minDate`, `maxDate` (`YYYY-MM-DD`), `unavailableDates` |
| `CalendarPicker` | Date or date range | `calendarMode`: `single` or `range`, `endLabel`, `includeDays`, `minDays`, `maxDays` |
| `PhotoPicker`, `DocumentPicker` | Uploads | One per screen, last screen only |
| `TextHeading`, `TextSubheading`, `TextBody`, `TextCaption` | Display text | `text` (or the label is shown) |
| `RichText` | Long formatted text | Must be the only field on its screen, with an empty description |
| `EmbeddedLink` | Link | `url`; at most 2 per screen |
| `Image` | Picture | `src` is base64 PNG/JPEG/WebP up to 300 KiB; at most 3 per screen |
| `If`, `Switch` | Show different fields by an earlier answer | `condition` + `then`/`else`; `switchFieldId` + `cases` |

Options are `{ "id", "title" }` with titles up to 30 characters and unique IDs; `description` is optional. To show a field only for certain answers, give it `visibility: { fieldId, operator: "==" | "!=", value }` pointing at an earlier text, date, single-choice, or consent field (consent compares `true`/`false`). Unknown keys anywhere in the definition are rejected with 422 and listed in `error.details.unknownKeys`.

### Saving answers to CRM fields

`repzo inbox whatsapp-flows objects` lists objects the Flow can use, and `repzo inbox whatsapp-flows properties contact` lists that object's writable properties. Each property has a ready `field` with `propertyBinding`. Copy it into a screen, give it your own `id`, and keep its `type`, `inputType`, and `options` exactly; a mismatch fails with 422. Never guess property keys.

Answers to bound fields arrive in the Inbox conversation as mapped values for the team or AI agent to act on. Submitting the form does not create or update a CRM record by itself.

### Live Flows

A Flow becomes live (it calls Workstation while the customer fills it in) when it uses `propertyBinding`, `dataSources`, a `Repeat` field, or when its kind is `appointment` or `order`. Live Flows:

- can't use uploads or `RichText` (put those in a separate static Flow);
- reserve field IDs starting with `flow_` or `options_`;
- need the server's public URL and Meta app secret at sync, which the sync error reports if missing.

`dataSources` let a choice list real records: `{ "id": "plans", "entityType": "product", "recordIds": [...], "labelProperty": "name" }`, then set `"dataSourceId": "plans"` on a `Dropdown`, `RadioButtonsGroup` (20 records max), or `CheckboxGroup` (20 max). Get record IDs with the normal list commands, such as `repzo products list`.

Appointment and order Flows rely on screen `action` bindings (`booking_*`, `order_*`) and the fields their starters create. Start from the `appointment` or `order` starter and change only wording, labels, and extra questions. Appointment Flows also need `bookingLinkId` set to an active booking link.

## Troubleshooting

- `problems` is not empty: fix each message; `flow-json` returns 422 with the same list until then.
- 409 on update: the Flow is published (duplicate it) or someone saved in between (re-read).
- 422 "Reconnect this WhatsApp channel": the channel lost its Meta connection; the user must reconnect it in Inbox.
- 502 `upstream_error`: Meta rejected the call; report its message as written.
- `metaValidationErrors` after sync: Meta's own checks; fix the definition and sync again.
- `send-test` 422 "Save and validate this Flow with Meta": sync first and make sure `syncedToMeta` is true.
