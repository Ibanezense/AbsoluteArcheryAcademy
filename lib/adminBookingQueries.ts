import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabaseClient'

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
  classes_remaining: number
  membership_type: string
  membership_start: string
  membership_end: string
  status: 'active' | 'expired' | 'no_classes'
  distance_m?: number | null
  group_type?: string | null
}

// Hook para obtener todos los estudiantes
export function useAdminStudents() {
  return useQuery({
    queryKey: ['admin-students'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, classes_remaining, membership_type, membership_start, membership_end, is_active, distance_m, group_type')
        .eq('role', 'student')
        .order('full_name', { ascending: true })

      if (error) throw error
      
      // Mapear a AdminStudent con status derivado
      return (data || []).map(profile => {
        const now = new Date()
        const membershipEnd = profile.membership_end ? new Date(profile.membership_end) : null
        const isExpired = membershipEnd && membershipEnd < now
        const hasClasses = (profile.classes_remaining || 0) > 0
        
        let status: 'active' | 'expired' | 'no_classes'
        if (!profile.is_active) {
          status = 'expired'
        } else if (!hasClasses) {
          status = 'no_classes'
        } else if (isExpired) {
          status = 'expired'
        } else {
          status = 'active'
        }
        
        return {
          id: profile.id,
          full_name: profile.full_name,
          classes_remaining: profile.classes_remaining || 0,
          membership_type: profile.membership_type || '',
          membership_start: profile.membership_start || '',
          membership_end: profile.membership_end || '',
          status,
          distance_m: profile.distance_m,
          group_type: profile.group_type,
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
      // Query manual con joins para obtener toda la información
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id,
          status,
          created_at,
          distance_m,
          group_type,
          admin_notes,
          user:profiles!bookings_user_id_fkey(
            id,
            full_name,
            classes_remaining
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

      // Mapear a AdminBooking
      return (data || []).map((booking: any) => ({
        booking_id: booking.id,
        status: booking.status,
        booking_created: booking.created_at,
        student_id: booking.user?.id,
        student_name: booking.user?.full_name,
        classes_remaining: booking.user?.classes_remaining || 0,
        session_id: booking.session?.id,
        start_at: booking.session?.start_at,
        end_at: booking.session?.end_at,
        distance: booking.distance_m,
        capacity: 0, // Se puede calcular desde allocations si es necesario
        coach_name: booking.session?.coach?.full_name,
        current_reservations: 0, // Se puede calcular si es necesario
        admin_notes: booking.admin_notes,
        group_type: booking.group_type,
      })) as AdminBooking[]
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
      adminNotes 
    }: { 
      sessionId: string; 
      studentId: string; 
      adminNotes?: string 
    }) => {
      const { data, error } = await supabase.rpc('admin_book_session', {
        p_session_id: sessionId,
        p_student_id: studentId,
        p_admin_notes: adminNotes || null,
      })

      if (error) throw error
      return data
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
      const { data, error } = await supabase.rpc('admin_cancel_booking', {
        p_booking_id: bookingId,
      })

      if (error) throw error
      return data
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

// Hook para obtener sesiones disponibles con información completa
export function useAvailableSessions() {
  return useQuery({
    queryKey: ['available-sessions'],
    queryFn: async () => {
      // Obtener sesiones desde ahora hasta 14 días en el futuro
      const now = new Date()
      now.setHours(0, 0, 0, 0) // Inicio del día actual
      
      const twoWeeksFromNow = new Date(now)
      twoWeeksFromNow.setDate(now.getDate() + 14)
      twoWeeksFromNow.setHours(23, 59, 59, 999)

      // Primero obtener todas las sesiones
      const { data: sessions, error: sessionsError } = await supabase
        .from('sessions')
        .select(`
          *,
          coach:profiles!sessions_coach_id_fkey(full_name)
        `)
        .eq('status', 'scheduled')
        .gte('start_at', now.toISOString())
        .lte('start_at', twoWeeksFromNow.toISOString())
        .order('start_at', { ascending: true })

      if (sessionsError) throw sessionsError

      const sessionIds = (sessions || []).map((s: any) => s.id)
      
      // Obtener allocations por distancia para cada sesión
      let allocations: Record<string, { distance_m: number; targets: number }[]> = {}
      if (sessionIds.length > 0) {
        const { data: allocs } = await supabase
          .from('session_distance_allocations')
          .select('session_id, distance_m, targets')
          .in('session_id', sessionIds)

        allocs?.forEach((a: any) => {
          if (!allocations[a.session_id]) allocations[a.session_id] = []
          allocations[a.session_id].push({ distance_m: a.distance_m, targets: a.targets })
        })
      }

      // Contar reservas por sesión, distancia Y grupo
      let bookingCountsByDistance: Record<string, Record<number, number>> = {}
      let bookingCountsByGroup: Record<string, Record<string, number>> = {}
      
      if (sessionIds.length > 0) {
        const { data: bookings } = await supabase
          .from('bookings')
          .select('session_id, distance_m, group_type')
          .eq('status', 'reserved')
          .in('session_id', sessionIds)

        bookings?.forEach((b: any) => {
          // Contar por distancia
          if (!bookingCountsByDistance[b.session_id]) bookingCountsByDistance[b.session_id] = {}
          const dist = b.distance_m || 0
          bookingCountsByDistance[b.session_id][dist] = (bookingCountsByDistance[b.session_id][dist] || 0) + 1
          
          // Contar por grupo
          if (b.group_type) {
            if (!bookingCountsByGroup[b.session_id]) bookingCountsByGroup[b.session_id] = {}
            bookingCountsByGroup[b.session_id][b.group_type] = (bookingCountsByGroup[b.session_id][b.group_type] || 0) + 1
          }
        })
      }

      // Crear una sesión por cada distancia configurada
      const sessionsWithAvailability: any[] = []
      
      sessions?.forEach((session: any) => {
        const sessionAllocs = allocations[session.id] || []
        
        sessionAllocs.forEach((alloc) => {
          const capacityDistance = alloc.targets * 4 // 4 spots por paca
          const reservedDistance = bookingCountsByDistance[session.id]?.[alloc.distance_m] || 0
          const spotsLeftDistance = capacityDistance - reservedDistance
          
          // Solo agregar si hay cupos disponibles en esta distancia
          if (spotsLeftDistance > 0) {
            sessionsWithAvailability.push({
              id: session.id,
              start_at: session.start_at,
              end_at: session.end_at,
              distance: alloc.distance_m,
              capacity: capacityDistance,
              status: session.status,
              spots_left: spotsLeftDistance,
              instructor_name: session.coach?.full_name || null,
              // Incluir capacidades por grupo para validación en frontend
              capacity_children: session.capacity_children || 0,
              capacity_youth: session.capacity_youth || 0,
              capacity_adult: session.capacity_adult || 0,
              capacity_assigned: session.capacity_assigned || 0,
              capacity_ownbow: session.capacity_ownbow || 0,
              // Incluir reservas actuales por grupo
              reserved_children: bookingCountsByGroup[session.id]?.['children'] || 0,
              reserved_youth: bookingCountsByGroup[session.id]?.['youth'] || 0,
              reserved_adult: bookingCountsByGroup[session.id]?.['adult'] || 0,
              reserved_assigned: bookingCountsByGroup[session.id]?.['assigned'] || 0,
              reserved_ownbow: bookingCountsByGroup[session.id]?.['ownbow'] || 0,
            })
          }
        })
      })

      return sessionsWithAvailability.sort((a, b) => a.start_at.localeCompare(b.start_at))
    },
  })
}