export type TrialAttendee = { introClientId: string; fullName: string; phone: string | null; firstAttendedAt: string }
export type TrialStudent = { id: string; fullName: string; dni: string | null; phone: string | null; firstMembershipDate: string }
export type TrialConversionLink = { id: string; introClientId: string; studentId: string | null; version: number; confirmedAt: string; confirmedBy: string }
export type TrialConversionData = { attendees: TrialAttendee[]; students: TrialStudent[]; links: TrialConversionLink[]; linksAvailable: boolean }
export type TrialConversionRow = TrialAttendee & { student: TrialStudent | null; link: TrialConversionLink | null }

function civilDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Fecha de conversión inválida.')
  return value
}
export function trialCivilDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return civilDate(value)
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) throw new Error('Fecha de asistencia inválida.')
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}
export function normalizeTrialSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}
export function matchesPersonSearch(value: string, search: string) {
  return normalizeTrialSearch(search).split(/\s+/).filter(Boolean).every(token => normalizeTrialSearch(value).includes(token))
}
export function buildTrialConversionReport(data: TrialConversionData, options: { fromDate: string; toDate: string; asOf: string; search?: string }) {
  const { fromDate, toDate, asOf } = options
  for (const date of [fromDate, toDate, asOf]) civilDate(date)
  if (fromDate > toDate) throw new Error('El inicio del periodo debe preceder a su final.')
  const students = new Map(data.students.map(student => [student.id, student]))
  const links = new Map(data.links.map(link => [link.introClientId, link]))
  const unique = new Map<string, TrialAttendee>()
  for (const attendee of data.attendees) {
    const previous = unique.get(attendee.introClientId)
    if (!previous || attendee.firstAttendedAt < previous.firstAttendedAt) unique.set(attendee.introClientId, attendee)
  }
  const allRows: TrialConversionRow[] = []
  for (const attendee of unique.values()) {
    const day = trialCivilDate(attendee.firstAttendedAt)
    if (day < fromDate || day > toDate || day > asOf) continue
    const link = data.linksAvailable ? links.get(attendee.introClientId) ?? null : null
    const candidate = link?.studentId ? students.get(link.studentId) : null
    const student = candidate && civilDate(candidate.firstMembershipDate) >= day && candidate.firstMembershipDate <= asOf ? candidate : null
    allRows.push({ ...attendee, link, student })
  }
  allRows.sort((a, b) => b.firstAttendedAt.localeCompare(a.firstAttendedAt) || a.introClientId.localeCompare(b.introClientId))
  const converted = data.linksAvailable ? allRows.filter(row => row.student !== null).length : null
  const tokens = normalizeTrialSearch(options.search ?? '').split(/\s+/).filter(Boolean)
  const rows = allRows.filter(row => tokens.every(token => normalizeTrialSearch(`${row.fullName} ${row.student?.fullName ?? ''}`).includes(token)))
  return { rows, attended: allRows.length, converted, conversionRate: converted !== null && allRows.length ? converted / allRows.length * 100 : null, linksAvailable: data.linksAvailable }
}
