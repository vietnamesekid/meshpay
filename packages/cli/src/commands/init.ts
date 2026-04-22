import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ENV_TEMPLATE = `# MeshPay configuration
# Get your Coinbase CDP API key at https://portal.cdp.coinbase.com
COINBASE_CDP_API_KEY=

# Optional: override default facilitator endpoint
# MESHPAY_FACILITATOR_URL=https://api.cdp.coinbase.com/platform/v1/x402/facilitate

# Optional: default spend caps (USD)
# MESHPAY_CAP_PER_CALL=0.05
# MESHPAY_CAP_PER_DAY=5.00
`

const CONFIG_TEMPLATE = `import type { MeshPayConfig } from '@meshpay/core'

const config: MeshPayConfig = {
  facilitator: 'coinbase-cdp', // or 'dexter' | 'custom'
  chain: 'eip155:8453',        // Base mainnet
  token: 'USDC',
  defaultCaps: {
    perCall: 0.05,   // max $0.05 per tool call
    perDay: 5.00,    // max $5.00 per day
  },
}

export default config
`

const EXAMPLE_TEMPLATE = (framework: string) => {
  switch (framework) {
    case 'mastra':
      return `import { paidTool } from '@meshpay/adapters/mastra'

// Paid browser-automation tool using Browserbase x402 endpoint
export const browseTool = paidTool({
  name: 'browse',
  description: 'Open a browser session and navigate to a URL',
  maxCostPerCall: 0.05,
  maxCostPerDay: 5.00,
  paymentEndpoint: 'https://api.browserbase.com/x402/session',
  handler: async ({ url }: { url: string }) => {
    // TODO: implement with @browserbasehq/sdk
    return { url, status: 'opened' }
  },
})
`
    case 'vercel':
      return `import { paidTool } from '@meshpay/adapters/vercel'

// Paid search tool using Firecrawl x402 endpoint
export const searchTool = paidTool({
  name: 'search',
  description: 'Search the web and return structured results',
  maxCostPerCall: 0.01,
  maxCostPerDay: 1.00,
  paymentEndpoint: 'https://api.firecrawl.dev/x402/search',
  handler: async ({ query }: { query: string }) => {
    // TODO: implement with @mendable/firecrawl-js
    return { query, results: [] }
  },
})
`
    default:
      return `import { paidTool } from '@meshpay/adapters/openai'

// Paid deep-research tool using Heurist x402 endpoint
export const researchTool = paidTool({
  name: 'deep_research',
  description: 'Run a deep research query via Heurist AI',
  maxCostPerCall: 1.00,
  maxCostPerDay: 20.00,
  paymentEndpoint: 'https://api.heurist.ai/x402/research',
  handler: async ({ query }: { query: string }) => {
    // TODO: implement with heurist SDK
    return { query, report: '' }
  },
})
`
  }
}

export async function runInit(framework: 'mastra' | 'vercel' | 'openai' = 'mastra'): Promise<void> {
  const cwd = process.cwd()

  // Write .env.local (skip if exists)
  const envPath = join(cwd, '.env.local')
  if (!existsSync(envPath)) {
    writeFileSync(envPath, ENV_TEMPLATE, 'utf-8')
    console.log('  created  .env.local')
  } else {
    console.log('  skipped  .env.local (already exists)')
  }

  // Write meshpay.config.ts
  const configPath = join(cwd, 'meshpay.config.ts')
  if (!existsSync(configPath)) {
    writeFileSync(configPath, CONFIG_TEMPLATE, 'utf-8')
    console.log('  created  meshpay.config.ts')
  } else {
    console.log('  skipped  meshpay.config.ts (already exists)')
  }

  // Write example tool
  const examplesDir = join(cwd, 'meshpay-examples')
  if (!existsSync(examplesDir)) mkdirSync(examplesDir, { recursive: true })
  const examplePath = join(examplesDir, `${framework}-tool.ts`)
  writeFileSync(examplePath, EXAMPLE_TEMPLATE(framework), 'utf-8')
  console.log(`  created  meshpay-examples/${framework}-tool.ts`)

  console.log('')
  console.log('Next steps:')
  console.log('  1. Add your COINBASE_CDP_API_KEY to .env.local')
  console.log('  2. Adjust spend caps in meshpay.config.ts')
  console.log(`  3. Use the example in meshpay-examples/${framework}-tool.ts as a starting point`)
  console.log('')
  console.log('Docs: https://meshpay.dev/docs')
}
