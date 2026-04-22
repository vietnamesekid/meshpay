import pc from 'picocolors'
import { createSessionWallet } from '@meshpay/wallet'

/** `meshpay wallet status` — show current session wallet state */
export async function runWalletStatus(): Promise<void> {
  const wallet = createSessionWallet({
    caps: {
      perCall: Number(process.env['MESHPAY_CAP_PER_CALL'] ?? 0.05),
      perDay: Number(process.env['MESHPAY_CAP_PER_DAY'] ?? 5.0),
    },
  })

  console.log()
  console.log(`  ${pc.bold(pc.cyan('Session Wallet'))}`)
  console.log()
  console.log(`  ${pc.dim('Address  ')}  ${pc.white(wallet.address)}`)
  console.log(`  ${pc.dim('Expires  ')}  ${wallet.expiresAt.toISOString()}`)
  console.log(`  ${pc.dim('Cap/call ')}  ${pc.green(`$${wallet.caps.perCall}`)}`)
  console.log(`  ${pc.dim('Cap/day  ')}  ${pc.green(`$${wallet.caps.perDay}`)}`)
  console.log(`  ${pc.dim('Spent    ')}  ${pc.yellow(`$${wallet.state.spentToday.toFixed(4)}`)}`)
  console.log(`  ${pc.dim('Tx count ')}  ${wallet.state.txCount}`)
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
