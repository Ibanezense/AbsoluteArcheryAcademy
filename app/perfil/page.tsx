
'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import NavBar from '@/components/NavBar'

export default function PerfilPage() {
  const [profile, setProfile] = useState<any>(null)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href='/login'; return }
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(data)
    })()
  }, [])

  if (!profile) return <div className="p-5">Cargando…</div>

  return (
    <div className="flex-1 flex flex-col">
      <header className="p-5"><h1 className="text-lg font-semibold">Mi perfil</h1></header>
      <main className="px-5 space-y-4">
        <div className="card p-5 flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-gray-800 grid place-items-center">👤</div>
          <div>
            <h2 className="text-xl font-semibold">{profile.full_name || 'Alumno'}</h2>
            <p className="text-sm text-textsec">{profile.membership_type || 'Sin membresía'}</p>
          </div>
        </div>
        <div className="grid gap-3">
          <div className="card p-4"><p className="text-sm text-textsec">Clases restantes</p><p className="text-2xl font-bold">{profile.classes_remaining ?? 0}</p></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="card p-4"><p className="text-sm text-textsec">Inicio membresía</p><p className="font-medium">{profile.membership_start || '—'}</p></div>
            <div className="card p-4"><p className="text-sm text-textsec">Vencimiento</p><p className="font-medium">{profile.membership_end || '—'}</p></div>
          </div>
        </div>
      </main>
      
    </div>
  )
}
