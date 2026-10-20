import { describe, it, expect, vi, afterEach } from 'vitest'
import { readControls, validateControlsSnapshot, validateDirectory } from './source'
const id = '11111111-1111-4111-8111-111111111111'
const control = {
  id: '22222222-2222-4222-8222-222222222222',
  student_id: id,
  distance: 20,
  arrows: 36,
  score: 0,
  performed_date: '2026-09-01',
  performed_time: null,
  status: 'valid',
  revision: 1,
  created_at: '2026-09-01T12:00:00Z',
  updated_at: '2026-09-01T12:00:00Z',
}
const snapshot = {
  contract_version: 'academy-student-controls-v1',
  complete: true,
  checked_at: '2026-09-01T12:00:00Z',
  student: { id, name: 'Private', active: 0 },
  controls: [control],
}
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})
describe('private source contract', () => {
  it('keeps inactive identity, zero score and unknown time without inventing values', () => {
    expect(validateControlsSnapshot(snapshot, id).controls[0]).toEqual(control)
  })
  it.each([
    { score: null },
    { distance: 0 },
    { arrows: 35 },
    { score: 361 },
    { revision: 0 },
    { performed_date: '2026-02-30' },
    { performed_date: '2099-01-01' },
    { performed_time: '25:00' },
    { student_id: '33333333-3333-4333-8333-333333333333' },
    { created_at: null },
  ])('rejects malformed control %j', (change) => {
    expect(() =>
      validateControlsSnapshot({ ...snapshot, controls: [{ ...control, ...change }] }, id)
    ).toThrow()
  })
  it('rejects duplicate IDs and truncation', () => {
    expect(() =>
      validateControlsSnapshot({ ...snapshot, controls: [control, control] }, id)
    ).toThrow()
    expect(() => validateControlsSnapshot({ ...snapshot, complete: false }, id)).toThrow()
  })
  it('rejects mixed identity and directory duplicates', () => {
    expect(() =>
      validateControlsSnapshot(
        {
          ...snapshot,
          student: { ...snapshot.student, id: '33333333-3333-4333-8333-333333333333' },
        },
        id
      )
    ).toThrow()
    expect(() =>
      validateDirectory({
        contract_version: 'academy-student-directory-v1',
        checked_at: snapshot.checked_at,
        candidates: [snapshot.student, snapshot.student],
        has_more: false,
      })
    ).toThrow()
  })
  it('blocks local HTTP source outside development before fetch', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ACADEMY_CONTROLS_URL', 'http://localhost:3101')
    vi.stubEnv('ACADEMY_CONTROLS_READ_TOKEN', 'x'.repeat(32))
    const request = vi.fn()
    vi.stubGlobal('fetch', request)
    await expect(readControls(id)).rejects.toThrow()
    expect(request).not.toHaveBeenCalled()
  })
  it('uses private auth header, no redirects and no framework caching', async () => {
    vi.stubEnv('ACADEMY_CONTROLS_URL', 'https://controls.example')
    vi.stubEnv('ACADEMY_CONTROLS_READ_TOKEN', 'x'.repeat(32))
    const request = vi.fn().mockResolvedValue(Response.json(snapshot))
    vi.stubGlobal('fetch', request)
    await expect(readControls(id)).resolves.toEqual(snapshot)
    expect(request.mock.calls[0][0].toString()).toBe(
      `https://controls.example/api/integrations/student-controls?student_id=${id}`
    )
    expect(request.mock.calls[0][1]).toMatchObject({
      redirect: 'error',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${'x'.repeat(32)}` },
    })
  })
  it('rejects overlarge bodies', async () => {
    vi.stubEnv('ACADEMY_CONTROLS_URL', 'https://controls.example')
    vi.stubEnv('ACADEMY_CONTROLS_READ_TOKEN', 'x'.repeat(32))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(' '.repeat(4_000_001))))
    await expect(readControls(id)).rejects.toThrow('source_too_large')
  })
})
