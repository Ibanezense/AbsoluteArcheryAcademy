import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import {
  emptyAdminDashboardData,
  normalizeAdminDashboardData,
  normalizeStudentSearchResults,
} from '@/lib/utils/adminDashboard'

export function useAdminDashboardData() {
  const query = useQuery({
    queryKey: ['admin-dashboard-operational'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_admin_dashboard_operational_data')
      if (error) throw error
      return normalizeAdminDashboardData(data)
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  return {
    dashboard: query.data ?? emptyAdminDashboardData,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error instanceof Error ? query.error.message : query.error ? 'Error desconocido' : null,
    refetch: query.refetch,
  }
}

export function useAdminStudentSearch(queryText: string) {
  const normalizedQuery = queryText.trim()

  return useQuery({
    queryKey: ['admin-student-search', normalizedQuery],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_search_students', {
        p_query: normalizedQuery,
        p_limit: 8,
      })
      if (error) throw error
      return normalizeStudentSearchResults(data)
    },
    enabled: normalizedQuery.length >= 2,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })
}
