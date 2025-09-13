 'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppContainer from '@/components/AppContainer'



export default function Home() {
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [ready, setReady] = useState(false)
  const [upcoming, setUpcoming] = useState<any[]>([])

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()

      // Si no hay sesión, ir a login
      if (!user) { router.replace('/login'); return }

      // Si es admin, ir directo al dashboard
      const { data: admin } = await supabase
        .from('admin_users')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (admin) { router.replace('/admin'); return }

      // Alumno: cargar su perfil y mostrar la página
      const { data: p, error } = await supabase
        .from('profiles')
        .select('full_name,membership_type,classes_remaining,membership_start,membership_end')
        .eq('id', user.id)
        .maybeSingle()

      if (error) console.error(error.message)
      setProfile(p)

      // Usar la vista user_booking_history y filtrar client-side las próximas
      const { data: rows, error: er } = await supabase
        .from('user_booking_history')
        .select('*')

      if (er) console.error('user_booking_history error', er.message)

      const now = Date.now()
      const next = (rows || [])
        .map((r: any) => ({ ...r, start_at: r.start_at }))
        .filter((r: any) => r.start_at && new Date(r.start_at).getTime() >= now && r.status === 'reserved')
        .sort((a: any,b: any) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())

      setUpcoming(next)

      setReady(true)
    })()
  }, [router])

  if (!ready) return null  // evita parpadeo mientras decide

  return (
    <AppContainer>
      <div className="p-5 space-y-5">
        {/* Panel de alumno */}
        <div className="card p-4">
        <h2 className="text-lg font-semibold">Hola {profile?.full_name || 'Arquero'}</h2>

        <p className="text-sm text-textsec">Tipo de membresía</p>
        <p className="font-medium">{profile?.membership_type || '—'}</p>

        <p className="text-sm text-textsec mt-2">Clases restantes</p>
        <p className="font-bold text-xl">{profile?.classes_remaining ?? 0}</p>

        <div className="flex justify-between mt-4 text-sm">
          <div>
            <p className="text-textsec">Inicio membresía</p>
            <p className="font-medium">
              {profile?.membership_start ? new Date(profile.membership_start).toLocaleDateString() : '—'}
            </p>
          </div>
          <div>
            <p className="text-textsec">Vencimiento</p>
            <p className="font-medium">
              {profile?.membership_end ? new Date(profile.membership_end).toLocaleDateString() : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Reservas próximas */}
      <div>
        <h2 className="text-sm font-semibold">Próximas reservas</h2>
        {upcoming.length === 0 ? (
          <p className="text-textsec text-sm">No tienes reservas próximas.</p>
        ) : (
          <div className="grid gap-3 mt-2">
            {upcoming.map(u => (
              <div key={u.booking_id} className="card p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{new Date(u.start_at).toLocaleDateString()} · {new Date(u.start_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</p>
                    <p className="text-sm text-textsec">{u.distance_m ? `${u.distance_m} m` : '—'}</p>
                  </div>
                  <Link className="btn-outline" href={`/reserva/${u.booking_id}`}>Ver</Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

        <Link href="/reservar" className="btn w-full">Reservar clase</Link>
      </div>
    </AppContainer>
  )
}
