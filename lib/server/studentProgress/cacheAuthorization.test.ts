import { describe, it, expect, vi } from 'vitest'
import { getTrainingProgress, clearTrainingCache } from './training'
const sid = '11111111-1111-4111-8111-111111111111',
  eid = '22222222-2222-4222-8222-222222222222'
const link = {
  id: 'link',
  student_id: sid,
  source: 'academy_controls' as const,
  external_id: eid,
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
  student: { id: eid, name: 'One', active: 1 as const },
  controls: [],
}
describe('training cache authorization boundaries', () => {
  it('rejects withdrawn guardian access even on hot cache', async () => {
    clearTrainingCache()
    const read = vi.fn().mockResolvedValue(snapshot)
    await getTrainingProgress(sid, {
      context: async () => ({ student_id: sid, assigned_distance_m: 20, link }),
      read,
    })
    await expect(
      getTrainingProgress(sid, {
        context: async () => {
          throw Error('forbidden')
        },
        read,
      })
    ).rejects.toThrow('forbidden')
    expect(read).toHaveBeenCalledTimes(1)
  })
  it('rejects guardian relation removed during source read', async () => {
    clearTrainingCache()
    let removed = false
    await expect(
      getTrainingProgress(sid, {
        context: async () => {
          if (removed) throw Error('forbidden')
          return { student_id: sid, assigned_distance_m: 20, link }
        },
        read: async () => {
          removed = true
          return snapshot
        },
      })
    ).rejects.toThrow('forbidden')
  })
  it('does not use old identity after link replacement during read', async () => {
    clearTrainingCache()
    let replacement = false
    const value = await getTrainingProgress(sid, {
      context: async () => ({
        student_id: sid,
        assigned_distance_m: 20,
        link: replacement ? { ...link, id: 'replacement', revision: 2 } : link,
      }),
      read: async () => {
        replacement = true
        return snapshot
      },
    })
    expect(value.state).toBe('pending_link')
    expect(value.checked_at).toBeNull()
  })
  it('preserves assignment while source unavailable', async () => {
    clearTrainingCache()
    const value = await getTrainingProgress(sid, {
      context: async () => ({ student_id: sid, assigned_distance_m: 30, link }),
      read: async () => {
        throw Error('secret provider error')
      },
    })
    expect(value).toMatchObject({
      state: 'unavailable',
      assigned_distance_m: 30,
      controls: [],
      summary: null,
      checked_at: null,
    })
  })
  it('never returns mismatched student context', async () => {
    const read = vi.fn()
    await expect(
      getTrainingProgress(sid, {
        context: async () => ({ student_id: eid, assigned_distance_m: 20, link }),
        read,
      })
    ).rejects.toThrow('forbidden')
    expect(read).not.toHaveBeenCalled()
  })
})
