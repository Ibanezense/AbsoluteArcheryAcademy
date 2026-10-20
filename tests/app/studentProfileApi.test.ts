import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as auth from '@/lib/server/studentProgress/auth'
import { GET, POST, PATCH, DELETE } from '@/app/api/student-profile/route'
const id = '20000000-0000-4000-8000-000000000001'
const row = {
  id,
  full_name: 'Camila',
  date_of_birth: '2013-03-15',
  division: 'Recurvo',
  gender: 'damas',
  current_distance_m: 40,
  has_own_bow: true,
  dni: 'SECRET',
  access_code: 'SECRET',
  guardian_phone: 'SECRET',
}
const rpc = vi.fn()
const from = vi.fn()
const select = vi.fn()
const eq = vi.fn()
const single = vi.fn()
function request(query = `studentId=${id}`) {
  return new Request(`http://localhost/api/student-profile?${query}`)
}
beforeEach(() => {
  vi.spyOn(auth, 'authorize').mockResolvedValue({ rpc, from } as never)
  rpc.mockReset().mockResolvedValue({ data: id, error: null })
  from.mockReset().mockReturnValue({ select })
  select.mockReset().mockReturnValue({ eq })
  eq.mockReset().mockReturnValue({ maybeSingle: single })
  single.mockReset().mockResolvedValue({ data: row, error: null })
})
afterEach(() => vi.restoreAllMocks())
describe('private student profile', () => {
  it('rejects inaccessible students before selecting any student data', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001' } })
    expect((await GET(request())).status).toBe(403)
    expect(from).not.toHaveBeenCalled()
  })
  it('rechecks access after the row read and discards data after a revoke', async () => {
    rpc
      .mockResolvedValueOnce({ data: id, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: 'P0001' } })
    const response = await GET(request())
    expect(response.status).toBe(403)
    expect(await response.text()).not.toContain('Camila')
    expect(from).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledTimes(2)
  })
  it('rejects an account deactivated while its student row is being fetched', async () => {
    vi.mocked(auth.authorize)
      .mockResolvedValueOnce({ rpc, from } as never)
      .mockRejectedValueOnce(new auth.ProgressError(403, 'forbidden'))
    const response = await GET(request())
    expect(response.status).toBe(403)
    expect(await response.text()).not.toContain('Camila')
    expect(from).toHaveBeenCalledTimes(1)
    expect(auth.authorize).toHaveBeenCalledTimes(2)
  })
  it('never reads student data for an invalid session', async () => {
    vi.mocked(auth.authorize).mockRejectedValue(
      new auth.ProgressError(401, 'invalid_session'),
    )
    expect((await GET(request())).status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
    expect(from).not.toHaveBeenCalled()
  })
  it('returns only the allowlisted selected student fields with no-store', async () => {
    const response = await GET(request())
    const value = await response.json()
    expect(response.status).toBe(200)
    expect(value.student_id).toBe(id)
    expect(value.profile.full_name).toBe('Camila')
    expect(value.profile.current_distance_m).toBe(40)
    expect(JSON.stringify(value)).not.toContain('SECRET')
    expect(from).toHaveBeenCalledWith('students')
    expect(eq).toHaveBeenCalledWith('id', id)
    expect(select.mock.calls[0][0]).not.toMatch(
      /\*|dni|access_code|guardian|membership|payment/,
    )
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc.mock.calls).toEqual([
      ['resolve_accessible_student_id', { p_student_id: id }],
      ['resolve_accessible_student_id', { p_student_id: id }],
    ])
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
  it('fails closed if the database unexpectedly returns a different student', async () => {
    single.mockResolvedValue({ data: { ...row, id: 'other' }, error: null })
    expect((await GET(request())).status).toBe(403)
  })
  it('rejects an unexpected student from the read-only resolver before row lookup', async () => {
    rpc.mockResolvedValue({
      data: '20000000-0000-4000-8000-000000000002',
      error: null,
    })
    expect((await GET(request())).status).toBe(403)
    expect(from).not.toHaveBeenCalled()
  })
  it.each(['42501', 'P0001'])(
    'returns 403 for resolver access rejection %s',
    async (code) => {
      rpc.mockResolvedValue({ data: null, error: { code } })
      expect((await GET(request())).status).toBe(403)
      expect(from).not.toHaveBeenCalled()
    },
  )
  it('returns unavailable for resolver failures without selecting a student', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '08006' } })
    expect((await GET(request())).status).toBe(503)
    expect(from).not.toHaveBeenCalled()
  })
  it.each([
    '',
    `studentId=${id}&studentId=${id}`,
    `studentId=${id}&include=all`,
    'studentId=nope',
  ])('rejects invalid query %s before authorization', async (query) => {
    expect((await GET(request(query))).status).toBe(400)
    expect(auth.authorize).not.toHaveBeenCalled()
  })
  it('keeps unsupported writes private and unavailable', async () => {
    for (const method of [POST, PATCH, DELETE])
      expect((await method()).status).toBe(405)
    expect(from).not.toHaveBeenCalled()
  })
})
