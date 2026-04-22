import {
  type AgentWallet,
  type ChainId,
  type PaymentReceipt,
  type Quote,
  type Signature,
  type SpendCap,
  type SpendState,
  assertUnderCap,
  freshSpendState,
  recordSpend,
} from '@meshpay/core'
import {
  type WalletClient,
  createWalletClient,
  http,
} from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { base, polygon, arbitrum, polygonAmoy } from 'viem/chains'
import type { X402Authorization } from '@meshpay/protocols'

export interface SessionWalletOptions {
  /** Hex private key — if omitted, a new ephemeral key is generated */
  privateKey?: `0x${string}`
  /** Session TTL in milliseconds — default 1 hour */
  sessionTtlMs?: number
  caps: SpendCap
  /** CAIP-2 chain id — defaults to eip155:8453 (Base) */
  chainId?: Exclude<ChainId, 'solana:mainnet'>
}

// EIP-3009 TransferWithAuthorization typed data definition (EIP-712)
// https://eips.ethereum.org/EIPS/eip-3009
const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const

// USDC contract addresses and their EIP-712 domain parameters per chain
const USDC_DOMAIN: Record<string, { name: string; version: string; address: `0x${string}`; chainNumericId: number }> = {
  'eip155:8453': {
    name: 'USD Coin',
    version: '2',
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    chainNumericId: 8453,
  },
  'eip155:137': {
    name: 'USD Coin',
    version: '2',
    address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    chainNumericId: 137,
  },
  'eip155:42161': {
    name: 'USD Coin',
    version: '2',
    address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    chainNumericId: 42161,
  },
  'eip155:80002': {
    name: 'USDC',
    version: '2',
    address: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
    chainNumericId: 80002,
  },
}

function chainFromCaip2(chainId: string) {
  if (chainId === 'eip155:137') return polygon
  if (chainId === 'eip155:42161') return arbitrum
  if (chainId === 'eip155:80002') return polygonAmoy

  return base // default: eip155:8453
}

// bytes32 nonce: left-pad hex string or use as-is if already 32 bytes
function toBytes32(nonce: string): `0x${string}` {
  const stripped = nonce.startsWith('0x') ? nonce.slice(2) : nonce
  return `0x${stripped.padStart(64, '0')}` as `0x${string}`
}

/**
 * Non-custodial agent wallet backed by an ephemeral or provided private key.
 * Keys NEVER leave the client — signing happens locally using viem.
 *
 * Uses EIP-3009 transferWithAuthorization typed data (EIP-712) for real
 * x402 compliance with USDC on Base, Polygon, and Arbitrum.
 */
export class SessionWallet implements AgentWallet {
  readonly address: string
  readonly chainId: ChainId
  readonly caps: SpendCap
  readonly expiresAt: Date

  private _state: SpendState
  private readonly client: WalletClient

  constructor(options: SessionWalletOptions) {
    const privateKey = options.privateKey ?? generatePrivateKey()
    const account = privateKeyToAccount(privateKey)
    const chainId: ChainId = options.chainId ?? 'eip155:8453'

    this.address = account.address
    this.caps = options.caps
    this.chainId = chainId
    this.expiresAt = new Date(Date.now() + (options.sessionTtlMs ?? 3_600_000))
    this._state = freshSpendState()

    this.client = createWalletClient({
      account,
      chain: chainFromCaip2(chainId),
      transport: http(),
    })
  }

  get state(): SpendState {
    return this._state
  }

  assertCanSpend(amount: number): void {
    if (new Date() >= this.expiresAt) {
      throw new Error('Wallet session has expired')
    }
    assertUnderCap(amount, this.caps, this._state)
  }

  /**
   * Signs a payment quote using EIP-3009 transferWithAuthorization (EIP-712
   * typed data). The USDC contract verifies this signature on-chain during
   * settlement via the CDP facilitator.
   */
  async sign(quote: Quote): Promise<Signature> {
    if (new Date() >= this.expiresAt) {
      throw new Error('Wallet session has expired — create a new SessionWallet')
    }

    if (quote.request.chainId !== this.chainId) {
      throw new Error(
        `Chain mismatch: quote is for ${quote.request.chainId} but wallet is on ${this.chainId}`,
      )
    }

    const auth = quote.rawTx as X402Authorization
    // Stamp the payer address so submit() can include it in the authorization payload
    auth.from = this.address

    const domainParams = USDC_DOMAIN[this.chainId]

    if (!domainParams) {
      throw new Error(`Unsupported chain for EIP-3009 signing: ${this.chainId}`)
    }

    // EIP-712 domain — must match what USDC contract's DOMAIN_SEPARATOR expects
    const domain = {
      name: domainParams.name,
      version: domainParams.version,
      chainId: domainParams.chainNumericId,
      verifyingContract: domainParams.address,
    } as const

    const message = {
      from: this.address as `0x${string}`,
      to: auth.to as `0x${string}`,
      value: BigInt(auth.value),
      validAfter: BigInt(auth.validAfter),
      validBefore: BigInt(auth.validBefore),
      nonce: toBytes32(auth.nonce),
    }

    const rawSignature = await this.client.signTypedData({
      account: this.client.account!,
      domain,
      types: EIP3009_TYPES,
      primaryType: 'TransferWithAuthorization',
      message,
    })

    // Parse r, s, v from the 65-byte signature (r=32, s=32, v=1)
    const sig = rawSignature.slice(2) // strip 0x
    return {
      v: parseInt(sig.slice(128, 130), 16),
      r: `0x${sig.slice(0, 64)}`,
      s: `0x${sig.slice(64, 128)}`,
      raw: rawSignature,
    }
  }

  recordSpend(receipt: PaymentReceipt): void {
    this._state = recordSpend(this._state, receipt.amount)
  }
}

/** Create a fresh ephemeral session wallet */
export function createSessionWallet(options: SessionWalletOptions): SessionWallet {
  return new SessionWallet(options)
}
