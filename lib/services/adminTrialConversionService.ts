import { supabase } from '@/lib/supabaseClient'
import { type TrialConversionData, type TrialConversionLink, trialCivilDate } from '@/lib/utils/adminTrialConversion'

type Query = { range: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { code?: string; message: string } | null }> }
async function allPages(create: () => Query) {
  const rows: unknown[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await create().range(offset, offset + 499)
    if (error) throw error
    if (!Array.isArray(data)) throw new Error('Respuesta incompleta al consultar conversiones.')
    rows.push(...data)
    if (data.length < 500) return rows
  }
}
export async function fetchTrialConversionData(): Promise<TrialConversionData> {
  const [bookings, rawStudents, memberships] = await Promise.all([
    allPages(() => supabase.from('bookings').select('id,intro_client_id,intro_client:intro_clients!inner(id,full_name,phone),session:sessions!inner(start_at)').eq('status', 'attended').not('intro_client_id', 'is', null).order('id', { ascending: true })),
    allPages(() => supabase.from('students').select('id,full_name,dni,phone').order('id', { ascending: true })),
    allPages(() => supabase.from('student_memberships').select('id,student_id,start_date,status,membership_origin').eq('membership_origin', 'paid').not('status', 'in', '(draft,cancelled)').order('id', { ascending: true })),
  ])
  let linksAvailable = true
  let rawLinks: unknown[] = []
  try {
    rawLinks = await allPages(() => supabase.from('intro_student_conversions').select('id,intro_client_id,student_id,version,confirmed_at,confirmed_by').is('revoked_at', null).order('id', { ascending: true }))
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code !== '42P01' && code !== 'PGRST205') throw error
    linksAvailable = false
  }
  const attendees = new Map<string, TrialConversionData['attendees'][number]>()
  for (const raw of bookings) {
    const row = raw as { intro_client_id: string; intro_client: { full_name: string; phone: string | null }; session: { start_at: string } }
    if (!row.intro_client?.full_name || !row.session?.start_at) throw new Error('Hay asistencias de prueba sin información completa.')
    trialCivilDate(row.session.start_at)
    const previous = attendees.get(row.intro_client_id)
    if (!previous || row.session.start_at < previous.firstAttendedAt) attendees.set(row.intro_client_id, { introClientId: row.intro_client_id, fullName: row.intro_client.full_name, phone: row.intro_client.phone, firstAttendedAt: row.session.start_at })
  }
  const first = new Map<string, string>()
  for (const raw of memberships) {
    const row = raw as { student_id: string; start_date: string }
    trialCivilDate(row.start_date)
    if (!first.has(row.student_id) || row.start_date < first.get(row.student_id)!) first.set(row.student_id, row.start_date)
  }
  const students = rawStudents.flatMap(raw => {
    const row = raw as { id: string; full_name: string; dni: string | null; phone: string | null }
    const firstMembershipDate = first.get(row.id)
    return firstMembershipDate ? [{ id: row.id, fullName: row.full_name, dni: row.dni, phone: row.phone, firstMembershipDate }] : []
  })
  const links: TrialConversionLink[] = rawLinks.map(raw => {
    const row = raw as { id: string; intro_client_id: string; student_id: string | null; version: number; confirmed_at: string; confirmed_by: string }
    return { id: row.id, introClientId: row.intro_client_id, studentId: row.student_id, version: row.version, confirmedAt: row.confirmed_at, confirmedBy: row.confirmed_by }
  })
  return { attendees: [...attendees.values()], students, links, linksAvailable }
}
export async function confirmTrialConversion(introClientId: string, studentId: string) {
  const { data, error } = await supabase.rpc('confirm_intro_student_conversion', { p_intro_client_id: introClientId, p_student_id: studentId })
  if (error) throw error
  return data as string
}
export async function unlinkTrialConversion(conversionId: string, expectedVersion: number) {
  const { error } = await supabase.rpc('revoke_intro_student_conversion', { p_conversion_id: conversionId, p_expected_version: expectedVersion })
  if (error) throw error
}
