import { beforeEach, describe, expect, it, vi } from 'vitest'
const { from, rpc, range, chain } = vi.hoisted(() => {
  const range = vi.fn()
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const name of ['select', 'eq', 'not', 'is', 'order']) chain[name] = vi.fn(() => chain)
  chain.range = range
  return { from: vi.fn((_table: string) => chain), rpc: vi.fn(), range, chain }
})
vi.mock('@/lib/supabaseClient', () => ({ supabase: { from, rpc } }))
import { confirmTrialConversion, fetchTrialConversionData, unlinkTrialConversion } from './adminTrialConversionService'
describe('trial conversion service', () => {
  beforeEach(() => { vi.clearAllMocks(); from.mockImplementation(() => chain); range.mockResolvedValue({ data: [], error: null }) })
  it('does not infer missing links and reads stable pages of 500', async () => {
    const report = await fetchTrialConversionData()
    expect(report).toEqual({ attendees: [], students: [], links: [], linksAvailable: true })
    expect(chain.order).toHaveBeenCalledWith('id', { ascending: true })
    expect(range.mock.calls.every(call => call[0] === 0 && call[1] === 499)).toBe(true)
  })
  it('only treats a genuinely absent table as unavailable', async () => {
    range.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: null, error: { code: 'PGRST205', message: 'missing' } })
    expect((await fetchTrialConversionData()).linksAvailable).toBe(false)
  })
  it('propagates permission or network failures', async () => {
    range.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'denied' } })
    await expect(fetchTrialConversionData()).rejects.toMatchObject({ code: '42501' })
  })
  it('loads subsequent pages without silently truncating students', async () => {
    let studentsCalls = 0
    from.mockImplementation(table => {
      if (table !== 'students') return chain
      const studentsChain: typeof chain = { ...chain, range: vi.fn(async () => ({ data: studentsCalls++ === 0 ? Array.from({ length: 500 }, (_, id) => ({ id: String(id), full_name: 'Persona' })) : [{ id: '500', full_name: 'Última' }], error: null })) }
      for (const name of ['select', 'order']) studentsChain[name] = vi.fn(() => studentsChain)
      return studentsChain
    })
    await fetchTrialConversionData()
    expect(studentsCalls).toBe(2)
    from.mockImplementation(() => chain)
  })
  it('sends explicit ids and optimistic version through authorized RPCs', async () => {
    rpc.mockResolvedValue({ data: 'link1', error: null })
    expect(await confirmTrialConversion('intro1', 'student1')).toBe('link1')
    await unlinkTrialConversion('link1', 2)
    expect(rpc).toHaveBeenCalledWith('confirm_intro_student_conversion', { p_intro_client_id: 'intro1', p_student_id: 'student1' })
    expect(rpc).toHaveBeenCalledWith('revoke_intro_student_conversion', { p_conversion_id: 'link1', p_expected_version: 2 })
  })
  it('keeps the first attended trial and first qualifying membership across history', async () => {
    const intro = { full_name: 'José Pérez', phone: '9' }
    range.mockResolvedValueOnce({ data: [{ intro_client_id: 'i', intro_client: intro, session: { start_at: '2026-09-20T15:00:00Z' } }, { intro_client_id: 'i', intro_client: intro, session: { start_at: '2026-09-01T15:00:00Z' } }], error: null })
      .mockResolvedValueOnce({ data: [{ id: 's', full_name: 'José Pérez', dni: '1', phone: '9' }, { id: 'no-membership', full_name: 'Otra' }], error: null })
      .mockResolvedValueOnce({ data: [{ student_id: 's', start_date: '2026-10-01' }, { student_id: 's', start_date: '2026-09-05' }], error: null })
      .mockResolvedValueOnce({ data: [{ id: 'l', intro_client_id: 'i', student_id: 's', version: 1, confirmed_at: '2026-10-19', confirmed_by: 'admin' }], error: null })
    const result = await fetchTrialConversionData()
    expect(result.attendees).toHaveLength(1)
    expect(result.attendees[0].firstAttendedAt).toBe('2026-09-01T15:00:00Z')
    expect(result.students).toHaveLength(1)
    expect(result.students[0].firstMembershipDate).toBe('2026-09-05')
    expect(result.links[0].studentId).toBe('s')
    expect(chain.eq).toHaveBeenCalledWith('status', 'attended')
    expect(chain.eq).toHaveBeenCalledWith('membership_origin', 'paid')
    expect(chain.not).toHaveBeenCalledWith('status', 'in', '(draft,cancelled)')
  })
  it('rejects a later-page failure instead of presenting a partial cohort', async () => {
    range.mockResolvedValueOnce({ data: Array.from({ length: 500 }, () => ({})), error: null })
      .mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: null, error: { code: 'network', message: 'offline' } })
    await expect(fetchTrialConversionData()).rejects.toMatchObject({ code: 'network' })
  })
})
