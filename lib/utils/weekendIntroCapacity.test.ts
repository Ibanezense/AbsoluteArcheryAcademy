import { describe, expect, it } from 'vitest'
import {
  WEEKEND_INTRO_CAPACITY_QUERY_KEY,
  buildWeekendIntroSlots,
  getLimaReferenceDate,
  type WeekendIntroCapacitySession,
} from './weekendIntroCapacity'

function session(
  sessionId: string,
  startAt: string,
  spotsRemaining = 2,
): WeekendIntroCapacitySession {
  const startTime = new Date(startAt).getTime()

  return {
    sessionId,
    startAt,
    endAt: Number.isFinite(startTime)
      ? new Date(startTime + 60 * 60 * 1000).toISOString()
      : 'invalid-end',
    equipmentCapacity: 8,
    equipmentReserved: 8 - spotsRemaining,
    spotsRemaining,
  }
}

describe('weekend intro capacity helpers', () => {
  it('exposes the shared query key', () => {
    expect(WEEKEND_INTRO_CAPACITY_QUERY_KEY).toEqual(['admin-weekend-intro-capacity'])
  })

  it('returns the Lima calendar date, including when UTC is still the following date', () => {
    expect(getLimaReferenceDate(new Date('2026-08-17T05:00:00Z'))).toBe('2026-08-17')
    expect(getLimaReferenceDate(new Date('2026-08-17T03:30:00Z'))).toBe('2026-08-16')
  })

  it('always returns four Saturday slots followed by three Sunday slots in chronological order', () => {
    const rows = [
      session('sun-3', '2026-08-23T19:00:00Z'),
      session('sat-2', '2026-08-22T15:00:00Z'),
      session('sat-4', '2026-08-22T21:00:00Z'),
      session('sun-1', '2026-08-23T14:00:00Z'),
      session('sat-1', '2026-08-22T13:00:00Z'),
      session('sun-2', '2026-08-23T16:30:00Z'),
      session('sat-3', '2026-08-22T18:00:00Z'),
    ]

    const slots = buildWeekendIntroSlots(rows, new Date('2026-08-20T15:00:00Z'))

    expect(slots.map((slot) => slot.day)).toEqual([
      'saturday',
      'saturday',
      'saturday',
      'saturday',
      'sunday',
      'sunday',
      'sunday',
    ])
    expect(slots.map((slot) => slot.session?.sessionId ?? null)).toEqual([
      'sat-1',
      'sat-2',
      'sat-3',
      'sat-4',
      'sun-1',
      'sun-2',
      'sun-3',
    ])
  })

  it('fills missing positions at the end of each day', () => {
    const slots = buildWeekendIntroSlots(
      [
        session('sat-1', '2026-08-22T14:00:00Z'),
        session('sun-1', '2026-08-23T14:00:00Z'),
        session('sun-2', '2026-08-23T17:00:00Z'),
      ],
      new Date('2026-08-20T15:00:00Z'),
    )

    expect(slots.map((slot) => [slot.day, slot.session?.sessionId ?? null, slot.status])).toEqual([
      ['saturday', 'sat-1', 'available'],
      ['saturday', null, 'not_scheduled'],
      ['saturday', null, 'not_scheduled'],
      ['saturday', null, 'not_scheduled'],
      ['sunday', 'sun-1', 'available'],
      ['sunday', 'sun-2', 'available'],
      ['sunday', null, 'not_scheduled'],
    ])
  })

  it('classifies every capacity status and gives finished sessions priority', () => {
    const slots = buildWeekendIntroSlots(
      [
        session('finished-full', '2026-08-22T14:00:00Z', 0),
        session('available', '2026-08-23T18:00:00Z', 2),
        session('last', '2026-08-23T19:00:00Z', 1),
        session('full-zero', '2026-08-23T20:00:00Z', 0),
      ],
      new Date('2026-08-23T16:00:00Z'),
    )

    expect(slots.find((slot) => slot.session?.sessionId === 'finished-full')?.status).toBe('finished')
    expect(slots.find((slot) => slot.session?.sessionId === 'available')?.status).toBe('available')
    expect(slots.find((slot) => slot.session?.sessionId === 'last')?.status).toBe('last_spot')
    expect(slots.find((slot) => slot.session?.sessionId === 'full-zero')?.status).toBe('full')
  })

  it('treats negative remaining capacity as full', () => {
    const slots = buildWeekendIntroSlots(
      [session('overbooked', '2026-08-22T14:00:00Z', -1)],
      new Date('2026-08-22T13:00:00Z'),
    )

    expect(slots[0].status).toBe('full')
  })

  it('treats a session starting exactly now as finished', () => {
    const now = new Date('2026-08-22T14:00:00Z')
    const slots = buildWeekendIntroSlots(
      [session('starts-now', now.toISOString(), 2)],
      now,
    )

    expect(slots[0].status).toBe('finished')
  })

  it('uses the current Lima week across the UTC boundary into Monday', () => {
    const rows = [
      session('current-sat', '2026-08-22T14:00:00Z'),
      session('current-sun', '2026-08-23T14:00:00Z'),
      session('next-sat', '2026-08-29T14:00:00Z'),
      session('next-sun', '2026-08-30T14:00:00Z'),
    ]

    const limaSundaySlots = buildWeekendIntroSlots(rows, new Date('2026-08-24T04:30:00Z'))
    expect(limaSundaySlots.flatMap((slot) => slot.session?.sessionId ?? [])).toEqual([
      'current-sat',
      'current-sun',
    ])

    const limaMondaySlots = buildWeekendIntroSlots(rows, new Date('2026-08-24T05:00:00Z'))
    expect(limaMondaySlots.flatMap((slot) => slot.session?.sessionId ?? [])).toEqual([
      'next-sat',
      'next-sun',
    ])
  })

  it('ignores invalid dates and deterministically caps extra rows for each day', () => {
    const rows = [
      session('sat-5', '2026-08-22T22:00:00Z'),
      session('sat-3', '2026-08-22T18:00:00Z'),
      session('invalid-start', 'not-a-date'),
      { ...session('invalid-end', '2026-08-22T13:00:00Z'), endAt: 'not-a-date' },
      session('sun-4', '2026-08-23T22:00:00Z'),
      session('sat-1', '2026-08-22T14:00:00Z'),
      session('sun-2', '2026-08-23T17:00:00Z'),
      session('sat-4', '2026-08-22T20:00:00Z'),
      session('sun-1', '2026-08-23T14:00:00Z'),
      session('sat-2', '2026-08-22T16:00:00Z'),
      session('sun-3', '2026-08-23T20:00:00Z'),
    ]

    const slots = buildWeekendIntroSlots(rows, new Date('2026-08-20T15:00:00Z'))

    expect(slots.map((slot) => slot.session?.sessionId ?? null)).toEqual([
      'sat-1',
      'sat-2',
      'sat-3',
      'sat-4',
      'sun-1',
      'sun-2',
      'sun-3',
    ])
  })
})
