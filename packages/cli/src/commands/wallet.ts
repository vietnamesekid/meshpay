import { createSessionWallet } from '@meshpay/wallet'
import { createX402Facilitator } from '@meshpay/protocols'

/** `meshpay wallet status` — show current session wallet state */
export async function runWalletStatus(): Promise<void> {
  const wallet = createSessionWallet({
    caps: {
      perCall: Number(process.env['MESHPAY_CAP_PER_CALL'] ?? 0.05),
      perDay: Number(process.env['MESHPAY_CAP_PER_DAY'] ?? 5.0),
    },
  })

  console.log('Session Wallet')
  console.log('  Address  :', wallet.address)
  console.log('  Expires  :', wallet.expiresAt.toISOString())
  console.log('  Cap/call :', `$${wallet.caps.perCall}`)
  console.log('  Cap/day  :', `$${wallet.caps.perDay}`)
  console.log('  Spent    :', `$${wallet.state.spentToday.toFixed(4)}`)
  console.log('  Tx count :', wallet.state.txCount)
}

/** `meshpay wallet probe <url>` — probe a URL and show payment requirements */
export async function runWalletProbe(url: string): Promise<void> {
  if (!url) {
    console.error('Usage: meshpay wallet probe <url>')
    process.exit(1)
  }

  console.log(`Probing ${url} for x402 payment requirements...`)

  const res = await fetch(url, { method: 'GET' })
  if (res.status !== 402) {
    console.log(`  HTTP ${res.status} — no 402 Payment Required at this endpoint`)
    return
  }

  const header =
    res.headers.get('X-PAYMENT-REQUIRED') ??
    res.headers.get('x-payment-required')

  if (!header) {
    console.log('  HTTP 402 but no X-PAYMENT-REQUIRED header found')
    return
  }

  const parsed = JSON.parse(Buffer.from(header, 'base64').toString('utf-8'))
  console.log('  Payment required:')
  console.log(JSON.stringify(parsed, null, 4))
}
