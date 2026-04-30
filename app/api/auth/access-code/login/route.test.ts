import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockCreateClient = vi.hoisted(() => vi.fn())
const mockCheckAccessCodeLoginRateLimit = vi.hoisted(() => vi.fn())
const mockRecordAccessCodeLoginAttempt = vi.hoisted(() => vi.fn())

vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}))

vi.mock('@/lib/security/accessCodeRateLimit', () => ({
  checkAccessCodeLoginRateLimit: mockCheckAccessCodeLoginRateLimit,
  recordAccessCodeLoginAttempt: mockRecordAccessCodeLoginAttempt,
}))

describe('POST /api/auth/access-code/login', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
  })

  it('returns 429 when the access code login rate limit is exceeded', async () => {
    mockCheckAccessCodeLoginRateLimit.mockResolvedValue({
      blocked: true,
      failureCount: 5,
      retryAfterSeconds: 900,
    })
    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn(),
      }),
      auth: { admin: {} },
    })

    const { POST } = await import('./route')
    const response = await POST(
      new Request('http://localhost/api/auth/access-code/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-real-ip': '203.0.113.10',
        },
        body: JSON.stringify({ accessCode: 'ABC123' }),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('900')
    expect(payload.error).toBe('Demasiados intentos fallidos. Intenta nuevamente en unos minutos.')
    expect(mockRecordAccessCodeLoginAttempt).not.toHaveBeenCalled()
  })
})
