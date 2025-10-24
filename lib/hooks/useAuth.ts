"use client"

import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from '@/components/ui/ToastProvider'
import type { Profile } from '@/lib/types'

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
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (!error && data) {
      setProfile(data as Profile)
    }
    setLoading(false)
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
  const isCoach = profile?.role === 'coach' || profile?.role === 'admin'

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
    checkAdmin()
  }, [])

  const checkAdmin = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      router.replace('/login')
      return
    }

    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single()

    if (data?.role !== 'admin') {
      router.replace('/')
      return
    }

    setIsAdmin(true)
    setChecking(false)
  }

  return { isAdmin, checking }
}
