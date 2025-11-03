'use client'
import Link from 'next/link'
import Avatar from '@/components/ui/Avatar'
import AppContainer from '@/components/AppContainer'
import { InfoCard } from '@/components/ui/InfoCard'
import { formatDateOnly } from '@/lib/utils/dateUtils'
import { useProfile } from '@/lib/hooks/useProfile'
import { useUpcomingBookings } from '@/lib/hooks/useUpcomingBookings'
import dayjs from 'dayjs'

const groupLabels: Record<string, string> = {
  children: 'Niños',
  youth: 'Jóvenes',
  adult: 'Adultos',
  assigned: 'Asignados',
  ownbow: 'Arco propio',
}

export default function Home() {
  const { profile, isLoading: isProfileLoading, error: profileError } = useProfile()
  const { bookings, isLoading: isBookingsLoading, error: bookingsError } = useUpcomingBookings(profile)

  // Manejo de estados de carga y error del perfil
  if (isProfileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-accent border-r-transparent mb-4"></div>
          <p className="text-textsec">Cargando perfil...</p>
        </div>
      </div>
    )
  }

  if (profileError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card p-8 text-center max-w-md">
          <p className="text-danger mb-4">Error al cargar el perfil: {profileError.message}</p>
          <button className="btn" onClick={() => window.location.reload()}>
            Reintentar
          </button>
        </div>
      </div>
    )
  }

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

  const now = dayjs()
  const expiryDate = dayjs(profile.membership_end)
  const daysUntilExpiry = profile.membership_end 
    ? expiryDate.diff(now, 'day') 
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
            {isBookingsLoading ? (
              <div className="card p-5 text-center">
                <p className="text-sm text-textsec">Cargando próximas clases...</p>
              </div>
            ) : bookingsError ? (
              <div className="card p-5 text-center">
                <p className="text-sm text-danger">Error al cargar reservas: {bookingsError.message}</p>
              </div>
            ) : bookings.length > 0 ? (
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-textsec mb-4 uppercase tracking-wide">Próximas Clases</h3>
                <div className="space-y-3">
                  {bookings.map(booking => (
                    <div key={booking.booking_id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                      <div>
                        <p className="font-medium">
                          {dayjs(booking.start_at).format('ddd, D [de] MMM')}
                        </p>
                        <p className="text-sm text-textsec">
                          {dayjs(booking.start_at).format('hh:mm A')}
                          {booking.distance_m && ` · ${booking.distance_m}m`}
                        </p>
                      </div>
                      <Link className="btn-ghost text-sm px-3 py-1.5" href={`/reserva/${booking.booking_id}`}>
                        Ver
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Grid de información */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Membresía */}
              <InfoCard title="Membresía">
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
              </InfoCard>

              {/* Configuración */}
              <InfoCard title="Configuración">
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
              </InfoCard>
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
