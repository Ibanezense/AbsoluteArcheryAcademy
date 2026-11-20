import type { AdminStudentMembership } from '@/lib/hooks/useMembershipPlans'
import type { StudentListRow } from '@/lib/queries/studentQueries'

export function membershipAttention(students: StudentListRow[], memberships: AdminStudentMembership[], today: string) {
  const deadline = new Date(`${today}T00:00:00Z`)
  deadline.setUTCDate(deadline.getUTCDate() + 7)
  const through = deadline.toISOString().slice(0, 10)
  const byStudent = new Map<string, AdminStudentMembership[]>()
  for (const membership of memberships) {
    const id = membership.student?.id
    if (!id || membership.status !== 'active' || (membership.end_date && membership.end_date < today)) continue
    if (membership.start_date > today && membership.classes_remaining <= 0) continue
    const group = byStudent.get(id) || []
    group.push(membership)
    byStudent.set(id, group)
  }

  const groups: Record<'expiring' | 'empty' | 'oneClass', Array<{ student: StudentListRow; end: string | null; balance: number }>> = {
    expiring: [],
    empty: [],
    oneClass: [],
  }
  for (const student of students) {
    const cycles = byStudent.get(student.id) || []
    if (!cycles.some(cycle => cycle.start_date <= today)) continue
    const balance = student.total_open_classes
    const end = cycles.some(cycle => cycle.end_date === null) ? null
      : cycles.reduce((latest, cycle) => cycle.end_date && cycle.end_date > latest ? cycle.end_date : latest, '')
    const entry = { student, end, balance }
    if (end && end <= through) groups.expiring.push(entry)
    if (balance === 0) groups.empty.push(entry)
    if (balance === 1) groups.oneClass.push(entry)
  }
  groups.expiring.sort((a, b) => (a.end || '').localeCompare(b.end || '') || a.student.full_name.localeCompare(b.student.full_name, 'es'))
  return groups
}
