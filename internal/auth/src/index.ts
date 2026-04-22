import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/** Generate a cryptographically random API key */
export function generateApiKey(prefix = 'mpy'): string {
  const raw = randomBytes(24).toString('base64url')
  return `${prefix}_${raw}`
}

/** Create an HMAC-SHA256 signature for webhook verification */
export function signWebhook(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex')
}

/** Verify a webhook signature — constant-time to prevent timing attacks */
export function verifyWebhook(payload: string, signature: string, secret: string): boolean {
  const expected = signWebhook(payload, secret)
  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(signature, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** Lightweight JWT-like token (for internal service-to-service auth, not production auth) */
export function encodeServiceToken(payload: Record<string, unknown>, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Date.now() })).toString('base64url')
  const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}

export function decodeServiceToken(
  token: string,
  secret: string,
): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, body, sig] = parts as [string, string, string]
  const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')) as Record<string, unknown>
  } catch {
    return null
  }
}
