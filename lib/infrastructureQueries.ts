import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabaseClient'

// Tipos TypeScript
export interface Equipment {
  id: string
  name: string
  category: 'niños' | 'jovenes' | 'adultos' | 'asignados'
  total_quantity: number
  available_quantity: number
  created_at: string
  updated_at: string
}

export interface ShootingLane {
  id: string
  name: string
  distance_meters: number
  capacity: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CreateEquipmentData {
  name: string
  category: 'niños' | 'jovenes' | 'adultos' | 'asignados'
  total_quantity: number
}

export interface UpdateEquipmentData extends CreateEquipmentData {
  id: string
}

export interface CreateShootingLaneData {
  name: string
  distance_meters: number
  capacity: number
}

export interface UpdateShootingLaneData extends CreateShootingLaneData {
  id: string
}

// === EQUIPMENT QUERIES ===

export function useEquipment() {
  return useQuery({
    queryKey: ['equipment'],
    queryFn: async (): Promise<Equipment[]> => {
      const { data, error } = await supabase
        .from('equipment')
        .select('*')
        .order('created_at', { ascending: true })

      if (error) {
        throw new Error(`Error fetching equipment: ${error.message}`)
      }

      return data || []
    },
  })
}

export function useCreateEquipment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (equipmentData: CreateEquipmentData): Promise<Equipment> => {
      const { data, error } = await supabase
        .from('equipment')
        .insert([{
          name: equipmentData.name,
          category: equipmentData.category,
          total_quantity: equipmentData.total_quantity,
          available_quantity: equipmentData.total_quantity // Initially all equipment is available
        }])
        .select()
        .single()

      if (error) {
        throw new Error(`Error creating equipment: ${error.message}`)
      }

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] })
    },
  })
}

export function useUpdateEquipment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (equipmentData: UpdateEquipmentData): Promise<Equipment> => {
      const { data, error } = await supabase
        .from('equipment')
        .update({
          name: equipmentData.name,
          category: equipmentData.category,
          total_quantity: equipmentData.total_quantity,
          // Update available quantity proportionally
          available_quantity: Math.min(
            equipmentData.total_quantity,
            equipmentData.total_quantity // For now, keep it simple
          )
        })
        .eq('id', equipmentData.id)
        .select()
        .single()

      if (error) {
        throw new Error(`Error updating equipment: ${error.message}`)
      }

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] })
    },
  })
}

export function useDeleteEquipment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (equipmentId: string): Promise<void> => {
      const { error } = await supabase
        .from('equipment')
        .delete()
        .eq('id', equipmentId)

      if (error) {
        throw new Error(`Error deleting equipment: ${error.message}`)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] })
    },
  })
}

// === SHOOTING LANES QUERIES ===

export function useShootingLanes() {
  return useQuery({
    queryKey: ['shooting-lanes'],
    queryFn: async (): Promise<ShootingLane[]> => {
      const { data, error } = await supabase
        .from('shooting_lanes')
        .select('*')
        .order('distance_meters', { ascending: true })

      if (error) {
        throw new Error(`Error fetching shooting lanes: ${error.message}`)
      }

      return data || []
    },
  })
}

export function useCreateShootingLane() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (laneData: CreateShootingLaneData): Promise<ShootingLane> => {
      const { data, error } = await supabase
        .from('shooting_lanes')
        .insert([{
          name: laneData.name,
          distance_meters: laneData.distance_meters,
          capacity: laneData.capacity,
          is_active: true
        }])
        .select()
        .single()

      if (error) {
        throw new Error(`Error creating shooting lane: ${error.message}`)
      }

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shooting-lanes'] })
    },
  })
}

export function useUpdateShootingLane() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (laneData: UpdateShootingLaneData): Promise<ShootingLane> => {
      const { data, error } = await supabase
        .from('shooting_lanes')
        .update({
          name: laneData.name,
          distance_meters: laneData.distance_meters,
          capacity: laneData.capacity
        })
        .eq('id', laneData.id)
        .select()
        .single()

      if (error) {
        throw new Error(`Error updating shooting lane: ${error.message}`)
      }

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shooting-lanes'] })
    },
  })
}

export function useDeleteShootingLane() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (laneId: string): Promise<void> => {
      const { error } = await supabase
        .from('shooting_lanes')
        .delete()
        .eq('id', laneId)

      if (error) {
        throw new Error(`Error deleting shooting lane: ${error.message}`)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shooting-lanes'] })
    },
  })
}