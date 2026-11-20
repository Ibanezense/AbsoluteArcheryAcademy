import { supabase } from '@/lib/supabaseClient'
import { norm } from '@/lib/utils/searchUtils'

export async function getIntroEnrollment(introClientId: string) {
  const { data, error } = await supabase.from('intro_student_conversions')
    .select('student_id').eq('intro_client_id', introClientId).is('revoked_at', null).maybeSingle()
  if (error) throw new Error('No se pudo verificar si la prueba ya tiene un alumno vinculado.')
  return data?.student_id as string | null | undefined
}

export async function findIntroEnrollmentMatches(fullName: string, dni = '') {
  const nameKey = (name: string) => norm(name.trim()).replace(/\s+/g, ' ')
  const name = nameKey(fullName)
  const document = dni.trim()
  if (!name && !document) return []
  const matches: { id: string; full_name: string; sameDni: boolean }[] = []
  const limit = 250
  for (let offset = 0; ; offset += limit) {
    const { data, error } = await supabase.from('students')
      .select('id,full_name,dni').order('id').range(offset, offset + limit - 1)
    if (error) throw new Error('No se pudieron comprobar las coincidencias de alumnos.')
    for (const row of data) {
      const sameDni = Boolean(document && document === row.dni?.trim())
      if (sameDni || (name && nameKey(row.full_name) === name)) {
        matches.push({ id: row.id, full_name: row.full_name, sameDni })
      }
    }
    if (data.length < limit) return matches
  }
}

export async function linkAttendedIntroStudent(bookingId: string, studentId: string) {
  const { error } = await supabase.rpc('link_attended_intro_student', {
    p_booking_id: bookingId, p_student_id: studentId,
  })
  if (error) throw new Error(error.message)
}
