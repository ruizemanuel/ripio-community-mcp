# ripio-community-mcp

> **Unofficial, community-built, not affiliated with Ripio.** Read-only. Use at your own risk.

A local [MCP](https://modelcontextprotocol.io) server that lets AI assistants read your [Ripio](https://www.ripio.com) account (balances, activity, prices, limits and open orders) using **your own API key**. It runs on your computer and only talks to `api.ripio.com`.

🇦🇷 Instrucciones en español: [README.es.md](README.es.md)

## Why use this instead of Ripio's official MCP?

Ripio has an official remote MCP server. If it works for you, use it. This project exists for the cases it doesn't cover:

|                | Official (`api.ripio.com/mcp`)                               | ripio-community-mcp                                               |
| -------------- | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| Clients        | Only Ripio-approved OAuth clients (Claude, ChatGPT, VS Code) | Any MCP client: Claude Desktop/Code, Cursor, VS Code, Zed, Cline… |
| Auth           | OAuth in the browser                                         | Your Ripio API key, stored locally                                |
| Tools          | ~70 endpoint mirrors                                         | 7 tools that answer whole questions                               |
| Read-only      | Depends on the permission preset you pick                    | Built in: the server can only send GET requests                   |
| Tool metadata  | No read-only/destructive annotations                         | Every tool is annotated read-only, with typed output              |
| Can move funds | Yes, with the Full preset                                    | No                                                                |

Neither can show card transactions, in-app buys/sells or bill payments: Ripio's public API doesn't expose them.

## Tools

| Tool                     | Ask things like                                                                  |
| ------------------------ | -------------------------------------------------------------------------------- |
| `ripio_get_portfolio`    | "How much do I have on Ripio and in what?"                                       |
| `ripio_list_activity`    | "What were my last withdrawals?" · "Show my Ripio Trade statement for September" |
| `ripio_get_transaction`  | "Give me the details of transaction 1234"                                        |
| `ripio_get_prices`       | "What's USDT at right now, in the app and on Ripio Trade?"                       |
| `ripio_estimate_trade`   | "How much would 100 USDT cost on Ripio Trade?"                                   |
| `ripio_get_limits`       | "How much can I still withdraw today?"                                           |
| `ripio_list_open_orders` | "Do I have open orders?"                                                         |

## Setup

### 1. Create a read-only API key in Ripio

1. Open [app.ripio.com](https://app.ripio.com) → **Configuración** → **API** → **Nueva clave**.
2. **IP restriction:** choose **IPs específicas** and add your public IP (recommended), or **Sin restricción**.
3. Name the key and keep the **Solo lectura** preset (Consultar 9/9, Operar 0/3, Retiros 0/2).
4. Confirm with your 2FA method and copy the **API Key** and **Secret Key**. The secret is shown only once.

> Ripio's "Solo lectura" preset still lets an API key register bank accounts in your own name. This server never calls that endpoint.

### 2. Add it to your client

**Claude Desktop (easiest).** Download `ripio-community-mcp.mcpb` from the [latest release](https://github.com/ruizemanuel/ripio-community-mcp/releases/latest), open it, and paste your API key and secret when asked. Claude Desktop keeps them in your system keychain.

**Claude Code**

```bash
claude mcp add --transport stdio ripio --env RIPIO_API_KEY=your-key --env RIPIO_API_SECRET=your-secret -- npx -y ripio-community-mcp
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

**Any other MCP client** (VS Code, Zed, Cline…): add a stdio server with command `npx`, arguments `-y ripio-community-mcp`, and the environment variables below. See your client's MCP documentation for where that goes.

### Configuration

| Variable           | Required | Description                                                                                      |
| ------------------ | -------- | ------------------------------------------------------------------------------------------------ |
| `RIPIO_API_KEY`    | yes      | Your Ripio API key                                                                               |
| `RIPIO_API_SECRET` | yes      | Your Ripio secret key                                                                            |
| `RIPIO_TRADE_RPS`  | no       | Ripio Trade requests per second. Default `1`; up to `3.5` if your account has verified documents |

## Security model

- **Read-only by construction.** The HTTP client can only send GET requests, and a test fails the build if anything else appears in the code. Even a key with write permissions can't be used to move funds through this server.
- **One host.** It only talks to `https://api.ripio.com`. No telemetry.
- **Your keys stay yours.** They are read from environment variables (or your keychain, in Claude Desktop) and never logged or sent to the model.
- **Least privilege.** Use a "Solo lectura" key with an IP allowlist. Revoke it any time in Ripio → Configuración → API.
- **Verifiable builds.** npm releases are published from GitHub Actions with [provenance](https://docs.npmjs.com/generating-provenance-statements).

Found a vulnerability? See [SECURITY.md](SECURITY.md).

## Limitations

- Ripio's API doesn't expose card transactions, in-app buys/sells or bill payments. Since 2026-07-21 they are not in the activity feed.
- On Wallet activity, `from`/`to` filter the page Ripio returns; follow `next_cursor` for older items.
- Values are estimates at Ripio app sell rates, not firm quotes.
- Tested with Argentinian accounts. Other countries may work for reading, but haven't been tested.
- Ripio Trade allows 1 request per second without verified documents; the server paces requests for you.

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
