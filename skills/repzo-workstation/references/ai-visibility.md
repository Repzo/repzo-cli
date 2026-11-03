# AI Visibility

Use this reference for Marketing → AI Visibility: tracking how ChatGPT, Gemini, Perplexity, Claude, and Google AI Mode answer buyers' questions, and acting on the results. The commands need the `ai_visibility:read` or `ai_visibility:write` scope. If a profile signed in before these commands existed gets `Missing required scope`, ask the user to run `repzo auth login` again.

## What can and can't be edited

| Tab | Read | Change |
|---|---|---|
| Overview, Citations | `repzo ai-visibility overview`, `repzo ai-visibility citations` | Nothing directly: the numbers are calculated from tracked answers. Change the brand, competitors, or prompts instead; past answers keep their results. |
| Prompts | `repzo ai-visibility prompts list`, `repzo ai-visibility prompts get` | `create`, `update`, `delete`, `suggest`, `translate`, `run` |
| Recommendations | `repzo ai-visibility recommendations list`, `repzo ai-visibility recommendations get` | `update`, `bulk-update`, `generate`, `draft`, `save-draft`, `create-task` |
| Page checks | `repzo ai-visibility audits list` | `repzo ai-visibility audits run` |
| Settings | `repzo ai-visibility settings get` | `repzo ai-visibility settings update`, plus `competitors` and `groups` |

If the user asks to fix a wrong number on the Overview or Citations, explain that and offer the setting behind it: a missing spelling goes in `brandAliases`, a site they own goes in `additionalDomains`, and a rival goes in `competitors`.

## What costs money

Every AI assistant answer and AI helper charges the workspace's AI balance. Confirm with the user before running these, and never loop them:

- `repzo ai-visibility prompts suggest`, `repzo ai-visibility prompts translate`, `repzo ai-visibility recommendations generate`: limited per day (429 when spent).
- `repzo ai-visibility recommendations draft`: replaces any existing draft. Read `draftMarkdown` first; if the user edited it, ask before overwriting.
- `repzo ai-visibility prompts run`: limited to 30 a day per workspace. Results arrive within minutes, so re-read later instead of polling.
- `completeSetup: true` and adding active prompts: every active prompt is asked of every engine, every day. `options.answerPriceUsd` from `settings get` is the typical price per answer; multiply it to tell the user the daily cost. `monthlyBudgetUsd` caps it.

An empty AI balance returns `payment_required` with `details.code` `ai_wallet_empty`.

## Set up tracking

```bash
repzo ai-visibility settings get
repzo ai-visibility settings update --data '{"brandName":"Acme","brandAliases":["أكمي"],"domain":"acme.com","country":"SA","engines":["chatgpt","gemini"],"locales":["en","ar"],"monthlyBudgetUsd":50}' --dry-run
repzo ai-visibility competitors create --data '{"name":"Zoho","aliases":["زوهو"],"domain":"zoho.com"}' --dry-run
repzo ai-visibility prompts create --data '{"prompts":[{"text":"Best CRM for clinics in Riyadh","locale":"en","stage":"consideration"}]}' --dry-run
repzo ai-visibility settings update --data '{"completeSetup":true}' --dry-run
```

Take `country`, `engines`, and `locales` values from `options` in `settings get`, and skip engines with `available: false`. Until the brand is saved, prompts return 409 with `details.code` `aeo_not_set_up`. After the first save, `settings update` keeps fields you omit, so send only what changes. Pause tracking with `{"trackingEnabled":false}`.

## Read results

```bash
repzo ai-visibility overview --query from=2026-10-01 --query to=2026-10-31 --query locale=ar
repzo ai-visibility citations --query engine=chatgpt
repzo ai-visibility referrals
repzo ai-visibility prompts list --query active=true --query q=clinic --limit 50
repzo ai-visibility prompts get PROMPT_ID
```

The default range is the last 30 days. `prompts get` returns each engine's latest full answer with its mentions and cited pages, which is the fastest way to see why a prompt scores low.

## Manage prompts

```bash
repzo ai-visibility prompts suggest --data '{"locale":"ar","count":10}' --dry-run
repzo ai-visibility prompts translate --data '{"promptIds":["PROMPT_ID"],"to":"ar"}' --dry-run
repzo ai-visibility prompts update PROMPT_ID --data '{"active":false}' --dry-run
repzo ai-visibility groups create --data '{"name":"Clinics"}' --dry-run
repzo ai-visibility prompts update PROMPT_ID --data '{"groupId":"GROUP_ID"}' --dry-run
```

`suggest` saves nothing: show the suggestions, then add the ones the user picks with `prompts create`, keeping each one's `source` and `stage`. Write prompts the way a buyer would ask; most should not name the brand. A prompt is tracked in one language, and changing its wording starts a new question while past answers stay. `create` reports duplicates in `skipped` instead of failing.

## Work on recommendations

```bash
repzo ai-visibility recommendations list --query status=active
repzo ai-visibility recommendations get REC_ID
repzo ai-visibility recommendations update REC_ID --data '{"title":"Compare Acme and Zoho","priority":"high"}' --dry-run
repzo ai-visibility recommendations update REC_ID --data @draft.json --dry-run
repzo ai-visibility recommendations bulk-update --data '{"ids":["REC_ID"],"status":"dismissed"}' --dry-run
repzo ai-visibility recommendations save-draft REC_ID --data '{"collectionId":"COLLECTION_ID"}' --dry-run
repzo ai-visibility recommendations create-task REC_ID --dry-run
```

You can write a draft yourself instead of paying for `draft`: send `draftTitle` and `draftMarkdown` to `update`. Drafts work only on types `create_content` and `update_page`. Get `collectionId` from `repzo collections list`; the article stays a draft in Content Hub. Use `save-draft` only when asked, because it needs Content Hub access, and `create-task` needs permission to create activities.

Editing an open recommendation moves it to `in_progress`, so the refresh keeps it. `generate` and the weekly refresh replace only open recommendations nobody touched. Set `done` only when the work is finished: it saves today's visibility as the baseline, and `impact` in the list compares the next 14 days against it.

## Check pages

```bash
repzo ai-visibility audits run --data '{"url":"https://acme.com/pricing"}' --dry-run
repzo ai-visibility audits list
```

Only pages on the brand's domains or a tracked competitor's site can be checked; others return 422. A page that can't be loaded still returns a saved check with `status: failed` and an `error`.

## Not available here

CSV export of prompts isn't exposed. Use `repzo ai-visibility prompts list` with `--all` for the same results as JSON.
