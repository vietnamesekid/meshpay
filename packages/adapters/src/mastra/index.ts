import type { PaidToolOptions } from '@meshpay/core'
import type { MeshpayClient } from '../client.js'
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
 * import { meshpay } from '@meshpay/adapters'
 * import { paidTool } from '@meshpay/adapters/mastra'
 *
 * const client = meshpay()
 *   .withWallet(createSessionWallet({ ... }))
 *   .withFacilitator(new X402Facilitator({ ... }))
 *
 * const browseTool = paidTool({
 *   name: 'browse',
 *   maxCostPerCall: 0.05,
 *   maxCostPerDay: 5.00,
 *   paymentEndpoint: 'https://api.browserbase.com/x402/session',
 *   handler: async (input) => browserbase.createSession(input),
 * }, client)
 * ```
 */
export function paidTool<TInput, TOutput>(
  opts: PaidToolOptions<TInput, TOutput> & {
    paymentEndpoint: string
    description?: string
  },
  client: MeshpayClient,
): MastraTool<TInput, TOutput> {
  return {
    name: opts.name,
    description: opts.description,
    _meshpay: {
      maxCostPerCall: opts.maxCostPerCall,
      maxCostPerDay: opts.maxCostPerDay,
    },
    async execute(input: TInput) {
      const { output } = await runPaidTool(input, opts, opts.paymentEndpoint, client)
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
  client: MeshpayClient,
): MastraTool<TInput, TOutput> {
  return paidTool({
    name: tool.name,
    description: tool.description,
    handler: (input) => tool.execute(input),
    ...paymentOpts,
  }, client)
}
