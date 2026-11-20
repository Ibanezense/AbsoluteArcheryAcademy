import { supabase } from '@/lib/supabaseClient'
import type { CapacitySession } from '@/lib/utils/adminSessionPlanning'

export type AdminSessionStatus = 'scheduled' | 'cancelled'

export type AdminSessionAllocationInput = {
  distanceM: number
  targets: number
  slotCapacity: number
}

export type SaveAdminSessionInput = {
  sessionId: string | null
  startAt: string
  endAt: string
  status: AdminSessionStatus
  notes: string | null
  weeklyTemplateId: string | null
  isManualOverride: boolean
  locationId: string
  allocations: AdminSessionAllocationInput[]
}

type SaveAdminSessionResult = {
  session_id: string
}

type CalendarLocation = { id: string; code: string; name: string }
type RosterPerson = { full_name: string | null; avatar_url?: string | null }
export type AdminCalendarSession = CapacitySession & {
  location: CalendarLocation | null
  notes: string | null
  weekly_template_id: string | null
  is_manual_override: boolean
}

async function calendarPages<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = []
  for (let from = 0; ; from += 250) {
    const { data, error } = await read(from, from + 249)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < 250) return rows
  }
}

function related<T>(record: unknown) {
  return ((Array.isArray(record) ? record[0] : record) ?? null) as T | null
}

export async function fetchAdminSessionCalendar(start: string, end: string, signal: AbortSignal) {
  const raw = await calendarPages((from, to) => supabase.from('sessions')
    .select('id,start_at,end_at,status,notes,weekly_template_id,is_manual_override,location_id,location:academy_locations!sessions_location_id_fkey(id,code,name)')
    .gt('end_at', start).lt('start_at', end).order('start_at').order('id').range(from, to).abortSignal(signal))
  const sessions: AdminCalendarSession[] = raw.map(row => ({
    id: row.id, startAt: row.start_at, endAt: row.end_at, status: row.status,
    locationId: row.location_id, location: related<CalendarLocation>(row.location), notes: row.notes,
    weekly_template_id: row.weekly_template_id, is_manual_override: row.is_manual_override,
  }))
  if (!sessions.length) return { sessions, allocations: [], bookings: [] }

  // Bounds each URL while paging the booking and allocation rows independently.
  const chunks = Array.from({ length: Math.ceil(sessions.length / 75) }, (_, index) =>
    sessions.slice(index * 75, index * 75 + 75).map(session => session.id))
  const data = await Promise.all(chunks.map(ids => Promise.all([
    calendarPages((from, to) => supabase.from('session_distance_allocations')
      .select('session_id,distance_m,slot_capacity,targets').in('session_id', ids)
      .order('session_id').order('distance_m').range(from, to).abortSignal(signal)),
    calendarPages((from, to) => supabase.from('bookings')
      .select('id,session_id,status,distance_m,bow_usage_type,bow_poundage,intro_client_id,student:students!bookings_student_id_fkey(full_name,avatar_url),intro:intro_clients(full_name)')
      .in('session_id', ids).in('status', ['reserved', 'attended', 'no_show'])
      .order('id').range(from, to).abortSignal(signal)),
  ])))
  return {
    sessions,
    allocations: data.flatMap(([rows]) => rows),
    bookings: data.flatMap(([, rows]) => rows.map(row => ({
      ...row,
      student: related<RosterPerson>(row.student),
      intro: related<RosterPerson>(row.intro),
    }))),
  }
}

export async function saveAdminSessionWithAllocations(
  input: SaveAdminSessionInput,
): Promise<SaveAdminSessionResult> {
  const { data, error } = await supabase.rpc('admin_upsert_session_with_allocations', {
    p_session_id: input.sessionId,
    p_start_at: input.startAt,
    p_end_at: input.endAt,
    p_status: input.status,
    p_notes: input.notes,
    p_weekly_template_id: input.weeklyTemplateId,
    p_is_manual_override: input.isManualOverride,
    p_location_id: input.locationId,
    p_allocations: input.allocations.map((allocation) => ({
      distance_m: allocation.distanceM,
      targets: allocation.targets,
      slot_capacity: allocation.slotCapacity,
    })),
  })

  if (error) {
    throw new Error(error.message)
  }

  return data as SaveAdminSessionResult
}
