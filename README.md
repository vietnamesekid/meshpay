# MeshPay

Micropayment infrastructure for AI agents — spend-guarded, non-custodial, on-chain.

MeshPay lets AI agents autonomously pay for tools and APIs using USDC on EVM chains, with per-call and daily spend caps enforced locally before any transaction hits the network. Built on the [x402](https://x402.org) payment protocol and AP2 (Agent Payment Protocol v2).

---

## How it works

1. **Spend guard** — checks per-call and daily caps before anything happens
2. **AP2 authorization** — builds a signed agent identity token for the request
3. **x402 quote** — probes the endpoint (HTTP 402 + `X-PAYMENT-REQUIRED` header)
4. **Sign** — wallet produces an EIP-3009 `transferWithAuthorization` signature (EIP-712)
5. **Submit** — facilitator posts the signed payment to settle on-chain
6. **Execute** — tool handler runs only after settlement is confirmed
7. **Record** — daily spend state updates locally

No custodians. Keys never leave the client.

---

## Packages

| Package | Description |
|---|---|
| [`@meshpay/core`](packages/core) | Core types, spend guards, and shared interfaces |
| [`@meshpay/wallet`](packages/wallet) | `SessionWallet` — ephemeral non-custodial wallet |
| [`@meshpay/protocols`](packages/protocols) | x402 and AP2 protocol implementations |
| [`@meshpay/adapters`](packages/adapters) | Framework adapters (Vercel AI, Mastra, OpenAI) |
| [`@meshpay/cli`](packages/cli) | `meshpay` CLI for setup and debugging |

---

## Quick start

### Install

```bash
pnpm add @meshpay/core @meshpay/wallet @meshpay/protocols @meshpay/adapters
```

### Vercel AI SDK

```typescript
import { meshpay } from '@meshpay/adapters'
import { paidTool } from '@meshpay/adapters/vercel'
import { createSessionWallet } from '@meshpay/wallet'
import { X402Facilitator } from '@meshpay/protocols'
import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'

const client = meshpay()
  .withWallet(createSessionWallet({
    privateKey: process.env.AGENT_PRIVATE_KEY,
    chainId: 'eip155:8453',          // Base
    caps: { perCall: 0.10, perDay: 5.00 },
  }))
  .withFacilitator(new X402Facilitator({ apiKey: process.env.CDP_API_KEY }))

const search = paidTool({
  name: 'search',
  description: 'Search the web for current information',
  parameters: z.object({ query: z.string() }),
  maxCostPerCall: 0.01,
  maxCostPerDay: 1.00,
  paymentEndpoint: 'https://api.example.com/x402/search',
  handler: async ({ query }) => fetchSearchResults(query),
}, client)

const { text } = await generateText({
  model: openai('gpt-4o-mini'),
  tools: { search },
  prompt: 'What happened in tech this week?',
})
```

### Mastra

```typescript
import { meshpay } from '@meshpay/adapters'
import { paidTool } from '@meshpay/adapters/mastra'

const client = meshpay().withWallet(...).withFacilitator(...)

const search = paidTool({ /* same options */ }, client)
```

### OpenAI Agents SDK

```typescript
import { meshpay } from '@meshpay/adapters'
import { paidTool } from '@meshpay/adapters/openai'

const client = meshpay().withWallet(...).withFacilitator(...)

const search = paidTool({ /* same options */ }, client)
```

---

## CLI

```bash
# Scaffold config files for your framework
meshpay init --framework vercel

# Show session wallet state and daily spend
meshpay wallet status

# Probe a URL for x402 payment requirements
meshpay wallet probe https://api.example.com/x402/search
```

---

## Supported networks

| Chain | ID |
|---|---|
| Base | `eip155:8453` |
| Polygon | `eip155:137` |
| Arbitrum | `eip155:42161` |
| Polygon Amoy (testnet) | `eip155:80002` |

Payment token: **USDC** (EIP-3009 compliant contracts on all supported chains)

---

## Spend caps

Caps are enforced locally — no request reaches the network if a cap would be exceeded.

```typescript
const wallet = createSessionWallet({
  chainId: 'eip155:8453',
  caps: {
    perCall: 0.05,              // max $0.05 per tool call
    perDay: 2.00,               // max $2.00 total per day
    allowedRecipients: [        // optional allowlist
      '0xabc...',
    ],
  },
})
```

Daily spend resets at UTC midnight. Current state is available at `wallet.state.spentToday`.

---

## Session wallet

`SessionWallet` generates an ephemeral keypair (or accepts an existing private key) and signs EIP-3009 typed-data locally via [viem](https://viem.sh). Sessions have a configurable TTL (default 1 hour).

```typescript
import { createSessionWallet } from '@meshpay/wallet'

// Ephemeral — new key per session
const wallet = createSessionWallet({ chainId: 'eip155:8453', caps })

// Persistent — bring your own key
const wallet = createSessionWallet({
  privateKey: process.env.AGENT_PRIVATE_KEY,
  chainId: 'eip155:8453',
  caps,
})

console.log(wallet.address)          // 0x...
console.log(wallet.state.spentToday) // 0.0
```

---

## Example

A fully working agent is in [examples/vercel-agent](examples/vercel-agent). It runs a GPT-4o-mini research agent with two paid tools (`search` at $0.01, `scrape` at $0.005) and settles real USDC transactions on Polygon Amoy.

```bash
cd examples/vercel-agent

# Copy and fill in env vars
cp .env.example .env

# Run the agent
pnpm agent "What is the x402 payment protocol and who is building on it?"

# End-to-end test with on-chain verification
pnpm amoy-e2e
```

Required env vars:

```
AGENT_PRIVATE_KEY=0x...          # funded with Amoy USDC
OPENAI_API_KEY=sk-...
```

---

## Development

**Prerequisites:** Node ≥ 20, pnpm 10

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint

# Watch mode
pnpm dev
```

### Project structure

```
meshpay/
├── packages/
│   ├── core/          # Types, spend guards, interfaces
│   ├── wallet/        # SessionWallet
│   ├── protocols/     # x402 + AP2 implementations
│   ├── adapters/      # Framework integrations
│   └── cli/           # meshpay CLI
├── internal/          # Private workspace packages
├── examples/
│   └── vercel-agent/  # End-to-end demo
└── docs/
```

### Release

MeshPay uses [Changesets](https://github.com/changesets/changesets) for versioning.

```bash
pnpm changeset          # describe your change
pnpm version-packages   # bump versions
pnpm release            # build + publish to npm
```

---

## License

MIT — Copyright 2026 MeshPay
