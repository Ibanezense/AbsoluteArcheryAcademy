'use client'

import { useEffect, useMemo, useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/lib/hooks/useAuth'
import { formatTime, toLocalYMD, parseLocalYMD, startOfDayISO, endOfDayISO } from '@/lib/utils/dateUtils'
import type { Session, BookingWithProfile, RosterLine, GroupType } from '@/lib/types'
import AdminGuard from '@/components/AdminGuard'
import AdminQuickBooking from '@/components/AdminQuickBooking'
import AdminBookingsManager from '@/components/AdminBookingsManager'
import Avatar from '@/components/ui/Avatar'

const groupLabel: Record<GroupType, string> = {
  children: 'Niños',
  youth: 'Jóvenes',
  adult: 'Adultos',
  assigned: 'Asignados',
  ownbow: 'Arco propio',
}

export default function AdminDashboard() {
  const router = useRouter()
  const toast = useToast()
  const { signOut } = useAuth()
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState<Session[]>([])
  const [roster, setRoster] = useState<RosterLine[]>([])
  const [bookings, setBookings] = useState<BookingWithProfile[]>([])
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState(() => toLocalYMD(new Date()))

  // --- Marcar asistencia/no-show ---
  const markAttendance = async (bookingId: string, attended: boolean) => {
    setUpdatingId(bookingId)
    const { error } = await supabase.rpc('admin_mark_attendance', {
      p_booking: bookingId,
      p_attended: attended,
    })
    if (error) {
      toast.push({ message: error.message, type: 'error' })
      setUpdatingId(null)
      return
    }
    await loadDate(selectedDate) // recargar estado para la fecha seleccionada
    setUpdatingId(null)
  }

  // --- Cargar datos de HOY ---
  const loadDate = async (dateStr?: string) => {
    setLoading(true)
    let d: Date
    if (dateStr) {
      const [y, m, day] = dateStr.split('-').map(Number)
      d = new Date(y, m - 1, day)
    } else {
      d = new Date()
    }
    const from = startOfDayISO(d)
    const to = endOfDayISO(d)

    // 1) Sesiones de hoy
    const { data: ses, error: e1 } = await supabase
      .from('sessions')
      .select('id,start_at,end_at,status')
      .gte('start_at', from)
      .lte('start_at', to)
      .order('start_at', { ascending: true })
  if (e1) { toast.push({ message: e1.message, type: 'error' }); setLoading(false); return }

    const ids = (ses || []).map(s => s.id)

    // 2) Capacidad / ocupación por distancia (vista)
    let ros: RosterLine[] = []
    if (ids.length) {
      const { data: r, error: e2 } = await supabase
        .from('admin_roster_by_distance')
        .select('session_id,distance_m,targets,reserved_count')
        .in('session_id', ids as string[])
  if (e2) { toast.push({ message: e2.message, type: 'error' }); setLoading(false); return }
      ros = (r || []) as RosterLine[]
    }

    // 3) Reservas del día (status=reserved) con perfil (normalizando profiles)
    let bks: BookingWithProfile[] = []
    if (ids.length) {
      const { data: b, error: e3 } = await supabase
        .from('bookings')
        .select('id,session_id,status,group_type,distance_m,created_at,user_id,profiles(full_name,avatar_url)')
        .in('status', ['reserved', 'attended', 'no_show'])
        .in('session_id', ids as string[])
      if (e3) { toast.push({ message: e3.message, type: 'error' }); setLoading(false); return }

      const rows = (b ?? []) as any[]
      bks = rows.map((row) => ({
        id: row.id as string,
        user_id: row.user_id as string,
        session_id: row.session_id as string,
        status: row.status,
        group_type: row.group_type,
        distance_m: row.distance_m ?? null,
        created_at: row.created_at,
        profiles: Array.isArray(row.profiles)
          ? (row.profiles[0] ?? null)
          : (row.profiles ?? null),
      }))
    }

    setSessions((ses || []) as Session[])
    setRoster(ros)
    setBookings(bks)
    setLoading(false)
  }

  useEffect(() => { loadDate(selectedDate) }, [selectedDate])

  // --- Derivados ---
  const totals = useMemo(() => {
    // capacidad total del día y ocupados
    const bySession = new Map<string, { cap: number; occ: number }>()
    roster.forEach(r => {
      const cap = r.targets * 4
      const occ = r.reserved_count
      if (!bySession.has(r.session_id)) bySession.set(r.session_id, { cap: 0, occ: 0 })
      const x = bySession.get(r.session_id)!
      x.cap += cap
      x.occ += occ
    })

    let dayCap = 0
    let dayOcc = 0
    let availSessions = 0
    sessions.forEach(s => {
      const x = bySession.get(s.id) || { cap: 0, occ: 0 }
      dayCap += x.cap
      dayOcc += x.occ
      if (s.status === 'scheduled' && x.occ < x.cap) availSessions += 1
    })
    const occPct = dayCap > 0 ? Math.round((dayOcc / dayCap) * 100) : 0
    return { dayCap, dayOcc, occPct, availSessions }
  }, [sessions, roster])

  // ordenar reservas por hora de sesión
  const bookingsOrdered = useMemo(() => {
    const timeMap = new Map<string, string>()
    sessions.forEach(s => timeMap.set(s.id, s.start_at))
    return [...bookings].sort((a, b) => {
      const ta = timeMap.get(a.session_id) || ''
      const tb = timeMap.get(b.session_id) || ''
      return ta.localeCompare(tb)
    })
  }, [bookings, sessions])

  return (
    <AdminGuard>
      <div className="space-y-6">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-bg/80 backdrop-blur border-b border-white/10 -mx-4 lg:-mx-8 px-4 lg:px-8">
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-sm px-2"
                aria-label="Seleccionar fecha"
              />
            </div>
            <h1 className="text-lg font-semibold">Panel de Control</h1>
            <div className="flex items-center gap-2">
              <button 
                className="btn-ghost px-3 py-1.5 text-sm"
                onClick={signOut}
                title="Cerrar Sesión"
              >
                Salir
              </button>
              <button className="btn-ghost px-2" onClick={() => loadDate(selectedDate)}>⟳</button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Reservas de hoy */}
          <div>
            <h2 className="text-sm font-semibold mb-4">Reservas — {parseLocalYMD(selectedDate).toLocaleDateString()}</h2>

            {loading && <div className="text-textsec text-sm">Cargando…</div>}
            {!loading && bookingsOrdered.length === 0 && (
              <div className="text-textsec text-sm">No hay reservas para hoy.</div>
            )}

            {/* Grid de tarjetas compactas */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {bookingsOrdered.map((b) => {
                const session = sessions.find(s => s.id === b.session_id)
                const time = session ? `${formatTime(session.start_at)} – ${formatTime(session.end_at)}` : ''
                const name = b.profiles?.full_name || 'Alumno'
                const badge = b.group_type ? groupLabel[b.group_type] : '—'
                const dist = b.distance_m ? `${b.distance_m} m` : '—'
                const status = b.status === 'attended' ? 'Asistió' :
                              b.status === 'no_show' ? 'No asistió' :
                              b.status === 'cancelled' ? 'Cancelada' : ''
                const canMark = b.status === 'reserved'
                const updating = updatingId === b.id
                
                return (
                  <div key={b.id} className="card p-3 flex flex-col items-center text-center gap-2 hover:bg-white/5 transition-colors">
                    <Avatar name={name} url={b.profiles?.avatar_url} size="md" />
                    <div className="w-full min-w-0">
                      <p className="font-medium text-sm truncate">{name}</p>
                      <p className="text-xs text-textsec truncate">{time}</p>
                      <p className="text-xs text-textsec truncate">{badge}</p>
                      {status && (
                        <span className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded ${
                          b.status === 'attended' ? 'bg-success/20 text-success' :
                          b.status === 'no_show' ? 'bg-danger/20 text-danger' :
                          'bg-textsec/20 text-textsec'
                        }`}>
                          {status}
                        </span>
                      )}
                    </div>
                    {canMark && (
                      <div className="flex gap-1 w-full">
                        <button
                          className="btn-outline !px-2 !py-1 text-xs flex-1"
                          onClick={() => markAttendance(b.id, true)}
                          disabled={updating}
                          title="Marcar asistencia"
                        >
                          {updating ? '...' : '✓'}
                        </button>
                        <button
                          className="btn-outline !px-2 !py-1 text-xs flex-1"
                          onClick={() => markAttendance(b.id, false)}
                          disabled={updating}
                          title="No asistió"
                        >
                          {updating ? '...' : '✗'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Resumen del día */}
          <div>
            <h2 className="text-sm font-semibold mb-4">Resumen del Día</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="card p-4">
                <p className="text-xs text-textsec">Ocupación</p>
                <p className="text-2xl font-bold mt-1">{totals.occPct}%</p>
                <p className="text-[11px] text-textsec mt-1">
                  {totals.dayOcc}/{totals.dayCap} plazas ocupadas
                </p>
              </div>
              <div className="card p-4">
                <p className="text-xs text-textsec">Turnos disponibles</p>
                <p className="text-2xl font-bold mt-1">{totals.availSessions}</p>
                <p className="text-[11px] text-textsec mt-1">
                  {sessions.length} turnos hoy
                </p>
              </div>
            </div>
          </div>

          {/* Reserva Rápida y Gestión en grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <AdminQuickBooking />
            <AdminBookingsManager />
          </div>

          {/* CTA gestionar */}
          <button className="w-full btn" onClick={() => router.push('/admin/sesiones')}>
            Gestionar Turnos
          </button>
        </div>
      </div>
    </AdminGuard>
  )
}
