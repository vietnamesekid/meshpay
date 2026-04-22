# @meshpay/protocols

[![npm](https://img.shields.io/npm/v/@meshpay/protocols)](https://www.npmjs.com/package/@meshpay/protocols)

x402 and AP2 protocol implementations for MeshPay. Contains the facilitator that settles USDC payments on-chain via Coinbase CDP, and the AP2 authorization layer for verifiable agent identity.

## Install

```bash
pnpm add @meshpay/protocols
# or
npm install @meshpay/protocols
```

## x402 — HTTP Payment Protocol

x402 is an open payment protocol built on HTTP 402. A resource server returns `402 Payment Required` with an `X-PAYMENT-REQUIRED` header describing the payment terms. The client signs a USDC transfer and submits it to the facilitator, which settles on-chain.

### X402Facilitator

`X402Facilitator` connects to the Coinbase CDP facilitator API. It handles quoting (probing the 402 endpoint) and submission (on-chain settlement).

```typescript
import { X402Facilitator } from '@meshpay/protocols'

// Uses COINBASE_CDP_API_KEY env var automatically
const facilitator = new X402Facilitator()

// Or pass the key explicitly
const facilitator = new X402Facilitator({
  apiKey: 'your-cdp-key',
})

// Point to a custom facilitator endpoint
const facilitator = new X402Facilitator({
  facilitatorUrl: 'https://your-facilitator.example.com/facilitate',
})
```

**Free tier:** 1,000 transactions/month without an API key. Each transaction after that costs $0.001. Get a key at [portal.cdp.coinbase.com](https://portal.cdp.coinbase.com).

### Quote flow

```typescript
const quote = await facilitator.quote({
  recipient: 'https://api.example.com/x402/search',
  amount: 0.01,
  token: 'USDC',
  chainId: 'eip155:8453',
  memo: 'search',
})
// quote.id, quote.expiresAt, quote.rawTx
```

`quote()` makes a `GET` to the `recipient` URL, expects `HTTP 402`, and parses the `X-PAYMENT-REQUIRED` header to build the raw EIP-3009 authorization data.

### Submit flow

```typescript
const signature = await wallet.sign(quote)
const receipt = await facilitator.submit(quote, signature)
// receipt.txHash, receipt.amount, receipt.timestamp
```

`submit()` encodes the signature as an `X-PAYMENT` header and posts to the CDP facilitator. The facilitator verifies the EIP-3009 signature and executes the on-chain `transferWithAuthorization`.

---

## AP2 — Agent Payment Protocol v2

AP2 provides verifiable agent identity for payment requests. Before the x402 quote is fetched, MeshPay builds a signed AP2 authorization request and issues a short-lived token. The resource server can verify both before processing payment.

### Building an authorization request

```typescript
import { buildAuthorizationRequest } from '@meshpay/protocols'

const request = buildAuthorizationRequest({
  agentId: wallet.address,
  privateKey: process.env.MESHPAY_AP2_KEY,
  amount: 0.01,
  recipient: 'https://api.example.com/x402/search',
  resource: 'search',
})
// request.version, request.agentId, request.signature, ...
```

### Issuing a token

```typescript
import { issueAuthorizationToken } from '@meshpay/protocols'

const response = issueAuthorizationToken({
  agentId: wallet.address,
  amount: 0.01,
  recipient: 'https://api.example.com/x402/search',
  signingKey: process.env.MESHPAY_AP2_KEY,
  ttlMs: 60_000, // default: 1 minute
})

// Attach to x402 payment request headers
headers['X-AP2-AUTHORIZATION'] = response.token
headers['X-AP2-AGENT-ID'] = wallet.address
```

### Verifying on the resource server

```typescript
import { verifyAuthorizationRequest, verifyAuthorizationToken } from '@meshpay/protocols'

// Verify the token
const result = verifyAuthorizationToken(
  req.headers['x-ap2-authorization'],
  process.env.MESHPAY_AP2_KEY,
)

if (!result.valid) {
  return Response.json({ error: result.reason }, { status: 401 })
}

// Or verify the full request with agent identity registry
const result = verifyAuthorizationRequest(authRequest, {
  agents: [{ id: agentId, publicKey: agentPublicKey }],
  maxAgeMs: 5 * 60 * 1000, // 5 minutes
})
```

### Delegation chains

AP2 supports delegated spending — a parent agent can grant a child agent permission to spend within defined limits.

```typescript
import { createDelegation } from '@meshpay/protocols'

const delegation = createDelegation({
  delegatorId: 'orchestrator-agent',
  delegatorPrivateKey: orchestratorKey,
  delegateeId: 'sub-agent',
  maxAmountPerCall: 0.01,
  maxAmountPerDay: 1.00,
  allowedRecipients: ['https://api.example.com'],
  ttlMs: 24 * 60 * 60 * 1000, // 24 hours
})

const request = buildAuthorizationRequest({
  agentId: 'sub-agent',
  privateKey: subAgentKey,
  amount: 0.01,
  recipient: 'https://api.example.com/x402/search',
  delegations: [delegation],
})
```

### Audit receipts

After settlement, create an audit receipt linking the authorization to the on-chain tx:

```typescript
import { createAuditReceipt } from '@meshpay/protocols'

const receipt = createAuditReceipt({
  authorizationId: authRequest.agentId,
  agentId: authRequest.agentId,
  txHash: paymentReceipt.txHash,
  amount: paymentReceipt.amount,
  recipient: paymentReceipt.recipient,
  facilitatorKey: process.env.FACILITATOR_SIGNING_KEY,
})
```

## API reference

### x402 subpath

```typescript
import { X402Facilitator, createX402Facilitator } from '@meshpay/protocols'
// or
import { X402Facilitator } from '@meshpay/protocols/x402'
```

### AP2 subpath

```typescript
import {
  buildAuthorizationRequest,
  verifyAuthorizationRequest,
  issueAuthorizationToken,
  verifyAuthorizationToken,
  createAuditReceipt,
  createDelegation,
} from '@meshpay/protocols'
```
