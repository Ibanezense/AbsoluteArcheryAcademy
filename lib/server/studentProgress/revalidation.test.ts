import { describe, it, expect, vi } from 'vitest'
import { validateControlsSnapshot } from './source'
import { getTrainingProgress, clearTrainingCache } from './training'
const id = '11111111-1111-4111-8111-111111111111'
const link = {
  id: 'link',
  student_id: id,
  source: 'academy_controls' as const,
  external_id: id,
  status: 'confirmed' as const,
  revision: 1,
  evidence_reference: 'verified',
  confirmed_at: null,
  updated_at: '2026-09-01T00:00:00Z',
}
const snapshot = {
  contract_version: 'academy-student-controls-v1' as const,
  complete: true as const,
  checked_at: '2026-09-01T00:00:00Z',
  student: { id, name: 'Example', active: 1 as const },
  controls: [],
}
describe('strict source timestamps and failed revalidation', () => {
  it.each(['2026-02-30T00:00:00Z', '2026-09-01T24:00:00Z', '2026-09-01T00:00:00'])(
    'rejects malformed timestamp %s',
    (checked_at) =>
      expect(() => validateControlsSnapshot({ ...snapshot, checked_at }, id)).toThrow()
  )
  it('rejects identity names longer than contract maximum', () =>
    expect(() =>
      validateControlsSnapshot(
        { ...snapshot, student: { ...snapshot.student, name: 'x'.repeat(101) } },
        id
      )
    ).toThrow())
  it('keeps only last checked timestamp when expired origin read fails', async () => {
    clearTrainingCache()
    vi.useFakeTimers()
    try {
      const context = async () => ({ student_id: id, assigned_distance_m: 20, link })
      await getTrainingProgress(id, { context, read: async () => snapshot })
      vi.advanceTimersByTime(300001)
      const result = await getTrainingProgress(id, {
        context,
        read: async () => {
          throw Error('down')
        },
      })
      expect(result).toMatchObject({
        state: 'unavailable',
        checked_at: snapshot.checked_at,
        controls: [],
        summary: null,
      })
    } finally {
      vi.useRealTimers()
    }
  })
})
