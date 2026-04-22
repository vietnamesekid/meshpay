import type { PaidToolOptions } from '@meshpay/core'
import { runPaidTool } from '../paid-tool-runner.js'

export interface MastraTool<TInput = unknown, TOutput = unknown> {
  name: string
  description?: string
  execute: (input: TInput) => Promise<TOutput>
  /** MeshPay metadata attached for observability */
  _meshpay?: { maxCostPerCall: number; maxCostPerDay: number }
}

/**
 * Wraps a handler as a Mastra-compatible tool with x402 payment gate.
 *
 * @example
 * ```ts
 * const browseTool = paidTool({
 *   name: 'browse',
 *   maxCostPerCall: 0.05,
 *   maxCostPerDay: 5.00,
 *   paymentEndpoint: 'https://api.browserbase.com/x402/session',
 *   handler: async (input) => browserbase.createSession(input),
 * })
 * ```
 */
export function paidTool<TInput, TOutput>(
  opts: PaidToolOptions<TInput, TOutput> & {
    paymentEndpoint: string
    description?: string
  },
): MastraTool<TInput, TOutput> {
  return {
    name: opts.name,
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

/** Wrap an existing Mastra tool behind an x402 payment gate */
export function withPayment<TInput, TOutput>(
  tool: MastraTool<TInput, TOutput>,
  paymentOpts: {
    paymentEndpoint: string
    maxCostPerCall: number
    maxCostPerDay: number
  },
): MastraTool<TInput, TOutput> {
  return paidTool({
    name: tool.name,
    description: tool.description,
    handler: (input) => tool.execute(input),
    ...paymentOpts,
  })
}
