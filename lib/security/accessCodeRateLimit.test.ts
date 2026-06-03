import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ACCESS_CODE_LOGIN_MAX_FAILURES,
  checkAccessCodeLoginRateLimit,
  getClientIp,
  hashRateLimitValue,
  recordAccessCodeLoginAttempt,
  resetInMemoryAccessCodeRateLimitForTests,
} from './accessCodeRateLimit'

function createSelectClient(count: number | null, error: { message: string } | null = null) {
  const gte = vi.fn().mockResolvedValue({ count, error })
  const eqSuccess = vi.fn().mockReturnValue({ gte })
  const eqCode = vi.fn().mockReturnValue({ eq: eqSuccess })
  const eqIp = vi.fn().mockReturnValue({ eq: eqCode })
  const select = vi.fn().mockReturnValue({ eq: eqIp })

  return {
    client: {
      from: vi.fn().mockReturnValue({ select }),
    },
    gte,
  }
}

describe('access code login rate limiting', () => {
  beforeEach(() => {
    resetInMemoryAccessCodeRateLimitForTests()
  })

  it('uses the first forwarded IP address', () => {
    const request = new Request('http://localhost/api/auth/access-code/login', {
      headers: {
        'x-forwarded-for': '203.0.113.5, 10.0.0.1',
      },
    })

    expect(getClientIp(request)).toBe('203.0.113.5')
  })

  it('hashes rate limit values deterministically without exposing the raw value', () => {
    const first = hashRateLimitValue('ABC123', 'test-secret')
    const second = hashRateLimitValue('ABC123', 'test-secret')

    expect(first).toBe(second)
    expect(first).toHaveLength(64)
    expect(first).not.toContain('ABC123')
  })

  it('blocks when the same IP and access code reach the failure limit within the window', async () => {
    const { client, gte } = createSelectClient(ACCESS_CODE_LOGIN_MAX_FAILURES)
    const request = new Request('http://localhost/api/auth/access-code/login', {
      headers: { 'x-real-ip': '203.0.113.10' },
    })
    const now = new Date('2026-04-30T10:00:00.000Z')

    const result = await checkAccessCodeLoginRateLimit(client, {
      request,
      accessCode: 'ABC123',
      secret: 'test-secret',
      now,
    })

    expect(result.blocked).toBe(true)
    expect(result.failureCount).toBe(ACCESS_CODE_LOGIN_MAX_FAILURES)
    expect(result.retryAfterSeconds).toBe(900)
    expect(gte).toHaveBeenCalledWith('attempted_at', '2026-04-30T09:45:00.000Z')
  })

  it('uses a process-local fallback if persistence is unavailable', async () => {
    const { client } = createSelectClient(null, { message: 'relation does not exist' })
    const request = new Request('http://localhost/api/auth/access-code/login', {
      headers: { 'x-real-ip': '203.0.113.30' },
    })

    for (let attempt = 0; attempt < ACCESS_CODE_LOGIN_MAX_FAILURES; attempt += 1) {
      await recordAccessCodeLoginAttempt(client, {
        request,
        accessCode: 'ABC123',
        secret: 'test-secret',
        success: false,
        now: new Date('2026-04-30T10:00:00.000Z'),
      })
    }

    const result = await checkAccessCodeLoginRateLimit(client, {
      request,
      accessCode: 'ABC123',
      secret: 'test-secret',
      now: new Date('2026-04-30T10:00:00.000Z'),
    })

    expect(result.blocked).toBe(true)
    expect(result.failureCount).toBe(ACCESS_CODE_LOGIN_MAX_FAILURES)
    expect(result.retryAfterSeconds).toBe(900)
  })

  it('records login attempts with hashed IP and access code values', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    const client = {
      from: vi.fn().mockReturnValue({ insert }),
    }

    await recordAccessCodeLoginAttempt(client, {
      request: new Request('http://localhost/api/auth/access-code/login', {
        headers: { 'x-real-ip': '203.0.113.20' },
      }),
      accessCode: 'ABC123',
      secret: 'test-secret',
      success: false,
    })

    expect(insert).toHaveBeenCalledWith({
      ip_hash: hashRateLimitValue('203.0.113.20', 'test-secret'),
      access_code_hash: hashRateLimitValue('ABC123', 'test-secret'),
      success: false,
    })
  })
})
