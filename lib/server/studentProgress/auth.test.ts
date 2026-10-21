import { afterEach, describe, it, expect, vi } from 'vitest'
const { makeClient } = vi.hoisted(() => ({ makeClient: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: makeClient }))
import { authorize } from './auth'
function client(profile: unknown, user: unknown = { id: 'actor' }) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: profile, error: null })
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) }, from }
}
afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})
function env() {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://db.example')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'never-use-service')
}
const request = () =>
  new Request('http://localhost', { headers: { Authorization: 'Bearer real-token' } })
describe('progress actor authorization', () => {
  it('allows an active administrator with the normal actor JWT', async () => {
    env()
    const c = client({ id: 'actor', role: 'admin', is_active: true })
    makeClient.mockReturnValue(c)
    await expect(authorize(request(), true)).resolves.toBe(c)
    expect(makeClient.mock.calls[0][1]).toBe('anon')
  })
  it('rejects an inactive administrator before reading student progress', async () => {
    env()
    makeClient.mockReturnValue(client({ id: 'actor', role: 'admin', is_active: false }))
    await expect(authorize(request(), true)).rejects.toMatchObject({ status: 403 })
  })
  it('verifies JWT with Auth server and uses actor anon client', async () => {
    env()
    const c = client({ id: 'actor', role: 'student', is_active: true })
    makeClient.mockReturnValue(c)
    await expect(authorize(request())).resolves.toBe(c)
    expect(c.auth.getUser).toHaveBeenCalledWith('real-token')
    expect(makeClient).toHaveBeenCalledWith(
      'https://db.example',
      'anon',
      expect.objectContaining({ global: { headers: { Authorization: 'Bearer real-token' } } })
    )
  })
  it('rejects inactive users before querying source', async () => {
    env()
    makeClient.mockReturnValue(client({ id: 'actor', role: 'student', is_active: false }))
    await expect(authorize(request())).rejects.toMatchObject({ status: 403 })
  })
  it('rejects student and guardian admin lookups', async () => {
    env()
    for (const role of ['student', 'guardian']) {
      makeClient.mockReturnValue(client({ id: 'actor', role, is_active: true }))
      await expect(authorize(request(), true)).rejects.toMatchObject({ status: 403 })
    }
  })
  it('rejects missing user despite a client session', async () => {
    env()
    const c = client({ id: 'actor', role: 'admin', is_active: true }, null)
    makeClient.mockReturnValue(c)
    await expect(authorize(request())).rejects.toMatchObject({ status: 401 })
    expect(c.from).not.toHaveBeenCalled()
  })
  it('rejects missing credentials before creating client', async () => {
    await expect(authorize(new Request('http://localhost'))).rejects.toMatchObject({ status: 401 })
    expect(makeClient).not.toHaveBeenCalled()
  })
})
