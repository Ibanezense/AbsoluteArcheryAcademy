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
  it.each([
    { status: 'active', blocked: false, profileActive: true, expected: 200 },
    { status: 'expired', blocked: false, profileActive: true, expected: 200 },
    { status: 'paused', blocked: false, profileActive: true, expected: 200 },
    { status: 'inactive', blocked: false, profileActive: true, expected: 403 },
    { status: 'retired', blocked: false, profileActive: true, expected: 403 },
    { status: 'withdrawn', blocked: false, profileActive: true, expected: 403 },
    { status: 'blocked', blocked: false, profileActive: true, expected: 403 },
    { status: 'suspended', blocked: false, profileActive: true, expected: 403 },
    { status: 'expired', blocked: true, profileActive: true, expected: 403 },
    { status: 'paused', blocked: false, profileActive: false, expected: 403 },
    { status: null, blocked: false, profileActive: true, expected: 403 },
  ])('enforces account access for $status, blocked=$blocked, profileActive=$profileActive', async ({ status, blocked, profileActive, expected }) => {
    mockCheckAccessCodeLoginRateLimit.mockResolvedValue({ blocked: false })
    const generateLink = vi.fn().mockResolvedValue({ data: { properties: { email_otp: 'test-otp' } }, error: null })
    const admin = {
      from: vi.fn((table: string) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({
        data: table === 'profiles' ? { id: 'student-profile', role: 'student', full_name: 'Test', is_active: profileActive } : status === null ? null : { operational_status: status, account_access_blocked: blocked }, error: null,
      }) }) }) })),
      auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: { email: 'test@example.com' } }, error: null }), generateLink } },
    }
    const auth = { auth: { verifyOtp: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-access', refresh_token: 'test-refresh' } }, error: null }) } }
    mockCreateClient.mockImplementation((_url: string, key: string) => key === 'service-key' ? admin : auth)
    const { POST } = await import('./route')
    const response = await POST(new Request('http://localhost/api/auth/access-code/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accessCode: 'ABC123' }) }))
    expect(response.status).toBe(expected)
    if (expected === 403) expect(generateLink).not.toHaveBeenCalled()
    else expect((await response.json()).redirectTo).toBe('/')
  })
})
