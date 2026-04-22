import type { ChainId, SpendCap, TokenSymbol } from '@meshpay/core'

export interface MeshPayConfig {
  facilitator: 'coinbase-cdp' | 'dexter' | 'custom'
  facilitatorUrl?: string
  chain: ChainId
  token: TokenSymbol
  defaultCaps: SpendCap
  /** CDP API key — falls back to process.env.COINBASE_CDP_API_KEY */
  cdpApiKey?: string
}

const DEFAULT_CONFIG: MeshPayConfig = {
  facilitator: 'coinbase-cdp',
  chain: 'eip155:8453',
  token: 'USDC',
  defaultCaps: {
    perCall: Number(process.env['MESHPAY_CAP_PER_CALL'] ?? 0.05),
    perDay: Number(process.env['MESHPAY_CAP_PER_DAY'] ?? 5.0),
  },
}

let _config: MeshPayConfig = DEFAULT_CONFIG

export function defineConfig(config: Partial<MeshPayConfig>): MeshPayConfig {
  _config = { ...DEFAULT_CONFIG, ...config }
  return _config
}

export function getConfig(): MeshPayConfig {
  return _config
}
