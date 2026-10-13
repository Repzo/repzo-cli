# Chat Messages

Use this reference for Chat reads, sends, edits, deletes, Markdown, Slack Block Kit messages, buttons, thread replies, ephemeral messages, modals, and App Home.

## Contents

- [Safe send workflow](#safe-send-workflow)
- [Direct messages](#direct-messages)
- [Message fields](#message-fields)
- [Plain text](#plain-text)
- [Markdown announcement](#markdown-announcement)
- [Structured announcement with a button](#structured-announcement-with-a-button)
- [Block Kit support](#block-kit-support)
- [Link buttons and interactive controls](#link-buttons-and-interactive-controls)
- [Thread reply](#thread-reply)
- [Idempotent send](#idempotent-send)
- [Edit or delete](#edit-or-delete)
- [Ephemeral messages](#ephemeral-messages)
- [Modals and App Home](#modals-and-app-home)
- [Full reference](#full-reference)

## Safe send workflow

Resolve a visible channel, read recent messages when context matters, preview the exact mutation, send once, and verify the returned message.

```bash
repzo chat channels list --limit 50
repzo chat messages list CHANNEL_ID --limit 50
repzo chat send CHANNEL_ID --data @message.json --dry-run
repzo chat send CHANNEL_ID --data @message.json --yes
repzo chat messages list CHANNEL_ID --limit 50
```

For complex JSON, put the payload in a temporary `message.json` file so shell quoting cannot change it. Sending is an external side effect; drafting a payload does not authorize sending it.

## Direct messages

Search for the person, use their exact returned user ID to find or create the direct channel, then send through the normal Chat endpoint. Do not guess user or channel IDs.
Creating a direct channel requires delegated `foxu-*` user authentication. A `foxa-*` Developer App key may post as the app to an existing visible channel, but it must not create a human-to-human DM under the app creator's identity.

```bash
repzo chat users list --query q=Hassan --limit 20
repzo chat channels direct --data '{"targetUserId":"USER_ID"}' --dry-run
repzo chat channels direct --data '{"targetUserId":"USER_ID"}' --yes
repzo chat send DIRECT_CHANNEL_ID --data @message.json --dry-run
repzo chat send DIRECT_CHANNEL_ID --data @message.json --yes
```

When a name matches more than one user, compare the returned email addresses and ask the user to choose. Inspect a channel when needed with:

```bash
repzo chat members list CHANNEL_ID --limit 50
```

## Message fields

| Field | Shape | Use |
| --- | --- | --- |
| `body` | string, at most 100,000 characters | Plain text or Markdown. Use `body`, never `content`. With `blocks`, it is the notification fallback. |
| `bodyFormat` | `plain` or `md` | Select rendering explicitly. If omitted, the server defaults to `plain`. Raw HTML is rejected. |
| `blocks` | array of 1-50 Slack Block Kit blocks | Any Block Kit block. See [Block Kit support](#block-kit-support). |
| `attachments` | array of 1-20 legacy Slack attachments | Colored side-bar attachments (`color`, `title`, `text`, `fields`, ...). Use blocks for buttons. |
| `parentMessageId` | UUID | Post a reply under an existing message. |
| `clientMessageId` | UUID | Make retries idempotent within the workspace. |

Provide a non-empty `body`, `blocks`, or `attachments`. The request is strict: do not send internal `blocksJson` metadata or undocumented top-level fields.

## Plain text

```json
{
  "body": "Hello",
  "bodyFormat": "plain"
}
```

```bash
repzo chat send CHANNEL_ID --data '{"body":"Hello","bodyFormat":"plain"}' --dry-run
```

## Markdown announcement

Use Markdown for headings, lists, emphasis, and ordinary links.

```json
{
  "body": "**New deal won**\n\n- Account: Acme\n- Value: $25,000\n- [Open deal](https://workstation.example.com/deals/DEAL_ID)",
  "bodyFormat": "md"
}
```

## Structured announcement with a button

Use Block Kit when the user asks for a button or richer layout. Put the human-readable announcement in a section and the link in an actions block. Use an absolute `http://` or `https://` URL.

```json
{
  "body": "Deal closed: Acme, $25,000",
  "blocks": [
    {
      "type": "header",
      "text": { "type": "plain_text", "text": "Deal closed" }
    },
    {
      "type": "section",
      "text": { "type": "mrkdwn", "text": "*Acme* — $25,000" }
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": { "type": "plain_text", "text": "Open deal" },
          "url": "https://workstation.example.com/deals/DEAL_ID",
          "style": "primary"
        }
      ]
    }
  ]
}
```

Preview the payload before sending, then verify the returned message in the channel.

## Block Kit support

`blocks` accepts any Slack Block Kit block: `section`, `header`, `divider`, `context`, `image`, `actions`, `input`, `rich_text`, `markdown`, `table`, `data_table`, `data_visualization` charts, `card`, `carousel`, `container`, `alert`, `video`, `file`, and the rest of the catalog. Write payloads exactly as for Slack; text objects use `plain_text` for labels and `mrkdwn` for content.

Blocks are never rejected. Unknown or invalid parts are skipped, and the send or edit response lists them in a `warnings` array. After sending blocks, read `warnings`; when it is non-empty, report it and fix the payload with an edit instead of sending a second message. `--dry-run` previews the exact request only, so it does not render or validate blocks.

Mention people with `<@USER_ID>` and channels with `<#CHANNEL_ID>` in `mrkdwn`, `rich_text` and `markdown` blocks. A user mention notifies that person, including people who only get notified for mentions, so mention only people who need to see the message. Find user ids with `repzo chat users list --query q=<name>`.

Missing `block_id` and `action_id` values are generated. Do not invent internal poll, snippet, file, voice, or approval metadata under `blocksJson`.

## Link buttons and interactive controls

- A button with `url` is a plain link. Any token can post it, and it works without an app server.
- Buttons with `action_id`, selects, overflow menus, date and time pickers, checkboxes, radio buttons, external selects, and inputs are real callbacks. A click sends a Slack `block_actions` payload to the posting Developer App's interactivity URL (Settings → Integrations & Developers → Developer Apps → Bots → Interactivity, or an event subscription that lists `block_actions`). The payload is signed and carries `response_url` and `trigger_id`.
- Only post interactive controls from a `foxa-*` Developer App that has an interactivity URL. Controls posted with a delegated `foxu-*` user token render but nothing receives their clicks; use `url` buttons instead.

Check whether the app already receives clicks before relying on them:

```bash
repzo events subscriptions list
```

## Thread reply

Read the channel first and use the exact parent message UUID.

```json
{
  "body": "I will follow up with the customer.",
  "bodyFormat": "plain",
  "parentMessageId": "PARENT_MESSAGE_UUID"
}
```

Use `blocks` instead of `body` when a thread reply needs structured content.

## Idempotent send

Generate one UUID for the intended message and keep it unchanged if the request must be retried. Reusing the same `clientMessageId` returns the existing message instead of creating a duplicate.

```json
{
  "body": "The deal is ready for review.",
  "bodyFormat": "plain",
  "clientMessageId": "CLIENT_MESSAGE_UUID"
}
```

Generate a new UUID for a genuinely new message.

## Edit or delete

An edit accepts `body`, `blocks`, or `attachments`; new `blocks` replace the old ones. Delete only the exact message the user named.

```bash
repzo chat messages update MESSAGE_ID --data @message.json --dry-run
repzo chat messages update MESSAGE_ID --data @message.json --yes
repzo chat messages delete MESSAGE_ID --dry-run
repzo chat messages delete MESSAGE_ID --yes
```

## Ephemeral messages

An ephemeral message is shown only to `userId` in the channel (or thread with `parentMessageId`). It is not stored or listed, its controls work for 24 hours, and the returned ID does not work with message commands. It requires a `foxa-*` Developer App token; delegated `foxu-*` tokens get `403`.

```json
{
  "userId": "USER_ID",
  "body": "Only you can see this.",
  "blocks": [
    { "type": "section", "text": { "type": "mrkdwn", "text": "Only *you* can see this." } }
  ]
}
```

```bash
repzo chat ephemeral send CHANNEL_ID --data @ephemeral.json --dry-run
repzo chat ephemeral send CHANNEL_ID --data @ephemeral.json --yes
```

## Modals and App Home

These follow Slack's `views.*` methods, need a `foxa-*` Developer App token, and return the view in Slack's shape. Errors carry Slack's error name in `error.details.slackError`.

| Command | Body | Notes |
| --- | --- | --- |
| `repzo chat views open` | `{ "trigger_id", "view" }` | `view.type` is `modal`. `trigger_id` comes from a `block_actions` or `view_submission` payload the app received; it works once within 60 seconds. |
| `repzo chat views push` | `{ "trigger_id", "view" }` | Stacks a view on an open modal; at most 3 views (`422 push_limit_reached`). |
| `repzo chat views update` | `{ "view_id" or "external_id", "hash"?, "view" }` | Pass the latest `hash`; a stale one fails with `409 hash_conflict`, so re-read instead of overwriting. |
| `repzo chat views publish` | `{ "user_id", "view", "hash"? }` | Replaces that user's App Home tab; `view.type` is `home`. |

```bash
repzo chat views publish --data @home.json --dry-run
repzo chat views publish --data @home.json --yes
```

A trigger expires quickly, so modals are normally opened by the app's own server. From the CLI, only open or push a view with a trigger the user just supplied, and send it promptly after the dry run.

## Full reference

Do not reproduce the Block Kit catalog from memory. Fetch the page needed; every docs page has a Markdown copy at its URL plus `.md`:

- Chat apps guides (sending messages, interactivity, modals, App Home, ephemeral messages, formatting text): https://workstation.repzo.com/docs/developers/chat-apps
- Block Kit reference, one page per block, element, and object: https://workstation.repzo.com/docs/developers/block-kit
- Docs index for agents: https://workstation.repzo.com/docs/llms.txt (complete text: https://workstation.repzo.com/docs/llms-full.txt)
- Live request schemas: `repzo openapi --quiet`
