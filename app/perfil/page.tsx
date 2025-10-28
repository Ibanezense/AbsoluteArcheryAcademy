
'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Avatar from '@/components/ui/Avatar'
import { formatDateOnly } from '@/lib/utils/dateUtils'

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

export default function PerfilPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { 
        window.location.href = '/login'
        return 
      }
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      
      if (error) {
        console.error('Error loading profile:', error)
      } else {
        setProfile(data as Profile)
      }
      setLoading(false)
    })()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-accent border-r-transparent"></div>
          <p className="mt-3 text-textsec">Cargando perfil...</p>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card p-8 text-center max-w-md">
          <p className="text-danger mb-4">No se pudo cargar tu perfil</p>
          <button 
            className="btn"
            onClick={() => window.location.reload()}
          >
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
            <h1 className="mt-4 text-3xl font-bold">{profile.full_name || 'Usuario'}</h1>
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
          
          {/* Alerta si está por vencer o vencido */}
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

          {/* Clases disponibles - destacado */}
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
                    {formatDateOnly(profile.membership_start) || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-textsec">Vencimiento</p>
                  <p className="text-base font-medium mt-1">
                    {formatDateOnly(profile.membership_end) || '—'}
                  </p>
                </div>
              </div>
            </div>

            {/* Configuración de práctica */}
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

          {/* Nota informativa */}
          {(!profile.distance_m || !profile.group_type) && (
            <div className="card p-4 bg-info/5 border-info/20">
              <div className="flex items-start gap-3">
                <span className="text-xl">ℹ️</span>
                <div className="flex-1">
                  <p className="text-sm text-textsec">
                    {!profile.distance_m && !profile.group_type 
                      ? 'Tu distancia de tiro y grupo aún no están configurados.'
                      : !profile.distance_m
                      ? 'Tu distancia de tiro aún no está configurada.'
                      : 'Tu grupo aún no está configurado.'}
                    {' '}Contacta al administrador para completar tu perfil y poder hacer reservas.
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
