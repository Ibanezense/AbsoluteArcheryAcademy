// Contenido COMPLETO y CORREGIDO para: app/page.tsx
'use client'

import { useEffect } from 'react'
import { AuthGuard } from '@/components/AuthGuard'
import Avatar from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { MembershipAlert } from '@/components/ui/MembershipAlert'
import { NextBookingWidget } from '@/components/ui/NextBookingWidget'
import { useProfile } from '@/lib/hooks/useProfile'
import { useMembershipExpiry } from '@/lib/hooks/useMembershipExpiry'
import { useBookingHistory } from '@/lib/hooks/useBookingHistory'
import { formatDateOnly } from '@/lib/utils/dateUtils'
import Link from 'next/link'
import dayjs from 'dayjs'

// Etiquetas para el grupo
const groupLabels: Record<string, string> = {
  children: 'Niños',
  youth: 'Jóvenes',
  adult: 'Adultos',
  assigned: 'Asignados',
  ownbow: 'Arco propio',
}

// Función para calcular edad
const calculateAge = (birthDate: string | null): number | null => {
  if (!birthDate) return null
  const today = dayjs()
  const birth = dayjs(birthDate)
  return today.diff(birth, 'year')
}

export default function HomePage() {
  // --- 1. CARGA DE DATOS ---
  const { profile, isLoading: isProfileLoading, error: profileError } = useProfile()
  const { daysUntilExpiry, isExpired, isExpiringSoon } = useMembershipExpiry(profile)
  const { 
    bookings: history, 
    isLoading: isHistoryLoading, 
    error: historyError,
    hasMore: hasMoreHistory, 
    loadMoreBookings 
  } = useBookingHistory()

  // Cargar primera página del historial automáticamente solo una vez
  useEffect(() => {
    if (profile && history.length === 0 && !isHistoryLoading && hasMoreHistory) {
      loadMoreBookings()
    }
  }, [profile, history.length, isHistoryLoading, hasMoreHistory, loadMoreBookings])

  // Calcular edad del perfil
  const age = profile ? calculateAge(profile.date_of_birth) : null

  // Lógica para la tarjeta inteligente de clases
  const classes = profile?.classes_remaining ?? 0
  const classesStatus: 'normal' | 'low' | 'empty' = 
    classes === 0 ? 'empty' : classes <= 2 ? 'low' : 'normal'

  // --- 2. ESTADOS DE CARGA Y ERROR ---
  if (isProfileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <Spinner />
      </div>
    )
  }

  if (profileError || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="card p-8 text-center max-w-md">
          <p className="text-danger mb-4">
            {profileError ? `Error: ${profileError.message}` : 'No se pudo cargar tu perfil'}
          </p>
          <button className="btn" onClick={() => window.location.reload()}>
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  // --- 3. RENDER DE LA PÁGINA ---

  return (
    <AuthGuard>
      <div className="min-h-screen bg-bg text-textpri">
        {/* Padding inferior para dejar espacio al menú de navegación fijo */}
        <div className="mx-auto w-full max-w-screen-2xl px-0 sm:px-4 lg:px-8 py-6 pb-24 space-y-5">
          
          {/* --- SECCIÓN 1: DATOS PERSONALES --- */}
          <div className="w-full flex flex-col sm:flex-row items-center gap-4 bg-card p-4 sm:rounded-2xl shadow-md border border-white/10">
            <div className="flex-shrink-0">
              <Avatar
                url={profile.avatar_url}
                name={profile.full_name || 'Usuario'}
                size="lg"
                className="!h-24 !w-24 !text-2xl"
              />
            </div>
            <div className="flex-1 space-y-3 text-center sm:text-left">
              <div>
                <h1 className="text-2xl font-bold text-textpri leading-tight">
                  {profile.full_name || 'Usuario'}
                </h1>
                <div className="flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-x-4 gap-y-1 mt-1">
                  {age && (
                    <p className="text-base text-textsec">
                      {age} años
                    </p>
                  )}
                  <p className="text-base text-textsec">
                    Distancia: <span className="font-semibold text-textpri">
                      {profile.distance_m ? `${profile.distance_m}m` : 'No asignada'}
                    </span>
                  </p>
                </div>
              </div>
              {/* Fila de Badges: Estado y Membresía */}
              <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                <span className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                  profile.is_active 
                    ? 'bg-success/20 text-success' 
                    : 'bg-danger/20 text-danger'
                }`}>
                  {profile.is_active ? 'Activo' : 'Inactivo'}
                </span>
                <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-info/20 text-info">
                  {profile.membership_type || 'Sin membresía'}
                </span>
              </div>
            </div>
          </div>

          {/* --- SECCIÓN 2: MEMBRESÍA Y ACCIÓN --- */}
          
          {/* Botón "Reservar" - Full bleed en móvil */}
          <div className="-mx-0 sm:mx-0">
            {classes === 0 || isExpired ? (
              <button 
                className="btn w-full text-center py-3 bg-gray-500/20 text-textsec/50 cursor-not-allowed rounded-none sm:rounded-lg"
                disabled
              >
                {isExpired ? 'Membresía vencida' : 'No tienes clases disponibles'}
              </button>
            ) : (
              <Link href="/reservar" className="btn w-full text-center block py-3 bg-accent text-white hover:bg-accent/90 transition-colors rounded-none sm:rounded-lg">
                Reservar nueva clase
              </Link>
            )}
          </div>

          {/* Alertas de membresía */}
          <MembershipAlert 
            isExpired={isExpired} 
            isExpiringSoon={isExpiringSoon} 
            daysUntilExpiry={daysUntilExpiry} 
          />

          {/* Tarjetas de Membresía y Clases */}
          <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Tarjeta de Clases (Inteligente) */}
            <div className={`w-full rounded-none sm:rounded-xl border p-4 flex items-center justify-between
              ${classesStatus === 'empty' ? 'bg-danger/10 border-danger/30' :
                classesStatus === 'low' ? 'bg-warning/10 border-warning/30' :
                'border-white/10 bg-card'}
            `}>
              <div>
                <p className={`text-sm mb-1 ${
                  classesStatus === 'empty' ? 'text-danger' :
                  classesStatus === 'low' ? 'text-warning' :
                  'text-textsec'
                }`}>
                  {classesStatus === 'empty' ? 'No tienes clases' : 'Clases disponibles'}
                </p>
                <p className={`text-4xl font-bold ${
                  classesStatus === 'empty' ? 'text-danger' :
                  classesStatus === 'low' ? 'text-warning' :
                  'text-accent'
                }`}>
                  {classes}
                </p>
              </div>
              <div className={`text-5xl ${classesStatus === 'empty' ? 'opacity-30' : 'opacity-20'}`}>
                {classesStatus === 'empty' ? '🚫' : '🎯'}
              </div>
            </div>

            {/* Tarjeta de Vigencia */}
            <div className="w-full rounded-none sm:rounded-xl border border-white/10 bg-card p-4">
              <h3 className="font-semibold text-textpri mb-2">Vigencia</h3>
              <p className="text-sm text-textsec">
                Inicio: <span className="font-medium">{formatDateOnly(profile.membership_start) || '—'}</span>
              </p>
              <p className="text-sm text-textsec">
                Vencimiento: <span className="font-medium">{formatDateOnly(profile.membership_end) || '—'}</span>
              </p>
            </div>
          </div>

          {/* --- SECCIÓN 3: PRÓXIMAS CLASES E HISTORIAL --- */}
          
          {/* Próxima Clase (Widget) */}
          <div className="w-full space-y-4">
            <h2 className="text-lg font-semibold text-textpri px-4 sm:px-0">Próximas Clases</h2>
            <NextBookingWidget />
          </div>

          {/* Historial Paginado */}
          <div className="w-full space-y-4">
            <h2 className="text-lg font-semibold text-textpri px-4 sm:px-0">Historial de Clases</h2>
            <div className="card w-full max-w-none p-4 rounded-none sm:rounded-xl2 space-y-3">
              {history.length === 0 && !isHistoryLoading && (
                <p className="text-textsec text-sm text-center py-4">No tienes historial de reservas.</p>
              )}
              {history.map(booking => (
                <div key={booking.booking_id} className="flex items-center justify-between p-3 rounded-lg bg-bg/50 border border-white/5">
                  <div>
                    <p className="font-medium text-textpri">{dayjs(booking.start_at).format('ddd, D [de] MMM, YYYY')}</p>
                    <p className="text-sm text-textsec">{dayjs(booking.start_at).format('hh:mm A')}</p>
                  </div>
                  <StatusBadge status={booking.status} />
                </div>
              ))}
              {isHistoryLoading && (
                <div className="flex justify-center py-4">
                  <Spinner />
                </div>
              )}
              {historyError && (
                <p className="text-danger text-sm text-center py-4">{historyError}</p>
              )}
              {hasMoreHistory && !isHistoryLoading && (
                <button 
                  onClick={loadMoreBookings}
                  className="btn-outline w-full"
                >
                  Cargar más
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  )
}
