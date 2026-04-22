// ─── Chain & Token ────────────────────────────────────────────────────────────

export type ChainId = 'eip155:8453' | 'eip155:137' | 'eip155:42161' | 'solana:mainnet'

export type TokenSymbol = 'USDC' | 'USDT' | 'DAI'

export interface Token {
  symbol: TokenSymbol
  address: string
  decimals: number
  chainId: ChainId
}

// ─── Money ────────────────────────────────────────────────────────────────────

/** Atomic unit amount (e.g. USDC with 6 decimals: $1.00 = 1_000_000) */
export type AtomicAmount = bigint

export interface Money {
  amount: AtomicAmount
  token: Token
}

// ─── Spend Caps ───────────────────────────────────────────────────────────────

export interface SpendCap {
  /** Max cost per individual tool call */
  perCall: number
  /** Max total spend per day (USD equivalent) */
  perDay: number
  /** Allowed recipient domains/addresses — empty means all allowed */
  allowedRecipients?: string[]
}

export interface SpendState {
  spentToday: number
  resetAt: Date
  txCount: number
}

// ─── Payment Request / Quote / Receipt ───────────────────────────────────────

export interface PaymentRequest {
  recipient: string
  amount: number
  token: TokenSymbol
  chainId: ChainId
  /** Human-readable memo */
  memo?: string
  /** Tool or service being paid for */
  resource?: string
}

export interface Quote {
  id: string
  request: PaymentRequest
  /** Expiry timestamp for this quote */
  expiresAt: Date
  /** Estimated gas/fee in USD */
  estimatedFee: number
  /** Raw transaction data to sign */
  rawTx: unknown
}

export interface PaymentReceipt {
  txHash: string
  chainId: ChainId
  amount: number
  token: TokenSymbol
  recipient: string
  timestamp: Date
  memo?: string
}

// ─── Wallet ───────────────────────────────────────────────────────────────────

export interface Signature {
  v: number
  r: string
  s: string
  raw: string
}

export interface AgentWallet {
  address: string
  caps: SpendCap
  state: SpendState
  sign(quote: Quote): Promise<Signature>
  /** Check spend cap before proceeding */
  assertCanSpend(amount: number): void
  recordSpend(receipt: PaymentReceipt): void
}

// ─── Facilitator ──────────────────────────────────────────────────────────────

export interface Facilitator {
  name: string
  quote(request: PaymentRequest): Promise<Quote>
  submit(quote: Quote, signature: Signature): Promise<PaymentReceipt>
}

// ─── Paid Tool ────────────────────────────────────────────────────────────────

export interface PaidToolOptions<TInput, TOutput> {
  name: string
  description?: string
  /** Max USD cost per call — rejects if quote exceeds this */
  maxCostPerCall: number
  /** Max USD spend per day — rejects if daily cap exceeded */
  maxCostPerDay: number
  /** The actual tool handler */
  handler: (input: TInput) => Promise<TOutput>
  /** Override default wallet */
  wallet?: AgentWallet
  /** Override default facilitator */
  facilitator?: Facilitator
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export class SpendCapError extends Error {
  constructor(
    message: string,
    public readonly cap: SpendCap,
    public readonly requested: number,
  ) {
    super(message)
    this.name = 'SpendCapError'
  }
}

export class PaymentError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'PaymentError'
  }
}

export class QuoteExpiredError extends Error {
  constructor(public readonly quote: Quote) {
    super(`Quote ${quote.id} expired at ${quote.expiresAt.toISOString()}`)
    this.name = 'QuoteExpiredError'
  }
}
