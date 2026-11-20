import { supabase } from '@/lib/supabaseClient'

const enrolled = ['active', 'paused', 'expired']

function limaDate(offset = 0) {
  const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(new Date())
  const date = new Date(day + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

export async function readDashboardPages<T>(read: (from: number, to: number) => PromiseLike<{data: T[] | null; error: unknown}>) {
  const rows: T[] = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await read(from, from + 499)
    if (error || !data) throw new Error('No se pudieron consultar los datos del panel.')
    rows.push(...data)
    if (data.length < 500) return rows
  }
}

export function localDashboardReadsEnabled() {
  return process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_ADMIN_LOCAL_READS === '1'
}

export async function readLocalBirthdays() {
  const today = limaDate().slice(5)
  const tomorrow = limaDate(1).slice(5)
  const students = await readDashboardPages((from, to) => supabase.from('students')
    .select('id,full_name,phone,date_of_birth').in('operational_status', enrolled)
    .not('date_of_birth', 'is', null).order('id').range(from, to))
  return students.flatMap(student => {
    const day = student.date_of_birth?.slice(5)
    if (day !== today && day !== tomorrow) return []
    return [{ student_id: student.id, full_name: student.full_name, phone: student.phone, day_offset: day === today ? 0 : 1 }]
  }).sort((a, b) => a.day_offset - b.day_offset || a.full_name.localeCompare(b.full_name, 'es'))
}

export async function readLocalMemberships() {
  const today = limaDate()
  const min = limaDate(-30)
  const max = limaDate(7)
  const students = await readDashboardPages((from, to) => supabase.from('students')
    .select('id,full_name,student_memberships(end_date,start_date,status)')
    .in('operational_status', enrolled)
    .in('student_memberships.status', ['active', 'expired']).order('id').range(from, to))
  return students.flatMap(student => {
    const memberships = student.student_memberships
    if (memberships.some(row => row.end_date === null || (row.status === 'active' && row.start_date > today))) return []
    const latest = memberships.map(row => row.end_date).filter(Boolean).sort().at(-1)
    if (!latest || latest < min || latest > max) return []
    return [{ student_id: student.id, full_name: student.full_name, end_date: latest, category: latest < today ? 'expired' : 'expiring' }]
  }).sort((a, b) => a.end_date.localeCompare(b.end_date) || a.full_name.localeCompare(b.full_name, 'es'))
}

export async function readLocalCapacity() {
  const now = new Date().toISOString()
  const cutoff = limaDate(7) + 'T00:00:00-05:00'
  const sessions = await readDashboardPages((from, to) => supabase.from('sessions')
    .select('id,location_id,start_at,end_at,academy_locations!inner(code,name)')
    .eq('status', 'scheduled').gt('end_at', now).lt('start_at', cutoff)
    .in('academy_locations.code', ['tiabaya', 'umacollo']).order('id').range(from, to))
  const bookings = (await Promise.all(Array.from({ length: Math.ceil(sessions.length / 100) }, (_, index) => {
    const ids = sessions.slice(index * 100, (index + 1) * 100).map(session => session.id)
    return readDashboardPages((from, to) => supabase.from('bookings').select('id,session_id,bow_usage_type,intro_client_id')
      .in('session_id', ids).in('status', ['reserved', 'attended']).order('id').range(from, to))
  }))).flat()
  return sessions.map(session => {
    const matching = new Set(sessions.filter(other => other.location_id === session.location_id &&
      Date.parse(other.start_at) < Date.parse(session.end_at) && Date.parse(other.end_at) > Date.parse(session.start_at))
      .map(other => other.id))
    const occupied = bookings.filter(booking => matching.has(booking.session_id))
    const equipment = occupied.filter(row => row.bow_usage_type === 'assigned' || row.bow_usage_type === 'shared_inventory' ||
      (row.bow_usage_type === null && row.intro_client_id !== null)).length
    const own = occupied.filter(row => row.bow_usage_type === 'own').length
    const location = session.academy_locations as unknown as { code: string; name: string }
    return { session_id: session.id, location_code: location.code, location_name: location.name,
      start_at: session.start_at, end_at: session.end_at, occupied_people: occupied.length,
      academy_bows_in_use: equipment, unknown_bow_usage: occupied.length - equipment - own }
  }).sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at) || a.location_name.localeCompare(b.location_name))
}
