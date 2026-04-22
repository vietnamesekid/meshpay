# @meshpay/core

[![npm](https://img.shields.io/npm/v/@meshpay/core)](https://www.npmjs.com/package/@meshpay/core)

Core types, interfaces, and spend-guard logic for MeshPay. This is the foundation package — all other MeshPay packages depend on it.

## Install

```bash
pnpm add @meshpay/core
# or
npm install @meshpay/core
```

## What's in here

- **Types** — `ChainId`, `TokenSymbol`, `Money`, `PaymentRequest`, `Quote`, `PaymentReceipt`, `Signature`
- **Interfaces** — `AgentWallet`, `Facilitator`, `PaidToolOptions`
- **Spend guards** — `assertUnderCap`, `recordSpend`, `freshSpendState`
- **Errors** — `SpendCapError`, `PaymentError`, `QuoteExpiredError`

## Spend caps

The spend guard runs locally before any transaction reaches the network. It checks both the per-call limit and the projected daily total.

```typescript
import { assertUnderCap, freshSpendState, recordSpend } from '@meshpay/core'
import type { SpendCap } from '@meshpay/core'

const caps: SpendCap = {
  perCall: 0.05,   // max $0.05 per tool call
  perDay: 2.00,    // max $2.00 total per day
}

let state = freshSpendState()

// Throws SpendCapError if either cap would be exceeded
assertUnderCap(0.03, caps, state)

// After a successful payment, update state
state = recordSpend(state, 0.03)
console.log(state.spentToday)  // 0.03
console.log(state.txCount)     // 1
```

Daily spend resets at UTC midnight — `freshSpendState()` sets `resetAt` to the next UTC midnight, and `recordSpend` auto-resets if the current time has passed it.

## Key types

```typescript
// Supported chains
type ChainId =
  | 'eip155:8453'    // Base
  | 'eip155:137'     // Polygon
  | 'eip155:42161'   // Arbitrum
  | 'eip155:80002'   // Polygon Amoy (testnet)
  | 'solana:mainnet'

// Spend cap configuration
interface SpendCap {
  perCall: number              // max USD per tool call
  perDay: number               // max USD per day
  allowedRecipients?: string[] // optional address allowlist
}

// Spend tracking state
interface SpendState {
  spentToday: number
  resetAt: Date    // next UTC midnight reset
  txCount: number
}

// Payment flow types
interface PaymentRequest {
  recipient: string
  amount: number
  token: TokenSymbol   // 'USDC' | 'USDT' | 'DAI'
  chainId: ChainId
  memo?: string
  resource?: string
  extraHeaders?: Record<string, string>
}

interface Quote {
  id: string
  request: PaymentRequest
  expiresAt: Date
  estimatedFee: number
  rawTx: unknown
}

interface PaymentReceipt {
  txHash: string
  chainId: ChainId
  amount: number
  token: TokenSymbol
  recipient: string
  timestamp: Date
  memo?: string
}
```

## Wallet and Facilitator interfaces

If you're building a custom wallet or facilitator, implement these interfaces:

```typescript
interface AgentWallet {
  address: string
  chainId: ChainId
  caps: SpendCap
  state: SpendState
  sign(quote: Quote): Promise<Signature>
  assertCanSpend(amount: number): void
  recordSpend(receipt: PaymentReceipt): void
}

interface Facilitator {
  name: string
  quote(request: PaymentRequest): Promise<Quote>
  submit(quote: Quote, signature: Signature): Promise<PaymentReceipt>
}
```

## Error types

```typescript
import { SpendCapError, PaymentError, QuoteExpiredError } from '@meshpay/core'

try {
  assertUnderCap(amount, caps, state)
} catch (err) {
  if (err instanceof SpendCapError) {
    console.log(err.cap)       // SpendCap
    console.log(err.requested) // amount that triggered the error
  }
}
```
