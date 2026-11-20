import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { readDashboardPages } from '@/lib/services/adminDashboardLocalReads'
import { getLimaWeek } from '@/lib/utils/adminWeeklySummary'
import { summarizeDashboardSite, type DashboardSite } from '@/lib/utils/adminDashboardSite'

export function useDashboardSite(site: DashboardSite) {
  const week = getLimaWeek(new Date())
  return useQuery({
    queryKey: ['admin-dashboard-operational', 'site', site, week.startDate],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      let locationId: string | null = null
      if (site !== 'all') {
        const { data, error } = await supabase.from('academy_locations').select('id').eq('code', site).single()
        if (error || !data) throw new Error('No se pudo consultar la sede.')
        locationId = data.id
      }
      const [sessions, students] = await Promise.all([
        readDashboardPages((from, to) => {
          const query = supabase.from('sessions').select('id,start_at,status')
            .gte('start_at', week.startDate + 'T00:00:00-05:00')
            .lt('start_at', week.nextMonday).order('id').range(from, to)
          return locationId ? query.eq('location_id', locationId) : query
        }),
        locationId ? readDashboardPages((from, to) => supabase.from('students').select('id')
          .or(`home_location_id.eq.${locationId},both_locations.eq.true`).order('id').range(from, to)) : null,
      ])
      const bookings = (await Promise.all(Array.from({ length: Math.ceil(sessions.length / 100) }, (_, index) =>
        readDashboardPages((from, to) => supabase.from('bookings').select('session_id,status,intro_client_id')
          .in('session_id', sessions.slice(index * 100, (index + 1) * 100).map(session => session.id))
          .in('status', ['reserved', 'attended', 'no_show']).order('id').range(from, to))
      ))).flat()
      return {
        ...summarizeDashboardSite(new Date(), sessions, bookings),
        studentIds: students ? new Set(students.map(student => student.id)) : undefined,
      }
    },
  })
}
