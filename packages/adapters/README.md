# @meshpay/adapters

[![npm](https://img.shields.io/npm/v/@meshpay/adapters)](https://www.npmjs.com/package/@meshpay/adapters)

Framework adapters for MeshPay — wrap any AI tool with an x402 payment gate. Supports Vercel AI SDK, Mastra, and OpenAI Agents SDK.

## Install

```bash
pnpm add @meshpay/adapters
# or
npm install @meshpay/adapters
```

**Peer dependencies** (install the ones you need):

```bash
pnpm add ai zod         # for Vercel AI SDK adapter
```

## Setup

Before calling `paidTool`, configure a wallet and facilitator. This only needs to happen once at startup.

```typescript
import { createSessionWallet } from '@meshpay/wallet'
import { X402Facilitator } from '@meshpay/protocols'
import { setDefaultWallet, setDefaultFacilitator } from '@meshpay/adapters'

setDefaultWallet(
  createSessionWallet({
    privateKey: process.env.AGENT_PRIVATE_KEY,
    chainId: 'eip155:8453',
    caps: { perCall: 0.10, perDay: 5.00 },
  })
)

setDefaultFacilitator(
  new X402Facilitator({ apiKey: process.env.COINBASE_CDP_API_KEY })
)
```

**Required env var:**

```
MESHPAY_AP2_KEY=<32-byte hex>
```

Generate one:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Vercel AI SDK

```typescript
import { paidTool } from '@meshpay/adapters/vercel'
import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'

const search = paidTool({
  name: 'search',
  description: 'Search the web for current information',
  parameters: z.object({ query: z.string().describe('The search query') }),
  maxCostPerCall: 0.01,
  maxCostPerDay: 1.00,
  paymentEndpoint: 'https://api.example.com/x402/search',
  handler: async ({ query }) => fetchResults(query),
})

const { text } = await generateText({
  model: openai('gpt-4o-mini'),
  tools: { search },
  prompt: 'What happened in AI this week?',
  onStepFinish({ toolResults }) {
    // toolResults is fully typed — PaidTool guarantees execute is non-optional
  },
})
```

`paidTool` from the Vercel adapter returns a `PaidTool<TSchema, TOutput>` — a `Tool` subtype with `execute` guaranteed non-optional. This means `toolResults` in `onStepFinish` is correctly typed by the SDK.

---

## Mastra

```typescript
import { paidTool, withPayment } from '@meshpay/adapters/mastra'

// Create a new paid tool from scratch
const browse = paidTool({
  name: 'browse',
  description: 'Open a browser session',
  maxCostPerCall: 0.05,
  maxCostPerDay: 5.00,
  paymentEndpoint: 'https://api.browserbase.com/x402/session',
  handler: async (input) => browserbase.createSession(input),
})

// Or wrap an existing Mastra tool with a payment gate
const paidBrowse = withPayment(existingBrowseTool, {
  paymentEndpoint: 'https://api.browserbase.com/x402/session',
  maxCostPerCall: 0.05,
  maxCostPerDay: 5.00,
})
```

---

## OpenAI Agents SDK

```typescript
import { paidTool, createPaymentHooks } from '@meshpay/adapters/openai'
import { Agent, Runner } from 'openai/agents'

const research = paidTool({
  name: 'deep_research',
  description: 'Run a deep research query',
  maxCostPerCall: 1.00,
  maxCostPerDay: 20.00,
  paymentEndpoint: 'https://api.heurist.ai/x402/research',
  handler: async ({ query }) => heurist.deepResearch(query),
})

const agent = new Agent({
  name: 'research-agent',
  tools: [research],
})

// Optional: attach payment lifecycle hooks
const hooks = createPaymentHooks({
  onPayment: (toolName, amountUsd, txHash) => {
    console.log(`[${toolName}] paid $${amountUsd} — tx: ${txHash}`)
  },
  onSpendCapExceeded: (toolName, requested, cap) => {
    console.warn(`[${toolName}] cap exceeded: requested $${requested}, cap $${cap}`)
  },
})

await Runner.run(agent, 'Research the latest in AI agents', { hooks })
```

---

## Payment flow

Every `paidTool` call follows this sequence before the handler runs:

1. Build a signed AP2 authorization request and issue a short-lived token
2. Probe the `paymentEndpoint` for x402 payment terms (HTTP 402 + `X-PAYMENT-REQUIRED`), attaching `X-AP2-AUTHORIZATION` and `X-AP2-AGENT-ID` headers
3. Check spend caps locally — throws `SpendCapError` before any signing if exceeded
4. Sign the quote with EIP-3009 typed data via the session wallet
5. Submit to the CDP facilitator for on-chain USDC settlement
6. Record spend, then call the `handler`

If payment fails at any step, the handler is never called.

---

## Per-tool wallet and facilitator override

Each tool can use a different wallet or facilitator:

```typescript
const premiumTool = paidTool({
  name: 'premium',
  maxCostPerCall: 1.00,
  maxCostPerDay: 50.00,
  paymentEndpoint: 'https://api.example.com/x402/premium',
  wallet: premiumWallet,           // override default
  facilitator: customFacilitator,  // override default
  handler: async (input) => callPremiumApi(input),
})
```

---

## API

```typescript
// Core (all adapters)
import { setDefaultWallet, setDefaultFacilitator } from '@meshpay/adapters'

// Vercel AI SDK
import { paidTool } from '@meshpay/adapters/vercel'

// Mastra
import { paidTool, withPayment } from '@meshpay/adapters/mastra'

// OpenAI Agents SDK
import { paidTool, createPaymentHooks } from '@meshpay/adapters/openai'
```
