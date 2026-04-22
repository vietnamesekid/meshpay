import type {
  Facilitator,
  PaymentReceipt,
  PaymentRequest,
  Quote,
  Signature,
} from '@meshpay/core'
import type {
  X402Authorization,
  X402Payment,
  X402PaymentRequired,
  X402PaymentResponse,
} from './types.js'

const CDP_FACILITATOR_URL = 'https://api.cdp.coinbase.com/platform/v1/x402/facilitate'

export interface X402FacilitatorOptions {
  /** Coinbase CDP API key — falls back to COINBASE_CDP_API_KEY env var */
  apiKey?: string
  /** Custom facilitator endpoint */
  facilitatorUrl?: string
}

export class X402Facilitator implements Facilitator {
  readonly name = 'coinbase-cdp'

  private readonly apiKey: string
  private readonly facilitatorUrl: string

  constructor(options: X402FacilitatorOptions = {}) {
    const key = options.apiKey ?? process.env['COINBASE_CDP_API_KEY'] ?? ''
    if (!key) {
      console.warn('[meshpay] No COINBASE_CDP_API_KEY set — using unauthenticated (1K free tx/month)')
    }

    this.apiKey = key
    this.facilitatorUrl = options.facilitatorUrl ?? CDP_FACILITATOR_URL
  }

  async quote(request: PaymentRequest): Promise<Quote> {
    // Probe the target URL to get the 402 Payment Required header
    const response = await fetch(request.recipient, { method: 'GET' })

    if (response.status !== 402) {
      throw new Error(
        `Expected HTTP 402 from ${request.recipient}, got ${response.status}`,
      )
    }

    const header = response.headers.get('X-PAYMENT-REQUIRED')
      ?? response.headers.get('x-payment-required')

    if (!header) {
      throw new Error('Missing X-PAYMENT-REQUIRED header in 402 response')
    }

    const paymentRequired: X402PaymentRequired = JSON.parse(
      Buffer.from(header, 'base64').toString('utf-8'),
    )

    const option = paymentRequired.accepts[0]
    if (!option) throw new Error('No payment options in X-PAYMENT-REQUIRED')

    const expiresAt = new Date(paymentRequired.expiresAt)

    const rawTx: X402Authorization = {
      from: '', // filled in by wallet at sign time
      to: option.payTo,
      value: option.maxAmountRequired,
      validAfter: '0',
      validBefore: String(Math.floor(expiresAt.getTime() / 1000)),
      nonce: paymentRequired.nonce,
    }

    return {
      id: paymentRequired.nonce,
      request,
      expiresAt,
      estimatedFee: 0.001, // CDP charges $0.001/tx after 1K free
      rawTx,
    }
  }

  async submit(quote: Quote, signature: Signature): Promise<PaymentReceipt> {
    if (new Date() > quote.expiresAt) {
      throw new Error(`Quote ${quote.id} has expired`)
    }

    const rawTx = quote.rawTx as X402Authorization

    const payment: X402Payment = {
      scheme: 'exact',
      network: quote.request.chainId,
      payload: {
        signature: signature.raw,
        authorization: { ...rawTx, from: '' }, // wallet address filled at sign
      },
    }

    const paymentHeader = Buffer.from(JSON.stringify(payment)).toString('base64')

    const res = await fetch(quote.request.recipient, {
      method: 'GET',
      headers: {
        'X-PAYMENT': paymentHeader,
        'X-PAYMENT-FACILITATOR': this.facilitatorUrl,
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
    })

    const responseHeader = res.headers.get('X-PAYMENT-RESPONSE')
      ?? res.headers.get('x-payment-response')

    if (!responseHeader) {
      throw new Error(`Payment failed — no X-PAYMENT-RESPONSE header (HTTP ${res.status})`)
    }

    const paymentResponse: X402PaymentResponse = JSON.parse(
      Buffer.from(responseHeader, 'base64').toString('utf-8'),
    )

    if (!paymentResponse.success) {
      throw new Error(`Payment rejected: ${paymentResponse.errorReason}`)
    }

    return {
      txHash: paymentResponse.txHash ?? '',
      chainId: quote.request.chainId,
      amount: quote.request.amount,
      token: quote.request.token,
      recipient: quote.request.recipient,
      timestamp: new Date(),
      memo: quote.request.memo,
    }
  }
}

/** Convenience factory — equivalent to `new X402Facilitator(options)` */
export function createX402Facilitator(options?: X402FacilitatorOptions): X402Facilitator {
  return new X402Facilitator(options)
}
