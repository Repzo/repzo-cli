# Email templates

Use this reference for the reusable email templates in Settings → Email templates. People insert them in the email composer, workflow email actions, and the Send email designer. Each template is built with the Unlayer drag-and-drop editor and stores two matching halves:

- `designJson`: the Unlayer design document the editor opens and edits.
- `bodyHtml`: the email-ready HTML that is actually sent.

These are not Send campaigns; use `communications.md` for those.

## Commands

```bash
repzo email-templates list --query 'q=welcome' --limit 50
repzo email-templates get TEMPLATE_ID
repzo email-templates create --data @template.json --dry-run
repzo email-templates update TEMPLATE_ID --data @change.json --if-match '"ETAG"' --dry-run
repzo email-templates clone TEMPLATE_ID --data '{"name":"Welcome (Arabic)"}' --dry-run
repzo email-templates delete TEMPLATE_ID --dry-run
```

`list` returns summaries (`id`, `name`, `subject`, `updatedAt`). Use `get` for `bodyHtml` and `designJson`.

## Choose how to write the body

Send exactly one of the two halves and the server fills in the other:

| You send | The server | In the editor |
| --- | --- | --- |
| `designJson` only (preferred) | Builds `bodyHtml` from the design | Every block is editable on its own |
| `bodyHtml` only | Wraps the HTML in a design with one HTML block | One HTML block; editable as code |
| Both | Saves both as sent; you must keep them in step | Opens your design |

Prefer `designJson`, so the person can tweak text, colors, and buttons in the editor later. Use `bodyHtml` when the user supplies finished HTML or wants a layout the supported blocks can't express.

The server builds HTML only for `text`, `heading`, `button`, `divider`, `image`, and `html` blocks. Any other block type (social, menu, video, timer, table, carousel, and so on) is rejected with `422` instead of being dropped. Use an `html` block for those parts. When the template is next saved in the editor, Unlayer re-exports the HTML itself.

## Design document

A design is `{ counters, body: { id, rows, values }, schemaVersion: 16 }`. Each row has `cells` (column width ratios, for example `[1]` or `[1, 1]`) and one `columns` entry per cell. Each column holds its blocks in `contents`. Give every row, column, and block a unique `id`.

```json
{
  "name": "Welcome",
  "subject": "Welcome to Acme, {{contact.firstName}}",
  "designJson": {
    "counters": { "u_row": 3, "u_column": 3, "u_content_heading": 1, "u_content_text": 1, "u_content_button": 1, "u_content_image": 1, "u_content_divider": 1 },
    "schemaVersion": 16,
    "body": {
      "id": "body_welcome",
      "values": {
        "backgroundColor": "#f4f4f5",
        "contentWidth": "600px",
        "contentAlign": "center",
        "fontFamily": { "label": "Helvetica Neue", "value": "'Helvetica Neue',Helvetica,Arial,sans-serif" },
        "textColor": "#1f2937",
        "linkStyle": { "body": true, "linkColor": "#059669", "linkHoverColor": "#059669", "linkUnderline": true, "inherit": false }
      },
      "rows": [
        {
          "id": "u_row_1",
          "cells": [1],
          "values": { "backgroundColor": "#ffffff", "padding": "24px 0px 0px" },
          "columns": [
            {
              "id": "u_column_1",
              "values": { "padding": "0px" },
              "contents": [
                { "id": "u_content_image_1", "type": "image", "values": { "src": { "url": "https://example.com/logo.png", "maxWidth": "30%" }, "altText": "Acme", "textAlign": "center", "containerPadding": "10px 20px" } },
                { "id": "u_content_heading_1", "type": "heading", "values": { "text": "Welcome aboard", "headingType": "h1", "fontSize": "26px", "fontWeight": 700, "color": "#111827", "textAlign": "center" } }
              ]
            }
          ]
        },
        {
          "id": "u_row_2",
          "cells": [1],
          "values": { "backgroundColor": "#ffffff" },
          "columns": [
            {
              "id": "u_column_2",
              "values": { "padding": "0px" },
              "contents": [
                { "id": "u_content_text_1", "type": "text", "values": { "text": "<p>Hi {{contact.firstName}},</p><p>Your account is ready.</p>", "fontSize": "15px", "lineHeight": "160%", "color": "#374151" } },
                { "id": "u_content_button_1", "type": "button", "values": { "text": "Open your dashboard", "href": { "name": "web", "values": { "href": "https://example.com/start", "target": "_blank" } }, "buttonColors": { "backgroundColor": "#059669", "color": "#ffffff" }, "borderRadius": "6px", "padding": "12px 28px", "textAlign": "center" } }
              ]
            }
          ]
        },
        {
          "id": "u_row_3",
          "cells": [1],
          "values": { "backgroundColor": "#ffffff", "padding": "0px 0px 24px" },
          "columns": [
            {
              "id": "u_column_3",
              "values": { "padding": "0px" },
              "contents": [
                { "id": "u_content_divider_1", "type": "divider", "values": { "border": { "borderTopWidth": "1px", "borderTopStyle": "solid", "borderTopColor": "#e5e7eb" } } }
              ]
            }
          ]
        }
      ]
    }
  }
}
```

Block `values` the server reads (others are kept for the editor):

- `text`: `text` (HTML), `fontSize`, `color`, `textAlign`, `lineHeight`, `containerPadding`.
- `heading`: `text`, `headingType` (`h1`–`h4`), `fontSize`, `fontWeight`, `color`, `textAlign`, `lineHeight`, `containerPadding`.
- `button`: `text`, `href.values.href`, `href.values.target`, `buttonColors.backgroundColor`, `buttonColors.color`, `borderRadius`, `padding`, `fontSize`, `textAlign`, `containerPadding`.
- `divider`: `border.borderTopWidth`, `border.borderTopStyle`, `border.borderTopColor`, `containerPadding`.
- `image`: `src.url`, `src.maxWidth`, `altText`, `textAlign`, `containerPadding`. The image must be at a public `https` URL.
- `html`: `html`, `containerPadding`.
- Row `values`: `backgroundColor`, `padding`. Body `values`: `backgroundColor`, `contentWidth`, `fontFamily.value`.

Use inline styles in `text` and `html` content; email clients ignore most stylesheets.

## HTML template

When the user supplies finished HTML, or asks for a layout the design blocks can't express, send `bodyHtml` without `designJson`. Use table-based layout and inline styles; email clients ignore most stylesheets and modern CSS.

```json
{
  "name": "Order shipped",
  "subject": "Your order is on its way, {{contact.firstName}}",
  "bodyHtml": "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head><body style=\"margin:0;padding:0;background:#f4f4f5;\"><table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#f4f4f5;\"><tr><td align=\"center\" style=\"padding:24px 12px;\"><table role=\"presentation\" width=\"600\" cellpadding=\"0\" cellspacing=\"0\" style=\"max-width:600px;width:100%;background:#ffffff;border-radius:8px;font-family:Helvetica,Arial,sans-serif;\"><tr><td style=\"padding:32px 32px 8px;font-size:22px;font-weight:700;color:#111827;\">Your order has shipped</td></tr><tr><td style=\"padding:8px 32px 24px;font-size:15px;line-height:1.6;color:#374151;\">Hi {{contact.firstName}}, your package from {{account.name}} is on its way.</td></tr><tr><td align=\"center\" style=\"padding:0 32px 32px;\"><a href=\"https://example.com/track\" style=\"display:inline-block;background:#059669;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 28px;border-radius:6px;\">Track your order</a></td></tr></table></td></tr></table></body></html>"
}
```

```bash
repzo email-templates create --data @order-shipped.json --dry-run
repzo email-templates create --data @order-shipped.json --yes
```

The HTML is saved exactly as sent and is what recipients get. The server also saves a design holding one Unlayer HTML block with your `<body>` content and any `<style>` tags, so the template opens in the editor as editable code. Once someone saves it there, Unlayer re-exports the HTML inside its own page layout.

To change an HTML template, get it, edit `bodyHtml`, and send the full new `bodyHtml` with `--if-match`; the one-block design is replaced to match.

## Merge tags

The editor offers these tags; they are filled in per recipient when the email is used:

`{{contact.firstName}}`, `{{contact.lastName}}`, `{{contact.fullName}}`, `{{contact.email}}`, `{{account.name}}`

Do not invent other tags; they would reach the recipient as literal text.

## Edit an existing template

1. `repzo email-templates get TEMPLATE_ID` and keep `meta.etag`.
2. Change the `designJson` you read: edit the blocks in place, and keep their `id`s so the editor's undo history and layout stay intact.
3. Send only what changed (`designJson`, `subject`, or `name`) with `--if-match` set to that ETag. A new `designJson` without `bodyHtml` rebuilds the HTML.
4. On `412`, someone saved the template meanwhile: get it again and reapply the change instead of overwriting.
5. Get the template again and report what changed.

Sending `bodyHtml` alone replaces the whole design with a single HTML block, which loses per-block editing. Do that only when the user asks to switch to raw HTML.

To try a big redesign without touching the original, `clone` first and edit the copy.
