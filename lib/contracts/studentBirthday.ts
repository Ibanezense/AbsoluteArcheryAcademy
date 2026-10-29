export type BirthdayCalendar = { today_lima: string; valid_for_ms: number }
export type BirthdaySnapshot = { received_at_monotonic: number; deadline_monotonic: number; request_started_at_monotonic?: number }
export type StudentBirthdayNotice = { id: string; source: 'birthday'; celebration_year: number; celebration_on: string; title: string; body: string }
export type AdminStudentBirthdayFlags = BirthdaySnapshot & { ready: boolean; calendar: BirthdayCalendar; students: Array<{ student_id: string; is_birthday_today: boolean }> }
export type BirthdayRpcClient = { rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }> }
export function validBirthdayDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value
}
export function isBirthdayCalendar(value: unknown): value is BirthdayCalendar {
  const c=value as BirthdayCalendar | null
  return !!c && validBirthdayDate(c.today_lima) && typeof c.valid_for_ms === 'number' && Number.isFinite(c.valid_for_ms) && c.valid_for_ms >= 0 && c.valid_for_ms <= 86400000
}
export function isStudentBirthdayNotice(value: unknown, calendar: BirthdayCalendar, studentId: string): value is StudentBirthdayNotice {
  const n=value as StudentBirthdayNotice | null
  return !!n && n.source === 'birthday' && Number.isInteger(n.celebration_year) && n.celebration_year === Number(calendar.today_lima.slice(0,4)) && n.celebration_on === calendar.today_lima && n.id === `birthday:${studentId}:${n.celebration_year}` && typeof n.title === 'string' && typeof n.body === 'string'
}
export function birthdayDeadline(calendar: BirthdayCalendar, requestStartedAt: number) {
  return requestStartedAt + calendar.valid_for_ms
}
