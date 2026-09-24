# Changelog

## 0.1.1 — unreleased

- `ripio_get_transaction` accepts the id as the string `ripio_list_activity` returns.
- `ripio_list_activity` explains Ripio Trade's 182-day statement limit instead of passing on Ripio's 400.
- A 403 now points first to a changed public IP, the usual cause with an IP-restricted key.
- Releases are published with npm trusted publishing (no long-lived token).

## 0.1.0 — 2026-09-24

- First release: seven read-only tools (`ripio_get_portfolio`, `ripio_list_activity`, `ripio_get_transaction`, `ripio_get_prices`, `ripio_estimate_trade`, `ripio_get_limits`, `ripio_list_open_orders`), the npm package, and a Claude Desktop bundle.
