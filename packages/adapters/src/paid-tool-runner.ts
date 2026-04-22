import type {
  AgentWallet,
  Facilitator,
  PaidToolOptions,
  PaymentReceipt,
} from '@meshpay/core'
import { PaymentError, QuoteExpiredError } from '@meshpay/core'
import { X402Facilitator } from '@meshpay/protocols'
import { createSessionWallet } from '@meshpay/wallet'

let _defaultFacilitator: Facilitator | undefined
let _defaultWallet: AgentWallet | undefined

/** Override default facilitator used by all paidTool() calls */
export function setDefaultFacilitator(f: Facilitator): void {
  _defaultFacilitator = f
}

/** Override default wallet used by all paidTool() calls */
export function setDefaultWallet(w: AgentWallet): void {
  _defaultWallet = w
}

function getDefaultFacilitator(): Facilitator {
  _defaultFacilitator ??= new X402Facilitator()
  return _defaultFacilitator
}

function getDefaultWallet(opts: Pick<PaidToolOptions<unknown, unknown>, 'maxCostPerCall' | 'maxCostPerDay'>): AgentWallet {
  _defaultWallet ??= createSessionWallet({
    caps: {
      perCall: opts.maxCostPerCall,
      perDay: opts.maxCostPerDay,
    },
  })
  return _defaultWallet
}

/**
 * Core execution logic shared by all framework adapters.
 * Resolves wallet + facilitator, enforces spend caps, signs & submits payment,
 * then calls the underlying handler.
 */
export async function runPaidTool<TInput, TOutput>(
  input: TInput,
  opts: PaidToolOptions<TInput, TOutput>,
  /** HTTP endpoint to pay (passed by framework adapter) */
  paymentEndpoint: string,
): Promise<{ output: TOutput; receipt: PaymentReceipt }> {
  const wallet = opts.wallet ?? getDefaultWallet(opts)
  const facilitator = opts.facilitator ?? getDefaultFacilitator()

  // 1. Get quote
  let quote
  try {
    quote = await facilitator.quote({
      recipient: paymentEndpoint,
      amount: opts.maxCostPerCall,
      token: 'USDC',
      chainId: 'eip155:8453',
      memo: opts.name,
      resource: opts.name,
    })
  } catch (err) {
    throw new PaymentError(`Failed to get quote for tool "${opts.name}"`, err)
  }

  // 2. Enforce spend cap BEFORE signing
  wallet.assertCanSpend(opts.maxCostPerCall)

  // 3. Sign
  if (new Date() > quote.expiresAt) throw new QuoteExpiredError(quote)
  const signature = await wallet.sign(quote)

  // 4. Submit payment
  let receipt: PaymentReceipt
  try {
    receipt = await facilitator.submit(quote, signature)
  } catch (err) {
    throw new PaymentError(`Payment submission failed for tool "${opts.name}"`, err)
  }

  // 5. Record spend
  wallet.recordSpend(receipt)

  // 6. Call handler
  const output = await opts.handler(input)

  return { output, receipt }
}
