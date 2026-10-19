import { getLimaReferenceDate } from '@/lib/utils/weekendIntroCapacity'

export type AdminWeeklySummary = {
  startDate: string
  endDate: string
  reservations: number
  scheduledSessions: number
  availableSlots: number | null
  pendingConfirmations: number
  attendancePending: number
}

export function getLimaWeek(now: Date) {
  const civil = new Date(`${getLimaReferenceDate(now)}T12:00:00Z`)
  civil.setUTCDate(civil.getUTCDate() - (civil.getUTCDay() + 6) % 7)
  const startDate = civil.toISOString().slice(0, 10)
  civil.setUTCDate(civil.getUTCDate() + 6)
  const endDate = civil.toISOString().slice(0, 10)
  civil.setUTCDate(civil.getUTCDate() + 1)
  const nextMonday = new Date(`${civil.toISOString().slice(0, 10)}T00:00:00-05:00`).toISOString()
  return { startDate, endDate, nextMonday }
}

export function normalizeWeeklySummary(raw: unknown, expectedStart: string): AdminWeeklySummary {
  const error = () => new Error('No pudimos obtener el resumen completo de esta semana.')
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw error()
  const row = raw as Record<string, unknown>
  const expected = getLimaWeek(new Date(`${expectedStart}T12:00:00Z`))
  if (row.startDate !== expectedStart || expected.startDate !== expectedStart || row.endDate !== expected.endDate) throw error()
  const keys = ['reservations', 'scheduledSessions', 'pendingConfirmations', 'attendancePending'] as const
  for (const key of keys) {
    const value = row[key]
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw error()
  }
  if (row.availableSlots !== null && (typeof row.availableSlots !== 'number' || !Number.isSafeInteger(row.availableSlots) || row.availableSlots < 0)) throw error()
  return row as AdminWeeklySummary
}

export function formatWeeklyRange(startDate: string, endDate: string) {
  const formatter = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  return `${formatter.format(new Date(`${startDate}T12:00:00Z`))} – ${formatter.format(new Date(`${endDate}T12:00:00Z`))}`
}
