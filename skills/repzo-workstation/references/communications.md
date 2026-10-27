# Communications

Use this reference for Inbox, personal notifications, voice, Repzo Send, and outbound event subscriptions. These surfaces can contact people or external systems; distinguish reads, drafts, and sends precisely. For Chat, read [chat-messages.md](chat-messages.md), which is also linked directly from `SKILL.md`.

## Personal notifications

Notification commands are always limited to the authenticated user's notifications in the active workspace. Listing and counting are reads; marking read or dismissing changes personal state and must be previewed like other mutations.

```bash
repzo notifications unread-count
repzo notifications list --query 'unreadOnly=true' --limit 50
repzo notifications read NOTIFICATION_ID --dry-run
repzo notifications dismiss NOTIFICATION_ID --dry-run
repzo notifications read-all --dry-run
```

## Inbox

List conversations with public filters, fetch the conversation, then read its messages before replying or changing state.

```bash
repzo inbox conversations list --query 'status=open' --limit 50
repzo inbox conversations get CONVERSATION_ID
repzo inbox conversations messages CONVERSATION_ID --limit 50
```

Drafting text does not authorize sending it. Only execute the following after the user asks to perform the action:

```bash
repzo inbox conversations reply CONVERSATION_ID --data @reply.json --dry-run
repzo inbox conversations note CONVERSATION_ID --data @note.json --dry-run
repzo inbox conversations assign CONVERSATION_ID --data @assignment.json --dry-run
repzo inbox conversations close CONVERSATION_ID --dry-run
```

To build or edit WhatsApp Flows (in-chat forms) on a WhatsApp channel, read [whatsapp-flows.md](whatsapp-flows.md).

## Voice

Listing calls, reading one call, channels, and analytics are reads. Placing a call is an external side effect and requires explicit authorization of the destination and purpose.

```bash
repzo voice calls list --limit 50
repzo voice calls get CALL_ID
repzo voice analytics --query 'from=2026-08-01' --query 'to=2026-08-31'
repzo voice calls place --data @call.json --dry-run
```

Geo-lock or provider restrictions come from the public API; report them without bypassing them.

## Repzo Send

Campaign listing and retrieval are reads. Transactional/system dispatch, event recording, event type changes, and opt-out are mutations.

```bash
repzo send campaigns list --limit 50
repzo send campaigns get CAMPAIGN_ID
repzo send transactional --data @message.json --dry-run
repzo send system --data @message.json --dry-run
repzo send opt-out --data @opt-out.json --dry-run
```

Inspect OpenAPI for each strict body.

## Send events

Events record something a contact, account, deal, or ticket did (for example `plan_upgraded`). They drive event-triggered campaigns, goals, segment conditions, record timelines, and reports. Event commands need the `tracking:read` / `tracking:write` scopes; older keys with `send:read` / `send:write` still work.

```bash
repzo send event-types list --query 'status=active' --limit 100
repzo send event-types get plan_upgraded
repzo send event --data @event.json --dry-run --idempotency-key plan-upgraded-u42
repzo send events batch --data @events.json --dry-run
repzo send events list --query 'name=plan_upgraded' --query 'occurredAfter=2026-10-01T00:00:00Z' --limit 50
repzo send events get EVENT_ID
```

A single event body:

```json
{
  "name": "plan_upgraded",
  "email": "maya@example.com",
  "createContact": true,
  "contact": { "firstName": "Maya", "lastName": "Haddad", "company": "Acme", "source": "Billing" },
  "properties": { "plan": "pro", "seats": 12 },
  "occurredAt": "2026-10-20T09:30:00Z",
  "dedupeKey": "invoice-INV-1042"
}
```

**Which record.** The event type's `primaryObject` decides which identifier is required. Identifiers are tried in this order:

- contact: `contactId`, `identityId`, `match`, `email`, `phone`
- account: `accountId`, `match`, `domain`
- deal: `dealId`, `match`
- ticket: `ticketId`, `ticketNumber`, `match`
- none: no identifier

`match` is `{ "property": "externalId", "value": "C-1001" }`: a property whose value is unique on that record, by native name or `custom_<definitionId>`. Related records fill in from the match (a deal's contact and account, a contact's account). No match returns `422 no_match`; several matches return `422 ambiguous_match`. Never guess an ID to make an event land.

**New contacts.** For contact events only, `createContact: true` creates a contact from `email` or `phone` when nothing matches. The `contact` block (`firstName`, `lastName`, `phone`, `company`, `title`, `source`, `utmSource`, `utmMedium`, `utmCampaign`, `utmTerm`, `utmContent`, `gclid`, `fbclid`) fills only that new contact. It never updates an existing contact; use `repzo contacts update` for that.

**Event types.** A name the workspace has never seen is added to the catalog automatically as a learned type (`origin: auto`). A defined type (`origin: manual`, created in Workstation or with `repzo send event-types create`) is strict: an occurrence with a property that isn't defined, or that doesn't fit its type, is rejected with `invalid_property`. Before sending, read the type with `repzo send event-types get NAME` and use its exact property names and types. `send event-types update` replaces the whole `properties` list, can't rename a type, and archives or restores it with `"archived": true|false`; an archived type rejects new occurrences with `archived_event`. Editing a learned type makes it strict.

**Retries and duplicates.** Give every event a stable `dedupeKey` (for example the source invoice or order ID). A repeat with the same name and `dedupeKey` returns `200` with `duplicate: true` and records nothing, so a retry is always safe. `--idempotency-key` also protects one exact request for 24 hours.

**Many events.** Requests are limited to 120 per minute per credential, so never loop `repzo send event` over a list. Send up to 500 events per `repzo send events batch` call as `{ "events": [ ... ] }`. Each event is checked and recorded on its own, in order. HTTP 200 can still contain rejections: read `recorded`, `duplicates`, `rejected`, and every `results[]` item (`index`, `status`, `id` or `code` and `message`). Fix and resend only the rejected items. Once the workspace's monthly event limit is reached, single events return `429 monthly_limit` and the rest of a batch is rejected with that code.

**No edits.** Recorded events can't be edited or deleted through the API. Preview with `--dry-run`, check identifiers and properties first, and send a corrected event with a new `dedupeKey` only when the user asks. Every rejection also appears on Events → Monitor in Workstation for 30 days.

## Event subscriptions

Event subscriptions are outbound webhooks: Workstation calls your URL when something changes in the workspace. They are a different feature from Send events above. Subscriptions are owned by the current Developer App. Inspect existing subscriptions and the live OpenAPI description before creating or changing one. The public API does not publish a catalog of webhook event names (`repzo send event-types` lists Send event types, not webhook events), so do not invent webhook event names.

```bash
repzo events subscriptions list --limit 100
repzo events subscriptions create --data @subscription.json --dry-run
```

Never assume visibility or ownership of subscriptions created by another app.
