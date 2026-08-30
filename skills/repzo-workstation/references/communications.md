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

Campaign listing and retrieval are reads. Transactional/system dispatch, event recording, and opt-out are mutations.

```bash
repzo send campaigns list --limit 50
repzo send campaigns get CAMPAIGN_ID
repzo send transactional --data @message.json --dry-run
repzo send system --data @message.json --dry-run
repzo send event --data @event.json --dry-run
repzo send opt-out --data @opt-out.json --dry-run
```

Inspect OpenAPI for each strict body.

## Event subscriptions

Subscriptions are owned by the current Developer App. Inspect existing subscriptions and the live OpenAPI description before creating or changing one. The public API does not currently publish an event-type catalog, so do not invent event names.

```bash
repzo events subscriptions list --limit 100
repzo events subscriptions create --data @subscription.json --dry-run
```

Never assume visibility or ownership of subscriptions created by another app.
