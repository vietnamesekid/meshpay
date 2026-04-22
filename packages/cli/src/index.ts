#!/usr/bin/env node
import { runInit } from './commands/init.js'
import { runWalletProbe, runWalletStatus } from './commands/wallet.js'

const [, , command, subCommand, ...args] = process.argv

const VERSION = '0.1.0'

function printHelp() {
  console.log(`
meshpay v${VERSION} — Payment infrastructure for TypeScript AI agents

Usage:
  meshpay init [--framework mastra|vercel|openai]   Scaffold config files
  meshpay wallet status                              Show session wallet state
  meshpay wallet probe <url>                         Probe URL for x402 requirements
  meshpay --version                                  Print version
  meshpay --help                                     Show this help
`)
}

async function main() {
  switch (command) {
    case 'init': {
      const frameworkFlag = args.find((_, i) => args[i - 1] === '--framework') ?? 'mastra'
      const framework = (['mastra', 'vercel', 'openai'] as const).find((f) => f === frameworkFlag) ?? 'mastra'
      console.log(`\nInitializing MeshPay for ${framework}...\n`)
      await runInit(framework)
      break
    }

    case 'wallet': {
      if (subCommand === 'status') {
        await runWalletStatus()
      } else if (subCommand === 'probe') {
        await runWalletProbe(args[0] ?? '')
      } else {
        console.error(`Unknown wallet command: ${subCommand}`)
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
      console.error(`Unknown command: ${command}`)
      printHelp()
      process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
