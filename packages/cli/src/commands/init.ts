import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import pc from 'picocolors'

const ENV_TEMPLATE = `# MeshPay configuration
# Generate a signing key: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
MESHPAY_AP2_KEY=

# Your funded agent wallet private key (0x...)
AGENT_PRIVATE_KEY=

# Coinbase CDP API key — https://portal.cdp.coinbase.com
CDP_API_KEY=
`

const CONFIG_TEMPLATE = `import { meshpay } from '@meshpay/adapters'
import { createSessionWallet } from '@meshpay/wallet'
import { X402Facilitator } from '@meshpay/protocols'

export const client = meshpay()
  .withWallet(createSessionWallet({
    privateKey: process.env.AGENT_PRIVATE_KEY,
    chainId: 'eip155:8453',   // Base mainnet
    caps: { perCall: 0.05, perDay: 5.00 },
  }))
  .withFacilitator(new X402Facilitator({ apiKey: process.env.CDP_API_KEY }))
`

const EXAMPLE_TEMPLATE = (framework: string) => {
  switch (framework) {
    case 'mastra':
      return `import { paidTool } from '@meshpay/adapters/mastra'
import { z } from 'zod'
import { client } from './meshpay.config'

export const browseTool = paidTool({
  name: 'browse',
  description: 'Open a browser session and navigate to a URL',
  parameters: z.object({ url: z.string().url() }),
  maxCostPerCall: 0.05,
  maxCostPerDay: 5.00,
  paymentEndpoint: 'https://api.browserbase.com/x402/session',
  handler: async ({ url }) => {
    // TODO: implement with @browserbasehq/sdk
    return { url, status: 'opened' }
  },
}, client)
`
    case 'vercel':
      return `import { paidTool } from '@meshpay/adapters/vercel'
import { z } from 'zod'
import { client } from './meshpay.config'

export const searchTool = paidTool({
  name: 'search',
  description: 'Search the web and return structured results',
  parameters: z.object({ query: z.string() }),
  maxCostPerCall: 0.01,
  maxCostPerDay: 1.00,
  paymentEndpoint: 'https://api.firecrawl.dev/x402/search',
  handler: async ({ query }) => {
    // TODO: implement with @mendable/firecrawl-js
    return { query, results: [] }
  },
}, client)
`
    default:
      return `import { paidTool } from '@meshpay/adapters/openai'
import { z } from 'zod'
import { client } from './meshpay.config'

export const researchTool = paidTool({
  name: 'deep_research',
  description: 'Run a deep research query via Heurist AI',
  parameters: z.object({ query: z.string() }),
  maxCostPerCall: 1.00,
  maxCostPerDay: 20.00,
  paymentEndpoint: 'https://api.heurist.ai/x402/research',
  handler: async ({ query }) => {
    // TODO: implement with heurist SDK
    return { query, report: '' }
  },
}, client)
`
  }
}

export async function runInit(framework: 'mastra' | 'vercel' | 'openai' = 'mastra'): Promise<void> {
  const cwd = process.cwd()

  // Write .env.local (skip if exists)
  const envPath = join(cwd, '.env.local')
  if (!existsSync(envPath)) {
    writeFileSync(envPath, ENV_TEMPLATE, 'utf-8')
    console.log(`  ${pc.green('created')}  .env.local`)
  } else {
    console.log(`  ${pc.dim('skipped')}  .env.local ${pc.dim('(already exists)')}`)
  }

  // Write meshpay.config.ts
  const configPath = join(cwd, 'meshpay.config.ts')
  if (!existsSync(configPath)) {
    writeFileSync(configPath, CONFIG_TEMPLATE, 'utf-8')
    console.log(`  ${pc.green('created')}  meshpay.config.ts`)
  } else {
    console.log(`  ${pc.dim('skipped')}  meshpay.config.ts ${pc.dim('(already exists)')}`)
  }

  // Write example tool
  const examplesDir = join(cwd, 'meshpay-examples')
  if (!existsSync(examplesDir)) mkdirSync(examplesDir, { recursive: true })
  const examplePath = join(examplesDir, `${framework}-tool.ts`)
  writeFileSync(examplePath, EXAMPLE_TEMPLATE(framework), 'utf-8')
  console.log(`  ${pc.green('created')}  meshpay-examples/${framework}-tool.ts`)

  console.log('')
  console.log(`  ${pc.bold('Next steps:')}`)
  console.log('')
  console.log(`  ${pc.cyan('1.')} Add ${pc.white('AGENT_PRIVATE_KEY')} and ${pc.white('CDP_API_KEY')} to ${pc.white('.env.local')}`)
  console.log(`  ${pc.cyan('2.')} Open ${pc.white(`meshpay-examples/${framework}-tool.ts`)} and wire up your handler`)
  console.log(`  ${pc.cyan('3.')} Run ${pc.white('meshpay wallet status')} to verify your wallet`)
  console.log('')
  console.log(`  ${pc.dim('Docs:')} https://meshpay.dev/docs`)
  console.log('')
}
