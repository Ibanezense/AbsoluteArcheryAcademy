export type GrowthMembership = {
  id: string
  student_id: string
  start_date: string
  end_date: string | null
  status: string
  membership_origin: string
}

export type MembershipGrowthMonth = {
  month: string
  newStudents: number
  notRenewed: number
  reactivated: number
  pending: number
  provisional: boolean
}

function civilDate(value: string) {
  const parsed = new Date(`${value}T12:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('El historial contiene una fecha inválida. Revisa las fechas de las membresías.')
  }
  return parsed
}

function addDays(value: string, days: number) {
  const date = civilDate(value)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function buildMembershipGrowth(memberships: GrowthMembership[], asOf: string, count = 12): MembershipGrowthMonth[] {
  const reference = civilDate(asOf)
  if (!Number.isInteger(count) || count < 1 || count > 24) throw new Error('Periodo inválido.')
  const months = Array.from({ length: count }, (_, index) => {
    const start = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() - count + index + 1, 1, 12))
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0, 12)).toISOString().slice(0, 10)
    return { month: start.toISOString().slice(0, 7), newStudents: new Set<string>(), notRenewed: new Set<string>(), reactivated: new Set<string>(), pending: new Set<string>(), provisional: asOf <= addDays(end, 7) }
  })
  const byMonth = new Map(months.map(month => [month.month, month]))
  const byStudent = new Map<string, GrowthMembership[]>()
  for (const membership of memberships) {
    if (!['paid', 'gift'].includes(membership.membership_origin)) throw new Error('Hay membresías sin origen válido; no se pudo calcular la evolución.')
    if (membership.membership_origin === 'gift' || ['draft', 'cancelled'].includes(membership.status)) continue
    if (!membership.student_id) throw new Error('Hay membresías sin alumno asociado.')
    civilDate(membership.start_date)
    if (membership.end_date !== null) {
      civilDate(membership.end_date)
      if (membership.end_date < membership.start_date) throw new Error('Una membresía vence antes de su inicio.')
    }
    const rows = byStudent.get(membership.student_id) || []
    rows.push(membership)
    byStudent.set(membership.student_id, rows)
  }
  for (const [studentId, rows] of byStudent) {
    rows.sort((a, b) => a.start_date.localeCompare(b.start_date) || a.id.localeCompare(b.id))
    if (rows[0].start_date <= asOf) byMonth.get(rows[0].start_date.slice(0, 7))?.newStudents.add(studentId)
    const episodes: Array<{ start: string; end: string | null }> = []
    for (const membership of rows) {
      const previous = episodes[episodes.length - 1]
      if (previous && (previous.end === null || membership.start_date <= addDays(previous.end, 7))) {
        if (previous.end !== null && (membership.end_date === null || membership.end_date > previous.end)) previous.end = membership.end_date
      } else {
        episodes.push({ start: membership.start_date, end: membership.end_date })
      }
    }
    episodes.forEach((episode, index) => {
      if (index > 0 && episode.start <= asOf) byMonth.get(episode.start.slice(0, 7))?.reactivated.add(studentId)
      if (episode.end === null || episode.end >= asOf) return
      const month = byMonth.get(episode.end.slice(0, 7))
      if (asOf > addDays(episode.end, 7)) month?.notRenewed.add(studentId)
      else month?.pending.add(studentId)
    })
  }
  return months.map(month => ({ month: month.month, newStudents: month.newStudents.size, notRenewed: month.notRenewed.size, reactivated: month.reactivated.size, pending: month.pending.size, provisional: month.provisional }))
}

export function buildMembershipGrowthReport(history: GrowthMembership[], asOf: string, count = 12) {
  buildMembershipGrowth([], asOf, count)
  const grouped = new Map<string, GrowthMembership[]>()
  for (const membership of history) {
    const rows = grouped.get(membership.student_id) || []
    rows.push(membership)
    grouped.set(membership.student_id, rows)
  }
  const valid: GrowthMembership[] = []
  const issues: Array<{ studentId: string; message: string }> = []
  for (const [studentId, memberships] of grouped) {
    try {
      buildMembershipGrowth(memberships, asOf, count)
      valid.push(...memberships)
    } catch (error) {
      issues.push({ studentId, message: error instanceof Error ? error.message : 'Historial no válido.' })
    }
  }
  const firstStart = valid.filter(row => row.membership_origin === 'paid' && !['draft', 'cancelled'].includes(row.status)).map(row => row.start_date).sort()[0]
  return { rows: buildMembershipGrowth(valid, asOf, count), issues, firstMonth: firstStart?.slice(0, 7) || null }
}
