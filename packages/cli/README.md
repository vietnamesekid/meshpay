# @meshpay/cli

[![npm](https://img.shields.io/npm/v/@meshpay/cli)](https://www.npmjs.com/package/@meshpay/cli)

CLI tools for MeshPay — scaffold config files, inspect wallet state, and probe x402 endpoints.

## Install

```bash
# Global install
npm install -g @meshpay/cli

# Or use directly with npx
npx @meshpay/cli <command>
```

## Commands

### `meshpay init`

Scaffold config files for your project.

```bash
meshpay init --framework vercel
meshpay init --framework mastra
meshpay init --framework openai
```

Creates three files:

| File | Description |
|---|---|
| `.env.local` | Env var template with `COINBASE_CDP_API_KEY` and optional overrides |
| `meshpay.config.ts` | Spend caps and chain config |
| `meshpay-examples/<framework>-tool.ts` | Example paid tool for your framework |

Existing files are skipped (never overwritten).

**Example output:**

```
Initializing MeshPay for vercel...

  created  .env.local
  created  meshpay.config.ts
  created  meshpay-examples/vercel-tool.ts

Next steps:
  1. Add your COINBASE_CDP_API_KEY to .env.local
  2. Adjust spend caps in meshpay.config.ts
  3. Use the example in meshpay-examples/vercel-tool.ts as a starting point
```

---

### `meshpay wallet status`

Show the current session wallet state using env vars for caps.

```bash
meshpay wallet status
```

```
Session Wallet
  Address  : 0x1a2b3c...
  Expires  : 2026-04-22T11:00:00.000Z
  Cap/call : $0.05
  Cap/day  : $5
  Spent    : $0.0000
  Tx count : 0
```

Configure caps via env vars:

```bash
MESHPAY_CAP_PER_CALL=0.10 MESHPAY_CAP_PER_DAY=10.00 meshpay wallet status
```

---

### `meshpay wallet probe <url>`

Probe a URL for x402 payment requirements. Useful for inspecting what payment terms an endpoint expects before integrating it.

```bash
meshpay wallet probe https://api.example.com/x402/search
```

**If the endpoint returns 402:**

```
Probing https://api.example.com/x402/search for x402 payment requirements...
  Payment required:
  {
      "accepts": [
          {
              "scheme": "exact",
              "network": "eip155:8453",
              "maxAmountRequired": "10000",
              "payTo": "0xrecipient...",
              "asset": "0xusdc..."
          }
      ],
      "expiresAt": "2026-04-22T10:05:00.000Z",
      "nonce": "abc123..."
  }
```

**If the endpoint does not return 402:**

```
Probing https://api.example.com/search for x402 payment requirements...
  HTTP 200 — no 402 Payment Required at this endpoint
```

---

### `meshpay --version`

```bash
meshpay --version
# or
meshpay -v
```
