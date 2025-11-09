import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

export type Profile = {
  id: string
  full_name: string | null
  avatar_url: string | null
  email: string | null
  phone: string | null
  membership_type: string | null
  membership_start: string | null
  membership_end: string | null
  classes_remaining: number | null
  distance_m: number | null
  group_type: string | null
  is_active: boolean
  date_of_birth: string | null
  birth_date: string | null
}

export function useProfile() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setIsLoading(true)
        setError(null)

        // Verificar sesión
        const { data: { user } } = await supabase.auth.getUser()

        // Si no hay sesión, ir a login
        if (!user) {
          router.replace('/login')
          return
        }

        // Si es admin, ir directo al dashboard
        const { data: admin } = await supabase
          .from('admin_users')
          .select('user_id')
          .eq('user_id', user.id)
          .maybeSingle()

        if (admin) {
          router.replace('/admin')
          return
        }

        // Alumno: cargar su perfil completo
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle()

        if (profileError) {
          throw new Error(profileError.message)
        }

        setProfile(profileData as Profile)
      } catch (err) {
        console.error('Error al cargar perfil:', err)
        setError(err instanceof Error ? err : new Error('Error desconocido'))
      } finally {
        setIsLoading(false)
      }
    }

    fetchProfile()
  }, [router])

  return { profile, isLoading, error }
}
