import type { PaidToolOptions } from '@meshpay/core'
import { runPaidTool } from '../paid-tool-runner.js'

export interface OpenAIAgentTool<TInput = unknown, TOutput = unknown> {
  name: string
  description?: string
  /** Called via OpenAI Agents SDK on_tool_start/end lifecycle hooks */
  execute: (input: TInput) => Promise<TOutput>
  _meshpay?: { maxCostPerCall: number; maxCostPerDay: number }
}

/**
 * Creates an OpenAI Agents SDK–compatible tool with an x402 payment gate.
 *
 * Wire into your agent via the `tools` array. MeshPay intercepts the
 * `on_tool_start` lifecycle hook to handle payment before execution.
 *
 * @example
 * ```ts
 * import { paidTool } from '@meshpay/adapters/openai'
 * import { Agent } from 'openai/agents'
 *
 * const agent = new Agent({
 *   name: 'research-agent',
 *   tools: [
 *     paidTool({
 *       name: 'deep_research',
 *       maxCostPerCall: 1.00,
 *       maxCostPerDay: 20.00,
 *       paymentEndpoint: 'https://api.heurist.ai/x402/research',
 *       handler: async ({ query }) => heurist.deepResearch(query),
 *     }),
 *   ],
 * })
 * ```
 */
export function paidTool<TInput, TOutput>(
  opts: PaidToolOptions<TInput, TOutput> & {
    paymentEndpoint: string
    description?: string
  },
): OpenAIAgentTool<TInput, TOutput> {
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

/**
 * OpenAI Agents SDK lifecycle hooks that add payment tracking.
 *
 * Pass the returned object as `hooks` to your `Runner.run()` call.
 */
export function createPaymentHooks(opts: {
  onPayment?: (toolName: string, amountUsd: number, txHash: string) => void
  onSpendCapExceeded?: (toolName: string, requested: number, cap: number) => void
}) {
  return {
    on_tool_end(toolName: string, _output: unknown, meta?: { _meshpay?: Record<string, unknown> }) {
      if (meta?._meshpay && opts.onPayment) {
        const { amountUsd, txHash } = meta._meshpay as { amountUsd: number; txHash: string }
        opts.onPayment(toolName, amountUsd, txHash)
      }
    },
  }
}
