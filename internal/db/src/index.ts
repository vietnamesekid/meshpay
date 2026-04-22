import type { PaymentReceipt } from '@meshpay/core'

/** Minimal in-memory store for prototype — replace with real DB (Postgres, D1, etc.) */
export interface SpendRecord {
  id: string
  walletAddress: string
  txHash: string
  toolName: string
  amountUsd: number
  token: string
  chainId: string
  recipient: string
  timestamp: Date
}

export interface SpendStore {
  insert(record: Omit<SpendRecord, 'id'>): Promise<SpendRecord>
  findByWallet(address: string, opts?: { limit?: number }): Promise<SpendRecord[]>
  sumByWalletToday(address: string): Promise<number>
}

/** In-memory implementation — suitable for development and testing */
export class MemorySpendStore implements SpendStore {
  private readonly records: SpendRecord[] = []

  async insert(record: Omit<SpendRecord, 'id'>): Promise<SpendRecord> {
    const full: SpendRecord = {
      ...record,
      id: `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    }
    this.records.push(full)
    return full
  }

  async findByWallet(address: string, opts: { limit?: number } = {}): Promise<SpendRecord[]> {
    const filtered = this.records
      .filter((r) => r.walletAddress === address)
      .slice(-(opts.limit ?? 100))
    return filtered.reverse()
  }

  async sumByWalletToday(address: string): Promise<number> {
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    return this.records
      .filter((r) => r.walletAddress === address && r.timestamp >= today)
      .reduce((sum, r) => sum + r.amountUsd, 0)
  }
}

/** Convert a PaymentReceipt to a SpendRecord */
export function receiptToRecord(
  receipt: PaymentReceipt,
  walletAddress: string,
  toolName: string,
): Omit<SpendRecord, 'id'> {
  return {
    walletAddress,
    txHash: receipt.txHash,
    toolName,
    amountUsd: receipt.amount,
    token: receipt.token,
    chainId: receipt.chainId,
    recipient: receipt.recipient,
    timestamp: receipt.timestamp,
  }
}
