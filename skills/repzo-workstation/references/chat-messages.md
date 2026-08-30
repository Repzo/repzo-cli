# Chat Messages

Use this reference for Chat reads, sends, rich formatting, buttons, native structured messages, and thread replies.

## Contents

- [Safe send workflow](#safe-send-workflow)
- [Message fields](#message-fields)
- [Plain text](#plain-text)
- [Markdown announcement](#markdown-announcement)
- [HTML announcement with a button](#html-announcement-with-a-button)
- [Native code snippet](#native-code-snippet)
- [Native poll](#native-poll)
- [Thread reply](#thread-reply)
- [Idempotent send](#idempotent-send)
- [Slack Block Kit boundary](#slack-block-kit-boundary)

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
| `body` | string, at most 100,000 characters | Message text or HTML. Use `body`, never `content`. |
| `bodyFormat` | `plain`, `md`, or `html` | Select rendering explicitly. If omitted, the server currently defaults to `html`. |
| `blocksJson` | object or `null` | Native Chat structures such as `poll` or `snippets`; it is not a Slack Block Kit array. |
| `parentMessageId` | UUID | Post a reply under an existing message. |
| `clientMessageId` | UUID | Make retries idempotent within the workspace. |

Provide a non-empty `body` or a non-null `blocksJson`. The request is strict: do not add undocumented top-level fields.

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

## HTML announcement with a button

Use HTML when the user asks for a button. The Chat UI recognizes `bot-actions`, `bot-button`, `bot-button-primary`, and `bot-button-danger`. Use an absolute `http://` or `https://` deal URL. Escape any untrusted text before interpolating it into HTML or attributes.

```json
{
  "body": "<div class=\"bot-section\"><p><strong>Deal closed</strong></p><p>Acme — $25,000</p><div class=\"bot-actions\"><a class=\"bot-button bot-button-primary\" href=\"https://workstation.example.com/deals/DEAL_ID\" target=\"_blank\" rel=\"noopener\">Open deal</a></div></div>",
  "bodyFormat": "html"
}
```

This is an HTML message, not a `blocksJson` message. Preserve a meaningful text summary in the body so notifications remain understandable.

## Native code snippet

Use `blocksJson.snippets` for a Chat code card. Each snippet needs a stable `id`, `title`, `content`, and a language name or `null`.

```json
{
  "body": "Payload used for the deal event:",
  "bodyFormat": "plain",
  "blocksJson": {
    "snippets": [
      {
        "id": "deal-event-example",
        "title": "deal.closed.json",
        "content": "{\n  \"dealId\": \"DEAL_ID\",\n  \"status\": \"closed\"\n}",
        "language": "json"
      }
    ]
  }
}
```

Do not invent file or voice-message metadata. Their native shapes require media created by the upload flow.

## Native poll

```json
{
  "body": "",
  "blocksJson": {
    "poll": {
      "question": "When should we launch?",
      "description": "Choose one date.",
      "options": [
        { "id": "monday", "text": "Monday" },
        { "id": "tuesday", "text": "Tuesday" }
      ],
      "showWhoVoted": true,
      "allowMultipleAnswers": false,
      "allowAddingOptions": false,
      "allowRevoting": true,
      "correctOptionIds": [],
      "durationHours": 24,
      "hideResultsUntilClosed": false
    }
  }
}
```

Require a question and 2-10 uniquely named options with unique IDs. Set a positive `durationHours` to close automatically. Setting `hideResultsUntilClosed` to `true` requires a positive duration. A single-answer poll can have at most one `correctOptionIds` entry. Send polls only as top-level messages in public or private channels, never in direct messages or threads.

## Thread reply

Read the channel first and use the exact parent message UUID.

```json
{
  "body": "I will follow up with the customer.",
  "bodyFormat": "plain",
  "parentMessageId": "PARENT_MESSAGE_UUID"
}
```

Do not attach a poll to a thread reply.

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

## Slack Block Kit boundary

Do not pass a top-level Slack `blocks` array, or put a Slack array inside `blocksJson`, when using `repzo chat send`. The delegated `/api/v1/chat` endpoint accepts `blocksJson` as an object but does not run the Slack Block Kit renderer.

The separate Integration Bot API understands Slack-style `header`, `section`, `divider`, `context`, `image`, and `actions` blocks, including `primary` and `danger` buttons. That API uses Integration App authentication and is not the delegated CLI Chat contract. Do not call it through this CLI workflow unless it becomes part of the public OpenAPI surface and the active credential has the required Integration App scopes.
