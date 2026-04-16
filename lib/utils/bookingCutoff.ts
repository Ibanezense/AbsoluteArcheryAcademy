import dayjs from 'dayjs'
import './dateUtils'

export const BOOKING_TIMEZONE = 'America/Lima'
export const BOOKING_DAILY_CUTOFF_HOURS = 2

type BookingCutoffSession = {
  start_at: string
  status?: string | null
}

export function getBookingDayKey(date: Date | string) {
  return dayjs(date).tz(BOOKING_TIMEZONE).format('YYYY-MM-DD')
}

export function getBookingDayCutoff(firstSessionStartAt: Date | string) {
  return dayjs(firstSessionStartAt)
    .tz(BOOKING_TIMEZONE)
    .subtract(BOOKING_DAILY_CUTOFF_HOURS, 'hour')
    .format()
}

export function hasBookingDayCutoffPassed(
  cutoffAt: Date | string | null | undefined,
  now: Date | string = new Date()
) {
  if (!cutoffAt) return false

  return dayjs(now).valueOf() >= dayjs(cutoffAt).valueOf()
}

export function buildBookingCutoffByDay(sessions: BookingCutoffSession[]) {
  const firstSessionByDay = new Map<string, string>()

  for (const session of sessions) {
    if (session.status && session.status !== 'scheduled') continue

    const dayKey = getBookingDayKey(session.start_at)
    const currentFirst = firstSessionByDay.get(dayKey)

    if (!currentFirst || dayjs(session.start_at).valueOf() < dayjs(currentFirst).valueOf()) {
      firstSessionByDay.set(dayKey, session.start_at)
    }
  }

  return Object.fromEntries(
    [...firstSessionByDay.entries()].map(([dayKey, firstSessionStartAt]) => [
      dayKey,
      getBookingDayCutoff(firstSessionStartAt),
    ])
  ) as Record<string, string>
}
