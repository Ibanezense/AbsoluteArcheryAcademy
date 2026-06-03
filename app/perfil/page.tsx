'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { getRoleRedirect } from '@/lib/security/adminAccess'

export default function PerfilPage() {
  const router = useRouter()

  useEffect(() => {
    let cancelled = false

    async function redirectToV2Surface() {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.replace('/login')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()

      if (!cancelled) {
        router.replace(getRoleRedirect(profile?.role))
      }
    }

    redirectToV2Surface()

    return () => {
      cancelled = true
    }
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-accent border-r-transparent" />
        <p className="mt-3 text-textsec">Redirigiendo a tu perfil actual...</p>
      </div>
    </div>
  )
}
