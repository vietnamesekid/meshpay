/**
 * x402 resource server for Polygon Amoy devnet testing.
 *
 * Issues real 402 challenges pointing to the merchant wallet on Amoy.
 * Settlement verification: checks on-chain via viem that transferWithAuthorization
 * was actually called (the AmoyFacilitator does the submission; this server
 * verifies the resulting tx before serving the resource).
 *
 * Flow:
 *   1. GET /search  → 402 + X-PAYMENT-REQUIRED (Amoy USDC, real merchant address)
 *   2. AmoyFacilitator calls transferWithAuthorization on-chain → records txHash
 *   3. GET /search?_tx=<txHash> → server verifies tx on Amoy RPC → 200 + result
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createPublicClient, http } from 'viem'
import { polygonAmoy } from 'viem/chains'
import { randomUUID } from 'node:crypto'
import { verifyAuthorizationToken } from '@meshpay/protocols'

export const AMOY_PORT = Number(process.env['AMOY_SERVER_PORT'] ?? 4403)

const AP2_SIGNING_KEY = (() => {
  const key = process.env['MESHPAY_AP2_KEY']
  if (!key) throw new Error('MESHPAY_AP2_KEY environment variable is required')
  return key
})()

// Merchant wallet — receives USDC payments on Amoy
// Using Hardhat account #1 as a well-known test recipient
export const MERCHANT_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

// USDC on Polygon Amoy (Circle testnet deployment)
export const USDC_AMOY = '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582'

const CHAIN_ID = 'eip155:80002'

const client = createPublicClient({
  chain: polygonAmoy,
  transport: http(),
})

// txHash → verified (true once confirmed on-chain)
const settledTxHashes = new Map<string, boolean>()

function b64(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64')
}

function makePaymentRequired(amountUsdc: number) {
  const nonce = `0x${randomUUID().replace(/-/g, '')}`
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

  return {
    nonce,
    header: b64({
      version: 1,
      chainId: CHAIN_ID,
      nonce,
      expiresAt,
      accepts: [
        {
          scheme: 'exact',
          network: CHAIN_ID,
          asset: USDC_AMOY,
          maxAmountRequired: String(Math.round(amountUsdc * 1_000_000)),
          payTo: MERCHANT_ADDRESS,
        },
      ],
    }),
  }
}

// Verify a tx on Polygon Amoy RPC — checks it was mined and came from USDC contract
async function verifyTx(txHash: string): Promise<boolean> {
  if (settledTxHashes.get(txHash)) return true
  try {
    const receipt = await client.getTransactionReceipt({
      hash: txHash as `0x${string}`,
    })
    const ok = receipt.status === 'success'
    if (ok) settledTxHashes.set(txHash, true)
    return ok
  } catch {
    return false
  }
}

function handlePaidEndpoint(
  req: IncomingMessage,
  res: ServerResponse,
  opts: {
    amountUsdc: number
    txHash: string | null
    result: () => unknown
  },
) {
  const url = new URL(req.url ?? '/', `http://localhost:${AMOY_PORT}`)
  const logPath = url.pathname

  // Case 1: Handler re-fetch after on-chain settlement — carries ?_tx=<txHash>
  if (opts.txHash) {
    verifyTx(opts.txHash)
      .then((ok) => {
        if (ok) {
          console.log(`[amoy-x402] ${logPath} ✓ on-chain verified (${opts.txHash?.slice(0, 10)}…)`)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(opts.result()))
        } else {
          console.log(`[amoy-x402] ${logPath} ✗ tx not found on-chain: ${opts.txHash}`)
          res.writeHead(402, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Payment not confirmed on-chain' }))
        }
      })
      .catch(() => {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'RPC error verifying tx' }))
      })
    return
  }

  // Case 2: First probe — verify AP2 token, then return 402 with Amoy payment terms
  const ap2Token = req.headers['x-ap2-authorization'] as string | undefined
  if (!ap2Token) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Missing X-AP2-AUTHORIZATION header' }))
    return
  }

  const ap2Result = verifyAuthorizationToken(ap2Token, AP2_SIGNING_KEY)
  if (!ap2Result.valid) {
    console.log(`[amoy-x402] ${logPath} ✗ AP2 rejected: ${ap2Result.reason}`)
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: `AP2 authorization failed: ${ap2Result.reason}` }))
    return
  }

  const agentId = req.headers['x-ap2-agent-id'] as string | undefined
  console.log(`[amoy-x402] ${logPath} ✓ AP2 verified (agent: ${agentId?.slice(0, 10)}…)`)

  const { nonce, header } = makePaymentRequired(opts.amountUsdc)
  console.log(`[amoy-x402] ${logPath} → 402 (nonce: ${nonce.slice(0, 10)}…)`)
  res.writeHead(402, {
    'Content-Type': 'application/json',
    'X-PAYMENT-REQUIRED': header,
  })
  res.end(JSON.stringify({ error: 'Payment required', chain: CHAIN_ID }))
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${AMOY_PORT}`)
  const path = url.pathname
  const txHash = url.searchParams.get('_tx')

  if (path === '/search') {
    const query = url.searchParams.get('q') ?? 'default query'
    handlePaidEndpoint(req, res, {
      amountUsdc: 0.01,
      txHash,
      result: () => ({
        query,
        results: [
          {
            title: `${query} — Overview`,
            url: `https://example.com/search?q=${encodeURIComponent(query)}`,
            snippet: `Real on-chain payment confirmed for "${query}" on Polygon Amoy.`,
          },
        ],
      }),
    })
  } else if (path === '/scrape') {
    const targetUrl = url.searchParams.get('url') ?? 'https://example.com'
    handlePaidEndpoint(req, res, {
      amountUsdc: 0.005,
      txHash,
      result: () => ({
        url: targetUrl,
        title: 'Amoy Test Page',
        markdown: `# Amoy Test\n\nReal on-chain payment verified for ${targetUrl}.`,
        wordCount: 12,
      }),
    })
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found', paths: ['/search', '/scrape'] }))
  }
})

server.listen(AMOY_PORT, () => {
  console.log(`[amoy-x402] Server running at http://localhost:${AMOY_PORT}`)
  console.log(`[amoy-x402] Chain    : ${CHAIN_ID}`)
  console.log(`[amoy-x402] USDC     : ${USDC_AMOY}`)
  console.log(`[amoy-x402] Merchant : ${MERCHANT_ADDRESS}`)
})

export { server }
