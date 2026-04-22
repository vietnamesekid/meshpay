import type { AgentWallet, Facilitator, PaidToolOptions } from '@meshpay/core'
import { X402Facilitator } from '@meshpay/protocols'
import { createSessionWallet } from '@meshpay/wallet'

export interface MeshpayClientOptions {
  wallet?: AgentWallet
  facilitator?: Facilitator
}

export class MeshpayClient {
  readonly wallet: AgentWallet | undefined
  readonly facilitator: Facilitator | undefined

  constructor(options: MeshpayClientOptions = {}) {
    this.wallet = options.wallet
    this.facilitator = options.facilitator
  }

  withWallet(wallet: AgentWallet): MeshpayClient {
    return new MeshpayClient({ wallet, facilitator: this.facilitator })
  }

  withFacilitator(facilitator: Facilitator): MeshpayClient {
    return new MeshpayClient({ wallet: this.wallet, facilitator })
  }

  resolveWallet(opts: Pick<PaidToolOptions<unknown, unknown>, 'maxCostPerCall' | 'maxCostPerDay' | 'chainId'>): AgentWallet {
    return (
      this.wallet ??
      createSessionWallet({
        caps: { perCall: opts.maxCostPerCall, perDay: opts.maxCostPerDay },
        chainId: opts.chainId,
      })
    )
  }

  resolveFacilitator(): Facilitator {
    return this.facilitator ?? new X402Facilitator()
  }
}

export function meshpay(options: MeshpayClientOptions = {}): MeshpayClient {
  return new MeshpayClient(options)
}
