/** x402 Payment-Required response header payload */
export interface X402PaymentRequired {
  /** x402 scheme version */
  version: number
  /** CAIP-2 chain identifier e.g. eip155:8453 */
  chainId: string
  /** Recipient wallet address */
  accepts: X402PaymentOption[]
  /** Unique nonce for this request */
  nonce: string
  /** ISO expiry timestamp */
  expiresAt: string
}

export interface X402PaymentOption {
  scheme: 'exact' | 'upto'
  network: string
  /** Token contract address */
  asset: string
  /** Atomic token amount */
  maxAmountRequired: string
  /** Recipient address */
  payTo: string
  /** Optional description */
  description?: string
  /** EIP-3009/Permit2 extra data */
  extra?: Record<string, unknown>
}

/** x402 X-PAYMENT header payload (sent by client) */
export interface X402Payment {
  /** x402 scheme e.g. "exact" */
  scheme: string
  network: string
  payload: X402PaymentPayload
}

export interface X402PaymentPayload {
  /** ERC-3009 signed transfer or Permit2 signature */
  signature: string
  /** Authorization data */
  authorization: X402Authorization
}

export interface X402Authorization {
  from: string
  to: string
  value: string
  validAfter: string
  validBefore: string
  nonce: string
}

/** x402 X-PAYMENT-RESPONSE header (returned after settlement) */
export interface X402PaymentResponse {
  success: boolean
  txHash?: string
  network?: string
  payer?: string
  errorReason?: string
}
