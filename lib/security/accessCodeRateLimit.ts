import { createHash } from 'node:crypto'

export const ACCESS_CODE_LOGIN_WINDOW_MS = 15 * 60 * 1000
export const ACCESS_CODE_LOGIN_MAX_FAILURES = 5

type RateLimitClient = {
  from: (table: string) => any
}

export type AccessCodeRateLimitInput = {
  request: Request
  accessCode: string
  secret: string
  now?: Date
}

export type AccessCodeRateLimitResult = {
  blocked: boolean
  failureCount: number
  retryAfterSeconds: number
}

const inMemoryFailures = new Map<string, number[]>()

export function getClientIp(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || 'unknown'
  }

  return (
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    'unknown'
  )
}

export function hashRateLimitValue(value: string, secret: string) {
  return createHash('sha256')
    .update(`${secret}:${value}`)
    .digest('hex')
}

function getWindowStart(now: Date) {
  return new Date(now.getTime() - ACCESS_CODE_LOGIN_WINDOW_MS).toISOString()
}

function getRateLimitHashes(input: AccessCodeRateLimitInput) {
  return {
    ipHash: hashRateLimitValue(getClientIp(input.request), input.secret),
    accessCodeHash: hashRateLimitValue(input.accessCode, input.secret),
  }
}

function getFallbackKey(ipHash: string, accessCodeHash: string) {
  return `${ipHash}:${accessCodeHash}`
}

function pruneFallbackFailures(key: string, now: Date) {
  const threshold = now.getTime() - ACCESS_CODE_LOGIN_WINDOW_MS
  const attempts = (inMemoryFailures.get(key) || []).filter((timestamp) => timestamp >= threshold)

  if (attempts.length > 0) {
    inMemoryFailures.set(key, attempts)
  } else {
    inMemoryFailures.delete(key)
  }

  return attempts
}

function getFallbackResult(key: string, now: Date): AccessCodeRateLimitResult {
  const failureCount = pruneFallbackFailures(key, now).length

  return {
    blocked: failureCount >= ACCESS_CODE_LOGIN_MAX_FAILURES,
    failureCount,
    retryAfterSeconds: Math.ceil(ACCESS_CODE_LOGIN_WINDOW_MS / 1000),
  }
}

function recordFallbackAttempt(key: string, now: Date, success: boolean) {
  if (success) {
    inMemoryFailures.delete(key)
    return
  }

  const attempts = pruneFallbackFailures(key, now)
  attempts.push(now.getTime())
  inMemoryFailures.set(key, attempts)
}

export function resetInMemoryAccessCodeRateLimitForTests() {
  inMemoryFailures.clear()
}

export async function checkAccessCodeLoginRateLimit(
  client: RateLimitClient,
  input: AccessCodeRateLimitInput,
): Promise<AccessCodeRateLimitResult> {
  const now = input.now || new Date()
  const { ipHash, accessCodeHash } = getRateLimitHashes(input)
  const fallbackKey = getFallbackKey(ipHash, accessCodeHash)

  let result: { count: number | null; error: { message?: string } | null }
  try {
    result = await client
      .from('access_code_login_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .eq('access_code_hash', accessCodeHash)
      .eq('success', false)
      .gte('attempted_at', getWindowStart(now))
  } catch {
    return getFallbackResult(fallbackKey, now)
  }

  if (result.error) {
    return getFallbackResult(fallbackKey, now)
  }

  const failureCount = result.count || 0
  return {
    blocked: failureCount >= ACCESS_CODE_LOGIN_MAX_FAILURES,
    failureCount,
    retryAfterSeconds: Math.ceil(ACCESS_CODE_LOGIN_WINDOW_MS / 1000),
  }
}

export async function recordAccessCodeLoginAttempt(
  client: RateLimitClient,
  input: AccessCodeRateLimitInput & { success: boolean },
) {
  const now = input.now || new Date()
  const { ipHash, accessCodeHash } = getRateLimitHashes(input)
  const fallbackKey = getFallbackKey(ipHash, accessCodeHash)

  try {
    const result = await client
      .from('access_code_login_attempts')
      .insert({
        ip_hash: ipHash,
        access_code_hash: accessCodeHash,
        success: input.success,
      })

    if (result?.error) {
      recordFallbackAttempt(fallbackKey, now, input.success)
    } else if (input.success) {
      inMemoryFailures.delete(fallbackKey)
    }
  } catch {
    recordFallbackAttempt(fallbackKey, now, input.success)
  }
}
