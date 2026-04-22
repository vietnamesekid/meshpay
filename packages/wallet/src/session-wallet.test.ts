import { describe, it, expect } from 'vitest'
import { createSessionWallet, SessionWallet } from './session-wallet.js'
import { SpendCapError } from '@meshpay/core'
import type { Quote } from '@meshpay/core'
import type { X402Authorization } from '@meshpay/protocols'

const CAPS = { perCall: 0.05, perDay: 1.00 }

// Real checksummed addresses (Hardhat accounts) — viem validates address format strictly
const RECIPIENT_ADDR = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' // Hardhat account #1

function makeQuote(overrides: Partial<X402Authorization> = {}): Quote {
  const auth: X402Authorization = {
    from: '',
    to: RECIPIENT_ADDR,
    value: '1000000', // 1 USDC (6 decimals)
    validAfter: '0',
    validBefore: String(Math.floor(Date.now() / 1000) + 300),
    nonce: '0xabc123',
    ...overrides,
  }
  return {
    id: 'test-quote-1',
    request: { recipient: 'https://api.example.com', amount: 0.01, token: 'USDC', chainId: 'eip155:8453' },
    expiresAt: new Date(Date.now() + 60_000),
    estimatedFee: 0.001,
    rawTx: auth,
  }
}

describe('createSessionWallet', () => {
  it('generates a fresh address when no private key is given', () => {
    const w = createSessionWallet({ caps: CAPS })
    expect(w.address).toMatch(/^0x[0-9a-fA-F]{40}$/)
  })

  it('two wallets created without a key have different addresses', () => {
    const a = createSessionWallet({ caps: CAPS })
    const b = createSessionWallet({ caps: CAPS })
    expect(a.address).not.toBe(b.address)
  })

  it('restores deterministic address from known private key', () => {
    const key = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
    const w = createSessionWallet({ caps: CAPS, privateKey: key })
    // This is the well-known Hardhat account #0 address
    expect(w.address.toLowerCase()).toBe('0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266')
  })
})

describe('SessionWallet.assertCanSpend', () => {
  it('passes when amount is within cap', () => {
    const w = createSessionWallet({ caps: CAPS })
    expect(() => w.assertCanSpend(0.01)).not.toThrow()
  })

  it('throws when amount exceeds perCall cap', () => {
    const w = createSessionWallet({ caps: CAPS })
    expect(() => w.assertCanSpend(0.10)).toThrow(SpendCapError)
  })

  it('throws after session expiry', () => {
    const w = createSessionWallet({ caps: CAPS, sessionTtlMs: -1 })
    expect(() => w.assertCanSpend(0.01)).toThrow('expired')
  })
})

describe('SessionWallet.sign', () => {
  it('stamps auth.from with wallet address before signing', async () => {
    const w = createSessionWallet({ caps: CAPS })
    const quote = makeQuote()

    await w.sign(quote)

    const auth = quote.rawTx as X402Authorization
    expect(auth.from.toLowerCase()).toBe(w.address.toLowerCase())
  })

  it('returns a 65-byte signature with r, s, v', async () => {
    const w = createSessionWallet({ caps: CAPS })
    const sig = await w.sign(makeQuote())

    expect(sig.raw).toMatch(/^0x[0-9a-fA-F]{130}$/) // 65 bytes = 130 hex chars
    expect(sig.r).toMatch(/^0x[0-9a-fA-F]{64}$/)
    expect(sig.s).toMatch(/^0x[0-9a-fA-F]{64}$/)
    expect([27, 28].includes(sig.v) || sig.v <= 1).toBe(true)
  })

  it('throws on expired session', async () => {
    const w = createSessionWallet({ caps: CAPS, sessionTtlMs: -1 })
    await expect(w.sign(makeQuote())).rejects.toThrow('expired')
  })

  it('throws when quote chain does not match wallet chain', async () => {
    const key = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
    // @ts-expect-error — intentionally passing unsupported chain for test
    const w = new SessionWallet({ caps: CAPS, privateKey: key, chainId: 'eip155:1' })
    // makeQuote() produces a quote for eip155:8453 — mismatches wallet chain eip155:1
    await expect(w.sign(makeQuote())).rejects.toThrow('Chain mismatch')
  })
})

describe('SessionWallet.recordSpend', () => {
  it('accumulates in state', () => {
    const w = createSessionWallet({ caps: CAPS })
    const receipt = {
      txHash: '0xabc',
      chainId: 'eip155:8453' as const,
      amount: 0.01,
      token: 'USDC' as const,
      recipient: 'https://api.example.com',
      timestamp: new Date(),
    }
    w.recordSpend(receipt)
    w.recordSpend(receipt)
    expect(w.state.spentToday).toBeCloseTo(0.02)
    expect(w.state.txCount).toBe(2)
  })
})
