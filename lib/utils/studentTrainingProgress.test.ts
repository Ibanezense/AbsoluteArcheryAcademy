import { describe, expect, it } from 'vitest'
import {
  summarizeTrainingControls,
  filterTrainingControls,
  selectInitialTrainingFormat,
} from './studentTrainingProgress'

const control = (
  id: string,
  score: number,
  date: string,
  distance = 30,
  arrows = 36,
  extra = {}
) => ({
  id,
  student_id: 'source-student',
  distance,
  arrows,
  score,
  performed_date: date,
  performed_time: '10:00',
  status: 'valid',
  revision: 1,
  created_at: `${date}T16:00:00Z`,
  updated_at: `${date}T16:00:00Z`,
  ...extra,
})

describe('student training progress', () => {
  it('keeps last control separate from best and separates 36 and 72', () => {
    const rows = [
      control('best', 305, '2026-09-01'),
      control('last', 280, '2026-10-01'),
      control('72', 600, '2026-09-20', 30, 72),
    ]
    const s = summarizeTrainingControls(rows as any, 30)
    expect(s.last_control?.id).toBe('last')
    expect(s.best_36?.score).toBe(305)
    expect(s.best_72?.score).toBe(600)
    expect(s.reference.kind).toBe('current')
  })
  it('keeps previous distances and explicitly flags disagreement', () => {
    const rows = [control('assigned', 280, '2026-09-01'), control('other', 300, '2026-10-01', 20)]
    const s = summarizeTrainingControls(rows as any, 30)
    expect(s.reference.kind).toBe('discrepant')
    expect(s.reference.latest_distances_m).toEqual([20])
    expect(s.last_control?.id).toBe('assigned')
    expect(
      filterTrainingControls(rows as any, { distance: 20, format: 'all', from: '', to: '' })
    ).toHaveLength(1)
  })
  it('does not choose a last distance by registration order when sporting order is unknown', () => {
    const rows = [
      control('one', 280, '2026-10-01', 30, 36, { performed_time: null }),
      control('two', 280, '2026-10-01', 20),
    ]
    const s = summarizeTrainingControls(rows as any, 30)
    expect(s.reference.kind).toBe('uncertain')
    expect(s.reference.latest_distances_m).toEqual([20, 30])
    expect(summarizeTrainingControls([rows[0]] as any, null).reference.kind).toBe('pending')
  })
  it('uses later known sporting time and never correction time as performance time', () => {
    const rows = [
      control('early', 305, '2026-09-01', 30, 36, { updated_at: '2026-12-01T10:00:00Z' }),
      control('late', 280, '2026-10-01', 30, 36, { performed_time: '16:00' }),
      control('morning', 290, '2026-10-01'),
    ]
    expect(summarizeTrainingControls(rows as any, 30).last_control?.id).toBe('late')
  })
  it('removes annulled best marks from summary but keeps all attempts in history', () => {
    const rows = [
      control('annulled', 340, '2026-10-01', 30, 36, { status: 'annulled' }),
      control('valid', 0, '2026-09-01'),
    ]
    expect(summarizeTrainingControls(rows as any, 30).best_36?.score).toBe(0)
    expect(
      filterTrainingControls(rows as any, { distance: 30, format: 'all', from: '', to: '' })
    ).toHaveLength(2)
  })
  it('recalculates on distance changes even with the same cached controls', () => {
    const rows = [control('20', 320, '2026-10-01', 20), control('30', 280, '2026-09-01')]
    expect(summarizeTrainingControls(rows as any, 20).best_36?.score).toBe(320)
    expect(summarizeTrainingControls(rows as any, 30).best_36?.score).toBe(280)
    expect(summarizeTrainingControls([] as any, 30).reference.kind).toBe('assigned')
  })
  it('applies date, distance and format filters to the whole set inclusively', () => {
    const rows = [
      control('one', 280, '2026-10-01'),
      control('two', 600, '2026-10-02', 30, 72),
      control('old', 280, '2026-09-01'),
    ]
    expect(
      filterTrainingControls(rows as any, {
        distance: 30,
        format: 36,
        from: '2026-10-01',
        to: '2026-10-01',
      }).map((x) => x.id)
    ).toEqual(['one'])
    expect(selectInitialTrainingFormat(rows as any, 30)).toBe(36)
    expect(selectInitialTrainingFormat([rows[1]] as any, 30)).toBe(72)
  })
  it('uses only registration order for listing a day with an unknown sporting time', () => {
    const rows = [
      control('known', 280, '2026-10-01', 30, 36, {
        performed_time: '22:00',
        created_at: '2026-10-01T14:00:00Z',
      }),
      control('unknown', 290, '2026-10-01', 30, 36, {
        performed_time: null,
        created_at: '2026-10-01T17:00:00Z',
      }),
    ]
    expect(
      filterTrainingControls(rows as any, { distance: 30, format: 'all', from: '', to: '' }).map(
        (row) => row.id
      )
    ).toEqual(['unknown', 'known'])
  })
})
