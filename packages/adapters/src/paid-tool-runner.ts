import type {
  AgentWallet,
  Facilitator,
  PaidToolOptions,
  PaymentReceipt,
} from '@meshpay/core'
import { PaymentError, QuoteExpiredError } from '@meshpay/core'
import { X402Facilitator } from '@meshpay/protocols'
import {
  buildAuthorizationRequest,
  issueAuthorizationToken,
} from '@meshpay/protocols'
import { createSessionWallet } from '@meshpay/wallet'

let _defaultFacilitator: Facilitator | undefined
let _defaultWallet: AgentWallet | undefined

// Signing key for AP2 tokens — in production, load from env/config
const AP2_SIGNING_KEY = process.env['MESHPAY_AP2_KEY'] ?? 'meshpay-dev-key'

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
 *
 * Flow:
 *   1. Build AP2 authorization request + issue short-lived token
 *   2. Get x402 quote (probe 402 endpoint, attach AP2 token as header)
 *   3. Enforce spend cap before signing
 *   4. Sign quote with EIP-3009 typed data
 *   5. Submit to CDP facilitator for on-chain settlement
 *   6. Record spend, call handler
 */
export async function runPaidTool<TInput, TOutput>(
  input: TInput,
  opts: PaidToolOptions<TInput, TOutput>,
  /** HTTP endpoint to pay (passed by framework adapter) */
  paymentEndpoint: string,
): Promise<{ output: TOutput; receipt: PaymentReceipt }> {
  const wallet = opts.wallet ?? getDefaultWallet(opts)
  const facilitator = opts.facilitator ?? getDefaultFacilitator()

  // 1. AP2: build a signed authorization request and issue a token.
  //    The token is sent as X-AP2-AUTHORIZATION so the resource server can
  //    verify agent identity and delegation before settling payment.
  const ap2Request = buildAuthorizationRequest({
    agentId: wallet.address,
    privateKey: AP2_SIGNING_KEY,
    amount: opts.maxCostPerCall,
    recipient: paymentEndpoint,
    resource: opts.name,
  })

  const ap2Response = issueAuthorizationToken({
    agentId: wallet.address,
    amount: opts.maxCostPerCall,
    recipient: paymentEndpoint,
    signingKey: AP2_SIGNING_KEY,
  })

  const extraHeaders: Record<string, string> = {
    'X-AP2-AUTHORIZATION': ap2Response.token ?? '',
    'X-AP2-AGENT-ID': ap2Request.agentId,
  }

  // 2. Get x402 quote — probes the 402 endpoint with AP2 headers attached
  let quote
  try {
    quote = await facilitator.quote({
      recipient: paymentEndpoint,
      amount: opts.maxCostPerCall,
      token: 'USDC',
      chainId: 'eip155:8453',
      memo: opts.name,
      resource: opts.name,
      extraHeaders,
    })
  } catch (err) {
    throw new PaymentError(`Failed to get quote for tool "${opts.name}"`, err)
  }

  // 3. Enforce spend cap BEFORE signing
  wallet.assertCanSpend(opts.maxCostPerCall)

  // 4. Sign (EIP-3009 typed data — also stamps auth.from with wallet address)
  if (new Date() > quote.expiresAt) throw new QuoteExpiredError(quote)
  const signature = await wallet.sign(quote)

  // 5. Submit payment to CDP facilitator for on-chain settlement
  let receipt: PaymentReceipt
  try {
    receipt = await facilitator.submit(quote, signature)
  } catch (err) {
    throw new PaymentError(`Payment submission failed for tool "${opts.name}"`, err)
  }

  // 6. Record spend and call handler
  wallet.recordSpend(receipt)
  const output = await opts.handler(input)

  return { output, receipt }
}
