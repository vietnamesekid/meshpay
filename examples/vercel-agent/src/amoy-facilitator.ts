/**
 * Polygon Amoy facilitator — calls USDC transferWithAuthorization on-chain.
 *
 * The agent wallet SIGNS the EIP-3009 authorization; a separate FACILITATOR
 * wallet (FACILITATOR_PRIVATE_KEY) pays the gas. This means you only need to
 * fund the facilitator wallet with POL — the agent wallet never needs gas money.
 *
 * EIP-3009: https://eips.ethereum.org/EIPS/eip-3009
 */

import type { Facilitator, PaymentReceipt, PaymentRequest, Quote, Signature } from '@meshpay/core'
import type { X402Authorization, X402PaymentRequired } from '@meshpay/protocols'
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  http,
} from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { polygonAmoy } from 'viem/chains'
import { USDC_AMOY, MERCHANT_ADDRESS } from './amoy-x402-server.js'

// EIP-3009 transferWithAuthorization ABI
const USDC_ABI = [
  {
    name: 'transferWithAuthorization',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export class AmoyFacilitator implements Facilitator {
  readonly name = 'amoy-onchain'

  private readonly publicClient
  private readonly walletClient
  readonly submitterAddress: string

  /**
   * @param gasPayerKey - Private key of the wallet that pays POL gas fees.
   *   This is SEPARATE from the agent signing key — the agent signs the EIP-3009
   *   authorization, but this wallet submits the tx on-chain. Only this wallet
   *   needs POL. Falls back to AGENT_PRIVATE_KEY if not set.
   */
  constructor(gasPayerKey: `0x${string}`) {
    const account = privateKeyToAccount(gasPayerKey)
    this.submitterAddress = account.address

    this.publicClient = createPublicClient({
      chain: polygonAmoy,
      transport: http(),
    })

    this.walletClient = createWalletClient({
      account,
      chain: polygonAmoy,
      transport: http(),
    })
  }

  async quote(request: PaymentRequest): Promise<Quote> {
    console.log(`[facilitator] quote — probing ${request.recipient}`)

    const response = await fetch(request.recipient, {
      method: 'GET',
      headers: request.extraHeaders,
    })

    if (response.status !== 402) {
      throw new Error(`Expected HTTP 402 from ${request.recipient}, got ${response.status}`)
    }

    const header = response.headers.get('X-PAYMENT-REQUIRED') ?? response.headers.get('x-payment-required')
    if (!header) throw new Error('Missing X-PAYMENT-REQUIRED header')

    const paymentRequired: X402PaymentRequired = JSON.parse(
      Buffer.from(header, 'base64').toString('utf-8'),
    )
    const option = paymentRequired.accepts[0]
    if (!option) throw new Error('No payment options in X-PAYMENT-REQUIRED')

    const expiresAt = new Date(paymentRequired.expiresAt)
    const rawTx: X402Authorization = {
      from: '',
      to: option.payTo,
      value: option.maxAmountRequired,
      validAfter: '0',
      validBefore: String(Math.floor(expiresAt.getTime() / 1000)),
      nonce: paymentRequired.nonce,
    }

    console.log(`[facilitator] quote — received 402`)
    console.log(`  payTo  : ${option.payTo}`)
    console.log(`  amount : ${option.maxAmountRequired} atomic (${Number(option.maxAmountRequired) / 1e6} USDC)`)
    console.log(`  nonce  : ${paymentRequired.nonce}`)
    console.log(`  expires: ${expiresAt.toISOString()}`)

    return {
      id: paymentRequired.nonce,
      request,
      expiresAt,
      estimatedFee: 0.001,
      rawTx,
    }
  }

  async submit(quote: Quote, signature: Signature): Promise<PaymentReceipt> {
    const auth = quote.rawTx as X402Authorization

    console.log(`[facilitator] submit — calling transferWithAuthorization on Polygon Amoy`)
    console.log(`  from      : ${auth.from}`)
    console.log(`  to        : ${auth.to}`)
    console.log(`  value     : ${Number(auth.value) / 1e6} USDC`)
    console.log(`  nonce     : ${auth.nonce}`)
    console.log(`  submitter : ${this.submitterAddress} (pays gas)`)
    console.log(`  sig v/r/s : ${signature.v} / ${signature.r.slice(0, 10)}… / ${signature.s.slice(0, 10)}…`)

    // Pre-flight: ensure gas payer has enough POL
    const polBalance = await this.publicClient.getBalance({ address: this.submitterAddress as `0x${string}` })
    if (polBalance < 5_000_000_000_000_000n) { // 0.005 POL minimum
      throw new Error(
        `Insufficient gas: facilitator ${this.submitterAddress} has only ${formatEther(polBalance)} POL. ` +
        `Fund it at https://faucet.polygon.technology/ — it only needs POL, not USDC.`,
      )
    }

    // bytes32 nonce padding
    const nonceHex = auth.nonce.startsWith('0x') ? auth.nonce.slice(2) : auth.nonce
    const nonce32 = `0x${nonceHex.padStart(64, '0')}` as `0x${string}`

    const txHash = await this.walletClient.writeContract({
      address: USDC_AMOY,
      abi: USDC_ABI,
      functionName: 'transferWithAuthorization',
      args: [
        auth.from as `0x${string}`,
        auth.to as `0x${string}`,
        BigInt(auth.value),
        BigInt(auth.validAfter),
        BigInt(auth.validBefore),
        nonce32,
        signature.v,
        signature.r as `0x${string}`,
        signature.s as `0x${string}`,
      ],
    })

    console.log(`[facilitator] submit — tx broadcast: ${txHash}`)
    console.log(`[facilitator] submit — waiting for block confirmation…`)

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash })

    if (receipt.status !== 'success') {
      throw new Error(`Transaction reverted: ${txHash}`)
    }

    console.log(`[facilitator] submit — ✓ confirmed (block ${receipt.blockNumber}, gas used: ${receipt.gasUsed})`)

    return {
      txHash,
      chainId: 'eip155:80002',
      amount: quote.request.amount,
      token: quote.request.token,
      recipient: quote.request.recipient,
      timestamp: new Date(),
      memo: quote.request.memo,
    }
  }

  async checkBalance(address: string): Promise<string> {
    const balance = await this.publicClient.readContract({
      address: USDC_AMOY,
      abi: USDC_ABI,
      functionName: 'balanceOf',
      args: [address as `0x${string}`],
    })
    return `${Number(balance) / 1e6} USDC`
  }
}

/** Resolve the gas payer key: FACILITATOR_PRIVATE_KEY → AGENT_PRIVATE_KEY → fresh ephemeral */
export function resolveGasPayerKey(): `0x${string}` {
  return (
    (process.env['FACILITATOR_PRIVATE_KEY'] as `0x${string}` | undefined) ??
    (process.env['AGENT_PRIVATE_KEY'] as `0x${string}` | undefined) ??
    generatePrivateKey()
  )
}

export { MERCHANT_ADDRESS, USDC_AMOY }
