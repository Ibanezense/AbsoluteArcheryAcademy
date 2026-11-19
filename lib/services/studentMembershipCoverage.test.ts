import { beforeEach, expect, it, vi } from 'vitest'
import { fetchStudentMembershipCoverageEnd, fetchStudentMembershipBalance } from './studentMembershipCoverage'

const { from, query } = vi.hoisted(() => {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
    or: vi.fn().mockReturnThis(),
  }
  return { query, from: vi.fn(() => query) }
})

it('totals current and scheduled credits after deducting reservations and pending reviews per plan', async () => {
  query.in.mockResolvedValueOnce({
    error: null,
    data: [
      { start_date: '2026-10-28', classes_remaining: 8, membership_recovery_credits: [
        { id: 'used-credit', classes_remaining: 1 }, { id: 'other-credit', classes_remaining: 1 },
      ], bookings: [
        { status: 'reserved', credit_kind: 'normal' },
        { status: 'cancelled', credit_kind: 'normal', booking_cancellations: { review_status: 'pending' } },
        { status: 'cancelled', credit_kind: 'normal', booking_cancellations: { review_status: 'refunded' } },
        { status: 'reserved', credit_kind: 'recovery', recovery_credit_id: 'used-credit' },
        { status: 'reserved', credit_kind: 'recovery', recovery_credit_id: 'used-credit' },
      ] },
      { start_date: '2026-12-05', classes_remaining: 16, membership_recovery_credits: [], bookings: [
        { status: 'reserved', credit_kind: 'normal' },
      ] },
      { start_date: '2027-01-05', classes_remaining: 8, membership_recovery_credits: [], bookings: [] },
    ],
  })
  await expect(fetchStudentMembershipBalance('student', '2026-11-19')).resolves.toEqual({
    current: 7, scheduled: 23, total: 30,
  })
  expect(query.or).toHaveBeenCalledWith('end_date.is.null,end_date.gte.2026-11-19')
})
vi.mock('@/lib/supabaseClient', () => ({ supabase: { from } }))
beforeEach(() => vi.clearAllMocks())

it('reads the furthest end date across confirmed cycles, including future cycles', async () => {
  query.maybeSingle.mockResolvedValue({ data: { end_date: '2027-01-15' }, error: null })
  await expect(fetchStudentMembershipCoverageEnd('student')).resolves.toBe('2027-01-15')
  expect(from).toHaveBeenCalledWith('student_memberships')
  expect(query.eq.mock.calls).toEqual([['student_id', 'student']])
  expect(query.in).toHaveBeenCalledWith('status', ['active', 'expired', 'consumed', 'historical'])
  expect(query.order).toHaveBeenCalledWith('end_date', { ascending: false, nullsFirst: false })
  expect(query.limit).toHaveBeenCalledWith(1)
})
