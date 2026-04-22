import { createHmac, timingSafeEqual as cryptoTimingSafeEqual, randomUUID } from 'node:crypto'
import type {
  AgentId,
  AgentIdentity,
  AP2AuthorizationRequest,
  AP2AuthorizationResponse,
  AP2AuditReceipt,
  Delegation,
} from './types.js'

// ─── Request Builder ──────────────────────────────────────────────────────────

/**
 * Builds a signed AP2AuthorizationRequest.
 *
 * Signs with HMAC-SHA256 keyed on the agent's private key (or any shared
 * secret). Full implementations should use EIP-712 typed-data signing so the
 * signature is verifiable on-chain without a trusted party.
 */
export function buildAuthorizationRequest(params: {
  agentId: AgentId
  privateKey: string
  amount: number
  recipient: string
  resource?: string
  delegations?: Delegation[]
}): AP2AuthorizationRequest {
  const requestedAt = new Date().toISOString()

  const payload: Omit<AP2AuthorizationRequest, 'signature'> = {
    version: 1,
    agentId: params.agentId,
    amount: params.amount,
    recipient: params.recipient,
    resource: params.resource,
    requestedAt,
    delegations: params.delegations,
  }

  const signature = signPayload(payload, params.privateKey)

  return { ...payload, signature }
}

// ─── Verifier ─────────────────────────────────────────────────────────────────

export interface VerifyOptions {
  /** Known agent identities — used to look up public key / shared secret */
  agents: AgentIdentity[]
  /** Current time for expiry checks — defaults to now */
  now?: Date
  /** Max allowed age of the request (ms) — default 5 minutes */
  maxAgeMs?: number
}

export interface VerifyResult {
  valid: boolean
  agentId?: AgentId
  reason?: string
}

/**
 * Verifies an AP2 authorization request.
 *
 * Checks:
 *  1. Signature is valid for the claiming agentId
 *  2. Request is not too old (replay protection)
 *  3. Delegation chain is valid (if present): each link is signed by the
 *     delegator, not expired, and the amount/recipient are within scope
 */
export function verifyAuthorizationRequest(
  req: AP2AuthorizationRequest,
  opts: VerifyOptions,
): VerifyResult {
  const now = opts.now ?? new Date()
  const maxAge = opts.maxAgeMs ?? 5 * 60 * 1000

  // 1. Request freshness
  const age = now.getTime() - new Date(req.requestedAt).getTime()
  if (age > maxAge) {
    return { valid: false, reason: `Request too old (${Math.round(age / 1000)}s)` }
  }

  // 2. Verify agent exists
  const agent = opts.agents.find((a) => a.id === req.agentId)
  if (!agent) {
    return { valid: false, reason: `Unknown agent: ${req.agentId}` }
  }

  // 3. Verify request signature
  const { signature, ...payload } = req
  const expectedSig = signPayload(payload, agent.publicKey)
  if (!timingSafeEqual(signature, expectedSig)) {
    return { valid: false, reason: 'Invalid request signature' }
  }

  // 4. Verify delegation chain (if present)
  if (req.delegations && req.delegations.length > 0) {
    const chainResult = verifyDelegationChain(req.delegations, req, opts.agents, now)
    if (!chainResult.valid) return chainResult
  }

  return { valid: true, agentId: req.agentId }
}

// ─── Delegation Verification ──────────────────────────────────────────────────

function verifyDelegationChain(
  delegations: Delegation[],
  req: AP2AuthorizationRequest,
  agents: AgentIdentity[],
  now: Date,
): VerifyResult {
  // Chain must be ordered: [root → ... → immediate delegator of requesting agent]
  // The last delegation's delegateeId must be req.agentId
  const last = delegations[delegations.length - 1]
  if (!last || last.delegateeId !== req.agentId) {
    return { valid: false, reason: 'Delegation chain does not end with requesting agent' }
  }

  for (const delegation of delegations) {
    // Expiry check
    if (new Date(delegation.expiresAt) < now) {
      return { valid: false, reason: `Delegation ${delegation.id} has expired` }
    }

    // Amount cap check
    if (req.amount > delegation.maxAmountPerCall) {
      return {
        valid: false,
        reason: `Requested amount ${req.amount} exceeds delegation cap ${delegation.maxAmountPerCall}`,
      }
    }

    // Recipient allowlist check
    if (
      delegation.allowedRecipients.length > 0 &&
      !delegation.allowedRecipients.some((r) => req.recipient.startsWith(r))
    ) {
      return { valid: false, reason: `Recipient ${req.recipient} not in delegation allowlist` }
    }

    // Signature check — delegator must have signed this delegation
    const delegator = agents.find((a) => a.id === delegation.delegatorId)
    if (!delegator) {
      return { valid: false, reason: `Unknown delegator: ${delegation.delegatorId}` }
    }
    const { signature: delegSig, ...delegPayload } = delegation
    const expectedDelegSig = signPayload(delegPayload, delegator.publicKey)
    if (!timingSafeEqual(delegSig, expectedDelegSig)) {
      return { valid: false, reason: `Invalid signature on delegation ${delegation.id}` }
    }
  }

  return { valid: true }
}

// ─── Authorization Token ──────────────────────────────────────────────────────

const TOKEN_VERSION = 'ap2v1'
const DEFAULT_TOKEN_TTL_MS = 60_000 // 1 minute — short-lived, tied to a specific payment

/**
 * Issues a short-lived authorization token after verifying the request.
 * The token is attached as `X-AP2-AUTHORIZATION` on the x402 payment request.
 */
export function issueAuthorizationToken(params: {
  agentId: AgentId
  amount: number
  recipient: string
  signingKey: string
  ttlMs?: number
}): AP2AuthorizationResponse {
  const expiresAt = new Date(Date.now() + (params.ttlMs ?? DEFAULT_TOKEN_TTL_MS))
  const tokenId = randomUUID()

  const payload = {
    ver: TOKEN_VERSION,
    id: tokenId,
    agentId: params.agentId,
    amount: params.amount,
    recipient: params.recipient,
    exp: Math.floor(expiresAt.getTime() / 1000),
  }

  const json = JSON.stringify(payload)
  const b64 = Buffer.from(json).toString('base64url')
  const mac = signPayload(payload, params.signingKey)
  const token = `${b64}.${mac}`

  return {
    authorized: true,
    token,
    tokenExpiresAt: expiresAt.toISOString(),
  }
}

/**
 * Verifies an AP2 token (issued by `issueAuthorizationToken`) and returns
 * the embedded claims if valid.
 */
export function verifyAuthorizationToken(
  token: string,
  signingKey: string,
  now: Date = new Date(),
): { valid: boolean; claims?: Record<string, unknown>; reason?: string } {
  const parts = token.split('.')
  if (parts.length !== 2) return { valid: false, reason: 'Malformed token' }

  const [b64, mac] = parts as [string, string]

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf-8')) as Record<string, unknown>
  } catch {
    return { valid: false, reason: 'Invalid token encoding' }
  }

  // Expiry check
  const exp = payload['exp'] as number | undefined
  if (!exp || now.getTime() / 1000 > exp) {
    return { valid: false, reason: 'Token expired' }
  }

  // MAC verification
  const expectedMac = signPayload(payload, signingKey)
  if (!timingSafeEqual(mac, expectedMac)) {
    return { valid: false, reason: 'Invalid token signature' }
  }

  return { valid: true, claims: payload }
}

// ─── Audit Receipt ────────────────────────────────────────────────────────────

/** Creates a signed audit receipt linking an AP2 authorization to an on-chain tx */
export function createAuditReceipt(params: {
  authorizationId: string
  agentId: AgentId
  txHash: string
  amount: number
  recipient: string
  facilitatorKey: string
}): AP2AuditReceipt {
  const settledAt = new Date().toISOString()
  const receiptPayload = {
    authorizationId: params.authorizationId,
    agentId: params.agentId,
    txHash: params.txHash,
    amount: params.amount,
    recipient: params.recipient,
    settledAt,
  }
  const facilitatorSignature = signPayload(receiptPayload, params.facilitatorKey)

  return { ...receiptPayload, facilitatorSignature }
}

// ─── Delegation Builder ───────────────────────────────────────────────────────

/** Creates a signed delegation granting a child agent permission to spend */
export function createDelegation(params: {
  delegatorId: AgentId
  delegatorPrivateKey: string
  delegateeId: AgentId
  maxAmountPerCall: number
  maxAmountPerDay: number
  allowedRecipients?: string[]
  ttlMs?: number
}): Delegation {
  const id = randomUUID()
  const expiresAt = new Date(Date.now() + (params.ttlMs ?? 24 * 60 * 60 * 1000)).toISOString()

  const payload: Omit<Delegation, 'signature'> = {
    id,
    delegatorId: params.delegatorId,
    delegateeId: params.delegateeId,
    maxAmountPerCall: params.maxAmountPerCall,
    maxAmountPerDay: params.maxAmountPerDay,
    allowedRecipients: params.allowedRecipients ?? [],
    expiresAt,
  }

  const signature = signPayload(payload, params.delegatorPrivateKey)
  return { ...payload, signature }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function signPayload(payload: unknown, key: string): string {
  const canonical = stableStringify(payload)
  return createHmac('sha256', key).update(canonical).digest('hex')
}

// Deterministic JSON stringify (sorted keys) to ensure consistent signatures
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const sorted = Object.keys(value as object)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
    .join(',')
  return `{${sorted}}`
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length === b.length) {
    return cryptoTimingSafeEqual(Buffer.from(a), Buffer.from(b))
  }

  return false
}
