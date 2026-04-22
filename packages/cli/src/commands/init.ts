import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ENV_TEMPLATE = `# MeshPay configuration

# Required: AP2 signing key — generate with:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
MESHPAY_AP2_KEY=

# Required: Coinbase CDP API key — https://portal.cdp.coinbase.com
COINBASE_CDP_API_KEY=

# Optional: spend caps (USD)
# MESHPAY_CAP_PER_CALL=0.05
# MESHPAY_CAP_PER_DAY=5.00
`

const EXAMPLE_TEMPLATE = (framework: 'mastra' | 'vercel' | 'openai') => {
  const shared = `import { meshpay } from '@meshpay/adapters'
import { createSessionWallet } from '@meshpay/wallet'
import { X402Facilitator } from '@meshpay/protocols'

const client = meshpay()
  .withWallet(createSessionWallet({
    privateKey: process.env.AGENT_PRIVATE_KEY as \`0x\${string}\`,
    chainId: 'eip155:8453', // Base mainnet
    caps: { perCall: 0.05, perDay: 5.00 },
  }))
  .withFacilitator(new X402Facilitator({ apiKey: process.env.COINBASE_CDP_API_KEY }))
`

  switch (framework) {
    case 'vercel':
      return `${shared}
import { paidTool } from '@meshpay/adapters/vercel'
import { z } from 'zod'

export const searchTool = paidTool({
  name: 'search',
  description: 'Search the web and return structured results',
  parameters: z.object({ query: z.string().describe('The search query') }),
  maxCostPerCall: 0.01,
  maxCostPerDay: 1.00,
  paymentEndpoint: 'https://api.firecrawl.dev/x402/search',
  handler: async ({ query }) => {
    // TODO: implement with @mendable/firecrawl-js
    return { query, results: [] }
  },
}, client)
`
    case 'mastra':
      return `${shared}
import { paidTool } from '@meshpay/adapters/mastra'

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
}, client)
`
    case 'openai':
      return `${shared}
import { paidTool } from '@meshpay/adapters/openai'

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
}, client)
`
  }
}

export async function runInit(framework: 'mastra' | 'vercel' | 'openai' = 'mastra'): Promise<void> {
  const cwd = process.cwd()

  const envPath = join(cwd, '.env.local')
  if (!existsSync(envPath)) {
    writeFileSync(envPath, ENV_TEMPLATE, 'utf-8')
    console.log('  created  .env.local')
  } else {
    console.log('  skipped  .env.local (already exists)')
  }

  const examplesDir = join(cwd, 'meshpay-examples')
  if (!existsSync(examplesDir)) mkdirSync(examplesDir, { recursive: true })
  const examplePath = join(examplesDir, `${framework}-tool.ts`)
  writeFileSync(examplePath, EXAMPLE_TEMPLATE(framework), 'utf-8')
  console.log(`  created  meshpay-examples/${framework}-tool.ts`)

  console.log('')
  console.log('Next steps:')
  console.log('  1. Generate MESHPAY_AP2_KEY:')
  console.log('     node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"')
  console.log('  2. Add COINBASE_CDP_API_KEY to .env.local')
  console.log(`  3. Open meshpay-examples/${framework}-tool.ts and wire up your handler`)
  console.log('')
  console.log('Docs: https://github.com/vietnamesekid/meshpay#readme')
}
