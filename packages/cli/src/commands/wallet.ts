import pc from 'picocolors'
import { createSessionWallet, CHAIN_NAME, NATIVE_SYMBOL, USDC_ADDRESS, viemChain } from '@meshpay/wallet'
import { createPublicClient, http, formatUnits, formatEther } from 'viem'
import type { ChainId } from '@meshpay/core'

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

async function fetchUsdcBalance(address: `0x${string}`, chainId: ChainId): Promise<number | null> {
  const usdcAddr = USDC_ADDRESS[chainId]
  if (!usdcAddr) return null
  try {
    const client = createPublicClient({ chain: viemChain(chainId), transport: http() })
    const raw = await client.readContract({
      address: usdcAddr,
      abi: BALANCE_OF_ABI,
      functionName: 'balanceOf',
      args: [address],
    })
    return Number(formatUnits(raw, 6))
  } catch {
    return null
  }
}

async function fetchNativeBalance(address: `0x${string}`, chainId: ChainId): Promise<number | null> {
  if (chainId === 'solana:mainnet') return null
  try {
    const client = createPublicClient({ chain: viemChain(chainId), transport: http() })
    const raw = await client.getBalance({ address })
    return Number(formatEther(raw))
  } catch {
    return null
  }
}

/** `meshpay wallet status` — show current session wallet state */
export async function runWalletStatus(privateKeyFlag?: string): Promise<void> {
  // Priority: --key flag > AGENT_PRIVATE_KEY env > ephemeral
  const privateKey = (privateKeyFlag ?? process.env['AGENT_PRIVATE_KEY']) as `0x${string}` | undefined
  const chainId = (process.env['MESHPAY_CHAIN_ID'] ?? 'eip155:8453') as Exclude<ChainId, 'solana:mainnet'>
  const wallet = createSessionWallet({
    privateKey,
    chainId,
    caps: {
      perCall: Number(process.env['MESHPAY_CAP_PER_CALL'] ?? 0.05),
      perDay: Number(process.env['MESHPAY_CAP_PER_DAY'] ?? 5.0),
    },
  })

  const addr = wallet.address as `0x${string}`
  const [balance, nativeBalance] = await Promise.all([
    fetchUsdcBalance(addr, chainId),
    fetchNativeBalance(addr, chainId),
  ])
  const { spentToday, txCount } = wallet.state

  const COL = 18
  const row = (label: string, value: string) =>
    `  ${pc.dim(label.padEnd(COL))}${value}`

  console.log()
  console.log(`  ${pc.bold(pc.cyan('Agent Wallet'))}`)
  console.log()
  console.log(row('Address', pc.white(wallet.address)))
  console.log(row('Network', CHAIN_NAME[chainId]))
  console.log(row('Balance', balance !== null ? pc.green(`${balance.toFixed(6)} USDC`) : pc.dim('unavailable')))
  const nativeSym = NATIVE_SYMBOL[chainId]
  const nativeStr = nativeBalance !== null
    ? (nativeBalance < 0.005 ? pc.red(`${nativeBalance.toFixed(6)} ${nativeSym}`) : pc.white(`${nativeBalance.toFixed(6)} ${nativeSym}`))
    : pc.dim('unavailable')
  console.log(row(`Gas (${nativeSym})`, nativeStr))
  console.log()
  console.log(row('Session expires', formatExpiry(wallet.expiresAt)))
  console.log(row('Spend limit', `${pc.white(`$${wallet.caps.perCall.toFixed(2)}/call`)} ${pc.dim('·')} ${pc.white(`$${wallet.caps.perDay.toFixed(2)}/day`)}`))
  console.log(row('Spent today', `${pc.yellow(`$${spentToday.toFixed(4)}`)}  ${pc.dim(`(${txCount} transaction${txCount === 1 ? '' : 's'})`)}`))
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
