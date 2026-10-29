import {
  birthdayDeadline, isBirthdayCalendar, validBirthdayDate,
  type BirthdayRpcClient, type StudentBirthdayNotice, type AdminStudentBirthdayFlags,
} from '@/lib/contracts/studentBirthday'

async function birthdayRpc(client: BirthdayRpcClient, name: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(name, args)
  if (error) {
    throw Object.assign(new Error(error.message || 'No se pudo consultar el cumpleaños.'), { code: error.code })
  }
  return data
}

export async function prepareStudentBirthdayDay(client: BirthdayRpcClient, studentId: string | null = null) {
  const data = await birthdayRpc(client, 'prepare_student_birthday_day', { p_student_id: studentId }) as { ready: boolean; today_lima: string } | null
  if (!data || typeof data.ready !== 'boolean' || !validBirthdayDate(data.today_lima)) {
    throw new Error('La comprobación diaria no está disponible.')
  }
  return data
}

export async function dismissStudentBirthday(client: BirthdayRpcClient, studentId: string, notice: StudentBirthdayNotice) {
  const data = await birthdayRpc(client, 'dismiss_student_birthday', {
    p_student_id: studentId,
    p_celebration_year: notice.celebration_year,
    p_celebration_on: notice.celebration_on,
  }) as { success: boolean; already_closed: boolean; celebration_year: number } | null
  if (!data || data.success !== true || typeof data.already_closed !== 'boolean' || data.celebration_year !== notice.celebration_year) {
    throw new Error('No se pudo confirmar el cierre del saludo.')
  }
  return data
}

export async function getAdminStudentBirthdayFlags(client: BirthdayRpcClient, studentIds: readonly string[]): Promise<AdminStudentBirthdayFlags> {
  const ids = [...new Set(studentIds)].sort()
  const batches = Array.from({ length: Math.max(1, Math.ceil(ids.length / 500)) }, (_, index) => ids.slice(index * 500, (index + 1) * 500))
  let merged: AdminStudentBirthdayFlags | undefined

  for (const batch of batches) {
    const start = performance.now()
    const data = await birthdayRpc(client, 'get_admin_student_birthday_flags', { p_student_ids: batch }) as Record<string, unknown> | null
    if (!data || typeof data.ready !== 'boolean' || !isBirthdayCalendar(data.calendar) || !Array.isArray(data.students)) {
      throw new Error('No se pudo leer el resultado diario de cumpleaños.')
    }
    const expected = new Set(batch)
    const students = data.students.filter((row): row is { student_id: string; is_birthday_today: boolean } =>
      !!row && typeof row === 'object'
      && typeof row.student_id === 'string' && typeof row.is_birthday_today === 'boolean'
      && expected.has(row.student_id),
    )
    // A malformed/omitted row is unavailable, never an invented false flag.
    if (merged && merged.calendar.today_lima !== data.calendar.today_lima) {
      throw new Error('El día cambió durante la consulta. Vuelve a consultar.')
    }
    const deadline = birthdayDeadline(data.calendar, start)
    if (!merged) {
      merged = {
        ready: data.ready,
        calendar: data.calendar,
        students: [],
        received_at_monotonic: performance.now(),
        deadline_monotonic: deadline,
        request_started_at_monotonic: start,
      }
    }
    merged.ready = merged.ready && data.ready
    merged.deadline_monotonic = Math.min(merged.deadline_monotonic, deadline)
    const byId = new Map(merged.students.map(row => [row.student_id, row]))
    for (const row of students) byId.set(row.student_id, row)
    merged.students = [...byId.values()]
  }
  return { ...merged!, received_at_monotonic: performance.now() }
}
