import { describe, it, expect } from 'vitest'
import {
  buildAuthorizationRequest,
  verifyAuthorizationRequest,
  issueAuthorizationToken,
  verifyAuthorizationToken,
  createDelegation,
  createAuditReceipt,
} from './authorization.js'
import type { AgentIdentity } from './types.js'

const KEY = 'test-signing-key-32-bytes-padded!'

const AGENT: AgentIdentity = {
  id: 'did:key:agent-a',
  publicKey: KEY, // shared secret for HMAC in prototype
  name: 'Agent A',
  createdAt: new Date().toISOString(),
}

const AGENTS = [AGENT]

describe('buildAuthorizationRequest', () => {
  it('produces a request with correct fields', () => {
    const req = buildAuthorizationRequest({
      agentId: AGENT.id,
      privateKey: KEY,
      amount: 0.01,
      recipient: 'https://api.example.com',
      resource: 'search',
    })
    expect(req.version).toBe(1)
    expect(req.agentId).toBe(AGENT.id)
    expect(req.amount).toBe(0.01)
    expect(req.recipient).toBe('https://api.example.com')
    expect(req.signature).toBeTruthy()
  })
})

describe('verifyAuthorizationRequest', () => {
  it('accepts a valid fresh request', () => {
    const req = buildAuthorizationRequest({
      agentId: AGENT.id,
      privateKey: KEY,
      amount: 0.01,
      recipient: 'https://api.example.com',
    })
    const result = verifyAuthorizationRequest(req, { agents: AGENTS })
    expect(result.valid).toBe(true)
    expect(result.agentId).toBe(AGENT.id)
  })

  it('rejects a tampered signature', () => {
    const req = buildAuthorizationRequest({
      agentId: AGENT.id,
      privateKey: KEY,
      amount: 0.01,
      recipient: 'https://api.example.com',
    })
    const tampered = { ...req, signature: 'deadbeef' }
    const result = verifyAuthorizationRequest(tampered, { agents: AGENTS })
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/signature/i)
  })

  it('rejects an unknown agent', () => {
    const req = buildAuthorizationRequest({
      agentId: 'did:key:unknown',
      privateKey: KEY,
      amount: 0.01,
      recipient: 'https://api.example.com',
    })
    const result = verifyAuthorizationRequest(req, { agents: AGENTS })
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/unknown agent/i)
  })

  it('rejects a stale request', () => {
    const req = buildAuthorizationRequest({
      agentId: AGENT.id,
      privateKey: KEY,
      amount: 0.01,
      recipient: 'https://api.example.com',
    })
    // Simulate 10 minutes in the future
    const futureNow = new Date(Date.now() + 10 * 60 * 1000)
    const result = verifyAuthorizationRequest(req, { agents: AGENTS, now: futureNow })
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/too old/i)
  })
})

describe('delegation chain', () => {
  const CHILD: AgentIdentity = {
    id: 'did:key:agent-child',
    publicKey: KEY,
    name: 'Child Agent',
    createdAt: new Date().toISOString(),
  }

  it('accepts a valid delegation chain', () => {
    const delegation = createDelegation({
      delegatorId: AGENT.id,
      delegatorPrivateKey: KEY,
      delegateeId: CHILD.id,
      maxAmountPerCall: 0.10,
      maxAmountPerDay: 5.00,
    })

    const req = buildAuthorizationRequest({
      agentId: CHILD.id,
      privateKey: KEY,
      amount: 0.05,
      recipient: 'https://api.example.com',
      delegations: [delegation],
    })

    const result = verifyAuthorizationRequest(req, { agents: [AGENT, CHILD] })
    expect(result.valid).toBe(true)
  })

  it('rejects when delegated amount exceeds cap', () => {
    const delegation = createDelegation({
      delegatorId: AGENT.id,
      delegatorPrivateKey: KEY,
      delegateeId: CHILD.id,
      maxAmountPerCall: 0.01, // very low cap
      maxAmountPerDay: 5.00,
    })

    const req = buildAuthorizationRequest({
      agentId: CHILD.id,
      privateKey: KEY,
      amount: 0.05, // exceeds the 0.01 cap
      recipient: 'https://api.example.com',
      delegations: [delegation],
    })

    const result = verifyAuthorizationRequest(req, { agents: [AGENT, CHILD] })
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/exceeds delegation cap/i)
  })

  it('rejects an expired delegation', () => {
    const delegation = createDelegation({
      delegatorId: AGENT.id,
      delegatorPrivateKey: KEY,
      delegateeId: CHILD.id,
      maxAmountPerCall: 0.10,
      maxAmountPerDay: 5.00,
      ttlMs: -1, // already expired
    })

    const req = buildAuthorizationRequest({
      agentId: CHILD.id,
      privateKey: KEY,
      amount: 0.05,
      recipient: 'https://api.example.com',
      delegations: [delegation],
    })

    const result = verifyAuthorizationRequest(req, { agents: [AGENT, CHILD] })
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/expired/i)
  })

  it('rejects a recipient not in delegation allowlist', () => {
    const delegation = createDelegation({
      delegatorId: AGENT.id,
      delegatorPrivateKey: KEY,
      delegateeId: CHILD.id,
      maxAmountPerCall: 0.10,
      maxAmountPerDay: 5.00,
      allowedRecipients: ['https://allowed.example.com'],
    })

    const req = buildAuthorizationRequest({
      agentId: CHILD.id,
      privateKey: KEY,
      amount: 0.05,
      recipient: 'https://api.other.com',
      delegations: [delegation],
    })

    const result = verifyAuthorizationRequest(req, { agents: [AGENT, CHILD] })
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/allowlist/i)
  })
})

describe('issueAuthorizationToken / verifyAuthorizationToken', () => {
  it('issues and verifies a valid token', () => {
    const resp = issueAuthorizationToken({
      agentId: AGENT.id,
      amount: 0.01,
      recipient: 'https://api.example.com',
      signingKey: KEY,
    })
    expect(resp.authorized).toBe(true)
    expect(resp.token).toBeTruthy()

    const verified = verifyAuthorizationToken(resp.token!, KEY)
    expect(verified.valid).toBe(true)
    expect(verified.claims?.['agentId']).toBe(AGENT.id)
  })

  it('rejects an expired token', () => {
    const resp = issueAuthorizationToken({
      agentId: AGENT.id,
      amount: 0.01,
      recipient: 'https://api.example.com',
      signingKey: KEY,
      ttlMs: -1000, // already expired
    })
    const verified = verifyAuthorizationToken(resp.token!, KEY)
    expect(verified.valid).toBe(false)
    expect(verified.reason).toMatch(/expired/i)
  })

  it('rejects a token with wrong signing key', () => {
    const resp = issueAuthorizationToken({
      agentId: AGENT.id,
      amount: 0.01,
      recipient: 'https://api.example.com',
      signingKey: KEY,
    })
    const verified = verifyAuthorizationToken(resp.token!, 'wrong-key')
    expect(verified.valid).toBe(false)
    expect(verified.reason).toMatch(/signature/i)
  })

  it('rejects a malformed token', () => {
    const result = verifyAuthorizationToken('not.a.valid.token.structure', KEY)
    expect(result.valid).toBe(false)
  })
})

describe('createAuditReceipt', () => {
  it('creates a receipt with all fields and a signature', () => {
    const receipt = createAuditReceipt({
      authorizationId: 'auth-123',
      agentId: AGENT.id,
      txHash: '0xdeadbeef',
      amount: 0.01,
      recipient: 'https://api.example.com',
      facilitatorKey: KEY,
    })
    expect(receipt.txHash).toBe('0xdeadbeef')
    expect(receipt.agentId).toBe(AGENT.id)
    expect(receipt.facilitatorSignature).toBeTruthy()
    expect(receipt.settledAt).toBeTruthy()
  })
})
