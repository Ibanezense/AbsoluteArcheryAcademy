'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import Avatar from '@/components/ui/Avatar'
import AdminGuard from '@/components/AdminGuard'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/ToastProvider'
import { supabase } from '@/lib/supabaseClient'
import { adminCancelSession } from '@/lib/services/adminBookingService'

type SessionRow = {
  id: string
  start_at: string
  end_at: string
  status: 'scheduled' | 'cancelled'
  notes: string | null
  weekly_template_id: string | null
  is_manual_override: boolean
}

type DistanceAllocation = {
  session_id: string
  distance_m: number
  slot_capacity: number | null
  targets: number | null
}

type ReservedBooking = {
  session_id: string
  distance_m: number | null
  bow_usage_type: 'shared_inventory' | 'assigned' | 'own' | null
  bow_poundage: number | null
}

type RosterBooking = {
  id: string
  distance_m: number | null
  bow_usage_type: 'shared_inventory' | 'assigned' | 'own' | null
  bow_poundage: number | null
  admin_notes: string | null
  student: {
    full_name: string | null
    avatar_url: string | null
    phone: string | null
    email: string | null
  } | null
}

function mondayOfWeek(date: dayjs.Dayjs) {
  return date.startOf('week').add(1, 'day')
}

function monthGrid(year: number, month: number) {
  const firstDay = dayjs().year(year).month(month).startOf('month')
  const startIndex = firstDay.day()
  const daysInMonth = firstDay.daysInMonth()
  const todayYMD = dayjs().format('YYYY-MM-DD')
  const cells: { ymd: string; inMonth: boolean; isToday: boolean }[] = []

  for (let index = 0; index < startIndex; index += 1) {
    const previousDate = firstDay.subtract(startIndex - index, 'day')
    cells.push({ ymd: previousDate.format('YYYY-MM-DD'), inMonth: false, isToday: false })
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = dayjs().year(year).month(month).date(day)
    const ymd = date.format('YYYY-MM-DD')
    cells.push({ ymd, inMonth: true, isToday: ymd === todayYMD })
  }

  while (cells.length < 42) {
    const nextDate = dayjs(cells[cells.length - 1].ymd).add(1, 'day')
    cells.push({ ymd: nextDate.format('YYYY-MM-DD'), inMonth: false, isToday: false })
  }

  return cells
}

function slotCapacity(allocation: DistanceAllocation) {
  // Siempre calculamos slot_capacity como targets * 4 si slot_capacity no está definido
  // o si queremos forzar la regla de 4 cupos por paca.
  const targets = allocation.targets || 0
  return allocation.slot_capacity ?? (targets * 4)
}

function bowUsageLabel(type: RosterBooking['bow_usage_type'], poundage: number | null) {
  if (type === 'own') return 'Arco propio'
  if (type === 'assigned') return 'Arco asignado'
  if (poundage) return `Arco academia ${poundage} lb`
  return 'Arco academia'
}

export default function AdminSessionsPage() {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const today = dayjs()
  const monday = mondayOfWeek(today)

  const [year, setYear] = useState(monday.year())
  const [month, setMonth] = useState(monday.month())
  const [selectedYMD, setSelectedYMD] = useState(monday.format('YYYY-MM-DD'))
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [allocations, setAllocations] = useState<Record<string, DistanceAllocation[]>>({})
  const [reservedBookings, setReservedBookings] = useState<ReservedBooking[]>([])
  const [liveUpdateAt, setLiveUpdateAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [rosterModalOpen, setRosterModalOpen] = useState(false)
  const [rosterModalSession, setRosterModalSession] = useState<SessionRow | null>(null)
  const [rosterModalData, setRosterModalData] = useState<RosterBooking[]>([])
  const [loadingRoster, setLoadingRoster] = useState(false)

  const loadMonth = useCallback(async (nextYear: number, nextMonth: number) => {
    try {
      setLoading(true)

      const monthStart = dayjs().year(nextYear).month(nextMonth).startOf('month')
      const monthEnd = dayjs().year(nextYear).month(nextMonth).endOf('month')

      const { data: sessionRows, error: sessionsError } = await supabase
        .from('sessions')
        .select('id, start_at, end_at, status, notes, weekly_template_id, is_manual_override')
        .gte('start_at', monthStart.toISOString())
        .lte('start_at', monthEnd.toISOString())
        .order('start_at', { ascending: true })

      if (sessionsError) {
        throw sessionsError
      }

      const currentSessions = (sessionRows || []) as SessionRow[]
      setSessions(currentSessions)

      const sessionIds = currentSessions.map((session) => session.id)
      if (!sessionIds.length) {
        setAllocations({})
        setReservedBookings([])
        return
      }

      const [
        { data: allocationRows, error: allocationsError },
        { data: bookingRows, error: bookingsError },
      ] = await Promise.all([
        supabase
          .from('session_distance_allocations')
          .select('session_id, distance_m, slot_capacity, targets')
          .in('session_id', sessionIds)
          .order('distance_m', { ascending: true }),
        supabase
          .from('bookings')
          .select('session_id, distance_m, bow_usage_type, bow_poundage')
          .eq('status', 'reserved')
          .in('session_id', sessionIds),
      ])

      if (allocationsError) throw allocationsError
      if (bookingsError) throw bookingsError

      const groupedAllocations: Record<string, DistanceAllocation[]> = {}
      ;((allocationRows || []) as DistanceAllocation[]).forEach((allocation) => {
        if (!groupedAllocations[allocation.session_id]) {
          groupedAllocations[allocation.session_id] = []
        }
        groupedAllocations[allocation.session_id].push(allocation)
      })
      setAllocations(groupedAllocations)
      setReservedBookings((bookingRows || []) as ReservedBooking[])
    } catch (loadError: any) {
      toast.push({ message: loadError?.message || 'No se pudieron cargar los turnos.', type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void loadMonth(year, month)
  }, [year, month, loadMonth])

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = setTimeout(async () => {
        await loadMonth(year, month)
        setLiveUpdateAt(dayjs().format('HH:mm:ss'))
      }, 500)
    }

    const channel = supabase
      .channel(`admin-sessions-live-${year}-${month}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_distance_allocations' }, scheduleRefresh)
      .subscribe()

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer)
      void supabase.removeChannel(channel)
    }
  }, [year, month, loadMonth])

  const sessionsByDay = useMemo(() => {
    const grouped: Record<string, SessionRow[]> = {}

    sessions.forEach((session) => {
      const ymd = dayjs(session.start_at).format('YYYY-MM-DD')
      if (!grouped[ymd]) grouped[ymd] = []
      grouped[ymd].push(session)
    })

    Object.values(grouped).forEach((daySessions) => {
      daySessions.sort((left, right) => dayjs(left.start_at).valueOf() - dayjs(right.start_at).valueOf())
    })

    return grouped
  }, [sessions])

  const daySummary = useMemo(() => {
    const summary: Record<string, { scheduled: number; cancelled: number }> = {}

    sessions.forEach((session) => {
      const ymd = dayjs(session.start_at).format('YYYY-MM-DD')
      if (!summary[ymd]) summary[ymd] = { scheduled: 0, cancelled: 0 }
      if (session.status === 'scheduled') summary[ymd].scheduled += 1
      else summary[ymd].cancelled += 1
    })

    return summary
  }, [sessions])

  const weekDays = useMemo(() => {
    const selected = dayjs(selectedYMD)
    const mondayDate = mondayOfWeek(selected)

    return Array.from({ length: 7 }, (_, index) => {
      const date = mondayDate.add(index, 'day')
      const ymd = date.format('YYYY-MM-DD')
      return {
        date,
        ymd,
        sessions: sessionsByDay[ymd] || [],
      }
    })
  }, [selectedYMD, sessionsByDay])

  const selectedDaySessions = sessionsByDay[selectedYMD] || []
  const monthLabel = dayjs().year(year).month(month).format('MMMM YYYY')
  const weekRangeLabel = (() => {
    const selected = dayjs(selectedYMD)
    const mondayDate = mondayOfWeek(selected)
    const sundayDate = mondayDate.add(6, 'day')
    return `${mondayDate.format('D MMM')} - ${sundayDate.format('D MMM')}`
  })()

  const bookingSummaryBySession = useMemo(() => {
    const summary: Record<
      string,
      {
        totalReserved: number
        distanceReserved: Record<number, number>
        sharedByPoundage: Record<number, number>
      }
    > = {}

    reservedBookings.forEach((booking) => {
      if (!summary[booking.session_id]) {
        summary[booking.session_id] = {
          totalReserved: 0,
          distanceReserved: {},
          sharedByPoundage: {},
        }
      }

      summary[booking.session_id].totalReserved += 1
      if (booking.distance_m) {
        summary[booking.session_id].distanceReserved[booking.distance_m] =
          (summary[booking.session_id].distanceReserved[booking.distance_m] || 0) + 1
      }
      if (booking.bow_usage_type === 'shared_inventory' && booking.bow_poundage) {
        summary[booking.session_id].sharedByPoundage[booking.bow_poundage] =
          (summary[booking.session_id].sharedByPoundage[booking.bow_poundage] || 0) + 1
      }
    })

    return summary
  }, [reservedBookings])

  const getSessionDistanceRows = (sessionId: string) => {
    return (allocations[sessionId] || []).map((allocation) => {
      const capacity = slotCapacity(allocation)
      const reserved = bookingSummaryBySession[sessionId]?.distanceReserved[allocation.distance_m] || 0
      return {
        distance_m: allocation.distance_m,
        capacity,
        reserved,
        available: Math.max(capacity - reserved, 0),
      }
    })
  }

  const getSharedInventorySummary = (sessionId: string) => {
    const rows = bookingSummaryBySession[sessionId]?.sharedByPoundage || {}
    return Object.entries(rows)
      .map(([poundage, count]) => `${poundage} lb: ${count}`)
      .join(' · ')
  }

  const openRosterModal = async (session: SessionRow) => {
    try {
      setRosterModalSession(session)
      setRosterModalOpen(true)
      setLoadingRoster(true)

      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id,
          distance_m,
          bow_usage_type,
          bow_poundage,
          admin_notes,
          student:students!bookings_student_id_fkey (
            full_name,
            avatar_url,
            phone,
            email
          )
        `)
        .eq('session_id', session.id)
        .eq('status', 'reserved')
        .order('distance_m', { ascending: true })

      if (error) {
        throw error
      }

      const normalized = ((data || []) as any[]).map((booking) => ({
        id: booking.id,
        distance_m: booking.distance_m,
        bow_usage_type: booking.bow_usage_type,
        bow_poundage: booking.bow_poundage,
        admin_notes: booking.admin_notes,
        student: Array.isArray(booking.student) ? (booking.student[0] || null) : booking.student,
      })) as RosterBooking[]

      setRosterModalData(normalized)
    } catch (loadError: any) {
      toast.push({ message: loadError?.message || 'No se pudo cargar el roster.', type: 'error' })
    } finally {
      setLoadingRoster(false)
    }
  }

  const cancelSession = async (sessionId: string, refund: boolean) => {
    const ok = await confirm(`Cancelar este turno${refund ? ' con reembolso' : ''}?`)
    if (!ok) return

    try {
      const data = await adminCancelSession(supabase as any, {
        sessionId,
        refund,
      })
      toast.push({ message: `Turno cancelado. Reservas afectadas: ${data ?? 0}`, type: 'success' })
      await loadMonth(year, month)
    } catch (error: any) {
      toast.push({ message: error?.message || 'No se pudo cancelar el turno.', type: 'error' })
      return
    }
  }

  return (
    <AdminGuard>
      <div className="space-y-6">
        <section className="rounded-3xl border border-white/10 bg-card p-5 sm:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-accent">Turnos</p>
              <h1 className="mt-2 text-3xl font-bold text-textpri">Plan semanal de sesiones</h1>
              <p className="mt-2 max-w-2xl text-sm text-textsec">
                Administra sesiones reales, cupos por distancia, turnos heredados de plantilla y cancelaciones del calendario.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/admin/ajustes/infraestructura" className="btn-outline text-center">
                Plantillas e inventario
              </Link>
              <button className="btn" onClick={() => router.push('/admin/sesiones/editar/new')}>
                Nuevo turno manual
              </button>
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-4 xl:col-span-3">
            <div className="card p-4 lg:sticky lg:top-6">
              <div className="mb-4 flex items-center justify-between">
                <button className="btn-ghost" onClick={() => {
                  const prev = dayjs().year(year).month(month).subtract(1, 'month')
                  setYear(prev.year())
                  setMonth(prev.month())
                }}>
                  {'<'}
                </button>
                <div className="font-medium capitalize">{monthLabel}</div>
                <button className="btn-ghost" onClick={() => {
                  const next = dayjs().year(year).month(month).add(1, 'month')
                  setYear(next.year())
                  setMonth(next.month())
                }}>
                  {'>'}
                </button>
              </div>

              <div className="mb-2 grid grid-cols-7 text-center text-xs text-textsec">
                {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((day, index) => <div key={index}>{day}</div>)}
              </div>

              <div className="grid grid-cols-7 gap-2">
                {monthGrid(year, month).map((cell) => {
                  const summary = daySummary[cell.ymd] || { scheduled: 0, cancelled: 0 }
                  const isSelected = cell.ymd === selectedYMD
                  const hasScheduled = summary.scheduled > 0
                  const hasCancelled = !hasScheduled && summary.cancelled > 0
                  const baseClass = cell.inMonth ? 'border-white/5 bg-card' : 'border-transparent bg-transparent text-textsec/50'
                  const toneClass = hasScheduled ? 'bg-info/10 border-info/30' : hasCancelled ? 'bg-danger/10 border-danger/30' : baseClass

                  return (
                    <button
                      key={cell.ymd}
                      onClick={() => setSelectedYMD(cell.ymd)}
                      className={`rounded-xl border p-2 text-left transition ${toneClass}${isSelected ? ' ring-2 ring-accent/60' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm">{Number(cell.ymd.slice(8, 10))}</span>
                        {cell.isToday && <span className="rounded bg-accent px-1 text-[10px] text-black">hoy</span>}
                      </div>
                      <div className="mt-1 space-y-1">
                        {summary.scheduled > 0 && <div className="text-[10px] text-info">● {summary.scheduled} turnos</div>}
                        {summary.cancelled > 0 && <div className="text-[10px] text-danger">● {summary.cancelled} cancel.</div>}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="lg:col-span-8 xl:col-span-9 space-y-6">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-textpri">Semana {weekRangeLabel}</h2>
                <p className="text-sm text-textsec">Selecciona un dia o revisa toda la semana.</p>
                {liveUpdateAt && (
                  <p className="mt-1 text-xs text-success">Actualizacion en tiempo real: {liveUpdateAt}</p>
                )}
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              {weekDays.map(({ date, ymd, sessions: daySessions }) => (
                <div key={ymd} className={`card p-4 ${ymd === selectedYMD ? 'ring-2 ring-accent/60' : ''}`}>
                  <button className="mb-3 flex w-full items-center justify-between" onClick={() => setSelectedYMD(ymd)}>
                    <div className="text-left">
                      <p className="text-xs uppercase tracking-wide text-textsec">{date.format('dddd')}</p>
                      <p className="text-lg font-semibold text-textpri">{date.format('D [de] MMMM')}</p>
                    </div>
                    <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-textsec">
                      {daySessions.length} turnos
                    </span>
                  </button>

                  <div className="space-y-3">
                    {daySessions.length === 0 && (
                      <div className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-textsec">
                        No hay turnos programados.
                      </div>
                    )}

                    {daySessions.map((session) => {
                      const distances = getSessionDistanceRows(session.id)
                      const totalCapacity = distances.reduce((sum, row) => sum + row.capacity, 0)
                      const totalReserved = bookingSummaryBySession[session.id]?.totalReserved || 0
                      const sharedInventory = getSharedInventorySummary(session.id)

                      return (
                        <div key={session.id} className="rounded-2xl border border-white/10 bg-bg/60 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-textpri">
                                {dayjs(session.start_at).format('HH:mm')} - {dayjs(session.end_at).format('HH:mm')}
                              </p>
                              <div className="mt-1 flex flex-wrap gap-2 text-xs">
                                <span className={`rounded-full px-2 py-1 ${session.status === 'cancelled' ? 'bg-danger/20 text-danger' : 'bg-success/20 text-success'}`}>
                                  {session.status === 'cancelled' ? 'Cancelado' : 'Programado'}
                                </span>
                                <span className="rounded-full bg-white/5 px-2 py-1 text-textsec">
                                  {session.weekly_template_id ? 'Desde plantilla' : 'Manual'}
                                </span>
                                {session.is_manual_override && (
                                  <span className="rounded-full bg-warning/15 px-2 py-1 text-warning">
                                    Ajustado manualmente
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button className="btn-outline text-xs" onClick={() => openRosterModal(session)}>
                                Roster
                              </button>
                              <Link className="btn-outline text-xs" href={`/admin/sesiones/editar/${session.id}`}>
                                Editar
                              </Link>
                            </div>
                          </div>

                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <div className="rounded-xl border border-white/5 bg-card p-3">
                              <p className="text-xs text-textsec">Reserva total</p>
                              <p className="mt-1 text-lg font-semibold text-textpri">
                                {totalReserved}/{totalCapacity}
                              </p>
                            </div>
                            <div className="rounded-xl border border-white/5 bg-card p-3">
                              <p className="text-xs text-textsec">Arcos compartidos reservados</p>
                              <p className="mt-1 text-sm font-medium text-textpri">{sharedInventory || 'Sin uso compartido'}</p>
                            </div>
                          </div>

                          <div className="mt-3 space-y-2">
                            {distances.map((distance) => (
                              <div key={`${session.id}-${distance.distance_m}`} className="flex items-center justify-between rounded-xl border border-white/5 bg-card p-3 text-sm">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-textpri">{distance.distance_m} m</span>
                                  <span className="text-[10px] text-textsec uppercase tracking-wider">({(allocations[session.id] || []).find(a => a.distance_m === distance.distance_m)?.targets || 0} pacas)</span>
                                </div>
                                <span className="text-textsec">
                                  {distance.reserved}/{distance.capacity} cupos ·{' '}
                                  <span className={distance.available > 0 ? 'text-success' : 'text-danger'}>
                                    {distance.available} libres
                                  </span>
                                </span>
                              </div>
                            ))}
                          </div>

                          {session.notes && (
                            <p className="mt-3 text-xs text-textsec">Nota: {session.notes}</p>
                          )}

                          <div className="mt-4 flex flex-wrap gap-2">
                            <button className="btn-outline text-xs" onClick={() => cancelSession(session.id, false)}>
                              Cancelar sin reembolso
                            </button>
                            <button className="btn-outline text-xs" onClick={() => cancelSession(session.id, true)}>
                              Cancelar con reembolso
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-textpri">Dia seleccionado</h3>
                  <p className="text-sm text-textsec">{dayjs(selectedYMD).format('dddd, D [de] MMMM')}</p>
                </div>
                <button className="btn-outline text-sm" onClick={() => router.push('/admin/sesiones/editar/new')}>
                  Crear turno ese dia
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {selectedDaySessions.length === 0 && (
                  <div className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-textsec">
                    No hay turnos en el dia seleccionado.
                  </div>
                )}

                {selectedDaySessions.map((session) => (
                  <div key={`selected-${session.id}`} className="rounded-xl border border-white/10 bg-bg/60 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-textpri">
                          {dayjs(session.start_at).format('HH:mm')} - {dayjs(session.end_at).format('HH:mm')}
                        </p>
                        <p className="text-sm text-textsec">
                          {getSessionDistanceRows(session.id).map((row) => `${row.distance_m}m`).join(' · ') || 'Sin distancias'}
                        </p>
                      </div>
                      <Link href={`/admin/sesiones/editar/${session.id}`} className="btn-outline text-sm">
                        Editar
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {rosterModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setRosterModalOpen(false)}>
            <div className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-card" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-white/10 p-4">
                <div>
                  <h3 className="text-lg font-semibold text-textpri">Roster del turno</h3>
                  {rosterModalSession && (
                    <p className="mt-1 text-sm text-textsec">
                      {dayjs(rosterModalSession.start_at).format('dddd, D [de] MMMM · HH:mm')}
                    </p>
                  )}
                </div>
                <button className="text-textsec transition-colors hover:text-textpri" onClick={() => setRosterModalOpen(false)}>
                  X
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {loadingRoster ? (
                  <div className="py-8 text-center text-textsec">Cargando roster...</div>
                ) : rosterModalData.length === 0 ? (
                  <div className="py-8 text-center text-textsec">No hay reservas para este turno.</div>
                ) : (
                  <div className="space-y-3">
                    {rosterModalData.map((booking) => (
                      <div key={booking.id} className="flex items-start gap-3 rounded-xl border border-white/5 bg-bg p-4">
                        <Avatar
                          name={booking.student?.full_name || 'Alumno'}
                          url={booking.student?.avatar_url || null}
                          size="md"
                        />
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-textpri">{booking.student?.full_name || 'Alumno sin nombre'}</p>
                            {booking.distance_m && (
                              <span className="rounded-full bg-info/20 px-2 py-1 text-xs text-info">
                                {booking.distance_m} m
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-textsec">
                            {bowUsageLabel(booking.bow_usage_type, booking.bow_poundage)}
                          </p>
                          {(booking.student?.email || booking.student?.phone) && (
                            <p className="mt-1 text-xs text-textsec">
                              {booking.student?.email || 'Sin email'}
                              {booking.student?.phone ? ` · ${booking.student.phone}` : ''}
                            </p>
                          )}
                          {booking.admin_notes && (
                            <p className="mt-2 text-xs italic text-warning">Nota: {booking.admin_notes}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminGuard>
  )
}
