"use client"

import React, { useEffect, useMemo, useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import dayjs from 'dayjs'

import AdminGuard from '@/components/AdminGuard'

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

class PageErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log detallado para diagnosticar bloqueos de eventos/hidratación
    console.error('⚠️ AdminSessions error boundary capturó un error', { error, info })
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-4">
          <div className="card p-4 border border-danger/30 bg-danger/10 text-danger">
            <h2 className="font-semibold mb-1">Se produjo un error en Turnos</h2>
            <p className="text-sm opacity-90">Intenta recargar la página. Si persiste, comparte la consola con el error.</p>
            <button className="btn mt-3" onClick={() => (location.href = '/admin/sesiones')}>Recargar</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function AdminSessionsCalendar() {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  
  console.log('🚀 AdminSessionsCalendar renderizado, router:', !!router, 'toast:', !!toast, 'confirm:', !!confirm)
  
  // Inicializar con el lunes de la semana actual usando dayjs
  const today = dayjs()
  const mondayOfCurrentWeek = today.startOf('week').add(1, 'day') // startOf('week') es domingo, +1 día = lunes
  const [year, setYear] = useState<number>(mondayOfCurrentWeek.year())
  const [month, setMonth] = useState<number>(mondayOfCurrentWeek.month())
  const [selectedYMD, setSelectedYMD] = useState<string>(mondayOfCurrentWeek.format('YYYY-MM-DD'))

  // data del mes y del día
  const [monthSessions, setMonthSessions] = useState<Session[]>([])
  const [weekRoster, setWeekRoster] = useState<Record<string, RosterLine[]>>({})

  // UI menus
  const [openMonthMenu, setOpenMonthMenu] = useState(false)
  const [openCardMenu, setOpenCardMenu] = useState<string | null>(null)
  
  // Modal roster
  const [rosterModalOpen, setRosterModalOpen] = useState(false)
  const [rosterModalSession, setRosterModalSession] = useState<Session | null>(null)
  const [rosterModalData, setRosterModalData] = useState<any[]>([])
  const [loadingRoster, setLoadingRoster] = useState(false)

  // Señal mínima para confirmar que la ruta hidrata correctamente en cliente
  useEffect(() => {
    console.log('✅ AdminSessionsCalendar hidratado en cliente')
  }, [])

  /* ----- cargar sesiones del mes Y semanas adyacentes ----- */
  const loadMonth = async (y = year, m = month) => {
    // Usar dayjs para calcular inicio y fin del mes + 7 días extra
    const monthStart = dayjs().year(y).month(m).startOf('month')
    const monthEnd = dayjs().year(y).month(m + 1).date(8).startOf('day')
    
    const startISO = monthStart.toISOString()
    const endISO = monthEnd.toISOString()
    
    console.log('🔍 Cargando sesiones del mes + semanas:', { year: y, month: m, startISO, endISO })
    const { data, error } = await supabase
      .from('sessions')
      .select('id,start_at,end_at,status')
      .gte('start_at', startISO)
      .lt('start_at', endISO)
      .order('start_at', { ascending: true })
    if (error) {
      toast.push({ message: error.message, type: 'error' })
      return
    }
    console.log('📅 Sesiones cargadas:', data?.length || 0, data)
    setMonthSessions((data || []) as Session[])
  }
  useEffect(() => {
    loadMonth()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month])

  /* ----- sesiones de la semana (derivado del mes) ----- */
  const weekSessionsMap = useMemo(() => {
    if (!monthSessions.length) {
      console.log('⚠️ No hay sesiones del mes para filtrar')
      return {}
    }
    
    // Calcular lunes y domingo de la semana seleccionada usando dayjs
    const selected = dayjs(selectedYMD)
    const monday = selected.startOf('week').add(1, 'day') // Lunes
    const sunday = monday.add(6, 'day') // Domingo
    
    const startDay = monday.startOf('day').valueOf()
    const endDay = sunday.endOf('day').valueOf()
    
    console.log('📆 Filtrando semana:', { 
      selectedYMD, 
      monday: monday.format('YYYY-MM-DD'), 
      sunday: sunday.format('YYYY-MM-DD'),
      startDay: dayjs(startDay).toISOString(),
      endDay: dayjs(endDay).toISOString()
    })
    
    const byDay: Record<string, Session[]> = {}
    monthSessions.forEach((session) => {
      const dt = dayjs(session.start_at)
      const sessionTime = dt.valueOf()
      const ymd = dt.format('YYYY-MM-DD')
      
      console.log('  🔹 Sesión:', { 
        id: session.id.slice(0,8), 
        start_at: session.start_at,
        ymd,
        sessionTime: dt.toISOString(),
        inRange: sessionTime >= startDay && sessionTime <= endDay
      })
      
      if (sessionTime < startDay || sessionTime > endDay) return
      if (!byDay[ymd]) byDay[ymd] = []
      byDay[ymd].push(session)
    })
    
    Object.values(byDay).forEach((list) =>
      list.sort((a, b) => dayjs(a.start_at).valueOf() - dayjs(b.start_at).valueOf())
    )
    console.log('✅ Sesiones agrupadas por día:', byDay)
    return byDay
  }, [monthSessions, selectedYMD])

  const weekSessionIds = useMemo(() => {
    const ids = Object.values(weekSessionsMap).flat().map((s) => s.id)
    ids.sort()
    return ids
  }, [weekSessionsMap])

  useEffect(() => {
    if (!weekSessionIds.length) {
      setWeekRoster({})
      return
    }
    ;(async () => {
      const { data, error } = await supabase
        .from('admin_roster_by_distance')
        .select('session_id,distance_m,targets,reserved_count')
        .in('session_id', weekSessionIds as string[])
      if (error) {
        toast.push({ message: error.message, type: 'error' })
        return
      }
      const grouped: Record<string, RosterLine[]> = {}
      ;(data || []).forEach((row: any) => {
        if (!grouped[row.session_id]) grouped[row.session_id] = []
        grouped[row.session_id].push(row as RosterLine)
      })
      Object.values(grouped).forEach((arr) =>
        arr.sort((a, b) => a.distance_m - b.distance_m)
      )
      setWeekRoster(grouped)
    })()
  }, [weekSessionIds, toast])

  const weekDays = useMemo(() => {
    const selected = dayjs(selectedYMD)
    const monday = selected.startOf('week').add(1, 'day')
    
    const days = Array.from({ length: 7 }, (_, idx) => {
      const date = monday.add(idx, 'day')
      const ymd = date.format('YYYY-MM-DD')
      return {
        date: date.toDate(), // Convertir a Date para compatibilidad con toLocaleDateString
        ymd,
        sessions: weekSessionsMap[ymd] || [],
      }
    })
    return days.filter((day) => day.sessions.length > 0)
  }, [selectedYMD, weekSessionsMap])

  /* ----- resumen por día (para marcar calendario) ----- */
  const daySummary = useMemo(() => {
    const map: Record<string, { scheduled: number; cancelled: number }> = {}
    monthSessions.forEach((s) => {
      const ymd = dayjs(s.start_at).format('YYYY-MM-DD')
      if (!map[ymd]) map[ymd] = { scheduled: 0, cancelled: 0 }
      if (s.status === 'scheduled') map[ymd].scheduled++
      else map[ymd].cancelled++
    })
    return map
  }, [monthSessions])

  /* ----- grilla 6 semanas ----- */
  const gridDays = useMemo(() => {
    const firstDay = dayjs().year(year).month(month).startOf('month')
    const startIndex = firstDay.day() // 0 = domingo
    const daysInMonth = firstDay.daysInMonth()
    const todayYMD = dayjs().format('YYYY-MM-DD')
    
    const cells: { ymd: string; inMonth: boolean; isToday: boolean }[] = []
    
    // Días del mes anterior
    for (let i = 0; i < startIndex; i++) {
      const d = firstDay.subtract(startIndex - i, 'day')
      cells.push({ ymd: d.format('YYYY-MM-DD'), inMonth: false, isToday: false })
    }
    
    // Días del mes actual
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = dayjs().year(year).month(month).date(d)
      const ymd = dt.format('YYYY-MM-DD')
      cells.push({ ymd, inMonth: true, isToday: ymd === todayYMD })
    }
    
    // Días del mes siguiente para completar 42 celdas (6 semanas)
    while (cells.length < 42) {
      const lastDate = dayjs(cells[cells.length - 1].ymd)
      const nextDate = lastDate.add(1, 'day')
      cells.push({ ymd: nextDate.format('YYYY-MM-DD'), inMonth: false, isToday: false })
    }
    
    return cells
  }, [year, month])

  /* ----- acciones ----- */
  const goPrevMonth = () => {
    const d = dayjs().year(year).month(month).subtract(1, 'month')
    setYear(d.year())
    setMonth(d.month())
  }
  const goNextMonth = () => {
    const d = dayjs().year(year).month(month).add(1, 'month')
    setYear(d.year())
    setMonth(d.month())
  }

  const openRosterModal = async (session: Session) => {
    setRosterModalSession(session)
    setRosterModalOpen(true)
    setLoadingRoster(true)
    
    // Cargar reservas de esta sesión
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        id,
        status,
        distance_m,
        group_type,
        admin_notes,
        user_id,
        profiles!inner(full_name, email, phone)
      `)
      .eq('session_id', session.id)
      .eq('status', 'reserved')
      .order('distance_m', { ascending: true })
    
    setLoadingRoster(false)
    if (error) {
      toast.push({ message: error.message, type: 'error' })
      return
    }
    
    setRosterModalData(data || [])
  }

  const cancelSession = async (sessionId: string, refund: boolean) => {
    const ok = await confirm(`¿Cancelar esta sesión${refund ? ' con reembolso' : ''}?`)
    if (!ok) return
    const { data, error } = await supabase.rpc('admin_cancel_session', {
      p_session: sessionId,
      p_refund: refund,
    })
    if (error) return toast.push({ message: error.message, type: 'error' })
    toast.push({ message: `Sesión cancelada. Reservas afectadas: ${data ?? 0}`, type: 'success' })
    setOpenCardMenu(null)
    await loadMonth()
  }

  const copyWeek = async () => {
    const selected = dayjs(selectedYMD)
    const monday = selected.startOf('week').add(1, 'day')
    const sunday = monday.add(6, 'day')
    const fmt = (d: dayjs.Dayjs) => d.format('YYYY-MM-DD')
    
    if (!(await confirm(`¿Copiar los turnos de la semana ${fmt(monday)} a ${fmt(sunday)} hacia la semana siguiente?`))) return
    
    const { data, error } = await supabase.rpc('admin_copy_week', {
      p_ref_date: selectedYMD,
    })
    if (error) return toast.push({ message: error.message, type: 'error' })
    setOpenMonthMenu(false)
    toast.push({ message: `Semana copiada. Turnos creados: ${data ?? 0}`, type: 'success' })
    await loadMonth()
  }

  const monthLabel = dayjs().year(year).month(month).format('MMMM YYYY')

  /* ----- util ocupación/cupos ----- */
  const capacityOf = (sessionId: string) =>
    (weekRoster[sessionId] || []).reduce((t, r) => t + r.targets * 4, 0)
  const occupiedOf = (sessionId: string) =>
    (weekRoster[sessionId] || []).reduce((t, r) => t + r.reserved_count, 0)

  const weekRangeLabel = useMemo(() => {
    const selected = dayjs(selectedYMD)
    const monday = selected.startOf('week').add(1, 'day')
    const sunday = monday.add(6, 'day')
    const fmt = (d: dayjs.Dayjs) => d.format('D MMM')
    return `${fmt(monday)} – ${fmt(sunday)}`
  }, [selectedYMD])

  /* ============ UI ============ */
  return (
    <PageErrorBoundary>
    <AdminGuard>
      <div className="space-y-6">
        {/* Top bar */}
        <div className="sticky top-0 z-10 bg-bg/95 backdrop-blur border-b border-white/10 -mx-4 lg:-mx-8 px-4 lg:px-8 py-3">
          <div className="flex items-center gap-3">
            <button className="btn-ghost !px-3" onClick={() => router.push('/admin')}>←</button>
            <h1 className="text-lg font-semibold">Turnos</h1>
          </div>
        </div>

        {/* Layout responsivo: 1 col en móvil, 2 cols en desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* COLUMNA IZQUIERDA: Calendario */}
          <div className="lg:col-span-5 xl:col-span-4">
            <div className="card p-4 lg:sticky lg:top-24">{/* Calendario compacto */}
            <div className="flex items-center justify-between mb-3">
              <button className="btn-ghost" onClick={goPrevMonth}>‹</button>
              <div className="font-medium capitalize">{monthLabel}</div>
              <div className="relative">
                <button className="btn-ghost" onClick={() => setOpenMonthMenu(v => !v)}>⋮</button>
                {openMonthMenu && (
                  <div className="absolute right-0 mt-2 w-56 rounded-xl border border-white/10 bg-card shadow-xl z-20">
                    <button
                      disabled
                      className="w-full text-left px-3 py-2 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={copyWeek}
                    >
                      Copiar semana → siguiente
                    </button>
                  </div>
                )}
              </div>
              <button className="btn-ghost" onClick={goNextMonth}>›</button>
            </div>

            {/* cabecera días */}
            <div className="grid grid-cols-7 text-center text-xs text-textsec pb-2">
              {['D','L','M','M','J','V','S'].map(d => <div key={d}>{d}</div>)}
            </div>

            {/* celdas */}
            <div className="grid grid-cols-7 gap-2">
              {gridDays.map(cell => {
                const sum = daySummary[cell.ymd] || { scheduled: 0, cancelled: 0 }
                const isSelected = cell.ymd === selectedYMD
                const hasProg = sum.scheduled > 0
                const hasCanc = !hasProg && sum.cancelled > 0

                const base = 'rounded-xl p-2 text-left border transition'
                const offMonth = 'bg-transparent border-transparent text-textsec/50'
                const neutral = 'bg-card border-white/5'
                const blue = 'bg-info/10 border-info/30'
                const red = 'bg-danger/10 border-danger/30'
                const cls =
                  (cell.inMonth ? (hasProg ? blue : hasCanc ? red : neutral) : offMonth) +
                  (isSelected ? ' ring-2 ring-accent/60' : '')

                return (
                  <button
                    key={cell.ymd}
                    onClick={() => setSelectedYMD(cell.ymd)}
                    className={base + ' ' + cls}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm">{Number(cell.ymd.slice(8,10))}</span>
                      {cell.isToday && (
                        <span className="text-[10px] px-1 rounded bg-accent text-black">hoy</span>
                      )}
                    </div>
                    <div className="mt-1 space-y-1">
                      {sum.scheduled > 0 && (<div className="text-[10px] text-info">● {sum.scheduled} prog.</div>)}
                      {sum.cancelled > 0 && (<div className="text-[10px] text-danger">● {sum.cancelled} canc.</div>)}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Botón copiar semana - dentro del card */}
            <div className="mt-4 pt-4 border-t border-white/10">
              <button disabled className="btn w-full disabled:opacity-50 disabled:cursor-not-allowed" onClick={copyWeek}>
                Copiar semana → siguiente
              </button>
            </div>
          </div>
        </div>

        {/* COLUMNA DERECHA: Turnos de la semana */}
        <div className="lg:col-span-7 xl:col-span-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Semana {weekRangeLabel}</h2>
            <button 
              className="btn-outline text-sm" 
              onClick={() => router.push('/admin/sesiones/editar/new')}
            >
              + Nuevo turno
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {weekDays.length === 0 && (
              <div className="col-span-full card p-6 text-center text-sm text-textsec">
                No hay turnos programados en esta semana.
              </div>
            )}
            {weekDays.map(({ date, ymd, sessions }) => {
              const isSelected = ymd === selectedYMD
              const dayLabel = date.toLocaleDateString('es', {
                weekday: 'short',
              })
              const dayNumber = date.getDate()

              return (
                <div
                  key={ymd}
                  className={`card p-3 space-y-2 transition-colors ${
                    isSelected ? 'ring-2 ring-accent/60' : ''
                  }`}
                >
                  <button
                    className="flex w-full items-center justify-between text-xs uppercase tracking-wide text-textsec"
                    onClick={() => setSelectedYMD(ymd)}
                  >
                    <span>{dayLabel}</span>
                    <span className="text-sm text-textpri">{dayNumber}</span>
                  </button>

                  {sessions.length === 0 && (
                    <p className="text-[11px] text-textsec/70">Sin turnos</p>
                  )}

                  <div className="space-y-2">
                    {sessions.map((s) => {
                      const start = new Date(s.start_at)
                      const end = new Date(s.end_at)
                      const cap = capacityOf(s.id)
                      const occ = occupiedOf(s.id)
                      const available = Math.max(cap - occ, 0)
                      const isCancelled = s.status === 'cancelled'

                      return (
                        <div
                          key={s.id}
                          className="rounded-lg border border-white/10 bg-bg/70 p-2 text-[11px]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-textpri">
                              {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded ${
                                isCancelled ? 'bg-danger/20 text-danger' : 'bg-success/20 text-success'
                              }`}
                            >
                              {isCancelled ? 'Cancelada' : 'Programada'}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-between text-[10px] text-textsec">
                            <span>
                              Ocupación {occ}/{cap}
                            </span>
                            <span className={available > 0 ? 'text-success font-semibold' : 'text-danger font-semibold'}>
                              {available > 0 ? `${available} libres` : 'Completo'}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center justify-end">
                            <div className="relative">
                              <button
                                className="btn-ghost !px-2 !py-1 text-xs"
                                onClick={() => setOpenCardMenu((prev) => (prev === s.id ? null : s.id))}
                              >
                                ⋮
                              </button>
                              {openCardMenu === s.id && (
                                <div className="absolute right-0 top-6 w-44 rounded-xl border border-white/10 bg-card shadow-xl z-30">
                                  <button
                                    className="w-full text-left px-3 py-2 text-[11px] hover:bg-white/5 transition-colors"
                                    onClick={() => {
                                      setOpenCardMenu(null)
                                      openRosterModal(s)
                                    }}
                                  >
                                    📋 Ver roster
                                  </button>
                                  <Link
                                    className="block px-3 py-2 text-[11px] hover:bg-white/5 transition-colors"
                                    href={`/admin/sesiones/editar/${s.id}`}
                                  >
                                    ✏️ Editar
                                  </Link>
                                  <button
                                    className="w-full text-left px-3 py-2 text-[11px] hover:bg-white/5 transition-colors"
                                    onClick={() => cancelSession(s.id, false)}
                                  >
                                    ❌ Cancelar turno
                                  </button>
                                  <button
                                    className="w-full text-left px-3 py-2 text-[11px] text-warning hover:bg-white/5 transition-colors"
                                    onClick={() => cancelSession(s.id, true)}
                                  >
                                    💰 Cancelar + reembolso
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* FAB + para crear turno (solo móvil) */}
      <button
        className="lg:hidden fixed bottom-24 right-6 h-14 w-14 rounded-full bg-accent text-black text-3xl leading-none
                     flex items-center justify-center shadow-lg hover:brightness-110 transition-all z-50"
        title="Nuevo turno"
        onClick={() => router.push('/admin/sesiones/editar/new')}
      >
        +
      </button>

      {/* Modal Roster */}
      {rosterModalOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          onClick={() => setRosterModalOpen(false)}
        >
          <div 
            className="bg-card rounded-2xl border border-white/10 max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <div>
                <h3 className="font-semibold text-lg">📋 Roster del Turno</h3>
                {rosterModalSession && (
                  <p className="text-sm text-textsec mt-1">
                    {new Date(rosterModalSession.start_at).toLocaleDateString('es', { 
                      weekday: 'long', 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                )}
              </div>
              <button
                onClick={() => setRosterModalOpen(false)}
                className="text-textsec hover:text-textpri transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {loadingRoster ? (
                <div className="text-center py-8 text-textsec">Cargando reservas...</div>
              ) : rosterModalData.length === 0 ? (
                <div className="text-center py-8 text-textsec">No hay reservas para este turno</div>
              ) : (
                <div className="space-y-3">
                  {rosterModalData.map((booking: any) => (
                    <div 
                      key={booking.id} 
                      className="bg-bg rounded-lg p-4 border border-white/5"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-medium">{booking.profiles.full_name}</div>
                          <div className="text-sm text-textsec mt-1">
                            📧 {booking.profiles.email}
                            {booking.profiles.phone && (
                              <span className="ml-3">📱 {booking.profiles.phone}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-2 text-xs">
                            <span className="bg-info/20 text-info px-2 py-1 rounded">
                              📏 {booking.distance_m}m
                            </span>
                            {booking.group_type && (
                              <span className="bg-purple-500/20 text-purple-300 px-2 py-1 rounded">
                                {booking.group_type === 'children' ? '👶 Niños' :
                                 booking.group_type === 'youth' ? '🧒 Jóvenes' :
                                 booking.group_type === 'adult' ? '🧑 Adultos' :
                                 booking.group_type === 'assigned' ? '🎯 Asignados' :
                                 booking.group_type === 'ownbow' ? '🏹 Arco propio' : booking.group_type}
                              </span>
                            )}
                          </div>
                          {booking.admin_notes && (
                            <div className="mt-2 text-xs text-amber-400 italic">
                              📝 {booking.admin_notes}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/10">
              <div className="flex items-center justify-between text-sm">
                <span className="text-textsec">
                  Total: <span className="text-textpri font-medium">{rosterModalData.length}</span> reservas
                </span>
                <button
                  onClick={() => setRosterModalOpen(false)}
                  className="btn-outline !py-2"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </AdminGuard>
    </PageErrorBoundary>
  )
}
