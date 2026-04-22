import { describe, it, expect, beforeEach } from 'vitest'
import { assertUnderCap, freshSpendState, recordSpend } from './spend-guard.js'
import { SpendCapError } from './types/index.js'
import type { SpendCap, SpendState } from './types/index.js'

const CAP: SpendCap = { perCall: 0.05, perDay: 1.00 }

describe('freshSpendState', () => {
  it('starts at zero spend', () => {
    const s = freshSpendState()
    expect(s.spentToday).toBe(0)
    expect(s.txCount).toBe(0)
  })

  it('resets at next UTC midnight', () => {
    const s = freshSpendState()
    const now = new Date()
    expect(s.resetAt.getUTCHours()).toBe(0)
    expect(s.resetAt.getUTCMinutes()).toBe(0)
    expect(s.resetAt > now).toBe(true)
  })
})

describe('assertUnderCap', () => {
  let state: SpendState

  beforeEach(() => {
    state = freshSpendState()
  })

  it('passes when amount is within both caps', () => {
    expect(() => assertUnderCap(0.01, CAP, state)).not.toThrow()
  })

  it('throws SpendCapError when amount exceeds perCall cap', () => {
    expect(() => assertUnderCap(0.10, CAP, state)).toThrow(SpendCapError)
  })

  it('throws SpendCapError when amount would exceed perDay cap', () => {
    // pre-load state so the next call would push us over
    state = recordSpend(state, 0.98)
    expect(() => assertUnderCap(0.05, CAP, state)).toThrow(SpendCapError)
  })

  it('allows spend exactly at perCall cap', () => {
    expect(() => assertUnderCap(0.05, CAP, state)).not.toThrow()
  })

  it('allows spend that exactly fills perDay cap', () => {
    state = recordSpend(state, 0.95)
    expect(() => assertUnderCap(0.05, CAP, state)).not.toThrow()
  })

  it('SpendCapError carries cap and requested amount', () => {
    try {
      assertUnderCap(0.10, CAP, state)
    } catch (err) {
      expect(err).toBeInstanceOf(SpendCapError)
      const e = err as SpendCapError
      expect(e.cap).toBe(CAP)
      expect(e.requested).toBe(0.10)
    }
  })
})

describe('recordSpend', () => {
  it('accumulates spend across multiple calls', () => {
    let state = freshSpendState()
    state = recordSpend(state, 0.01)
    state = recordSpend(state, 0.02)
    expect(state.spentToday).toBeCloseTo(0.03)
    expect(state.txCount).toBe(2)
  })

  it('resets daily total when resetAt is in the past', () => {
    let state = freshSpendState()
    state = recordSpend(state, 0.50)
    // Backdate the reset time
    state = { ...state, resetAt: new Date(Date.now() - 1000) }
    state = recordSpend(state, 0.10)
    // Should start fresh — only 0.10
    expect(state.spentToday).toBeCloseTo(0.10)
    expect(state.txCount).toBe(1)
  })
})
