'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Avatar from '@/components/ui/Avatar'
import AppContainer from '@/components/AppContainer'

type Profile = {
  id: string
  full_name: string | null
  avatar_url: string | null
  email: string | null
  membership_type: string | null
  membership_start: string | null
  membership_end: string | null
  classes_remaining: number | null
  distance_m: number | null
  group_type: string | null
  is_active: boolean
}

const groupLabels: Record<string, string> = {
  children: 'Niños',
  youth: 'Jóvenes',
  adult: 'Adultos',
  assigned: 'Asignados',
  ownbow: 'Arco propio',
}

export default function Home() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
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

      // Alumno: cargar su perfil completo
      const { data: p, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()

      if (error) console.error(error.message)
      setProfile(p as Profile)

      // Cargar próximas reservas
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

  if (!ready) return null

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card p-8 text-center max-w-md">
          <p className="text-danger mb-4">No se pudo cargar tu perfil</p>
          <button className="btn" onClick={() => window.location.reload()}>
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  const daysUntilExpiry = profile.membership_end 
    ? Math.ceil((new Date(profile.membership_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry <= 7 && daysUntilExpiry > 0
  const isExpired = daysUntilExpiry !== null && daysUntilExpiry <= 0

  return (
    <AppContainer>
      <div className="min-h-screen bg-gradient-to-b from-bg to-bg/50">
        {/* Header con avatar */}
        <div className="relative pt-20 pb-24">
          <div className="relative max-w-4xl mx-auto px-5">
            <div className="flex flex-col items-center text-center">
              <Avatar 
                name={profile.full_name || 'Usuario'} 
                url={profile.avatar_url} 
                size="lg"
              />
              <h1 className="mt-4 text-3xl font-bold">{profile.full_name || 'Arquero'}</h1>
              {profile.email && (
                <p className="mt-1 text-sm text-textsec">{profile.email}</p>
              )}
              <div className="mt-3 flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                  profile.is_active 
                    ? 'bg-success/20 text-success' 
                    : 'bg-danger/20 text-danger'
                }`}>
                  <span className={`h-2 w-2 rounded-full ${profile.is_active ? 'bg-success' : 'bg-danger'}`}></span>
                  {profile.is_active ? 'Activo' : 'Inactivo'}
                </span>
                {profile.membership_type && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-info/20 text-info">
                    {profile.membership_type}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Contenido principal */}
        <div className="max-w-4xl mx-auto px-5 -mt-12 pb-24">
          <div className="space-y-6">
            
            {/* Alertas */}
            {isExpired && (
              <div className="rounded-2xl border border-danger/30 px-5 py-4 bg-danger/10">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <p className="font-semibold text-danger">Membresía vencida</p>
                    <p className="text-sm text-textsec mt-1">
                      Tu membresía venció hace {Math.abs(daysUntilExpiry)} día{Math.abs(daysUntilExpiry) !== 1 ? 's' : ''}. 
                      Contacta al administrador para renovarla.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {isExpiringSoon && (
              <div className="rounded-2xl border border-warning/30 px-5 py-4 bg-warning/10">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">⏰</span>
                  <div>
                    <p className="font-semibold text-warning">Membresía por vencer</p>
                    <p className="text-sm text-textsec mt-1">
                      Tu membresía vence en {daysUntilExpiry} día{daysUntilExpiry !== 1 ? 's' : ''}. 
                      Considera renovarla pronto.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Clases disponibles */}
            <div className="rounded-2xl border border-white/10 px-6 py-5 flex items-center justify-between bg-transparent backdrop-blur">
              <div>
                <p className="text-sm text-textsec mb-1">Clases disponibles</p>
                <p className="text-5xl font-bold text-accent">{profile.classes_remaining ?? 0}</p>
              </div>
              <div className="text-6xl opacity-20">🎯</div>
            </div>

            {/* Próximas reservas */}
            {upcoming.length > 0 && (
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-textsec mb-4 uppercase tracking-wide">Próximas Clases</h3>
                <div className="space-y-3">
                  {upcoming.map(u => (
                    <div key={u.booking_id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                      <div>
                        <p className="font-medium">
                          {new Date(u.start_at).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </p>
                        <p className="text-sm text-textsec">
                          {new Date(u.start_at).toLocaleTimeString('es', {hour:'2-digit', minute:'2-digit'})}
                          {u.distance_m && ` · ${u.distance_m}m`}
                        </p>
                      </div>
                      <Link className="btn-ghost text-sm px-3 py-1.5" href={`/reserva/${u.booking_id}`}>
                        Ver
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Grid de información */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Membresía */}
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-textsec mb-4 uppercase tracking-wide">Membresía</h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-textsec">Inicio</p>
                    <p className="text-base font-medium mt-1">
                      {profile.membership_start 
                        ? new Date(profile.membership_start).toLocaleDateString('es', { 
                            day: 'numeric', 
                            month: 'long', 
                            year: 'numeric' 
                          })
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-textsec">Vencimiento</p>
                    <p className="text-base font-medium mt-1">
                      {profile.membership_end 
                        ? new Date(profile.membership_end).toLocaleDateString('es', { 
                            day: 'numeric', 
                            month: 'long', 
                            year: 'numeric' 
                          })
                        : '—'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Configuración */}
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-textsec mb-4 uppercase tracking-wide">Configuración</h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-textsec">Distancia de tiro</p>
                    <p className="text-base font-medium mt-1">
                      {profile.distance_m ? `📏 ${profile.distance_m} metros` : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-textsec">Grupo</p>
                    <p className="text-base font-medium mt-1">
                      {profile.group_type ? `🎯 ${groupLabels[profile.group_type] || profile.group_type}` : '—'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Botón de acción */}
            {isExpired || (profile.classes_remaining ?? 0) <= 0 ? (
              <div className="rounded-2xl border border-white/10 px-6 py-4 bg-white/5 text-center">
                <p className="text-textsec text-sm">
                  {isExpired 
                    ? '⚠️ No puedes reservar clases con membresía vencida'
                    : '⚠️ No tienes clases disponibles para reservar'}
                </p>
                <p className="text-xs text-textsec mt-1">
                  Contacta al administrador para {isExpired ? 'renovar tu membresía' : 'agregar más clases'}
                </p>
              </div>
            ) : (
              <Link href="/reservar" className="btn w-full text-center block py-4">
                Reservar nueva clase
              </Link>
            )}

          </div>
        </div>
      </div>
    </AppContainer>
  )
}
