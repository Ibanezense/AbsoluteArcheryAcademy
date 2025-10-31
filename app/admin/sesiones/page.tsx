'use client'

import { useEffect, useMemo, useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

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

/* ======== helpers (LOCAL, NO UTC) ======== */
// yyyy-mm-dd en HORA LOCAL
function ymdLocal(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
// Convierte Date local a ISO string UTC (respetando conversión de zona horaria)
// Ejemplo: si tienes 2025-11-01 00:00:00 local (UTC-5), se convierte a 2025-11-01T05:00:00Z
function isoLocal(date: Date) {
  return date.toISOString()
}
function monthBoundsLocal(y: number, m: number) {
  // Inicio: primer día del mes a las 00:00 local
  const start = new Date(y, m, 1, 0, 0, 0, 0)
  // Fin: primer día del mes SIGUIENTE a las 00:00 local (no inclusive)
  // Esto cubre TODO el mes hasta 23:59:59.999 del último día
  const end = new Date(y, m + 1, 1, 0, 0, 0, 0)
  return { startISO: isoLocal(start), endISO: isoLocal(end) }
}
function mondayOf(ymd: string) {
  const d = new Date(ymd + 'T00:00')
  const iso = d.getDay() === 0 ? 7 : d.getDay()
  d.setDate(d.getDate() - (iso - 1))
  return d
}
function sundayOf(ymd: string) {
  const m = mondayOf(ymd)
  const s = new Date(m)
  s.setDate(m.getDate() + 6)
  return s
}

export default function AdminSessionsCalendar() {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const today = new Date()
  const [year, setYear] = useState<number>(today.getFullYear())
  const [month, setMonth] = useState<number>(today.getMonth())
  const [selectedYMD, setSelectedYMD] = useState<string>(ymdLocal(today))

  // data del mes y del día
  const [monthSessions, setMonthSessions] = useState<Session[]>([])
  const [weekRoster, setWeekRoster] = useState<Record<string, RosterLine[]>>({})

  // UI menus
  const [openMonthMenu, setOpenMonthMenu] = useState(false)
  const [openCardMenu, setOpenCardMenu] = useState<string | null>(null)

  /* ----- cargar sesiones del mes Y semanas adyacentes ----- */
  const loadMonth = async (y = year, m = month) => {
    // Calcular inicio del mes
    const monthStart = new Date(y, m, 1, 0, 0, 0, 0)
    // Calcular fin: incluir hasta 7 días en el mes siguiente para capturar semanas que cruzan meses
    const monthEnd = new Date(y, m + 1, 8, 0, 0, 0, 0)
    
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
    const monday = mondayOf(selectedYMD)
    const sunday = sundayOf(selectedYMD)
    const startDay = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate()).getTime()
    const endDay = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate()).getTime()
    console.log('📆 Filtrando semana:', { 
      selectedYMD, 
      monday: ymdLocal(monday), 
      sunday: ymdLocal(sunday),
      startDay: new Date(startDay).toISOString(),
      endDay: new Date(endDay).toISOString()
    })
    const byDay: Record<string, Session[]> = {}
    monthSessions.forEach((session) => {
      const dt = new Date(session.start_at)
      const dayStamp = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime()
      const ymd = ymdLocal(dt)
      console.log('  🔹 Sesión:', { 
        id: session.id.slice(0,8), 
        start_at: session.start_at,
        ymd,
        dayStamp: new Date(dayStamp).toISOString(),
        inRange: dayStamp >= startDay && dayStamp <= endDay
      })
      if (dayStamp < startDay || dayStamp > endDay) return
      if (!byDay[ymd]) byDay[ymd] = []
      byDay[ymd].push(session)
    })
    Object.values(byDay).forEach((list) =>
      list.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
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
    const monday = mondayOf(selectedYMD)
    const days = Array.from({ length: 7 }, (_, idx) => {
      const date = new Date(monday)
      date.setDate(monday.getDate() + idx)
      const ymd = ymdLocal(date)
      return {
        date,
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
      // ¡LOCAL! no uses toISOString aqui
      const dt = new Date(s.start_at)
      const ymd = ymdLocal(dt)
      if (!map[ymd]) map[ymd] = { scheduled: 0, cancelled: 0 }
      if (s.status === 'scheduled') map[ymd].scheduled++
      else map[ymd].cancelled++
    })
    return map
  }, [monthSessions])

  /* ----- grilla 6 semanas ----- */
  const gridDays = useMemo(() => {
    const first = new Date(year, month, 1)
    const startIndex = first.getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells: { ymd: string; inMonth: boolean; isToday: boolean }[] = []
    for (let i = 0; i < startIndex; i++) {
      const d = new Date(year, month, i - startIndex + 1)
      cells.push({ ymd: ymdLocal(d), inMonth: false, isToday: false })
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(year, month, d)
      const isToday = ymdLocal(dt) === ymdLocal(new Date())
      cells.push({ ymd: ymdLocal(dt), inMonth: true, isToday })
    }
    while (cells.length < 42) {
      const last = new Date(cells[cells.length - 1].ymd + 'T00:00')
      last.setDate(last.getDate() + 1)
      cells.push({ ymd: ymdLocal(last), inMonth: false, isToday: false })
    }
    return cells
  }, [year, month])

  /* ----- acciones ----- */
  const goPrevMonth = () => {
    const d = new Date(year, month - 1, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
  }
  const goNextMonth = () => {
    const d = new Date(year, month + 1, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
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
    const mon = mondayOf(selectedYMD)
    const sun = sundayOf(selectedYMD)
    const fmt = (d: Date) => ymdLocal(d)
    if (!(await confirm(`¿Copiar los turnos de la semana ${fmt(mon)} a ${fmt(sun)} hacia la semana siguiente?`))) return
    const { data, error } = await supabase.rpc('admin_copy_week', {
      p_ref_date: selectedYMD,
    })
    if (error) return toast.push({ message: error.message, type: 'error' })
    setOpenMonthMenu(false)
    toast.push({ message: `Semana copiada. Turnos creados: ${data ?? 0}`, type: 'success' })
    await loadMonth()
  }

  const monthLabel = new Date(year, month, 1).toLocaleDateString('es', {
    month: 'long',
    year: 'numeric',
  })

  /* ----- util ocupación/cupos ----- */
  const capacityOf = (sessionId: string) =>
    (weekRoster[sessionId] || []).reduce((t, r) => t + r.targets * 4, 0)
  const occupiedOf = (sessionId: string) =>
    (weekRoster[sessionId] || []).reduce((t, r) => t + r.reserved_count, 0)

  const weekRangeLabel = useMemo(() => {
    const monday = mondayOf(selectedYMD)
    const sunday = sundayOf(selectedYMD)
    const fmt = (d: Date) =>
      d.toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', '')
    return `${fmt(monday)} – ${fmt(sunday)}`
  }, [selectedYMD])

  /* ============ UI ============ */
  return (
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
                      className="w-full text-left px-3 py-2 hover:bg-white/5"
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
              <button className="btn w-full" onClick={copyWeek}>
                Copiar semana → siguiente
              </button>
            </div>
          </div>
        </div>

        {/* COLUMNA DERECHA: Turnos de la semana */}
        <div className="lg:col-span-7 xl:col-span-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Semana {weekRangeLabel}</h2>
            <button className="btn-outline text-sm" onClick={() => router.push('/admin/sesiones/editar/new')}>
              + Nuevo turno
            </button>
          </div>

          <div className="grid gap-3 auto-cols-fr" style={{ gridTemplateColumns: `repeat(${weekDays.length || 1}, minmax(0, 1fr))` }}>
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
                                  <Link
                                    className="block px-3 py-2 text-[11px] hover:bg-white/5 transition-colors"
                                    href={`/admin/roster/${s.id}`}
                                  >
                                    📋 Ver roster
                                  </Link>
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

      {/* FAB + para crear turno */}
      <button
        className="fixed bottom-24 right-6 lg:right-8 h-14 w-14 rounded-full bg-accent text-black text-3xl leading-none
                     flex items-center justify-center shadow-lg hover:brightness-110 transition-all z-50"
          title="Nuevo turno"
          onClick={() => router.push('/admin/sesiones/editar/new')}
        >
          +
        </button>
      </div>
    </AdminGuard>
  )
}
