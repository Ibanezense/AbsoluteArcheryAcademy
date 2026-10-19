import { supabase } from '@/lib/supabaseClient'
import { normalizeWeeklySummary } from '@/lib/utils/adminWeeklySummary'

export async function fetchAdminWeeklySummary(expectedStart: string) {
  const { data, error } = await supabase.rpc('admin_get_weekly_dashboard_summary')
  if (error) throw error
  return normalizeWeeklySummary(data, expectedStart)
}
