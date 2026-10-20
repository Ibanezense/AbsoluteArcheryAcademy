import { describe, it, expect } from 'vitest'
import { getTrainingProgress, clearTrainingCache } from './training'
import { validateControlsSnapshot } from './source'
const student = '11111111-1111-4111-8111-111111111111'
const external = '22222222-2222-4222-8222-222222222222'
const link = {
  id: 'link',
  student_id: student,
  source: 'academy_controls' as const,
  external_id: external,
  status: 'confirmed' as const,
  revision: 1,
  evidence_reference: 'verified',
  confirmed_at: null,
  updated_at: '2026-10-19T00:00:00Z',
}
const snapshot = {
  contract_version: 'academy-student-controls-v1',
  complete: true,
  checked_at: '2026-10-19T00:00:00Z',
  student: { id: external, name: 'Example', active: 1 },
  controls: [],
}
describe('private training reads', () => {
  it('does not read origin when authorization fails', async () => {
    let reads = 0
    await expect(
      getTrainingProgress(student, {
        context: async () => {
          throw Error('forbidden')
        },
        read: async () => {
          reads++
          return snapshot as never
        },
      })
    ).rejects.toThrow('forbidden')
    expect(reads).toBe(0)
  })
  it('uses fresh assignment on cache hits and preserves source timestamp', async () => {
    clearTrainingCache()
    let reads = 0
    let distance = 20
    const deps = {
      context: async () => ({ student_id: student, assigned_distance_m: distance, link }),
      read: async () => {
        reads++
        return snapshot as never
      },
    }
    const a = await getTrainingProgress(student, deps)
    distance = 30
    const b = await getTrainingProgress(student, deps)
    expect(a.state).toBe('empty')
    expect(b.assigned_distance_m).toBe(30)
    expect(b.checked_at).toBe(snapshot.checked_at)
    expect(reads).toBe(1)
  })
  it('does not release a late response after revocation', async () => {
    clearTrainingCache()
    let revoked = false
    const result = await getTrainingProgress(student, {
      context: async () => ({
        student_id: student,
        assigned_distance_m: 20,
        link: revoked ? null : link,
      }),
      read: async () => {
        revoked = true
        return snapshot as never
      },
    })
    expect(result.state).toBe('pending_link')
    expect(result.controls).toEqual([])
  })
  it('validates exact external identity and rejects incomplete snapshots', () => {
    expect(() => validateControlsSnapshot(snapshot, external)).not.toThrow()
    expect(() => validateControlsSnapshot({ ...snapshot, complete: false }, external)).toThrow()
    expect(() => validateControlsSnapshot(snapshot, student)).toThrow()
  })
})
