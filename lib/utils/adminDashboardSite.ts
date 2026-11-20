import { getLimaWeek } from './adminWeeklySummary'
import { getLimaReferenceDate } from './weekendIntroCapacity'

export type DashboardSite = 'all' | 'tiabaya' | 'umacollo'
export const dashboardSiteLabels = { all: 'Todas las sedes', tiabaya: 'Tiabaya', umacollo: 'Umacollo' } as const

type Session = { id: string; start_at: string; status: string }
type Booking = { session_id: string; status: string; intro_client_id: string | null }

export function summarizeDashboardSite(now: Date, sessions: Session[], bookings: Booking[]) {
  const today = getLimaReferenceDate(now)
  const week = getLimaWeek(now)
  const sessionIds = new Set(sessions.map(session => session.id))
  const dates = new Map(sessions.filter(session => session.status !== 'cancelled')
    .map(session => [session.id, getLimaReferenceDate(new Date(session.start_at))]))
  const counts = new Map<string, number>()
  let reservations = 0
  let pendingConfirmations = 0
  let attendancePending = 0
  let todayPending = 0
  let todayTrialPending = 0
  for (const booking of bookings) {
    const date = dates.get(booking.session_id)
    if (!date || !['reserved', 'attended', 'no_show'].includes(booking.status)) continue
    counts.set(date, (counts.get(date) ?? 0) + 1)
    reservations++
    if (booking.status !== 'reserved') continue
    attendancePending++
    if (booking.intro_client_id) pendingConfirmations++
    if (date === today) {
      todayPending++
      if (booking.intro_client_id) todayTrialPending++
    }
  }
  const scheduled = sessions.filter(session => session.status === 'scheduled')
  const chart = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((day, index) => {
    const date = new Date(week.startDate + 'T12:00:00Z')
    date.setUTCDate(date.getUTCDate() + index)
    return { day, usedSlots: counts.get(date.toISOString().slice(0, 10)) ?? 0 }
  })
  return {
    sessionIds,
    chart,
    today: {
      reservationsToday: counts.get(today) ?? 0,
      scheduledSessionsToday: scheduled.filter(session => dates.get(session.id) === today).length,
      availableSlotsToday: null,
      pendingConfirmations: todayTrialPending,
      attendancePending: todayPending,
    },
    weekly: {
      startDate: week.startDate, endDate: week.endDate, reservations,
      scheduledSessions: scheduled.length, availableSlots: null, pendingConfirmations, attendancePending,
    },
  }
}
