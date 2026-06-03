import { supabase } from '@/lib/supabaseClient'

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
  allocations: AdminSessionAllocationInput[]
}

type SaveAdminSessionResult = {
  session_id: string
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
