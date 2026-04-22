import 'dotenv/config'
import pc from 'picocolors'
import { createRequire } from 'node:module'
import { runInit } from './commands/init.js'
import { runWalletProbe, runWalletStatus } from './commands/wallet.js'

const [, , command, ...rest] = process.argv

const require = createRequire(import.meta.url)
const VERSION: string = (require('../package.json') as { version: string }).version

const FRAMEWORKS = ['vercel', 'mastra', 'openai'] as const
type Framework = typeof FRAMEWORKS[number]

function printHelp() {
  console.log(`
  ${pc.bold(pc.cyan('meshpay'))} v${VERSION} — Micropayment infrastructure for AI agents

  ${pc.bold('Usage:')}
    ${pc.cyan('meshpay init')} ${pc.dim('[--framework vercel|mastra|openai]')}         Scaffold config & example tool
    ${pc.cyan('meshpay wallet status')} ${pc.dim('[--key 0x...]')}                      Show session wallet state
    ${pc.cyan('meshpay wallet probe')} ${pc.dim('<url>')}                               Probe URL for x402 requirements
    ${pc.cyan('meshpay --version')}                                             Print version
    ${pc.cyan('meshpay --help')}                                                Show this help

  ${pc.bold('Examples:')}
    ${pc.dim('$')} npx @meshpay/cli init --framework vercel
    ${pc.dim('$')} npx @meshpay/cli wallet status                  ${pc.dim('# reads AGENT_PRIVATE_KEY from .env')}
    ${pc.dim('$')} npx @meshpay/cli wallet status --key 0xe01...   ${pc.dim('# override with explicit key')}
    ${pc.dim('$')} npx @meshpay/cli wallet probe https://api.example.com/x402/search
`)
}

async function prompt(question: string): Promise<string> {
  process.stdout.write(question)
  return new Promise((resolve) => {
    process.stdin.setEncoding('utf-8')
    process.stdin.resume()
    process.stdin.once('data', (chunk) => {
      process.stdin.pause()
      resolve(String(chunk).trim())
    })
  })
}

async function selectFramework(): Promise<Framework> {
  console.log()
  console.log(`  ${pc.bold('Which framework are you using?')}`)
  console.log()
  console.log(`  ${pc.cyan('1')}  Vercel AI SDK`)
  console.log(`  ${pc.cyan('2')}  Mastra`)
  console.log(`  ${pc.cyan('3')}  OpenAI Agents SDK`)
  console.log()
  const answer = await prompt(`  ${pc.dim('Enter number (default: 1):')} `)
  const map: Record<string, Framework> = { '1': 'vercel', '2': 'mastra', '3': 'openai' }
  return map[answer] ?? 'vercel'
}

async function main() {
  const subCommand = rest[0]
  const args = rest.slice(1)

  switch (command) {
    case 'init': {
      let framework: Framework

      // --framework <value> or just <value> directly
      const flagIdx = rest.indexOf('--framework')
      if (flagIdx !== -1 && rest[flagIdx + 1]) {
        const raw = rest[flagIdx + 1] as string
        framework = (FRAMEWORKS as readonly string[]).includes(raw) ? raw as Framework : 'vercel'
      } else if (FRAMEWORKS.includes(subCommand as Framework)) {
        framework = subCommand as Framework
      } else {
        // interactive
        framework = await selectFramework()
      }

      console.log()
      console.log(`  ${pc.bold(pc.cyan('MeshPay'))} ${pc.dim(`— initializing for ${pc.white(framework)}...`)}`)
      console.log()
      await runInit(framework)
      break
    }

    case 'wallet': {
      if (subCommand === 'status') {
        const keyIdx = args.indexOf('--key')
        const privateKey = keyIdx !== -1 ? args[keyIdx + 1] : undefined
        await runWalletStatus(privateKey)
      } else if (subCommand === 'probe') {
        await runWalletProbe(args[0] ?? '')
      } else {
        console.error(pc.red(`Unknown wallet command: ${subCommand}`))
        printHelp()
        process.exit(1)
      }
      break
    }

    case '--version':
    case '-v':
      console.log(VERSION)
      break

    case '--help':
    case '-h':
    case undefined:
      printHelp()
      break

    default:
      console.error(pc.red(`Unknown command: ${command}`))
      printHelp()
      process.exit(1)
  }
}

main().catch((err) => {
  console.error(pc.red('Error:'), err instanceof Error ? err.message : err)
  process.exit(1)
})
