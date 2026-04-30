import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabaseClient'
import { adminBookSession, adminCancelBooking } from '@/lib/services/adminBookingService'

// Tipos para las funciones de admin
export interface AdminBooking {
  booking_id: string
  status: string
  booking_created: string
  student_id: string
  student_name: string
  classes_remaining: number
  session_id: string
  start_at: string
  end_at: string
  distance: number
  capacity: number
  coach_name: string
  current_reservations: number
  admin_notes?: string | null
  group_type?: string | null
}

export interface AdminStudent {
  id: string
  full_name: string
  avatar_url?: string | null
  classes_remaining: number
  membership_type: string
  membership_start: string
  membership_end: string
  status: 'active' | 'expired' | 'no_classes' | 'no_membership' | 'inactive'
  distance_m?: number | null
  bow_poundage?: number | null
  has_own_bow?: boolean
  assigned_bow?: boolean
}

// Hook para obtener todos los estudiantes
export function useAdminStudents() {
  return useQuery({
    queryKey: ['admin-students'],
    queryFn: async () => {
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_admin_quick_booking_students')

      if (!rpcError) {
        return ((rpcData || []) as any[]).map((student) => ({
          id: student.id,
          full_name: student.full_name,
          avatar_url: student.avatar_url,
          classes_remaining: student.classes_remaining || 0,
          membership_type: student.membership_type || '',
          membership_start: student.membership_start || '',
          membership_end: student.membership_end || '',
          status: student.status || 'no_membership',
          distance_m: student.distance_m,
          bow_poundage: student.bow_poundage,
          has_own_bow: student.has_own_bow,
          assigned_bow: student.assigned_bow,
        })) as AdminStudent[]
      }

      const { data, error } = await supabase
        .from('students')
        .select(`
          id,
          full_name,
          avatar_url,
          current_distance_m,
          bow_poundage,
          has_own_bow,
          assigned_bow,
          is_active,
          student_memberships (
            custom_name,
            classes_remaining,
            start_date,
            end_date,
            status,
            created_at
          )
        `)
        .order('full_name', { ascending: true })

      if (error) throw error
      
      return (data || []).map((student: any) => {
        const memberships = [...(student.student_memberships || [])].sort((left, right) =>
          new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
        )
        const activeMembership =
          memberships.find((membership: any) => membership.status === 'active') || memberships[0] || null
        
        let status: AdminStudent['status']
        if (!student.is_active) {
          status = 'inactive'
        } else if (!activeMembership) {
          status = 'no_membership'
        } else if ((activeMembership.classes_remaining || 0) <= 0) {
          status = 'no_classes'
        } else {
          status = 'active'
        }
        
        return {
          id: student.id,
          full_name: student.full_name,
          avatar_url: student.avatar_url,
          classes_remaining: activeMembership?.classes_remaining || 0,
          membership_type: activeMembership?.custom_name || '',
          membership_start: activeMembership?.start_date || '',
          membership_end: activeMembership?.end_date || '',
          status,
          distance_m: student.current_distance_m,
          bow_poundage: student.bow_poundage,
          has_own_bow: student.has_own_bow,
          assigned_bow: student.assigned_bow,
        } as AdminStudent
      })
    },
  })
}

// Hook para obtener todas las reservas (vista de admin)
export function useAdminBookings() {
  return useQuery({
    queryKey: ['admin-bookings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id,
          status,
          created_at,
          distance_m,
          group_type,
          admin_notes,
          student_id,
          student:students!bookings_student_id_fkey(
            id,
            full_name,
            student_memberships (
              classes_remaining,
              status
            )
          ),
          session:sessions!bookings_session_id_fkey(
            id,
            start_at,
            end_at,
            coach:profiles!sessions_coach_id_fkey(full_name)
          )
        `)
        .order('created_at', { ascending: false })

      if (error) throw error

      // Recopilar los session_ids únicos para buscar capacidad y ocupación
      const sessionIds = [...new Set(
        (data || []).map((b: any) => b.session?.id).filter(Boolean)
      )]

      // Obtener capacidad total por sesión desde session_distance_allocations
      let capacityBySession: Record<string, number> = {}
      if (sessionIds.length > 0) {
        const { data: allocData } = await supabase
          .from('session_distance_allocations')
          .select('session_id, slot_capacity, targets')
          .in('session_id', sessionIds)

        allocData?.forEach((a: any) => {
          const cap = a.slot_capacity ?? (a.targets ?? 0) * 4
          capacityBySession[a.session_id] = (capacityBySession[a.session_id] || 0) + cap
        })
      }

      // Contar reservas activas por sesión
      let reservedBySession: Record<string, number> = {}
      if (sessionIds.length > 0) {
        const { data: bookingCounts } = await supabase
          .from('bookings')
          .select('session_id')
          .eq('status', 'reserved')
          .in('session_id', sessionIds)

        bookingCounts?.forEach((b: any) => {
          reservedBySession[b.session_id] = (reservedBySession[b.session_id] || 0) + 1
        })
      }

      return (data || []).map((booking: any) => {
        const activeMembership = (booking.student?.student_memberships || [])
          .find((m: any) => m.status === 'active')
        const sessionId = booking.session?.id

        return {
          booking_id: booking.id,
          status: booking.status,
          booking_created: booking.created_at,
          student_id: booking.student?.id,
          student_name: booking.student?.full_name,
          classes_remaining: activeMembership?.classes_remaining || 0,
          session_id: sessionId,
          start_at: booking.session?.start_at,
          end_at: booking.session?.end_at,
          distance: booking.distance_m,
          capacity: sessionId ? (capacityBySession[sessionId] || 0) : 0,
          coach_name: booking.session?.coach?.full_name,
          current_reservations: sessionId ? (reservedBySession[sessionId] || 0) : 0,
          admin_notes: booking.admin_notes,
          group_type: booking.group_type,
        } as AdminBooking
      })
    },
  })
}

// Hook para que admin reserve clase para un estudiante
export function useAdminBookSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ 
      sessionId, 
      studentId, 
      adminNotes,
      forceBooking,
    }: { 
      sessionId: string; 
      studentId: string; 
      adminNotes?: string 
      forceBooking?: boolean
    }) => {
      return adminBookSession(supabase as any, {
        sessionId,
        studentId,
        adminNotes,
        forceBooking,
      })
    },
    onSuccess: () => {
      // Invalidar múltiples queries para actualizar la UI
      queryClient.invalidateQueries({ queryKey: ['admin-bookings'] })
      queryClient.invalidateQueries({ queryKey: ['admin-students'] })
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      queryClient.invalidateQueries({ queryKey: ['upcoming_bookings'] })
    },
  })
}

// Hook para que admin cancele reserva de estudiante
export function useAdminCancelBooking() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (bookingId: string) => {
      return adminCancelBooking(supabase as any, bookingId)
    },
    onSuccess: () => {
      // Invalidar múltiples queries para actualizar la UI
      queryClient.invalidateQueries({ queryKey: ['admin-bookings'] })
      queryClient.invalidateQueries({ queryKey: ['admin-students'] })
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      queryClient.invalidateQueries({ queryKey: ['upcoming_bookings'] })
    },
  })
}

