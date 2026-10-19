import { supabase } from '@/lib/supabaseClient'
import type { GrowthMembership } from '@/lib/utils/adminMembershipGrowth'

export async function fetchMembershipGrowthHistory(): Promise<GrowthMembership[]> {
  const rows: GrowthMembership[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('student_memberships')
      .select('id,student_id,start_date,end_date,status,membership_origin')
      .order('id', { ascending: true }).range(offset, offset + 499)
    if (error) throw error
    rows.push(...(data || []) as GrowthMembership[])
    if ((data || []).length < 500) return rows
  }
}
