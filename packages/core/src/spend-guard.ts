import type { SpendCap, SpendState } from './types/index.js';
import { SpendCapError } from './types/index.js'

export function assertUnderCap(
  amount: number,
  caps: SpendCap,
  state: SpendState,
): void {
  if (amount > caps.perCall) {
    throw new SpendCapError(
      `Cost $${amount.toFixed(4)} exceeds per-call cap $${caps.perCall}`,
      caps,
      amount,
    )
  }

  const projectedDaily = state.spentToday + amount
  if (projectedDaily > caps.perDay) {
    throw new SpendCapError(
      `Projected daily spend $${projectedDaily.toFixed(4)} exceeds daily cap $${caps.perDay}`,
      caps,
      projectedDaily,
    )
  }
}

export function freshSpendState(): SpendState {
  const resetAt = new Date()
  resetAt.setUTCHours(24, 0, 0, 0)
  return { spentToday: 0, resetAt, txCount: 0 }
}

export function recordSpend(state: SpendState, amount: number): SpendState {
  const now = new Date()
  const reset = now >= state.resetAt ? freshSpendState() : { ...state }
  return {
    ...reset,
    spentToday: reset.spentToday + amount,
    txCount: reset.txCount + 1,
  }
}
