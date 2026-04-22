import pc from 'picocolors'
import { createSessionWallet } from '@meshpay/wallet'
import { createPublicClient, http, formatUnits } from 'viem'
import { base, polygon, arbitrum, polygonAmoy } from 'viem/chains'
import type { ChainId } from '@meshpay/core'

const USDC: Record<ChainId, `0x${string}`> = {
  'eip155:8453':    '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'eip155:137':     '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  'eip155:42161':   '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  'eip155:80002':   '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
  'solana:mainnet': '0x0000000000000000000000000000000000000000',
}

const CHAIN_NAME: Record<ChainId, string> = {
  'eip155:8453':    'Base',
  'eip155:137':     'Polygon',
  'eip155:42161':   'Arbitrum',
  'eip155:80002':   'Polygon Amoy (testnet)',
  'solana:mainnet': 'Solana',
}

function formatExpiry(expiresAt: Date): string {
  const mins = Math.round((expiresAt.getTime() - Date.now()) / 60_000)
  if (mins <= 0) return pc.red('expired')
  if (mins < 60) return pc.yellow(`in ${mins} minute${mins === 1 ? '' : 's'}`)
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  return pc.green(`in ${hrs}h ${rem}m`)
}

const BALANCE_OF_ABI = [{
  name: 'balanceOf',
  type: 'function',
  stateMutability: 'view',
  inputs: [{ name: 'account', type: 'address' }],
  outputs: [{ name: '', type: 'uint256' }],
}] as const

function viemChain(chainId: ChainId) {
  if (chainId === 'eip155:137') return polygon
  if (chainId === 'eip155:42161') return arbitrum
  if (chainId === 'eip155:80002') return polygonAmoy
  return base
}

async function fetchUsdcBalance(address: `0x${string}`, chainId: ChainId): Promise<number | null> {
  if (chainId === 'solana:mainnet') return null
  try {
    const client = createPublicClient({ chain: viemChain(chainId), transport: http() })
    const raw = await client.readContract({
      address: USDC[chainId],
      abi: BALANCE_OF_ABI,
      functionName: 'balanceOf',
      args: [address],
    })
    return Number(formatUnits(raw, 6))
  } catch {
    return null
  }
}

/** `meshpay wallet status` — show current session wallet state */
export async function runWalletStatus(privateKeyFlag?: string): Promise<void> {
  // Priority: --key flag > AGENT_PRIVATE_KEY env > ephemeral
  const privateKey = (privateKeyFlag ?? process.env['AGENT_PRIVATE_KEY']) as `0x${string}` | undefined
  const chainId = (process.env['MESHPAY_CHAIN_ID'] ?? 'eip155:8453') as ChainId
  const wallet = createSessionWallet({
    privateKey,
    chainId,
    caps: {
      perCall: Number(process.env['MESHPAY_CAP_PER_CALL'] ?? 0.05),
      perDay: Number(process.env['MESHPAY_CAP_PER_DAY'] ?? 5.0),
    },
  })

  const balance = await fetchUsdcBalance(wallet.address as `0x${string}`, chainId)
  const { spentToday, txCount } = wallet.state

  console.log()
  console.log(`  ${pc.bold(pc.cyan('Session Wallet'))}`)
  console.log()
  console.log(`  ${pc.dim('Address')}        ${pc.white(wallet.address)}`)
  console.log(`  ${pc.dim('Network')}        ${CHAIN_NAME[chainId]}`)
  console.log(`  ${pc.dim('Balance')}        ${balance !== null ? pc.green(`${balance.toFixed(6)} USDC`) : pc.dim('unavailable')}`)
  console.log()
  console.log(`  ${pc.dim('Session expires')}  ${formatExpiry(wallet.expiresAt)}`)
  console.log(`  ${pc.dim('Spend limit')}     ${pc.white(`$${wallet.caps.perCall.toFixed(2)} / call`)} ${pc.dim('·')} ${pc.white(`$${wallet.caps.perDay.toFixed(2)} / day`)}`)
  console.log(`  ${pc.dim('Spent today')}     ${pc.yellow(`$${spentToday.toFixed(4)}`)}  ${pc.dim(`(${txCount} transaction${txCount === 1 ? '' : 's'})`)}`)
  console.log()
}

/** `meshpay wallet probe <url>` — probe a URL and show payment requirements */
export async function runWalletProbe(url: string): Promise<void> {
  if (!url) {
    console.error(pc.red('Usage: meshpay wallet probe <url>'))
    process.exit(1)
  }

  console.log()
  console.log(`  ${pc.dim('Probing')} ${pc.cyan(url)} ${pc.dim('for x402 payment requirements...')}`)
  console.log()

  const res = await fetch(url, { method: 'GET' })
  if (res.status !== 402) {
    console.log(`  ${pc.yellow(`HTTP ${res.status}`)} ${pc.dim('— no 402 Payment Required at this endpoint')}`)
    console.log()
    return
  }

  const header =
    res.headers.get('X-PAYMENT-REQUIRED') ??
    res.headers.get('x-payment-required')

  if (!header) {
    console.log(`  ${pc.yellow('HTTP 402')} ${pc.dim('but no X-PAYMENT-REQUIRED header found')}`)
    console.log()
    return
  }

  const parsed = JSON.parse(Buffer.from(header, 'base64').toString('utf-8'))
  console.log(`  ${pc.bold('Payment required:')}`)
  console.log()
  console.log(JSON.stringify(parsed, null, 4).split('\n').map(l => `  ${l}`).join('\n'))
  console.log()
}
