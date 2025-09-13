'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [ok, setOk] = useState(false)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      // Eres admin si estás en admin_users
      const { data, error } = await supabase
        .from('admin_users')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle()
  if (error || !data) { console.warn('Acceso restringido a administradores'); router.replace('/'); return }
      setOk(true)
    })()
  }, [router])

  if (!ok) return <div className="p-5">Cargando…</div>
  return <>{children}</>
}
