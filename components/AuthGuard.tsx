'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { Spinner } from '@/components/ui/Spinner'
import { isLikelyNetworkError } from '@/lib/utils/networkError'

interface AuthGuardProps {
  children: React.ReactNode
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    let isActive = true

    const checkAuth = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        if (!isActive) return

        if (sessionError || !session) {
          setIsAuthenticated(false)
          setIsLoading(false)
          router.replace('/login')
          return
        }

        setIsAuthenticated(true)
        setIsLoading(false)

        try {
          const { data: { user }, error: userError } = await supabase.auth.getUser()
          if (!isActive || user) return

          if (userError && isLikelyNetworkError(userError)) return

          setIsAuthenticated(false)
          router.replace('/login')
        } catch (error) {
          if (!isActive || isLikelyNetworkError(error)) return

          console.error('Error validating auth:', error)
          setIsAuthenticated(false)
          router.replace('/login')
        }
      } catch (error) {
        if (!isActive) return

        console.error('Error reading auth session:', error)
        setIsAuthenticated(false)
        setIsLoading(false)
        router.replace('/login')
      }
    }

    checkAuth()

    // Suscribirse a cambios de autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setIsAuthenticated(false)
        router.replace('/login')
        return
      }

      if (session) {
        setIsAuthenticated(true)
        setIsLoading(false)
      }
    })

    return () => {
      isActive = false
      subscription.unsubscribe()
    }
  }, [router])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <Spinner />
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return <>{children}</>
}
