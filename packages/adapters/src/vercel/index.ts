import type { PaidToolOptions } from '@meshpay/core'
import type { Tool, ToolExecutionOptions, ToolSet } from 'ai'
import type { ZodObject, ZodRawShape, output as ZodOutput } from 'zod'
import { runPaidTool, setDefaultFacilitator, setDefaultWallet } from '../paid-tool-runner.js'

export { setDefaultFacilitator, setDefaultWallet }

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
 * The return type is `PaidTool<TSchema, TOutput>` — a `Tool` subtype with
 * `execute` guaranteed non-optional. This means:
 * - It passes `ToolSet` validation in `generateText` / `streamText`
 * - `onStepFinish({ toolCalls, toolResults })` is fully typed
 * - `toolResults[n].toolName` resolves correctly
 * - You can call `.execute()` directly without an undefined guard
 *
 * @example
 * ```ts
 * import { paidTool } from '@meshpay/adapters/vercel'
 * import { generateText } from 'ai'
 * import { openai } from '@ai-sdk/openai'
 * import { z } from 'zod'
 *
 * const result = await generateText({
 *   model: openai('gpt-4o-mini'),
 *   tools: {
 *     search: paidTool({
 *       name: 'search',
 *       description: 'Search the web for current information.',
 *       parameters: z.object({ query: z.string().describe('The search query') }),
 *       maxCostPerCall: 0.01,
 *       maxCostPerDay: 1.00,
 *       paymentEndpoint: 'https://api.example.com/x402/search',
 *       handler: async ({ query }) => searchApi(query),
 *     }),
 *   },
 * })
 * ```
 */
export function paidTool<TSchema extends ZodObject<ZodRawShape>, TOutput>(
  opts: PaidVercelToolOptions<TSchema, TOutput>,
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
      )
      return output
    },
  }
}
