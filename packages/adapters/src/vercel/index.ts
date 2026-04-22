import type { PaidToolOptions } from '@meshpay/core'
import { runPaidTool } from '../paid-tool-runner.js'

export interface VercelAITool<TInput = unknown, TOutput = unknown> {
  description?: string
  /** Called by Vercel AI SDK when the model invokes the tool */
  execute: (input: TInput) => Promise<TOutput>
  /** MeshPay metadata */
  _meshpay?: { maxCostPerCall: number; maxCostPerDay: number }
}

/**
 * Creates a Vercel AI SDK–compatible tool with an x402 payment gate.
 *
 * Use this in place of the AI SDK `tool()` helper when your tool calls a
 * paid API endpoint.
 *
 * @example
 * ```ts
 * import { paidTool } from '@meshpay/adapters/vercel'
 * import { streamText } from 'ai'
 *
 * const result = streamText({
 *   model: openai('gpt-4o'),
 *   tools: {
 *     search: paidTool({
 *       name: 'search',
 *       maxCostPerCall: 0.01,
 *       maxCostPerDay: 1.00,
 *       paymentEndpoint: 'https://api.firecrawl.dev/x402/search',
 *       handler: async ({ query }) => firecrawl.search(query),
 *     }),
 *   },
 * })
 * ```
 */
export function paidTool<TInput, TOutput>(
  opts: PaidToolOptions<TInput, TOutput> & {
    paymentEndpoint: string
    description?: string
  },
): VercelAITool<TInput, TOutput> {
  return {
    description: opts.description,
    _meshpay: {
      maxCostPerCall: opts.maxCostPerCall,
      maxCostPerDay: opts.maxCostPerDay,
    },
    async execute(input: TInput) {
      const { output } = await runPaidTool(input, opts, opts.paymentEndpoint)
      return output
    },
  }
}

/**
 * Middleware that intercepts Vercel AI SDK `needsApproval` callbacks and
 * auto-approves + pays when the spend is within configured caps.
 *
 * Attach to your `streamText` / `generateText` call via `onStepFinish`.
 */
export function createPaymentMiddleware(caps: {
  maxCostPerCall: number
  maxCostPerDay: number
}) {
  return {
    /** Returns true if the tool call should be auto-approved based on spend caps */
    shouldAutoApprove(_toolName: string, estimatedCost: number): boolean {
      return estimatedCost <= caps.maxCostPerCall
    },
  }
}
