import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabaseClient'

export interface BowInventoryItem {
  id: string
  draw_weight_lbs: number
  quantity_total: number
  quantity_active: number
  notes: string | null
  created_at: string
  updated_at: string
}

export interface WeeklyTemplateDistance {
  id?: string
  distance_m: number
  slot_capacity: number
  targets?: number
}

export interface WeeklySessionTemplate {
  id: string
  label: string
  weekday: number
  start_time: string
  end_time: string
  is_active: boolean
  created_at: string
  updated_at: string
  distances: WeeklyTemplateDistance[]
}

export interface CreateBowInventoryData {
  draw_weight_lbs: number
  quantity_total: number
  quantity_active: number
  notes?: string | null
}

export interface UpdateBowInventoryData extends CreateBowInventoryData {
  id: string
}

export interface UpsertWeeklyTemplateData {
  label: string
  weekday: number
  start_time: string
  end_time: string
  is_active: boolean
  distances: WeeklyTemplateDistance[]
}

export interface UpdateWeeklyTemplateData extends UpsertWeeklyTemplateData {
  id: string
}

export interface GenerateWeeklySessionsData {
  weekStart: string
  weeks: number
}

export function useBowInventory() {
  return useQuery({
    queryKey: ['bow-inventory'],
    queryFn: async (): Promise<BowInventoryItem[]> => {
      const { data, error } = await supabase
        .from('bow_inventory')
        .select('*')
        .order('draw_weight_lbs', { ascending: true })

      if (error) {
        throw new Error(`Error fetching bow inventory: ${error.message}`)
      }

      return (data || []) as BowInventoryItem[]
    },
  })
}

export function useCreateBowInventory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: CreateBowInventoryData): Promise<BowInventoryItem> => {
      const { data, error } = await supabase
        .from('bow_inventory')
        .insert({
          draw_weight_lbs: payload.draw_weight_lbs,
          quantity_total: payload.quantity_total,
          quantity_active: payload.quantity_active,
          notes: payload.notes || null,
        })
        .select()
        .single()

      if (error) {
        throw new Error(`Error creating bow inventory: ${error.message}`)
      }

      return data as BowInventoryItem
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bow-inventory'] })
    },
  })
}

export function useUpdateBowInventory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: UpdateBowInventoryData): Promise<BowInventoryItem> => {
      const { data, error } = await supabase
        .from('bow_inventory')
        .update({
          draw_weight_lbs: payload.draw_weight_lbs,
          quantity_total: payload.quantity_total,
          quantity_active: payload.quantity_active,
          notes: payload.notes || null,
        })
        .eq('id', payload.id)
        .select()
        .single()

      if (error) {
        throw new Error(`Error updating bow inventory: ${error.message}`)
      }

      return data as BowInventoryItem
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bow-inventory'] })
    },
  })
}

export function useDeleteBowInventory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('bow_inventory')
        .delete()
        .eq('id', id)

      if (error) {
        throw new Error(`Error deleting bow inventory: ${error.message}`)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bow-inventory'] })
    },
  })
}

export function useWeeklySessionTemplates() {
  return useQuery({
    queryKey: ['weekly-session-templates'],
    queryFn: async (): Promise<WeeklySessionTemplate[]> => {
      const { data, error } = await supabase
        .from('weekly_session_templates')
        .select(`
          id,
          label,
          weekday,
          start_time,
          end_time,
          is_active,
          created_at,
          updated_at,
          distances:weekly_session_template_distances (
            id,
            distance_m,
            slot_capacity,
            targets
          )
        `)

      if (error) {
        throw new Error(`Error fetching weekly templates: ${error.message}`)
      }

      return ((data || []) as WeeklySessionTemplate[])
        .map((template) => ({
          ...template,
          distances: [...(template.distances || [])].sort((a, b) => a.distance_m - b.distance_m),
        }))
        .sort((a, b) => {
          if (a.weekday !== b.weekday) return a.weekday - b.weekday
          return a.start_time.localeCompare(b.start_time)
        })
    },
  })
}

async function saveTemplateDistances(templateId: string, distances: WeeklyTemplateDistance[]) {
  const normalized = distances
    .filter((distance) => distance.slot_capacity > 0)
    .map((distance) => ({
      weekly_template_id: templateId,
      distance_m: distance.distance_m,
      slot_capacity: distance.slot_capacity,
      targets: distance.targets || Math.ceil(distance.slot_capacity / 4),
    }))

  const { error: deleteError } = await supabase
    .from('weekly_session_template_distances')
    .delete()
    .eq('weekly_template_id', templateId)

  if (deleteError) {
    throw new Error(`Error resetting template distances: ${deleteError.message}`)
  }

  if (!normalized.length) {
    return
  }

  const { error: insertError } = await supabase
    .from('weekly_session_template_distances')
    .insert(normalized)

  if (insertError) {
    throw new Error(`Error saving template distances: ${insertError.message}`)
  }
}

export function useCreateWeeklySessionTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: UpsertWeeklyTemplateData): Promise<WeeklySessionTemplate> => {
      const { data, error } = await supabase
        .from('weekly_session_templates')
        .insert({
          label: payload.label,
          weekday: payload.weekday,
          start_time: payload.start_time,
          end_time: payload.end_time,
          is_active: payload.is_active,
        })
        .select()
        .single()

      if (error) {
        throw new Error(`Error creating weekly template: ${error.message}`)
      }

      await saveTemplateDistances(data.id, payload.distances)

      return {
        ...(data as Omit<WeeklySessionTemplate, 'distances'>),
        distances: payload.distances.filter((distance) => distance.slot_capacity > 0),
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weekly-session-templates'] })
    },
  })
}

export function useUpdateWeeklySessionTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: UpdateWeeklyTemplateData): Promise<WeeklySessionTemplate> => {
      const { data, error } = await supabase
        .from('weekly_session_templates')
        .update({
          label: payload.label,
          weekday: payload.weekday,
          start_time: payload.start_time,
          end_time: payload.end_time,
          is_active: payload.is_active,
        })
        .eq('id', payload.id)
        .select()
        .single()

      if (error) {
        throw new Error(`Error updating weekly template: ${error.message}`)
      }

      await saveTemplateDistances(payload.id, payload.distances)

      return {
        ...(data as Omit<WeeklySessionTemplate, 'distances'>),
        distances: payload.distances.filter((distance) => distance.slot_capacity > 0),
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weekly-session-templates'] })
    },
  })
}

export function useDeleteWeeklySessionTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('weekly_session_templates')
        .delete()
        .eq('id', id)

      if (error) {
        throw new Error(`Error deleting weekly template: ${error.message}`)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weekly-session-templates'] })
    },
  })
}

export function useGenerateWeeklySessions() {
  return useMutation({
    mutationFn: async (payload: GenerateWeeklySessionsData): Promise<number> => {
      const { data, error } = await supabase.rpc('admin_generate_sessions_from_templates', {
        p_week_start: payload.weekStart,
        p_weeks: payload.weeks,
      })

      if (error) {
        throw new Error(`Error generating sessions: ${error.message}`)
      }

      return Number(data || 0)
    },
  })
}
