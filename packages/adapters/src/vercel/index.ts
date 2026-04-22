import type { PaidToolOptions } from '@meshpay/core'
import type { Tool, ToolExecutionOptions, ToolSet } from 'ai'
import type { ZodObject, ZodRawShape, output as ZodOutput } from 'zod'
import type { MeshpayClient } from '../client.js'
import { runPaidTool } from '../paid-tool-runner.js'

// Re-export SDK types consumers commonly need alongside paidTool
export type { Tool, ToolSet, ToolExecutionOptions }

/**
 * Options for creating a paid Vercel AI SDK tool.
 */
export type PaidVercelToolOptions<
  TSchema extends ZodObject<ZodRawShape>,
  TOutput,
> = Omit<PaidToolOptions<ZodOutput<TSchema>, TOutput>, 'name'> & {
  name: string
  /** Zod schema describing the tool input — forwarded verbatim to the SDK */
  parameters: TSchema
  /** x402-enabled endpoint MeshPay probes for payment terms before each call */
  paymentEndpoint: string
  description?: string
}

/**
 * A paid tool whose `execute` is always defined (never optional).
 * This ensures `toolResults` in `onStepFinish` is correctly typed by the SDK.
 */
export type PaidTool<TSchema extends ZodObject<ZodRawShape>, TOutput> =
  Tool<TSchema, TOutput> & {
    execute: (
      args: ZodOutput<TSchema>,
      options: ToolExecutionOptions,
    ) => Promise<TOutput>
  }

/**
 * Creates a Vercel AI SDK–compatible tool with an x402 payment gate.
 *
 * @example
 * ```ts
 * import { meshpay } from '@meshpay/adapters'
 * import { paidTool } from '@meshpay/adapters/vercel'
 * import { createSessionWallet } from '@meshpay/wallet'
 * import { X402Facilitator } from '@meshpay/protocols'
 *
 * const client = meshpay()
 *   .withWallet(createSessionWallet({ privateKey, chainId, caps }))
 *   .withFacilitator(new X402Facilitator({ apiKey: process.env.CDP_API_KEY }))
 *
 * const tools = {
 *   search: paidTool({
 *     name: 'search',
 *     parameters: z.object({ query: z.string() }),
 *     maxCostPerCall: 0.01,
 *     maxCostPerDay: 1.00,
 *     paymentEndpoint: 'https://api.example.com/x402/search',
 *     handler: async ({ query }) => searchApi(query),
 *   }, client),
 * }
 * ```
 */
export function paidTool<TSchema extends ZodObject<ZodRawShape>, TOutput>(
  opts: PaidVercelToolOptions<TSchema, TOutput>,
  client: MeshpayClient,
): PaidTool<TSchema, TOutput> {
  return {
    description: opts.description,
    parameters: opts.parameters,
    execute: async (
      input: ZodOutput<TSchema>,
      _options: ToolExecutionOptions,
    ): Promise<TOutput> => {
      const { output } = await runPaidTool(
        input,
        opts as unknown as PaidToolOptions<ZodOutput<TSchema>, TOutput>,
        opts.paymentEndpoint,
        client,
      )
      return output
    },
  }
}
