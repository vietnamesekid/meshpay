# @meshpay/wallet

[![npm](https://img.shields.io/npm/v/@meshpay/wallet)](https://www.npmjs.com/package/@meshpay/wallet)

Non-custodial session wallet for MeshPay agents. Signs EIP-3009 `transferWithAuthorization` typed data locally using [viem](https://viem.sh) — keys never leave the client.

## Install

```bash
pnpm add @meshpay/wallet
# or
npm install @meshpay/wallet
```

## Quick start

```typescript
import { createSessionWallet } from '@meshpay/wallet'

const wallet = createSessionWallet({
  privateKey: process.env.AGENT_PRIVATE_KEY, // omit for ephemeral key
  chainId: 'eip155:8453',                    // Base (default)
  caps: {
    perCall: 0.05,  // max $0.05 per tool call
    perDay: 2.00,   // max $2.00 per day
  },
})

console.log(wallet.address)           // 0x...
console.log(wallet.state.spentToday)  // 0
console.log(wallet.expiresAt)         // 1 hour from now
```

## Ephemeral vs persistent key

```typescript
// Ephemeral — generates a new private key on every call
const ephemeral = createSessionWallet({
  caps: { perCall: 0.01, perDay: 1.00 },
})

// Persistent — reuse an existing key across sessions
const persistent = createSessionWallet({
  privateKey: '0xabc123...',
  caps: { perCall: 0.01, perDay: 1.00 },
})
```

An ephemeral wallet is useful for one-off agent runs. A persistent key lets you maintain a USDC balance that survives restarts.

## Session TTL

Sessions expire after 1 hour by default. Signing or `assertCanSpend` will throw once the session expires.

```typescript
const wallet = createSessionWallet({
  caps: { perCall: 0.01, perDay: 1.00 },
  sessionTtlMs: 30 * 60 * 1000, // 30 minutes
})

console.log(wallet.expiresAt) // 30 min from now
```

## Supported chains

| Chain | `chainId` | USDC contract |
|---|---|---|
| Base | `eip155:8453` | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Polygon | `eip155:137` | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` |
| Arbitrum | `eip155:42161` | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` |
| Polygon Amoy (testnet) | `eip155:80002` | `0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582` |

## Spend caps

`assertCanSpend` is called before signing. It throws `SpendCapError` if either the per-call or projected daily cap would be exceeded.

```typescript
wallet.assertCanSpend(0.03) // throws if over cap

// After a successful payment
wallet.recordSpend(receipt)
console.log(wallet.state.spentToday) // 0.03
console.log(wallet.state.txCount)    // 1
```

Daily spend resets automatically at UTC midnight.

## Signing

`wallet.sign(quote)` produces an EIP-3009 `transferWithAuthorization` signature (EIP-712 typed data). The USDC contract verifies this signature on-chain during settlement via the facilitator.

```typescript
const signature = await wallet.sign(quote)
// { v, r, s, raw }
```

The wallet validates that the quote's `chainId` matches its own before signing. It also stamps `quote.rawTx.from` with the wallet address so the facilitator can include it in the authorization payload.

## API

```typescript
class SessionWallet implements AgentWallet {
  readonly address: string
  readonly chainId: ChainId
  readonly caps: SpendCap
  readonly expiresAt: Date
  get state(): SpendState

  assertCanSpend(amount: number): void
  sign(quote: Quote): Promise<Signature>
  recordSpend(receipt: PaymentReceipt): void
}

function createSessionWallet(options: SessionWalletOptions): SessionWallet

interface SessionWalletOptions {
  privateKey?: `0x${string}` // omit for ephemeral
  sessionTtlMs?: number       // default: 3_600_000 (1 hour)
  caps: SpendCap
  chainId?: 'eip155:8453' | 'eip155:137' | 'eip155:42161' | 'eip155:80002'
}
```
