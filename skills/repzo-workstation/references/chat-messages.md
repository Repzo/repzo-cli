# Chat Messages

Use this reference for Chat reads, sends, Markdown, Slack-style structured messages, buttons, and thread replies.

## Contents

- [Safe send workflow](#safe-send-workflow)
- [Message fields](#message-fields)
- [Plain text](#plain-text)
- [Markdown announcement](#markdown-announcement)
- [Structured announcement with a button](#structured-announcement-with-a-button)
- [Supported Slack blocks](#supported-slack-blocks)
- [Thread reply](#thread-reply)
- [Idempotent send](#idempotent-send)

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

## Message fields

| Field | Shape | Use |
| --- | --- | --- |
| `body` | string, at most 100,000 characters | Plain text or Markdown. Use `body`, never `content`. |
| `bodyFormat` | `plain` or `md` | Select rendering explicitly. If omitted, the server defaults to `plain`. Raw HTML is rejected. |
| `blocks` | array of 1-50 objects | Slack-style `header`, `section`, `divider`, `context`, `image`, or `actions` blocks. |
| `parentMessageId` | UUID | Post a reply under an existing message. |
| `clientMessageId` | UUID | Make retries idempotent within the workspace. |

Provide a non-empty `body` or a non-empty `blocks` array. The request is strict: do not send internal `blocksJson` metadata or undocumented top-level fields.

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

Use Slack-style blocks when the user asks for a button. Put the human-readable announcement in a section and the link in an actions block. Use an absolute `http://` or `https://` URL.

```json
{
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

## Supported Slack blocks

The public Chat endpoint renders these Block Kit-compatible types:

- `header`: a `plain_text` or `mrkdwn` text object.
- `section`: one text object, optional fields, and an optional image or button accessory.
- `divider`: a visual separator.
- `context`: text and image elements.
- `image`: `image_url`, `alt_text`, and optional title.
- `actions`: button elements with optional `url`, `style: "primary"`, or `style: "danger"`.

Prefer `plain_text` for labels and `mrkdwn` for message content. Do not send interactive action IDs: public Chat buttons are links, not callbacks. Do not invent internal poll, snippet, file, voice, or approval metadata under `blocksJson`.

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
