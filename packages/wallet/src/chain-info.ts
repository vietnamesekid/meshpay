import type { ChainId } from '@meshpay/core'
import { base, polygon, arbitrum, polygonAmoy } from 'viem/chains'

export const CHAIN_NAME: Record<ChainId, string> = {
  'eip155:8453':    'Base',
  'eip155:137':     'Polygon',
  'eip155:42161':   'Arbitrum',
  'eip155:80002':   'Polygon Amoy (testnet)',
  'solana:mainnet': 'Solana',
}

export const NATIVE_SYMBOL: Record<ChainId, string> = {
  'eip155:8453':    'ETH',
  'eip155:137':     'POL',
  'eip155:42161':   'ETH',
  'eip155:80002':   'POL',
  'solana:mainnet': 'SOL',
}

/** USDC contract address per chain */
export const USDC_ADDRESS: Partial<Record<ChainId, `0x${string}`>> = {
  'eip155:8453':  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'eip155:137':   '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  'eip155:42161': '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  'eip155:80002': '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
}

export function viemChain(chainId: ChainId) {
  if (chainId === 'eip155:137') return polygon
  if (chainId === 'eip155:42161') return arbitrum
  if (chainId === 'eip155:80002') return polygonAmoy
  return base
}
