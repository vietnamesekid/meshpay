/**
 * AP2 — Agent Payment Protocol v2
 *
 * AP2 is an authorization wrapper that sits above x402. Where x402 handles
 * the wire-level payment (HTTP 402 + USDC transfer), AP2 handles:
 *   - Agent identity attestation (who is authorizing the spend)
 *   - Delegation chains (parent agent authorizes child agent)
 *   - Capability scoping (what the agent is allowed to pay for)
 *   - Audit trails (signed receipts linking agent identity to payment)
 *
 * Spec reference: https://agentpayments.org/ap2 (draft)
 */

// ─── Agent Identity ───────────────────────────────────────────────────────────

/** DID-style agent identifier (did:key, did:web, or opaque string for now) */
export type AgentId = string

export interface AgentIdentity {
  /** Agent's DID or opaque identifier */
  id: AgentId
  /** Public key used to verify this agent's signatures (hex, 0x-prefixed) */
  publicKey: string
  /** Human-readable agent name */
  name: string
  /** ISO timestamp when this identity was created */
  createdAt: string
}

// ─── Delegation ───────────────────────────────────────────────────────────────

/**
 * A delegation grants a child agent permission to spend on behalf of a parent.
 * Delegations are signed by the parent and verified before each payment.
 */
export interface Delegation {
  /** Unique delegation ID */
  id: string
  /** The agent granting permission */
  delegatorId: AgentId
  /** The agent receiving permission */
  delegateeId: AgentId
  /** Max amount per call (USD) the delegatee may spend */
  maxAmountPerCall: number
  /** Max cumulative spend per day (USD) */
  maxAmountPerDay: number
  /** Allowed recipient addresses or domains — empty = all */
  allowedRecipients: string[]
  /** ISO expiry timestamp */
  expiresAt: string
  /** EIP-712 or HMAC signature from delegator */
  signature: string
}

// ─── Authorization Request ────────────────────────────────────────────────────

/**
 * Sent by an agent before initiating an x402 payment to prove it has
 * authorization to spend the requested amount.
 */
export interface AP2AuthorizationRequest {
  /** Protocol version */
  version: 1
  /** The requesting agent */
  agentId: AgentId
  /** Payment amount (USD) */
  amount: number
  /** Recipient URL or address */
  recipient: string
  /** Resource being purchased */
  resource?: string
  /** ISO timestamp of this request */
  requestedAt: string
  /** Delegation chain if agent is acting on behalf of another */
  delegations?: Delegation[]
  /** Agent's signature over this request (covers all fields above) */
  signature: string
}

// ─── Authorization Response ───────────────────────────────────────────────────

export interface AP2AuthorizationResponse {
  /** Whether the payment is authorized to proceed */
  authorized: boolean
  /** Authorization token — included in the x402 payment as a header */
  token?: string
  /** ISO expiry for the token */
  tokenExpiresAt?: string
  /** Reason if not authorized */
  reason?: string
}

// ─── Audit Receipt ────────────────────────────────────────────────────────────

/**
 * Returned after a payment settles. Links the AP2 authorization to the
 * on-chain x402 transaction hash for audit purposes.
 */
export interface AP2AuditReceipt {
  authorizationId: string
  agentId: AgentId
  txHash: string
  amount: number
  recipient: string
  settledAt: string
  /** Signature from the facilitator over this receipt */
  facilitatorSignature: string
}
