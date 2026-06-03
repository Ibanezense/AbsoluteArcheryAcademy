"use client"

import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from '@/components/ui/ToastProvider'
import type { Profile } from '@/lib/types'
import { getAdminAccessDecision } from '@/lib/security/adminAccess'

export function useAuth() {
  const router = useRouter()
  const toast = useToast()
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        loadProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        loadProfile(session.user.id)
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const loadProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (error) {
        setProfile(null)
        return
      }

      setProfile((data as Profile | null) ?? null)
    } finally {
      setLoading(false)
    }
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      toast.push({ message: error.message, type: 'error' })
      return false
    }
    router.replace('/login')
    return true
  }

  const isAdmin = profile?.role === 'admin'
  const isCoach = profile?.role === 'admin'

  return {
    user,
    profile,
    loading,
    signOut,
    isAdmin,
    isCoach,
    isAuthenticated: !!user
  }
}

/**
 * Hook específico para verificar acceso de admin
 */
export function useRequireAdmin() {
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let cancelled = false

    const checkAdmin = async () => {
      try {
        setChecking(true)

        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        if (sessionError || !session?.user) {
          if (!cancelled) {
            setIsAdmin(false)
            setChecking(false)
          }
          router.replace('/login')
          return
        }

        const { data, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .maybeSingle()

        if (error || !data) {
          if (!cancelled) {
            setIsAdmin(false)
            setChecking(false)
          }
          router.replace('/login')
          return
        }

        const decision = getAdminAccessDecision({
          authenticated: true,
          role: data.role as Profile['role'],
        })

        if (!decision.allowed) {
          if (!cancelled) {
            setIsAdmin(false)
            setChecking(false)
          }
          router.replace(decision.redirectTo || '/')
          return
        }

        if (!cancelled) {
          setIsAdmin(true)
          setChecking(false)
        }
      } catch {
        if (!cancelled) {
          setIsAdmin(false)
          setChecking(false)
        }
        router.replace('/login')
      }
    }

    checkAdmin()

    return () => {
      cancelled = true
    }
  }, [router])

  return { isAdmin, checking }
}
