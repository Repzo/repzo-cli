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
[[slot variable="contact.email" present="Confirm the email on file" missing="Ask for an email address"]]
[[tool name="transfer_to_human"]]
```

- Prose inside a flow becomes ordered instruction steps.
- `collect`, `tool`, and `reply` compile into executable procedure steps.
- `handoff` and `tag` compile into behavioral instructions; they are not direct database mutations.
- `slot` (mainly for voice) branches on whether a variable already has a value: the agent follows `present` when it does and `missing` when it does not. It compiles to an instruction step. Use a real variable path from the Variables section.
- `[[tool name="transfer_to_human"]]` is the voice "transfer the call to a human" action. It compiles to an instruction and transfers to the destination configured in the agent's call flow; it does not need a Function.
- A chip outside a flow remains prompt guidance and does not compile into a procedure.
- Numbered/list-prefixed chip lines are accepted, but plain standalone lines are clearest.
- An action tool name must be one the agent is allowed to use. Never invent one.

## Choosing tool names

1. Run `repzo agents tools AGENT_ID --json` and use only names with `allowed: true`.
2. If the action you need is a Function that is not enabled yet, enable it first with `repzo agents functions update` (see [functions.md](functions.md)), then re-read the tools list. Helper read tools cannot be enabled alone; they come with their Function.
3. Run `repzo agents playbook validate AGENT_ID --data @playbook.json` and fix every error before `repzo agents update`.

Validation returns `valid`, `characterCount` and `characterLimit`, `errors`, `warnings`, and the compiled `flows` with their steps (`collect_fields`, `tool`, `instruction`). Read the compiled steps to confirm each flow does what you meant. On older agents whose tools are not managed through Functions yet, a warning such as "Saving also allows the agent to use X" means the save will turn that tool on; tell the user before saving.

## Saved replies, handoffs, and tags

Fixed saved replies currently bind by macro name, while best-match replies can bind to a folder ID. Handoffs and tags accept stable IDs plus human-readable names, but the compiled runtime instruction currently uses the name. Always copy exact IDs and names from live metadata/UI; never guess them. Renaming a fixed macro, handoff user, or tag can require a Playbook review.

## Editing rules

- Preserve headings and unrelated prose.
- Prefer modifying one existing flow over adding a competing flow.
- Keep facts out of Playbook when they belong in Knowledge.
- Keep behavior out of Knowledge articles when it belongs in Playbook.
- Validate before saving; an invalid Playbook returns `422` and is not saved.
- Saving a Playbook regenerates its `source: playbook` procedures. Do not edit those procedures directly; change the flow here.
- Do not publish merely because a save succeeded. Run a fresh test conversation first.
