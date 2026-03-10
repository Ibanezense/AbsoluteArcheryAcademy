import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

export type Profile = {
  id: string
  full_name: string | null
  avatar_url: string | null
  role?: 'admin' | 'guardian' | 'student'
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
    let cancelled = false

    const fetchProfile = async () => {
      try {
        setIsLoading(true)
        setError(null)

        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          if (!cancelled) setIsLoading(false)
          router.replace('/login')
          return
        }

        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle()

        if (profileError) {
          throw new Error(profileError.message)
        }

        if (profileData?.role === 'admin') {
          if (!cancelled) setIsLoading(false)
          router.replace('/admin')
          return
        }

        if (profileData?.role === 'guardian') {
          if (!cancelled) setIsLoading(false)
          router.replace('/hub')
          return
        }

        if (!cancelled) {
          setProfile((profileData as Profile | null) ?? null)
          setIsLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Error al cargar perfil:', err)
          setError(err instanceof Error ? err : new Error('Error desconocido'))
          setIsLoading(false)
        }
      }
    }

    fetchProfile()

    return () => {
      cancelled = true
    }
  }, [router])

  return { profile, isLoading, error }
}
