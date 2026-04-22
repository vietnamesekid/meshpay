import type {
  PaidToolOptions,
  PaymentReceipt,
} from '@meshpay/core'
import { PaymentError, QuoteExpiredError } from '@meshpay/core'
import {
  buildAuthorizationRequest,
  issueAuthorizationToken,
} from '@meshpay/protocols'
import type { MeshpayClient } from './client.js'

const AP2_SIGNING_KEY = (() => {
  const key = process.env['MESHPAY_AP2_KEY']
  if (!key) {
    throw new Error(
      'MESHPAY_AP2_KEY environment variable is required. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    )
  }
  return key
})()

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
  client: MeshpayClient,
): Promise<{ output: TOutput; receipt: PaymentReceipt }> {
  const wallet = opts.wallet ?? client.resolveWallet(opts)
  const facilitator = opts.facilitator ?? client.resolveFacilitator()

  // 1. AP2: build a signed authorization request and issue a token.
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

  if (!ap2Response.token) throw new PaymentError('AP2 token issuance failed — no token returned')

  const extraHeaders: Record<string, string> = {
    'X-AP2-AUTHORIZATION': ap2Response.token,
    'X-AP2-AGENT-ID': ap2Request.agentId,
  }

  // 2. Get x402 quote — probes the 402 endpoint with AP2 headers attached
  let quote
  try {
    quote = await facilitator.quote({
      recipient: paymentEndpoint,
      amount: opts.maxCostPerCall,
      token: 'USDC',
      chainId: wallet.chainId,
      memo: opts.name,
      resource: opts.name,
      extraHeaders,
    })
  } catch (err) {
    throw new PaymentError(`Failed to get quote for tool "${opts.name}"`, err)
  }

  // 3. Enforce spend cap BEFORE signing
  wallet.assertCanSpend(opts.maxCostPerCall)

  // 4. Sign (EIP-3009 typed data)
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
