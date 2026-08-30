# Playbook authoring

The Playbook is Markdown source code. Normal prose controls behavior. Structured tokens add live variables and deterministic flow steps. Maximum length is 12,000 characters, with at most 8 flows and 20 steps per flow.

## Variables

Use Liquid-style dot paths:

```markdown
Hello {{contact.firstName}}.
```

Built-in useful paths include `contact.firstName`, `contact.lastName`, `contact.fullName`, `contact.email`, `contact.phone`, `contact.city`, and `contact.address`. Discover workspace contact properties with:

```bash
repzo metadata properties contact --json
```

Native stored properties use `{{contact.<key>}}`. Custom stored properties use `{{contact.customFields.<key>}}`. Do not use computed or reference-ID properties as customer-facing variables. When a value is unknown, the runtime uses a natural fallback; never instruct the agent to guess.

## Flow grammar

Flow markers must be alone on their lines. A flow needs a unique `name`, a plain-language `when`, at least one step, and an end marker:

```markdown
[[flow name="Order confirmation" when="Customer wants to place an order"]]
Confirm the requested products and quantities.
[[collect fields="name, phone, address"]]
[[reply macro="Delivery fees"]]
[[tool name="create_order"]]
[[/flow]]
```

Supported structured steps:

```markdown
[[collect fields="name, phone" optional="true"]]
[[tool name="create_ticket" optional="true"]]
[[reply macro="Delivery fees"]]
[[reply mode="best_match" folder="FOLDER_ID" folderName="Shipping"]]
[[handoff user="USER_ID" name="Hassan"]]
[[tag id="TAG_ID" name="VIP"]]
```

- Prose inside a flow becomes ordered instruction steps.
- `collect`, `tool`, and `reply` compile into executable procedure steps.
- `handoff` and `tag` compile into behavioral instructions; they are not direct database mutations.
- A chip outside a flow remains prompt guidance and does not compile into a procedure.
- Numbered/list-prefixed chip lines are accepted, but plain standalone lines are clearest.
- An action tool name must exist in the deployed-agent tool registry. Never invent one. Preserve known tool names from the existing Playbook; if a new name cannot be discovered from the live contract, stop and direct the user to the UI action picker.

## Saved replies, handoffs, and tags

Fixed saved replies currently bind by macro name, while best-match replies can bind to a folder ID. Handoffs and tags accept stable IDs plus human-readable names, but the compiled runtime instruction currently uses the name. Always copy exact IDs and names from live metadata/UI; never guess them. Renaming a fixed macro, handoff user, or tag can require a Playbook review.

## Editing rules

- Preserve headings and unrelated prose.
- Prefer modifying one existing flow over adding a competing flow.
- Keep facts out of Playbook when they belong in Knowledge.
- Keep behavior out of Knowledge articles when it belongs in Playbook.
- Do not publish merely because a save succeeded. Run a fresh test conversation first.
