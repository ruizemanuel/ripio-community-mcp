# Changelog

## 0.2.3 — 2026-09-25

- `ripio_list_activity` (Ripio Trade): an entry with an unreadable amount takes its direction from its type instead of reading as incoming, and an entry with a blank currency shows `UNKNOWN` and is flagged.
- `ripio_list_activity` (Wallet): once a page reaches back past `from`, no `next_cursor` is offered.
- `ripio_get_transaction` says what each field shows as when both the amount and the asset are missing.
- A rate limit with a long `Retry-After` says how long Ripio asks to wait, and a redirect from Ripio is reported as such instead of being retried as a network error.
- Deposit tools: a network where Ripio lists conflicting addresses or memos at the newest version says so, instead of "not assigned yet" in `ripio_get_deposit_address` and `not_yours` in `ripio_verify_deposit_address`, which gets the new status `conflicting`.

## 0.2.2 — 2026-09-25

- `ripio_get_portfolio` warns about each balance Ripio sends in an unreadable form instead of counting it as 0 in silence, and its summary counts those warnings.
- `ripio_list_activity` and `ripio_get_transaction` flag movements whose amount or asset Ripio sent missing or unreadable (`unreadable`), and say so in the summary.
- `ripio_get_deposit_address` lists only the networks where the address itself credits the asset, and names the networks that need a different address.
- `ripio_get_deposit_accounts` warns that, depending on the deposit currency set in the Ripio app, pesos sent to the CVU may be converted to crypto.

## 0.2.1 — 2026-09-25

- Requests to Ripio never follow redirects, don't wait out a `Retry-After` longer than 10 seconds, and identify themselves with a `User-Agent`.
- Both deposit tools: a network needs every Ripio flag on to receive; a network where Ripio lists conflicting addresses or memos at the newest version has no current address; a warning says when Ripio's currency list could not confirm that deposits are open.
- `ripio_get_deposit_address`: negative minimums and maximums are ignored.
- `ripio_verify_deposit_address`: ignores spaces around Ripio's own address and memo, flags a lowercase EVM copy with an extra character as a mistyped copy, and explains an ambiguous network or a network the address is not on.
- A 403 on the deposit endpoints names the "General data" permission.
- CI and release workflows pin their actions by commit SHA.

## 0.2.0 — 2026-09-25

- `ripio_get_deposit_address`: the Ripio app (Wallet) deposit address for an asset and network, with its memo/tag, the networks that credit the asset and the warnings to relay. It returns no address while the network is unclear, doesn't credit the asset, has deposits disabled or lacks a required memo, and it never creates one.
- `ripio_verify_deposit_address`: checks by code that an address (and memo) is exactly one of your Wallet deposit addresses on a network that credits the asset, and flags mistyped copies.
- `ripio_get_deposit_accounts`: Ripio's bank-deposit accounts for fiat (CVU and alias).
- README: deposit safety.

## 0.1.3 — 2026-09-24

- Listed in the official MCP Registry as `io.github.ruizemanuel/ripio-community-mcp` (`mcpName` in package.json, `server.json`); releases publish there too.
- README badges for npm, CI and license.

## 0.1.2 — 2026-09-24

- English text (README, bundle descriptions, error messages) uses the labels of Ripio's English interface; the Spanish guide stays in README.es.md.

## 0.1.1 — 2026-09-24

- `ripio_get_transaction` accepts the id as the string `ripio_list_activity` returns.
- `ripio_list_activity` explains Ripio Trade's 182-day statement limit instead of passing on Ripio's 400.
- A 403 now points first to a changed public IP, the usual cause with an IP-restricted key.
- Releases are published with npm trusted publishing (no long-lived token).

## 0.1.0 — 2026-09-24

- First release: seven read-only tools (`ripio_get_portfolio`, `ripio_list_activity`, `ripio_get_transaction`, `ripio_get_prices`, `ripio_estimate_trade`, `ripio_get_limits`, `ripio_list_open_orders`), the npm package, and a Claude Desktop bundle.
