# Accounting

Use this reference for anything in the Accounting workspace: the chart of accounts, journal entries, customers and suppliers, invoices' ledger side, credit notes, payments, bills, expenses, banking, assets, landed costs, prepaid expenses, period and year close, opening balances, multiple legal entities, and the financial reports. Everything the Accounting workspace does is available here, with the same rules.

Accounting needs a browser login (`repzo auth login`), the Accounting add-on, and Accounting access for the person (a seat, or the member switch on older plans). API keys can't use it. Each area also needs its own role permission (Sales, Purchases, Payments, Banking, Ledger, Reports, or Accounting settings), exactly as in the web app. Start with `repzo accounting access` when a command is refused: it says why (`module_not_in_plan`, `seat_required` or `switch_off`). If the scope is missing, run `repzo auth login` again.

## Legal entities

Everything happens in one legal entity at a time: your default unless you add `--query entityId=ENTITY_ID`. List them with `repzo accounting entities list`. Read the entity first, and use the same `entityId` for every command in one task. Never move between entities silently.

## What changes the books

| Kind of command | Effect | Ask first? |
|---|---|---|
| `list`, `get`, reports, `preview`, `status`, `check`, `candidates`, `open-items` | Read only | No |
| `create` and `update` on journal entries, bills, expenses, payment entries, landed costs, prepaid expenses, period closing vouchers, eliminations | Saves a **draft**. Nothing reaches the ledger | No, beyond the user asking for the change |
| `post` | **Posts to the ledger**. A posted document can't be edited, only cancelled or reversed | Always |
| `cancel`, `reverse`, `reverse-write-off`, `deposits reverse`, `year-close cancel` | Adds the opposite entries | Always |
| `bank transfer`, `bank deposits create`, `bills payments create`, `invoices write-off`, `invoices returns create` (credit note), `credit-applications create`, `opening-balances documents bring-in`, `opening-balances stock create`, `assets disposals create`, `currency-revaluation post` | **Post immediately**: there's no draft | Always |
| `assets create` | Posts only with `acquisitionCreditAccountId` (the purchase) or `isOpening: true` (an asset you already owned) | Always when either is sent |
| `assets depreciate`, `prepaid-expenses process`, `deferred-revenue process`, retries of scheduled-posting issues | Post **many entries at once** | Always, and say how far they run |
| `year-close close`, `period-closing-vouchers post`, `fiscal-lock update` | Close or lock periods. Nothing can be posted or changed before the lock date | Always |
| `settings update`, `mappings update`, `members access set`, `entities members set`, `document-sequences update`, `withholding-categories`, `payment-terms` | Change how the books work for everyone | Always |

Never post, cancel, reverse or close as a side effect of "create" or "fix". Stop at the draft and tell the user what posting would do, unless they asked for it to be posted. Every write needs `--dry-run` first and `--yes` to send.

## Typical flows

Journal entry:

```bash
repzo accounting accounts list --query accountType=expense --query isGroup=false
repzo accounting journal-entries create --data @entry.json --dry-run
repzo accounting journal-entries create --data @entry.json --yes
repzo accounting journal-entries post ENTRY_ID --dry-run
```

`entry.json` is `{ "postingDate": "2026-11-05", "memo": "...", "lines": [{ "accountId": "...", "debit": 100, "credit": 0 }, { "accountId": "...", "debit": 0, "credit": 100 }] }`. Debits must equal credits. **Posting returns the posted entry with a new id**: the draft is replaced, so use the returned id for `get` or `reverse`.

Supplier bill and payment:

```bash
repzo accounting suppliers list --query q=Acme
repzo accounting bills create --data @bill.json --dry-run
repzo accounting bills post BILL_ID --dry-run
repzo accounting bills payments create BILL_ID --data @payment.json --dry-run
```

Receive money from a customer against invoices:

```bash
repzo accounting payment-entries open-items --query partyType=account --query partyId=ACCOUNT_ID
repzo accounting payment-entries create --data @receipt.json --dry-run
repzo accounting payment-entries post PAYMENT_ENTRY_ID --dry-run
```

Credit note and invoice PDF. Use `repzo invoices …` with CRM invoice permissions, or the `repzo accounting invoices …` twins when the person works on invoices through Accounting (Sales) instead. If one gives 403, try the other:

```bash
repzo invoices returns create INVOICE_ID --data '{"reason":"Damaged","items":[{"invoiceItemId":"ITEM_ID","quantity":2}]}' --dry-run
repzo invoices pdf INVOICE_ID --output ./invoices
repzo accounting invoices returns create INVOICE_ID --data '{"reason":"Damaged"}' --dry-run
repzo accounting invoices pdf INVOICE_ID --output ./invoices
```

Reports take dates in `YYYY-MM-DD`. Range reports need `from` and `to`; as-of reports take `asOf` (today by default). Add `--query currency=EUR` to see amounts converted from the base currency:

```bash
repzo accounting reports trial-balance --query from=2026-01-01 --query to=2026-10-31
repzo accounting reports balance-sheet --query asOf=2026-10-31
repzo accounting reports general-ledger --query from=2026-10-01 --query to=2026-10-31 --query accountId=ACCOUNT_ID
repzo accounting reports consolidated trial-balance --query groupId=GROUP_ID --query from=2026-01-01 --query to=2026-10-31
```

## Settings the books use

These live outside `repzo accounting` because they're workspace settings with their own scopes and permissions, the same as their Settings screens:

| Command family | Read | Change | What the books use it for |
|---|---|---|---|
| `locations` | list, get, settings get | create, update, delete, settings update | Where stock is kept. `accountingEntityId` shows the company it belongs to; Accounting sets it, so it can't be written |
| `tax-rates` | list, get | create, update, delete | Tax on lines. Map each rate to its tax account with `accounting mappings update` |
| `product-categories` | list, get | create, update, delete, reorder | Category default accounts (`accounting product-account-defaults`) |
| `price-lists` | list, get, items list | create, update, delete, items set, items remove | Prices in a currency |
| `units-of-measure` | list, get | create, update, delete | The catalog of units products can be sold in |
| `unit-groups` | list, get | create, update, delete | Named sets of units; a product joins one with `unitGroupId` on `products units set` |
| `products units`, `products barcodes` | units get, barcodes lookup (`--query code=...`) | units set (replaces all of a product's units) | A product's units, and finding one by barcode |
| `currencies` | list, get, rates list, exchange-rate | create, update, delete, rates set | Exchange rates for documents, reports and revaluation |
| `payment-methods` | list, get, preferences get | create, update, delete, preferences set | A custom method's `category` decides how payments post; map `custom:<id>` to an account in `accounting mappings update` |
| `inventory` | items list, levels list, transactions list, transfers list | adjustments create, transfers create, levels low-stock, levels retail-price | Stock and its value. Adjustments and transfers **post immediately**; there's no draft |
| `product-suppliers` | list, get | create, update, delete | The same suppliers as `accounting suppliers`, without the accounting fields (holds, tax ID, bank details, default accounts). Use `accounting suppliers` for those |
| `product-brands` | list, get | create, update, delete | Grouping products |

```bash
repzo locations create --data '{"name":"Riyadh warehouse","country":"SA","timezone":"Asia/Riyadh"}' --dry-run
repzo tax-rates create --data '{"name":"VAT 15%","rate":15}' --dry-run
repzo currencies create --data '{"currencyCode":"EUR","currencyName":"Euro","currencySymbol":"€","exchangeRateToBase":4.1}' --dry-run
repzo currencies rates set EUR --data '{"rate":4.05,"effectiveDate":"2026-10-31"}' --dry-run
repzo currencies exchange-rate --query currency=EUR --query date=2026-11-01
repzo price-lists items set PRICE_LIST_ID --data '{"productId":"PRODUCT_ID","unitPrice":12.5}' --dry-run
repzo accounting products stock --query ids=PRODUCT_ID,PRODUCT_ID
repzo inventory adjustments create --data '{"locationId":"LOCATION_ID","reason":"receive_items","items":[{"inventoryItemId":"ITEM_ID","quantity":10,"unitCost":4}]}' --dry-run
repzo inventory transfers create --data '{"sourceLocationId":"FROM_ID","destinationLocationId":"TO_ID","items":[{"inventoryItemId":"ITEM_ID","quantity":3}]}' --dry-run
```

- A tax rate that's on any document, product, line item, membership plan or location setting can't be deleted (409). Rename it, or move those records to another rate.
- A location that still has stock on hand can't be deleted (409). Transfer or adjust the stock to zero first.
- `inventory adjustments create` posts to the books at once: `receive_items` at `unitCost`, `inventory_count` (send `countedQuantity`), `loss`, `damage`, `correction` and `internal_use` at average cost. Opening stock goes through `accounting opening-balances stock create`, never here. Confirm before posting.
- A supplier or brand still used by products or documents can't be deleted (409). Mark it inactive instead.
- `currencies rates set` records a rate for one date without changing today's rate. `currencies update` with `exchangeRateToBase` changes today's rate. The base currency's rate is always 1, and the base can't change once Accounting has been turned on.
- A price list's currency, and any price's currency, must be one of the workspace's active currencies.

## Every command

Run `repzo commands --json` for each command's arguments, body and notes. The families:

| Family (`repzo accounting …`) | Reads | Writes |
|---|---|---|
| `access` | (no action) | none |
| `settings` | get | update |
| `setup-defaults` | (no action) | none |
| `mappings` | get | update |
| `accounts` | list, get, balance | create, update, delete |
| `journal-entries` | list, get | create, update, delete, post, reverse |
| `fiscal-lock` | none | update |
| `customers` | list, people | create-individual |
| `suppliers` | list, get | create, update |
| `parties` | get | settings update |
| `credit-limits` | check | none |
| `payment-terms` | list | create, set-default, set-party-default, update, archive |
| `invoices` | entries, pdf | write-off, reverse-write-off, returns create |
| `credit-applications` | list, party | create, cancel |
| `payment-entries` | list, open-items, get | create, update, post, apply-advance, cancel, delete |
| `bills` | list, get | create, update, post, cancel, delete, payments create, payments delete |
| `expenses` | list, get | create, update, post, cancel, delete |
| `withholding-categories` | list | create, update |
| `landed-costs` | list, eligible-bills, get | preview, create, update, post, cancel, delete |
| `prepaid-expenses` | eligible-lines, list, get | issues retry, process, create, post, cancel |
| `assets` | list, get | depreciation-issues retry, depreciate, create, disposals create |
| `asset-disposals` | none | cancel |
| `deferred-revenue` | none | process |
| `currency-revaluation` | preview | post |
| `scheduled-postings` | issues | none |
| `bank` | lines list, lines candidates, rules list, undeposited-receipts, deposits list | import, lines match, lines status, transfer, rules create, rules update, rules delete, deposits create, deposits reverse |
| `fiscal-years` | list, closing-preview | create, update |
| `period-closing-vouchers` | none | create, update, post, reverse, delete |
| `year-close` | status | close, cancel |
| `opening-balances` | status | targets replace, documents preview, documents bring-in, complete, reopen, stock create |
| `document-sequences` | list | update |
| `products` | stock, summary | none |
| `product-account-defaults` | resolve, get | update |
| `entities` | list | create, update, members list, members set |
| `members` | none | access get, access set |
| `intercompany` | get | relationships create, relationships update |
| `eliminations` | list | create, update, post, reverse |
| `reports` | balance-sheet, trial-balance, profit-and-loss, cash-flow, vat-return, ar-aging, ap-aging, general-ledger, stock-ledger, statement, statement-customers, open-items, consolidated trial-balance, consolidated balance-sheet, consolidated cash-flow, consolidated profit-and-loss | none |

## Things that surprise people

- Request bodies are strict: an unknown or misspelled field, at any depth, is refused with 422 and named in `error.details`. Read the error instead of retrying blindly.
- `409` means the document changed state (posted, cancelled, already reversed) or a period is closed or locked. Read it again before trying anything else.
- A transfer is undone by reversing its journal entry. A deposit is undone with `bank deposits reverse`.
- Currency revaluations, depreciation runs, and deferred revenue or prepaid recognitions can't be undone through any command. Revalue again at the earlier rate if a revaluation was wrong.
- Disposing of an asset first posts any depreciation due up to the disposal date, and cancelling the disposal leaves that depreciation posted.
- `bank rules update` replaces the whole rule: anything left out goes back to its default.
- Supplier custom properties go in `customProperties`, keyed by property name, like on other records. `metadata properties supplier` lists them and says which are required.
- `journal-entries list` refuses a `status`, `sourceType` or `kind` it doesn't know, so a typo can't quietly return every entry.
- `--query sort=FIELD` (or `-FIELD` for descending) only takes the fields each list names in its help. Anything else gets 422.
- A supplier on a payment hold blocks bill payments and posting an expense paid to them. The draft expense saves fine.
- Deleting a draft landed cost hides it but keeps it for history, so its number stays used. Cancelling a draft prepaid expense keeps it as cancelled and frees its journal line for a new schedule. Deleted draft bills and expenses are removed for good.
- `members access get` and `members access set` need someone who works across all companies. A user limited to some companies gets 403.
- `bills payments delete` needs the bill the payment belongs to. Another bill's id gives 404.
- Customers are CRM accounts (companies or individuals). Make a contact an individual customer with `customers create-individual`.
- Listing fiscal years creates the standard years if they're missing, and reading the intercompany setup can add missing system accounts. Both are expected.
