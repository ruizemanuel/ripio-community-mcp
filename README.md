# ripio-community-mcp

[![npm](https://img.shields.io/npm/v/ripio-community-mcp)](https://www.npmjs.com/package/ripio-community-mcp) [![CI](https://github.com/ruizemanuel/ripio-community-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/ruizemanuel/ripio-community-mcp/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/npm/l/ripio-community-mcp)](LICENSE)

> **Unofficial, community-built, not affiliated with Ripio.** Read-only. Use at your own risk.

A local [MCP](https://modelcontextprotocol.io) server that lets AI assistants read your [Ripio](https://www.ripio.com) account (balances, activity, prices, limits, open orders and deposit addresses) using **your own API key**. It runs on your computer and only talks to `api.ripio.com`.

🇦🇷 Instrucciones en español: [README.es.md](README.es.md)

## Why use this instead of Ripio's official MCP?

Ripio has an official remote MCP server. If it works for you, use it. This project exists for the cases it doesn't cover:

|                | Official (`api.ripio.com/mcp`)                               | ripio-community-mcp                                                                               |
| -------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Clients        | Only Ripio-approved OAuth clients (Claude, ChatGPT, VS Code) | Any MCP client that runs local (stdio) servers: Claude Desktop/Code, Cursor, VS Code, Zed, Cline… |
| Auth           | OAuth in the browser                                         | Your Ripio API key, stored locally                                                                |
| Tools          | ~70 endpoint mirrors                                         | 10 tools that answer whole questions                                                              |
| Read-only      | Depends on the permission preset you pick                    | Built in: the server can only send GET requests                                                   |
| Tool metadata  | No read-only/destructive annotations                         | Every tool is annotated read-only, with typed output                                              |
| Can move funds | Yes, with the Full preset                                    | No                                                                                                |

Neither can show card transactions, in-app buys/sells or bill payments: Ripio's public API doesn't expose them.

## Tools

| Tool                           | Ask things like                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------- |
| `ripio_get_portfolio`          | "How much do I have on Ripio and in what?"                                       |
| `ripio_list_activity`          | "What were my last withdrawals?" · "Show my Ripio Trade statement for September" |
| `ripio_get_transaction`        | "Give me the details of transaction 1234"                                        |
| `ripio_get_prices`             | "What's USDT at right now, in the app and on Ripio Trade?"                       |
| `ripio_estimate_trade`         | "How much would 100 USDT cost on Ripio Trade?"                                   |
| `ripio_get_limits`             | "How much can I still withdraw today?"                                           |
| `ripio_list_open_orders`       | "Do I have open orders?"                                                         |
| `ripio_get_deposit_address`    | "What address do I send USDT to over Tron?"                                      |
| `ripio_verify_deposit_address` | "Is this address really mine? I'm about to send USDT over Polygon"               |
| `ripio_get_deposit_accounts`   | "What's my CVU and alias?"                                                       |

## Deposit safety

A wrong network, a missing memo or one mistyped character can lose the funds, so deposits get extra layers:

1. **Exact output.** Addresses and memos come back exactly as Ripio sends them. The server never creates an address: if Ripio hasn't assigned one for a network yet, it tells you to start that deposit in the Ripio app.
2. **Network rules.** `ripio_get_deposit_address` returns no address until the network is clear. Along with the address, it names the networks where that same address credits the asset, and the ones that need a different address. Your EVM address is the same on every EVM network, but Ripio only credits each asset on some of them.
3. **Verification by code.** The assistant retypes what it reads, and a language model can, rarely, change a character. Before sending, paste the address you will actually use and ask to verify it: `ripio_verify_deposit_address` compares it character by character with your real addresses and flags near misses.
4. **Network checksums.** Most networks (EVM with mixed-case addresses, Tron, Bitcoin, XRP, Stellar…) have a checksum, so the sending wallet usually rejects a mistyped address. Solana addresses have none.

For large amounts, send a small test deposit first. These are Ripio app (Wallet) addresses; Ripio Trade uses different ones.

Pesos sent to your CVU are credited in the deposit currency set in your Ripio app profile: if that is a crypto, they are converted automatically. `ripio_get_deposit_accounts` reminds you of this.

## Setup

### 1. Create a read-only API key in Ripio

The steps use the labels of Ripio's English interface. If yours is in Spanish, switch it in **Profile** → **Preferences** → **Language**, or follow [README.es.md](README.es.md).

1. Open [app.ripio.com](https://app.ripio.com), click your avatar (top right) → **Profile** → **API** tab → **New key**.
2. **IP restriction:** choose **Specific IPs** and add your public IP (recommended), or **No restriction**. Home connections often get a new public IP now and then; when that happens the server reports a 403 until you add the new IP to the key.
3. Name the key and keep the **Read-only** preset (Consult 9/9, Operate within Ripio 0/3, Withdrawals and addresses 0/2).
4. Confirm with your 2FA method and copy the **API Key** and **Secret Key**. The secret is shown only once.

> Ripio's "Read-only" preset still lets an API key register bank accounts in your own name. This server never calls that endpoint.

### 2. Add it to your client

**Claude Desktop (easiest).** Download `ripio-community-mcp.mcpb` from the [latest release](https://github.com/ruizemanuel/ripio-community-mcp/releases/latest). In Claude Desktop, go to **Settings** → **Extensions** → **Advanced settings** → **Install Extension…**, pick the file, and paste your API key and secret when asked. Claude Desktop keeps them in your system keychain. Then ask in a regular chat, for example "How much do I have on Ripio and in what?"

**Claude Code**

```bash
claude mcp add --env RIPIO_API_KEY=your-key --env RIPIO_API_SECRET=your-secret --transport stdio ripio -- npx -y ripio-community-mcp
```

**Cursor** (`~/.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "ripio": {
      "command": "npx",
      "args": ["-y", "ripio-community-mcp"],
      "env": { "RIPIO_API_KEY": "your-key", "RIPIO_API_SECRET": "your-secret" }
    }
  }
}
```

**VS Code** (`.vscode/mcp.json`, or **MCP: Open User Configuration** for all workspaces). VS Code asks for the key and secret once and stores them securely:

```json
{
  "inputs": [
    { "type": "promptString", "id": "ripio-key", "description": "Ripio API key", "password": true },
    { "type": "promptString", "id": "ripio-secret", "description": "Ripio secret key", "password": true }
  ],
  "servers": {
    "ripio": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "ripio-community-mcp"],
      "env": { "RIPIO_API_KEY": "${input:ripio-key}", "RIPIO_API_SECRET": "${input:ripio-secret}" }
    }
  }
}
```

**Zed** (`settings.json`)

```json
{
  "context_servers": {
    "ripio": {
      "command": "npx",
      "args": ["-y", "ripio-community-mcp"],
      "env": { "RIPIO_API_KEY": "your-key", "RIPIO_API_SECRET": "your-secret" }
    }
  }
}
```

**Any other MCP client** (Cline, Continue…): add a stdio server with command `npx`, arguments `-y ripio-community-mcp`, and the environment variables below. See your client's MCP documentation for where that goes. It is also listed in the official [MCP Registry](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.ruizemanuel/ripio-community-mcp) as `io.github.ruizemanuel/ripio-community-mcp`, so clients that install from the registry can find it there.

> **Windows:** if the server doesn't start (for example, "Connection closed"), launch `npx` through `cmd`. In Claude Code, end the command with `-- cmd /c npx -y ripio-community-mcp`; in JSON configs, use `"command": "cmd"` and `"args": ["/c", "npx", "-y", "ripio-community-mcp"]`.

### Configuration

| Variable           | Required | Description                                                                                      |
| ------------------ | -------- | ------------------------------------------------------------------------------------------------ |
| `RIPIO_API_KEY`    | yes      | Your Ripio API key                                                                               |
| `RIPIO_API_SECRET` | yes      | Your Ripio secret key                                                                            |
| `RIPIO_TRADE_RPS`  | no       | Ripio Trade requests per second. Default `1`; up to `3.5` if your account has verified documents |

## Security model

- **Read-only by construction.** The HTTP client can only send GET requests, and a test fails the build if anything else appears in the code. Even a key with write permissions can't be used to move funds through this server.
- **One host.** It only talks to `https://api.ripio.com` and never follows redirects, so a signed request can't end up anywhere else. No telemetry.
- **Your keys stay yours.** They are read from environment variables (or your keychain, in Claude Desktop) and never logged or sent to the model.
- **Least privilege.** Use a "Read-only" key with an IP allowlist. Revoke it any time in Ripio → Profile → API.
- **Verifiable builds.** npm releases are published from GitHub Actions with [provenance](https://docs.npmjs.com/generating-provenance-statements).

Found a vulnerability? See [SECURITY.md](SECURITY.md).

## Limitations

- Ripio's API doesn't expose card transactions, in-app buys/sells or bill payments. Since 2026-07-21 they are not in the activity feed.
- On Wallet activity, `from`/`to` filter the page Ripio returns; follow `next_cursor` for older items. Once a page reaches back past `from`, no `next_cursor` is offered.
- Values are estimates at Ripio app sell rates, not firm quotes.
- Tested with Argentinian accounts. Other countries may work for reading, but haven't been tested.
- Ripio Trade allows 1 request per second without verified documents; the server paces requests for you.
- Ripio Trade statements can be read up to 182 days at a time; ask for older periods in chunks of about 6 months.
- Deposit addresses are Ripio app (Wallet) addresses. Ripio Trade deposit addresses aren't supported yet.

## Development

```bash
npm ci
npm test
npm run build
```

To run the live suite against your own account, create `.env.live` (git-ignored) with `RIPIO_API_KEY` and `RIPIO_API_SECRET` for a read-only key, then run `npm run test:live`.

Contributions are welcome. Keep the server read-only and add tests with every change.

## Disclaimer

MIT licensed. This project is not affiliated with, endorsed by or supported by Ripio; trademarks belong to their owners. Everything it shows is informational and not financial advice. You are responsible for your API keys.
