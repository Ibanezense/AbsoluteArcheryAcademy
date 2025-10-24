'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import AdminGuard from '@/components/AdminGuard'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import Avatar from '@/components/ui/Avatar'

type Profile = {
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
}

type Booking = {
  id: string
  status: string
  distance_m: number | null
  start_at: string | null
  end_at: string | null
}

const groupLabels: Record<string, string> = {
  children: 'Niños',
  youth: 'Jóvenes',
  adult: 'Adultos',
  assigned: 'Asignados',
  ownbow: 'Arco propio',
}

export default function StudentProfile({ params }: { params: { id: string } }) {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [reservas, setReservas] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const id = params.id

  useEffect(() => {
    let mounted = true
    
    const loadData = async () => {
      try {
        setLoading(true)
        
        const { data: p, error: e1 } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', id)
          .maybeSingle()
        
        if (!mounted) return
        
        if (e1) { 
          toast.push({ message: e1.message, type: 'error' })
          setLoading(false)
          return 
        }
        
        setProfile(p as Profile)

        // reservas del alumno (historial)
        const { data: b, error: e2 } = await supabase
          .from('bookings')
          .select('id,status,distance_m,sessions(start_at,end_at)')
          .eq('user_id', id)
          .order('created_at', { ascending: false })

        if (!mounted) return

        if (e2) { 
          toast.push({ message: e2.message, type: 'error' })
        } else {
          setReservas((b || []).map((r: any) => ({ 
            id: r.id, 
            status: r.status, 
            start_at: r.sessions?.start_at, 
            end_at: r.sessions?.end_at, 
            distance_m: r.distance_m 
          })))
        }

        setLoading(false)
      } catch (err) {
        if (mounted) {
          console.error('Error loading student profile:', err)
          setLoading(false)
        }
      }
    }

    loadData()

    return () => {
      mounted = false
    }
  }, [id])

  if (loading) {
    return (
      <AdminGuard>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-accent border-r-transparent"></div>
            <p className="mt-3 text-textsec">Cargando perfil...</p>
          </div>
        </div>
      </AdminGuard>
    )
  }

  if (!profile) {
    return (
      <AdminGuard>
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="card p-8 text-center max-w-md">
            <p className="text-danger mb-4">Perfil no encontrado</p>
            <button className="btn" onClick={() => router.back()}>
              Volver
            </button>
          </div>
        </div>
      </AdminGuard>
    )
  }

  const daysUntilExpiry = profile.membership_end 
    ? Math.ceil((new Date(profile.membership_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry <= 7 && daysUntilExpiry > 0
  const isExpired = daysUntilExpiry !== null && daysUntilExpiry <= 0

  const statusBadge = (status: string) => {
    const styles = {
      attended: 'bg-success/20 text-success',
      no_show: 'bg-danger/20 text-danger',
      cancelled: 'bg-textsec/20 text-textsec',
      reserved: 'bg-warning/20 text-warning',
    }
    const labels = {
      attended: 'Asistió',
      no_show: 'No asistió',
      cancelled: 'Cancelada',
      reserved: 'Reservada',
    }
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[status as keyof typeof styles] || styles.reserved}`}>
        {labels[status as keyof typeof labels] || 'Reservada'}
      </span>
    )
  }

  return (
    <AdminGuard>
      <div className="min-h-screen bg-gradient-to-b from-bg to-bg/50">
        {/* Header sticky */}
        <div className="sticky top-0 z-10 bg-bg/95 backdrop-blur border-b border-white/10">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
            <button 
              onClick={() => router.back()} 
              className="btn-ghost !px-3"
              aria-label="Volver"
            >
              ←
            </button>
            <h1 className="flex-1 text-center font-semibold">Perfil del Estudiante</h1>
            <Link 
              href={`/admin/alumnos/editar/${id}`} 
              className="btn-ghost !px-3"
              title="Editar perfil"
            >
              ✏️
            </Link>
          </div>
        </div>

        {/* Header con avatar */}
        <div className="relative pt-16 pb-20">
          <div className="relative max-w-4xl mx-auto px-4">
            <div className="flex flex-col items-center text-center">
              <Avatar 
                name={profile.full_name || 'Usuario'} 
                url={profile.avatar_url} 
                size="lg"
              />
              <h2 className="mt-4 text-2xl font-bold">{profile.full_name || 'Usuario'}</h2>
              {profile.email && (
                <p className="mt-1 text-sm text-textsec">{profile.email}</p>
              )}
              {profile.phone && (
                <p className="text-sm text-textsec">{profile.phone}</p>
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
        <div className="max-w-4xl mx-auto px-4 -mt-8 pb-24">
          <div className="space-y-6">
            
            {/* Alertas */}
            {isExpired && (
              <div className="rounded-2xl border border-danger/30 px-5 py-4 bg-danger/10">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <p className="font-semibold text-danger">Membresía vencida</p>
                    <p className="text-sm text-textsec mt-1">
                      La membresía venció hace {Math.abs(daysUntilExpiry)} día{Math.abs(daysUntilExpiry) !== 1 ? 's' : ''}.
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
                      La membresía vence en {daysUntilExpiry} día{daysUntilExpiry !== 1 ? 's' : ''}.
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

            {/* Nota si falta configuración */}
            {(!profile.distance_m || !profile.group_type) && (
              <div className="card p-4 bg-warning/5 border-warning/20">
                <div className="flex items-start gap-3">
                  <span className="text-xl">⚠️</span>
                  <div className="flex-1">
                    <p className="text-sm text-textsec">
                      {!profile.distance_m && !profile.group_type 
                        ? 'La distancia de tiro y grupo aún no están configurados.'
                        : !profile.distance_m
                        ? 'La distancia de tiro aún no está configurada.'
                        : 'El grupo aún no está configurado.'}
                      {' '}Este estudiante no podrá hacer reservas hasta completar su perfil.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Historial de reservas */}
            <div className="card p-5">
              <h3 className="text-lg font-semibold mb-4">Historial de Reservas</h3>
              {reservas.length === 0 ? (
                <p className="text-sm text-textsec text-center py-8">No tiene reservas registradas</p>
              ) : (
                <div className="space-y-3">
                  {reservas.map(r => (
                    <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-bg/50 border border-white/5">
                      <div className="flex-1">
                        <div className="font-medium">
                          {r.start_at 
                            ? new Date(r.start_at).toLocaleDateString('es', { 
                                weekday: 'short', 
                                day: 'numeric', 
                                month: 'short' 
                              })
                            : '—'}
                        </div>
                        <div className="text-sm text-textsec">
                          {r.start_at 
                            ? new Date(r.start_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})
                            : '—'}
                          {r.distance_m && ` • ${r.distance_m}m`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {statusBadge(r.status)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </AdminGuard>
  )
}
