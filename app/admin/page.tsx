'use client'

import { useEffect, useMemo, useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import AdminGuard from '@/components/AdminGuard'
import AdminBottomNav from '@/components/AdminBottomNav'
import AppContainer from '@/components/AppContainer'

type Session = {
  id: string
  start_at: string
  end_at: string
  status: 'scheduled' | 'cancelled'
}

type RosterLine = {
  session_id: string
  distance_m: number
  targets: number
  reserved_count: number
}

type BookingItem = {
  id: string
  session_id: string
  status: 'reserved' | 'cancelled' | 'attended' | 'no_show'
  group_type: 'children' | 'youth' | 'adult' | 'assigned' | 'ownbow'
  distance_m: number | null
  profiles: { full_name: string | null; avatar_url: string | null } | null
}

function startOfDayISO(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
  // return local midnight in ISO (properly converted to UTC)
  return x.toISOString()
}
function endOfDayISO(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
  // return local end of day in ISO (properly converted to UTC)
  return x.toISOString()
}
function hhmm(dateISO: string) {
  const d = new Date(dateISO)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
const groupLabel: Record<NonNullable<BookingItem['group_type']>, string> = {
  children: 'Niños',
  youth: 'Jóvenes',
  adult: 'Adultos',
  assigned: 'Asignados',
  ownbow: 'Arco propio',
}

export default function AdminDashboard() {
  const router = useRouter()
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState<Session[]>([])
  const [roster, setRoster] = useState<RosterLine[]>([])
  const [bookings, setBookings] = useState<BookingItem[]>([])
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  // selectedDate is stored as local YYYY-MM-DD (no timezone offsets)
  const ymdLocal = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  const [selectedDate, setSelectedDate] = useState(() => ymdLocal(new Date())) // YYYY-MM-DD local

  const parseYmdToLocalDate = (s: string) => {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, (m || 1) - 1, d || 1)
  }

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      toast.push({ message: error.message, type: 'error' })
      return
    }
    router.replace('/login')
  }

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
let bks: BookingItem[] = []
if (ids.length) {
  const { data: b, error: e3 } = await supabase
    .from('bookings')
    .select('id,session_id,status,group_type,distance_m,profiles(full_name,avatar_url)')
    .in('status', ['reserved', 'attended', 'no_show'])
    .in('session_id', ids as string[])
  if (e3) { toast.push({ message: e3.message, type: 'error' }); setLoading(false); return }

  const rows = (b ?? []) as any[]
  bks = rows.map((row) => ({
    id: row.id as string,
    session_id: row.session_id as string,
    status: row.status as BookingItem['status'],
    group_type: row.group_type as BookingItem['group_type'],
    distance_m: (row.distance_m ?? null) as number | null,
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

  // util Avatar
  const Avatar = ({ url }: { url: string | null | undefined }) => (
    <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
      {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <span className="text-xl">🏹</span>}
    </div>
  )

  return (
    <AdminGuard>
      <AppContainer title="Panel de Control">
        <div className="pb-24"> {/* espacio para la barra inferior */}
        {/* Header */}
        <div className="sticky top-0 z-10 bg-bg/80 backdrop-blur border-b border-white/10">
          <div className="max-w-screen-sm mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="relative group">
                <button className="btn-ghost px-2">☰</button>
                <div className="absolute left-0 mt-2 py-2 w-48 bg-bg border border-white/10 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                  <button 
                    className="w-full px-4 py-2 text-left hover:bg-white/5 transition-colors"
                    onClick={handleSignOut}
                  >
                    Cerrar Sesión
                  </button>
                </div>
              </div>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-sm px-2"
                aria-label="Seleccionar fecha"
              />
            </div>
            <h1 className="text-lg font-semibold">Panel de Control</h1>
            <button className="btn-ghost px-2" onClick={() => loadDate(selectedDate)}>⟳</button>
          </div>
        </div>

        <div className="max-w-screen-sm mx-auto px-4 py-4 space-y-4">
          {/* Reservas de hoy */}
          {/* Reservas para la fecha seleccionada */}
          <h2 className="text-sm font-semibold">Reservas — {parseYmdToLocalDate(selectedDate).toLocaleDateString()}</h2>

          {loading && <div className="text-textsec text-sm">Cargando…</div>}
          {!loading && bookingsOrdered.length === 0 && (
            <div className="text-textsec text-sm">No hay reservas para hoy.</div>
          )}

          <div className="space-y-3">
            {bookingsOrdered.map((b) => {
              const session = sessions.find(s => s.id === b.session_id)
              const time = session ? `${hhmm(session.start_at)} – ${hhmm(session.end_at)}` : ''
              const name = b.profiles?.full_name || 'Alumno'
              const badge = groupLabel[b.group_type] || '—'
              const dist = b.distance_m ? `${b.distance_m} m` : '—'
              const status = b.status === 'attended' ? 'Asistió' :
                            b.status === 'no_show' ? 'No asistió' :
                            b.status === 'cancelled' ? 'Cancelada' : ''
              const canMark = b.status === 'reserved'
              const updating = updatingId === b.id
              return (
                <div key={b.id} className="card p-3 flex items-center gap-3">
                  <Avatar url={b.profiles?.avatar_url} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{name}</p>
                    <p className="text-xs text-textsec truncate">
                      {time} · {badge} · {dist}
                      {status && ` · ${status}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {canMark && (
                      <>
                        <button
                          className={`btn-outline !px-3 !py-1 ${b.status === 'attended' ? 'bg-success/20 text-success' : ''}`}
                          onClick={() => markAttendance(b.id, true)}
                          disabled={updating}
                        >
                          {updating ? '...' : '✓'}
                        </button>
                        <button
                          className={`btn-outline !px-3 !py-1 ${b.status === 'no_show' ? 'bg-danger/20 text-danger' : ''}`}
                          onClick={() => markAttendance(b.id, false)}
                          disabled={updating}
                        >
                          {updating ? '...' : '✗'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Resumen del día */}
          <h2 className="text-sm font-semibold">Resumen del Día</h2>
          <div className="grid grid-cols-2 gap-3">
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

          {/* CTA gestionar */}
          <button className="w-full btn" onClick={() => router.push('/admin/sesiones')}>
            Gestionar Turnos
          </button>
        </div>
        </div>
      </AppContainer>
      <AdminBottomNav active="dashboard" />
    </AdminGuard>
  )
}
