import { describe, expect, it } from 'vitest'
import {
  buildMembershipCyclePreview,
  getLimaDateKey,
  suggestNextMembershipStart,
  summarizeMemberships,
  type MembershipLike,
} from './membershipCycles'

describe('getLimaDateKey', () => {
  it('keeps the previous business day before midnight in America/Lima', () => {
    expect(getLimaDateKey(new Date('2026-06-04T04:30:00.000Z'))).toBe('2026-06-03')
  })
})

describe('buildMembershipCyclePreview', () => {
  it('builds consecutive inclusive paid cycles with UTC date-only arithmetic', () => {
    const preview = buildMembershipCyclePreview({
      origin: 'paid',
      startDate: '2026-08-01',
      periodCount: 2,
      durationDays: 30,
      classesPerPeriod: 8,
      amountPerPeriod: 180,
    })

    expect(preview).toEqual([
      {
        cycleNumber: 1,
        origin: 'paid',
        startDate: '2026-08-01',
        endDate: '2026-08-30',
        classes: 8,
        amount: 180,
      },
      {
        cycleNumber: 2,
        origin: 'paid',
        startDate: '2026-08-31',
        endDate: '2026-09-29',
        classes: 8,
        amount: 180,
      },
    ])
  })

  it('builds one zero-cost gift with its requested classes and dates', () => {
    expect(
      buildMembershipCyclePreview({
        origin: 'gift',
        startDate: '2026-08-10',
        giftEndDate: '2026-08-31',
        giftClasses: 1,
      }),
    ).toEqual([
      {
        cycleNumber: 1,
        origin: 'gift',
        startDate: '2026-08-10',
        endDate: '2026-08-31',
        classes: 1,
        amount: 0,
      },
    ])
  })

  it('rejects more than the twelve periods accepted by the membership RPC', () => {
    expect(() =>
      buildMembershipCyclePreview({
        origin: 'paid',
        startDate: '2026-08-01',
        periodCount: 13,
        durationDays: 30,
        classesPerPeriod: 8,
        amountPerPeriod: 180,
      }),
    ).toThrow('Period count must be between 1 and 12')
  })
})

describe('suggestNextMembershipStart', () => {
  it('suggests the day after the latest finite open membership end date', () => {
    const memberships: MembershipLike[] = [
      membership({ id: 'older', end_date: '2026-08-30' }),
      membership({ id: 'latest', end_date: '2026-09-29' }),
      membership({ id: 'closed', status: 'expired', end_date: '2026-12-31' }),
    ]

    expect(suggestNextMembershipStart(memberships, '2026-08-01')).toBe(
      '2026-09-30',
    )
  })

  it('uses today when there is no open membership with a finite end date', () => {
    expect(suggestNextMembershipStart([], '2026-08-01')).toBe('2026-08-01')
    expect(
      suggestNextMembershipStart(
        [membership({ id: 'open-ended', end_date: null })],
        '2026-08-01',
      ),
    ).toBe('2026-08-01')
  })
})

describe('summarizeMemberships', () => {
  it('keeps the current cycle visible while moving bookable FIFO availability forward', () => {
    const summary = summarizeMemberships(
      [
        membership({ id: 'older', classes_remaining: 2 }),
        membership({ id: 'next', classes_remaining: 3, created_at: '2026-08-02T00:00:00Z' }),
      ],
      '2026-08-10',
      new Map([['older', 2]]),
    )

    expect(summary.currentMembershipId).toBe('older')
    expect(summary.bookableMembershipId).toBe('next')
    expect(summary.usableClasses).toBe(3)
    expect(summary.totalOpenClasses).toBe(5)
    expect(summary.availableClassesById).toMatchObject({ older: 0, next: 3 })
    expect(summary.statusesById.older).toBe('current')
    expect(summary.statusesById.next).toBe('queued')
  })

  it('orders overlapping eligible memberships by start, creation, then id', () => {
    const byStart = summarizeMemberships(
      [
        membership({ id: 'later', start_date: '2026-08-05' }),
        membership({ id: 'earlier', start_date: '2026-08-01' }),
      ],
      '2026-08-10',
    )
    expect(byStart.currentMembershipId).toBe('earlier')

    const byCreated = summarizeMemberships(
      [
        membership({ id: 'newer', created_at: '2026-08-02T10:00:00Z' }),
        membership({ id: 'older', created_at: '2026-08-01T10:00:00Z' }),
      ],
      '2026-08-10',
    )
    expect(byCreated.currentMembershipId).toBe('older')

    const byId = summarizeMemberships(
      [membership({ id: 'b' }), membership({ id: 'a' })],
      '2026-08-10',
    )
    expect(byId.currentMembershipId).toBe('a')
  })

  it('marks the first usable membership current, later usable rows queued, and future rows scheduled', () => {
    const summary = summarizeMemberships(
      [
        membership({ id: 'current', classes_remaining: 2 }),
        membership({ id: 'queued', classes_remaining: 3, created_at: '2026-08-02T00:00:00Z' }),
        membership({
          id: 'future',
          start_date: '2026-09-01',
          end_date: '2026-09-30',
          classes_remaining: 4,
        }),
      ],
      '2026-08-10',
    )

    expect(summary).toEqual({
      usableClasses: 5,
      totalOpenClasses: 9,
      openCount: 3,
      currentMembershipId: 'current',
      bookableMembershipId: 'current',
      availableClassesById: {
        current: 2,
        queued: 3,
        future: 0,
      },
      statusesById: {
        current: 'current',
        queued: 'queued',
        future: 'scheduled',
      },
    })
  })

  it('excludes consumed, expired, cancelled, historical, and date-expired rows from usable totals', () => {
    const summary = summarizeMemberships(
      [
        membership({ id: 'usable', classes_remaining: 2 }),
        membership({ id: 'zero', classes_remaining: 0 }),
        membership({ id: 'consumed', status: 'consumed', classes_remaining: 9 }),
        membership({ id: 'expired', status: 'expired', classes_remaining: 9 }),
        membership({ id: 'cancelled', status: 'cancelled', classes_remaining: 9 }),
        membership({ id: 'historical', status: 'historical', classes_remaining: 9 }),
        membership({ id: 'date-expired', end_date: '2026-08-09', classes_remaining: 9 }),
      ],
      '2026-08-10',
    )

    expect(summary.usableClasses).toBe(2)
    expect(summary.totalOpenClasses).toBe(2)
    expect(summary.openCount).toBe(1)
    expect(summary.statusesById).toEqual({
      usable: 'current',
      zero: 'consumed',
      consumed: 'consumed',
      expired: 'expired',
      cancelled: 'cancelled',
      historical: 'historical',
      'date-expired': 'expired',
    })
  })

  it.each([
    [
      'start_date',
      membership({ id: 'bad-start', start_date: '2026-02-30' }),
      'Invalid membership start_date for bad-start',
    ],
    [
      'end_date',
      membership({ id: 'bad-end', end_date: 'not-a-date' }),
      'Invalid membership end_date for bad-end',
    ],
    [
      'created_at',
      membership({ id: 'bad-created', created_at: 'not-a-timestamp' }),
      'Invalid membership created_at for bad-created',
    ],
  ])('rejects an invalid %s before summarizing', (_field, row, message) => {
    expect(() => summarizeMemberships([row], '2026-08-10')).toThrow(message)
  })

  it('does not mutate the membership array while applying FIFO order', () => {
    const memberships = [
      membership({ id: 'later', start_date: '2026-08-05' }),
      membership({ id: 'earlier', start_date: '2026-08-01' }),
    ]
    const original = structuredClone(memberships)

    summarizeMemberships(memberships, '2026-08-10')

    expect(memberships).toEqual(original)
  })
})

function membership(overrides: Partial<MembershipLike>): MembershipLike {
  return {
    id: 'membership',
    start_date: '2026-08-01',
    end_date: '2026-08-31',
    status: 'active',
    classes_remaining: 1,
    created_at: '2026-08-01T00:00:00Z',
    ...overrides,
  }
}
