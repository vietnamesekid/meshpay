/**
 * Paid Research Agent — MeshPay + Vercel AI SDK
 *
 * Answers research questions using two x402-gated tools:
 *   - search: web search ($0.01/call)
 *   - scrape: page content extraction ($0.005/call)
 *
 * Payment flow per tool call:
 *   1. Probes endpoint → HTTP 402 + X-PAYMENT-REQUIRED (Polygon Amoy USDC terms)
 *   2. Wallet signs EIP-3009 transferWithAuthorization typed data
 *   3. AmoyFacilitator submits tx on-chain → real block confirmation
 *   4. Handler re-fetches with ?_tx=<hash> → server verifies on-chain → 200
 *   5. MeshPay records spend against daily cap
 *
 * Run: pnpm agent [question]
 */

import 'dotenv/config'
import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { paidTool } from '@meshpay/adapters/vercel'
import { meshpay } from '@meshpay/adapters'
import { createSessionWallet } from '@meshpay/wallet'
import { AmoyFacilitator, resolveGasPayerKey } from './amoy-facilitator.js'
import { server as resourceServer, AMOY_PORT } from './amoy-x402-server.js'

// ─── Config ───────────────────────────────────────────────────────────────────

const PRIVATE_KEY = process.env['AGENT_PRIVATE_KEY'] as `0x${string}` | undefined
if (!PRIVATE_KEY) throw new Error('AGENT_PRIVATE_KEY not set in .env')
if (!process.env['OPENAI_API_KEY']) throw new Error('OPENAI_API_KEY not set in .env')

const SERVER = `http://localhost:${AMOY_PORT}`

// ─── Wallet + Facilitator ─────────────────────────────────────────────────────

const wallet = createSessionWallet({
  privateKey: PRIVATE_KEY,
  chainId: 'eip155:80002',
  caps: { perCall: 0.05, perDay: 2.0 },
})

const facilitator = new AmoyFacilitator(resolveGasPayerKey())

const client = meshpay()
  .withWallet(wallet)
  .withFacilitator(facilitator)

console.log('════════════════════════════════════════════════════')
console.log('  MeshPay Paid Research Agent — Polygon Amoy')
console.log('════════════════════════════════════════════════════')
console.log(`  Wallet   : ${wallet.address}  (signs EIP-3009, holds USDC)`)
console.log(`  Submitter: ${facilitator.submitterAddress}  (pays gas, needs POL)`)
console.log(`  Chain    : eip155:80002 (Polygon Amoy)`)
console.log(`  Cap/call : $${wallet.caps.perCall}`)
console.log(`  Cap/day  : $${wallet.caps.perDay}`)
console.log(`  Expires  : ${wallet.expiresAt.toISOString()}`)
console.log(`  Model    : gpt-4o-mini`)
console.log('════════════════════════════════════════════════════')
console.log()

// ─── Track last settled tx so handlers can pass ?_tx= to resource server ──────

let lastTxHash: string | undefined

const originalSubmit = facilitator.submit.bind(facilitator)
facilitator.submit = async (quote, signature) => {
  const receipt = await originalSubmit(quote, signature)
  lastTxHash = receipt.txHash
  return receipt
}

// ─── Paid tools ───────────────────────────────────────────────────────────────

const tools = {
  search: paidTool({
    name: 'search',
    description: 'Search the web for up-to-date information on a topic.',
    parameters: z.object({
      query: z.string().describe('The search query'),
    }),
    maxCostPerCall: 0.01,
    maxCostPerDay: 1.0,
    paymentEndpoint: `${SERVER}/search`,
    handler: async (input) => {
      console.log(`  [handler] search — fetching result with on-chain proof`)
      const url = new URL(`${SERVER}/search`)
      url.searchParams.set('q', input.query)
      if (lastTxHash) { url.searchParams.set('_tx', lastTxHash); lastTxHash = undefined }
      const res = await fetch(url.toString())
      if (!res.ok) throw new Error(`Search failed: ${res.status}`)
      const data = await res.json() as { query: string; results: { title: string; url: string; snippet: string }[] }
      console.log(`  [handler] search — got ${data.results.length} result(s)`)
      return data
    },
  }, client),

  scrape: paidTool({
    name: 'scrape',
    description: 'Extract the full text content of a web page given its URL.',
    parameters: z.object({
      url: z.string().url().describe('The page URL to scrape'),
    }),
    maxCostPerCall: 0.005,
    maxCostPerDay: 0.5,
    paymentEndpoint: `${SERVER}/scrape`,
    handler: async (input) => {
      console.log(`  [handler] scrape — fetching result with on-chain proof`)
      const url = new URL(`${SERVER}/scrape`)
      url.searchParams.set('url', input.url)
      if (lastTxHash) { url.searchParams.set('_tx', lastTxHash); lastTxHash = undefined }
      const res = await fetch(url.toString())
      if (!res.ok) throw new Error(`Scrape failed: ${res.status}`)
      const data = await res.json() as { url: string; title: string; markdown: string; wordCount: number }
      console.log(`  [handler] scrape — got "${data.title}" (${data.wordCount} words)`)
      return data
    },
  }, client),
}

// ─── Run ──────────────────────────────────────────────────────────────────────

const QUESTION = process.argv[2] ?? 'What is the x402 payment protocol and who is building on it?'

console.log(`[agent] Question: "${QUESTION}"`)
console.log()

let stepCount = 0

const result = await generateText({
  model: openai('gpt-4o-mini'),
  maxSteps: 5,
  system: [
    'You are a research assistant. Use the search and scrape tools to answer questions accurately.',
    'Always search first, then scrape the most relevant result for full details.',
    'Summarize your findings concisely (3-5 bullet points).',
  ].join('\n'),
  prompt: QUESTION,
  tools,
  onStepFinish({ stepType, toolCalls, toolResults, usage }) {
    stepCount++
    console.log(`── Step ${stepCount} (${stepType}) ─────────────────────────────────`)

    if (toolCalls.length > 0) {
      for (const call of toolCalls) {
        const r = toolResults.find((r) => r.toolCallId === call.toolCallId)
        console.log(`  tool call  : ${call.toolName}(${JSON.stringify(call.args)})`)
        if (r) {
          console.log(`  tool result: ${JSON.stringify(r.result).slice(0, 120)}…`)
        }
      }
    }

    if (usage) {
      console.log(`  tokens     : ${usage.promptTokens} prompt + ${usage.completionTokens} completion`)
    }
    console.log(`  spent      : $${wallet.state.spentToday.toFixed(4)} total (${wallet.state.txCount} on-chain tx)`)
    console.log()
  },
})

console.log('─── Answer ───────────────────────────────────────────')
console.log(result.text)
console.log()

const s = wallet.state
console.log('─── Spend summary ────────────────────────────────────')
console.log(`  Total spent today : $${s.spentToday.toFixed(4)}`)
console.log(`  Transactions      : ${s.txCount}`)
console.log(`  Daily cap         : $${wallet.caps.perDay.toFixed(2)}`)
console.log(`  Remaining today   : $${(wallet.caps.perDay - s.spentToday).toFixed(4)}`)
console.log(`  Resets at         : ${s.resetAt.toUTCString()}`)
console.log('──────────────────────────────────────────────────────')

resourceServer.close()
