/**
 * End-to-end test: real x402 payment on Polygon Amoy devnet.
 *
 * What's real:
 *   - EIP-3009 signature with a real private key
 *   - transferWithAuthorization submitted to Polygon Amoy RPC
 *   - On-chain tx confirmation before resource is served
 *   - USDC balance changes verified before + after
 *
 * What's local:
 *   - x402 resource server runs in-process (no public endpoint needed)
 *   - AmoyFacilitator submits directly (no CDP)
 *
 * Run: pnpm amoy-e2e
 */

import 'dotenv/config'
import { createSessionWallet } from '@meshpay/wallet'
import { paidTool, setDefaultWallet, setDefaultFacilitator } from '@meshpay/adapters/vercel'
import { z } from 'zod'
import { AmoyFacilitator, MERCHANT_ADDRESS, USDC_AMOY } from './amoy-facilitator.js'
import { server as amoyServer, AMOY_PORT } from './amoy-x402-server.js'
import { createPublicClient, http, formatUnits } from 'viem'
import { polygonAmoy } from 'viem/chains'

// ─── Config ───────────────────────────────────────────────────────────────────

const PRIVATE_KEY = process.env['WALLET_PRIVATE_KEY'] as `0x${string}` | undefined
if (!PRIVATE_KEY) {
  console.error('WALLET_PRIVATE_KEY not set in .env')
  process.exit(1)
}

const SERVER_URL = `http://localhost:${AMOY_PORT}`

// ─── Wallet + Facilitator ─────────────────────────────────────────────────────

const wallet = createSessionWallet({
  privateKey: PRIVATE_KEY,
  chainId: 'eip155:80002',
  caps: { perCall: 0.05, perDay: 2.0 },
})

const facilitator = new AmoyFacilitator(PRIVATE_KEY)

setDefaultWallet(wallet)
setDefaultFacilitator(facilitator)

// ─── Balance helpers ──────────────────────────────────────────────────────────

const publicClient = createPublicClient({ chain: polygonAmoy, transport: http() })

const USDC_ABI = [{
  name: 'balanceOf',
  type: 'function',
  stateMutability: 'view',
  inputs: [{ name: 'account', type: 'address' }],
  outputs: [{ name: '', type: 'uint256' }],
}] as const

async function usdcBalance(address: string): Promise<number> {
  const raw = await publicClient.readContract({
    address: USDC_AMOY,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
  })
  return Number(formatUnits(raw, 6))
}

// ─── Paid tool ────────────────────────────────────────────────────────────────

// After AmoyFacilitator settles, it returns a real txHash.
// We pass it as ?_tx=<hash> so the resource server can verify on-chain.
let lastTxHash: string | undefined

const originalSubmit = facilitator.submit.bind(facilitator)
facilitator.submit = async (quote, signature) => {
  const receipt = await originalSubmit(quote, signature)
  lastTxHash = receipt.txHash
  return receipt
}

const searchTool = paidTool({
  name: 'search',
  description: 'Search the web (paid, Polygon Amoy testnet).',
  parameters: z.object({ query: z.string() }),
  maxCostPerCall: 0.01,
  maxCostPerDay: 1.0,
  paymentEndpoint: `${SERVER_URL}/search`,
  handler: async (input) => {
    const url = new URL(`${SERVER_URL}/search`)
    url.searchParams.set('q', input.query)
    if (lastTxHash) {
      url.searchParams.set('_tx', lastTxHash)
      lastTxHash = undefined
    }
    const res = await fetch(url.toString())
    if (!res.ok) throw new Error(`Search failed: ${res.status}`)
    return res.json() as Promise<{ query: string; results: { title: string; url: string; snippet: string }[] }>
  },
})

// ─── Run ──────────────────────────────────────────────────────────────────────

console.log('═══ MeshPay × Polygon Amoy — End-to-End Test ═══')
console.log()
console.log(`Wallet  : ${wallet.address}`)
console.log(`Chain   : eip155:80002 (Polygon Amoy)`)
console.log(`USDC    : ${USDC_AMOY}`)
console.log(`Merchant: ${MERCHANT_ADDRESS}`)
console.log()

// 1. Snapshot balances before
const agentBefore = await usdcBalance(wallet.address)
const merchantBefore = await usdcBalance(MERCHANT_ADDRESS)
console.log(`Balances before:`)
console.log(`  Agent    : ${agentBefore.toFixed(6)} USDC`)
console.log(`  Merchant : ${merchantBefore.toFixed(6)} USDC`)
console.log()

// 2. Execute the paid tool — triggers real on-chain payment
console.log('Calling search tool (will trigger real on-chain USDC transfer)…')
console.log()

let result: Awaited<ReturnType<typeof searchTool.execute>>
try {
  result = await searchTool.execute(
    { query: 'x402 payment protocol' },
    { toolCallId: 'amoy-e2e-1', messages: [] },
  )
} catch (err) {
  console.error('✗ Tool call failed:', (err as Error).message)
  amoyServer.close()
  process.exit(1)
}

console.log()
console.log(`✓ Search result: "${result.results[0]?.title}"`)
console.log(`  Snippet: ${result.results[0]?.snippet}`)
console.log()

// 3. Verify balances changed on-chain
const agentAfter = await usdcBalance(wallet.address)
const merchantAfter = await usdcBalance(MERCHANT_ADDRESS)
const transferred = agentBefore - agentAfter

console.log(`Balances after:`)
console.log(`  Agent    : ${agentAfter.toFixed(6)} USDC  (Δ ${(-transferred).toFixed(6)})`)
console.log(`  Merchant : ${merchantAfter.toFixed(6)} USDC  (Δ +${(merchantAfter - merchantBefore).toFixed(6)})`)
console.log()

// 4. Spend summary
const s = wallet.state
console.log('─── Spend summary ─────────────────────────────')
console.log(`  MeshPay recorded : $${s.spentToday.toFixed(4)} (${s.txCount} tx)`)
console.log(`  On-chain transfer: ${transferred.toFixed(6)} USDC`)
console.log(`  Match: ${Math.abs(transferred - s.spentToday) < 0.001 ? '✓' : '✗'}`)
console.log()

if (transferred <= 0) {
  console.warn('⚠ No USDC was transferred — check wallet balance and USDC allowance')
} else {
  console.log('✓ End-to-end test passed — real USDC transferred on Polygon Amoy')
}

amoyServer.close()
