import { operationalDate } from './adminCalendar'
import { calendarDate, calendarTime } from './introCalendar'

export type SessionSite = 'all' | 'tiabaya' | 'umacollo'
export type CapacitySession = { id: string; locationId: string | null; status: string; startAt: string; endAt: string }
type CapacityBooking = { bow_usage_type: string | null; intro_client_id: string | null }

export function sessionSite(value: string | null): SessionSite {
  return value === 'tiabaya' || value === 'umacollo' ? value : 'all'
}

export function sessionsHref(date: string, location: SessionSite, sessionId?: string) {
  const params = new URLSearchParams({ date })
  if (location !== 'all') params.set('location', location)
  if (sessionId) params.set('session', sessionId)
  return `/admin/sesiones?${params}`
}

export function sessionEditorHref(id: string, date: string, location: SessionSite) {
  return sessionsHref(date, location).replace('/admin/sesiones?', `/admin/sesiones/editar/${id}?`)
}

export function limaSessionInput(instant: string | Date) {
  const value = new Date(instant)
  return `${calendarDate(value)}T${calendarTime(value.toISOString())}`
}

export function limaSessionTime(input: string) {
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(input)) return null
  const date = input.slice(0, 10)
  if (operationalDate(date) !== date) return null
  return new Date(`${input}:00-05:00`).toISOString()
}

export function capacityForAdminSession(
  target: CapacitySession, site: Exclude<SessionSite, 'all'>,
  sessions: CapacitySession[], bookings: Map<string, CapacityBooking[]>,
) {
  const start = Date.parse(target.startAt)
  const end = Date.parse(target.endAt)
  const events: { time: number; count: number }[] = []
  let unknown = false

  for (const session of sessions) {
    if (session.locationId !== target.locationId || session.status !== 'scheduled') continue
    const from = Math.max(start, Date.parse(session.startAt))
    const to = Math.min(end, Date.parse(session.endAt))
    if (from >= to) continue
    let count = 0
    for (const booking of bookings.get(session.id) ?? []) {
      const bow = booking.bow_usage_type
      if (site === 'umacollo' || bow === 'assigned' || bow === 'shared_inventory' || (!bow && booking.intro_client_id)) count++
      else if (bow !== 'own') unknown = true
    }
    events.push({ time: from, count }, { time: to, count: -count })
  }

  let used = 0
  let max = 0
  for (const event of events.sort((a, b) => a.time - b.time || a.count - b.count)) {
    used += event.count
    max = Math.max(max, used)
  }
  const limit = site === 'umacollo' ? 4 : 6
  return { limit, free: unknown ? null : Math.max(0, limit - max) }
}
