import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { Profile } from './useProfile'

export type Booking = {
  id: string
  status: string
  distance_m: number | null
  start_at: string | null
  end_at: string | null
}

export function useStudentDetail(studentId: string) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    
    const loadData = async () => {
      try {
        setIsLoading(true)
        setError(null)
        
        // Cargar perfil del estudiante
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', studentId)
          .maybeSingle()
        
        if (!mounted) return
        
        if (profileError) {
          setError(profileError.message)
          setIsLoading(false)
          return
        }
        
        setProfile(profileData as Profile)

        // Cargar reservas del alumno (historial)
        const { data: bookingsData, error: bookingsError } = await supabase
          .from('bookings')
          .select('id,status,distance_m,sessions(start_at,end_at)')
          .eq('user_id', studentId)
          .order('created_at', { ascending: false })

        if (!mounted) return

        if (bookingsError) {
          setError(bookingsError.message)
        } else {
          setBookings((bookingsData || []).map((r: any) => ({ 
            id: r.id, 
            status: r.status, 
            start_at: r.sessions?.start_at, 
            end_at: r.sessions?.end_at, 
            distance_m: r.distance_m 
          })))
        }

        setIsLoading(false)
      } catch (err) {
        if (mounted) {
          console.error('Error loading student profile:', err)
          setError(err instanceof Error ? err.message : 'Error desconocido')
          setIsLoading(false)
        }
      }
    }

    loadData()

    return () => {
      mounted = false
    }
  }, [studentId])

  return { profile, bookings, isLoading, error }
}
