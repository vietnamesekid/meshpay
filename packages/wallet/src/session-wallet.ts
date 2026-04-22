import {
  type AgentWallet,
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
import { base } from 'viem/chains'
import type { X402Authorization } from '@meshpay/protocols'

export interface SessionWalletOptions {
  /** Hex private key — if omitted, a new ephemeral key is generated */
  privateKey?: `0x${string}`
  /** Session TTL in milliseconds — default 1 hour */
  sessionTtlMs?: number
  caps: SpendCap
}

/**
 * Non-custodial agent wallet backed by an ephemeral or provided private key.
 * Keys NEVER leave the client — signing happens locally using viem.
 */
export class SessionWallet implements AgentWallet {
  readonly address: string
  readonly caps: SpendCap
  readonly expiresAt: Date

  private _state: SpendState
  private readonly client: WalletClient

  constructor(options: SessionWalletOptions) {
    const privateKey = options.privateKey ?? generatePrivateKey()
    const account = privateKeyToAccount(privateKey)

    this.address = account.address
    this.caps = options.caps
    this.expiresAt = new Date(Date.now() + (options.sessionTtlMs ?? 3_600_000))
    this._state = freshSpendState()

    this.client = createWalletClient({
      account,
      chain: base,
      transport: http(),
    })
  }

  get state(): SpendState {
    return this._state
  }

  assertCanSpend(amount: number): void {
    if (new Date() > this.expiresAt) {
      throw new Error('Wallet session has expired')
    }
    assertUnderCap(amount, this.caps, this._state)
  }

  async sign(quote: Quote): Promise<Signature> {
    if (new Date() > this.expiresAt) {
      throw new Error('Wallet session has expired — create a new SessionWallet')
    }

    const auth = quote.rawTx as X402Authorization

    // EIP-3009 transferWithAuthorization — prototype uses signMessage; full impl uses typed data
    const message = JSON.stringify({
      from: this.address,
      to: auth.to,
      value: auth.value,
      validAfter: auth.validAfter,
      validBefore: auth.validBefore,
      nonce: auth.nonce,
    })

    const rawSignature = await this.client.signMessage({
      account: this.client.account!,
      message,
    })

    const sig = rawSignature.slice(2)
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
