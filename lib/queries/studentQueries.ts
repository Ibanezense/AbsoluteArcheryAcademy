import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { Profile } from '@/lib/types'

// Query Keys
export const studentKeys = {
  all: ['students'] as const,
  list: () => [...studentKeys.all, 'list'] as const,
  detail: (id: string) => [...studentKeys.all, 'detail', id] as const,
}

/**
 * Hook para obtener lista de estudiantes (sin admins)
 */
export function useStudents() {
  return useQuery({
    queryKey: studentKeys.list(),
    queryFn: async () => {
      // Obtener IDs de admins
      const { data: admins } = await supabase
        .from('admin_users')
        .select('user_id')

      const adminSet = new Set((admins || []).map(a => a.user_id))

      // Obtener todos los perfiles
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name', { ascending: true })
        .limit(500)

      if (error) throw error

      // Filtrar admins
      const students = (data || []).filter(p => !adminSet.has(p.id))
      return students as Profile[]
    },
  })
}

/**
 * Hook para obtener detalle de un estudiante
 */
export function useStudent(id: string) {
  return useQuery({
    queryKey: studentKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error
      return data as Profile
    },
    enabled: !!id,
  })
}

/**
 * Hook para actualizar un estudiante
 */
export function useUpdateStudent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Profile> }) => {
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: studentKeys.all })
      queryClient.invalidateQueries({ queryKey: studentKeys.detail(data.id) })
    },
  })
}

/**
 * Hook para toggle activo/inactivo
 */
export function useToggleStudentActive() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: isActive })
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: studentKeys.all })
    },
  })
}
