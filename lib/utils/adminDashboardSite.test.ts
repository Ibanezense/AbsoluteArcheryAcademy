import { expect, it } from 'vitest'
import { summarizeDashboardSite } from './adminDashboardSite'

it('counts reservations by Lima day and excludes cancelled sessions and reservations', () => {
  const result = summarizeDashboardSite(new Date('2026-11-20T01:00:00Z'), [
    { id: 'a', start_at: '2026-11-20T02:00:00Z', status: 'scheduled' },
    { id: 'b', start_at: '2026-11-20T19:00:00Z', status: 'scheduled' },
    { id: 'c', start_at: '2026-11-20T03:00:00Z', status: 'cancelled' },
  ], [
    { session_id: 'a', status: 'reserved', intro_client_id: 'intro' },
    { session_id: 'a', status: 'attended', intro_client_id: null },
    { session_id: 'a', status: 'cancelled', intro_client_id: null },
    { session_id: 'b', status: 'reserved', intro_client_id: null },
    { session_id: 'c', status: 'reserved', intro_client_id: null },
  ])
  expect(result.today).toMatchObject({ reservationsToday: 2, scheduledSessionsToday: 1, attendancePending: 1 })
  expect(result.weekly).toMatchObject({ reservations: 3, scheduledSessions: 2, pendingConfirmations: 1, attendancePending: 2 })
  expect(result.chart.map(row => row.usedSlots)).toEqual([0, 0, 0, 2, 1, 0, 0])
  expect(result.sessionIds.has('c')).toBe(true)
})
