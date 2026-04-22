/** All event types emitted by MeshPay */
export type MeshPayEventType =
  | 'payment.initiated'
  | 'payment.completed'
  | 'payment.failed'
  | 'spend_cap.exceeded'
  | 'wallet.session_started'
  | 'wallet.session_expired'
  | 'quote.requested'
  | 'quote.expired'

export interface BaseEvent {
  id: string
  type: MeshPayEventType
  timestamp: string
  version: '1.0'
}

export interface PaymentInitiatedEvent extends BaseEvent {
  type: 'payment.initiated'
  data: {
    toolName: string
    recipient: string
    amountUsd: number
    token: string
    chainId: string
    quoteId: string
  }
}

export interface PaymentCompletedEvent extends BaseEvent {
  type: 'payment.completed'
  data: {
    toolName: string
    txHash: string
    amountUsd: number
    token: string
    chainId: string
    walletAddress: string
    durationMs: number
  }
}

export interface PaymentFailedEvent extends BaseEvent {
  type: 'payment.failed'
  data: {
    toolName: string
    reason: string
    errorMessage: string
    amountUsd: number
  }
}

export interface SpendCapExceededEvent extends BaseEvent {
  type: 'spend_cap.exceeded'
  data: {
    toolName: string
    requestedUsd: number
    capType: 'perCall' | 'perDay'
    capValueUsd: number
  }
}

export interface WalletSessionStartedEvent extends BaseEvent {
  type: 'wallet.session_started'
  data: {
    address: string
    expiresAt: string
    caps: { perCall: number; perDay: number }
  }
}

export type MeshPayEvent =
  | PaymentInitiatedEvent
  | PaymentCompletedEvent
  | PaymentFailedEvent
  | SpendCapExceededEvent
  | WalletSessionStartedEvent

/** Create a typed event with auto-generated id and timestamp */
export function createEvent<T extends MeshPayEvent>(
  type: T['type'],
  data: T['data'],
): T {
  return {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    timestamp: new Date().toISOString(),
    version: '1.0',
    data,
  } as T
}
