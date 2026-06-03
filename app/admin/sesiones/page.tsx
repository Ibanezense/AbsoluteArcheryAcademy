'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import { Boxes, CalendarDays, ChevronLeft, ChevronRight, Clock3, Plus, Target, UserCheck, Users } from 'lucide-react'
import { AdminSessionAccordion } from '@/components/admin/AdminOperationalComponents'
import { AdminPageHeader } from '@/components/admin/AdminVisualSystem'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/ToastProvider'
import { adminCancelSession } from '@/lib/services/adminBookingService'
import { supabase } from '@/lib/supabaseClient'

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
  id: string
  session_id: string
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

type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

function mondayOfWeek(date: dayjs.Dayjs) {
  return date.startOf('week').add(1, 'day')
}

function monthGrid(year: number, month: number) {
  const firstDay = dayjs().year(year).month(month).startOf('month')
  const startIndex = (firstDay.day() + 6) % 7
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
  const targets = allocation.targets || 0
  return allocation.slot_capacity ?? targets * 4
}

function sessionStatus(session: SessionRow): { label: string; tone: BadgeTone } {
  if (session.status === 'cancelled') return { label: 'Cancelada', tone: 'danger' }

  const now = dayjs()
  const start = dayjs(session.start_at)
  const end = dayjs(session.end_at)

  if (now.isAfter(end)) return { label: 'Finalizada', tone: 'neutral' }
  if (now.isAfter(start) && now.isBefore(end)) return { label: 'En curso', tone: 'warning' }
  return { label: 'Programada', tone: 'success' }
}

function occupancyStatus(occupancyRate: number, availableSlots: number, totalCapacity: number): { label: string; tone: BadgeTone } {
  if (totalCapacity <= 0) return { label: 'Sin cupos', tone: 'neutral' }
  if (occupancyRate >= 100 || availableSlots <= 0) return { label: 'Completa', tone: 'danger' }
  if (occupancyRate >= 90) return { label: 'Ultimos cupos', tone: 'warning' }
  if (occupancyRate >= 70) return { label: 'Ocupacion alta', tone: 'warning' }
  return { label: 'Disponible', tone: 'success' }
}

function buildAttendanceHref(session: SessionRow) {
  const date = dayjs(session.start_at).format('YYYY-MM-DD')
  return `/admin/asistencia?date=${date}&sessionId=${session.id}`
}

function buildSessionCancellationImpact(session: SessionRow, affectedBookings: number, refund: boolean) {
  const dateLabel = dayjs(session.start_at).format('dddd, D [de] MMMM [de] YYYY')
  const timeLabel = `${dayjs(session.start_at).format('HH:mm')} - ${dayjs(session.end_at).format('HH:mm')}`
  const refundLabel = refund
    ? 'si, solo para reservas con credito ya consumido por asistencia o inasistencia'
    : 'no'

  return {
    title: refund ? 'Cancelar turno con devolucion' : 'Cancelar turno sin devolucion',
    confirmLabel: refund ? 'Cancelar con devolucion' : 'Cancelar sin devolucion',
    tone: refund ? 'warning' as const : 'danger' as const,
    message: [
      `Fecha: ${dateLabel}`,
      `Hora: ${timeLabel}`,
      `Reservas afectadas: ${affectedBookings}`,
      `Devolucion de creditos: ${refundLabel}`,
      'Esta accion cancelara el turno completo.',
    ].join('\n'),
    description: refund
      ? 'Usa esta opcion solo si corresponde restaurar creditos ya consumidos. La operacion sigue usando la regla actual del backend.'
      : 'Usa esta opcion cuando no corresponde restaurar creditos. La sesion y sus reservas activas se cancelaran.',
  }
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
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    const requestedDate = new URLSearchParams(window.location.search).get('date')
    if (!requestedDate) return

    const parsedDate = dayjs(requestedDate)
    if (!parsedDate.isValid()) return

    setSelectedYMD(parsedDate.format('YYYY-MM-DD'))
    setYear(parsedDate.year())
    setMonth(parsedDate.month())
  }, [])

  const loadMonth = useCallback(async (nextYear: number, nextMonth: number) => {
    try {
      setLoading(true)
      setLoadError(null)

      const monthStart = dayjs().year(nextYear).month(nextMonth).startOf('month')
      const monthEnd = dayjs().year(nextYear).month(nextMonth).endOf('month')

      const { data: sessionRows, error: sessionsError } = await supabase
        .from('sessions')
        .select('id, start_at, end_at, status, notes, weekly_template_id, is_manual_override')
        .gte('start_at', monthStart.toISOString())
        .lte('start_at', monthEnd.toISOString())
        .order('start_at', { ascending: true })

      if (sessionsError) throw sessionsError

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
          .select(`
            id,
            session_id,
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
          .eq('status', 'reserved')
          .in('session_id', sessionIds)
          .order('distance_m', { ascending: true }),
      ])

      if (allocationsError) throw allocationsError
      if (bookingsError) throw bookingsError

      const groupedAllocations: Record<string, DistanceAllocation[]> = {}
      ;((allocationRows || []) as DistanceAllocation[]).forEach((allocation) => {
        if (!groupedAllocations[allocation.session_id]) groupedAllocations[allocation.session_id] = []
        groupedAllocations[allocation.session_id].push(allocation)
      })

      const normalizedBookings = ((bookingRows || []) as any[]).map((booking) => ({
        id: booking.id,
        session_id: booking.session_id,
        distance_m: booking.distance_m,
        bow_usage_type: booking.bow_usage_type,
        bow_poundage: booking.bow_poundage,
        admin_notes: booking.admin_notes,
        student: Array.isArray(booking.student) ? (booking.student[0] || null) : booking.student,
      })) as ReservedBooking[]

      setAllocations(groupedAllocations)
      setReservedBookings(normalizedBookings)
    } catch (loadError: any) {
      setLoadError(loadError?.message || 'No se pudieron cargar los turnos.')
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

  const bookingSummaryBySession = useMemo(() => {
    const summary: Record<
      string,
      {
        totalReserved: number
        distanceReserved: Record<number, number>
      }
    > = {}

    reservedBookings.forEach((booking) => {
      if (!summary[booking.session_id]) {
        summary[booking.session_id] = {
          totalReserved: 0,
          distanceReserved: {},
        }
      }

      summary[booking.session_id].totalReserved += 1
      if (booking.distance_m) {
        summary[booking.session_id].distanceReserved[booking.distance_m] =
          (summary[booking.session_id].distanceReserved[booking.distance_m] || 0) + 1
      }
    })

    return summary
  }, [reservedBookings])

  const bookingsBySession = useMemo(() => {
    const grouped: Record<string, ReservedBooking[]> = {}
    reservedBookings.forEach((booking) => {
      if (!grouped[booking.session_id]) grouped[booking.session_id] = []
      grouped[booking.session_id].push(booking)
    })
    return grouped
  }, [reservedBookings])

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
  const selectedDateLabel = dayjs(selectedYMD).format('dddd, D [de] MMMM')
  const weekRangeLabel = (() => {
    const selected = dayjs(selectedYMD)
    const mondayDate = mondayOfWeek(selected)
    const sundayDate = mondayDate.add(6, 'day')
    return `${mondayDate.format('D MMM')} - ${sundayDate.format('D MMM')}`
  })()

  const getSessionDistanceRows = (sessionId: string) => {
    return (allocations[sessionId] || []).map((allocation) => {
      const capacity = slotCapacity(allocation)
      const reserved = bookingSummaryBySession[sessionId]?.distanceReserved[allocation.distance_m] || 0
      return {
        distance_m: allocation.distance_m,
        capacity,
        reserved,
        available: Math.max(capacity - reserved, 0),
        targets: allocation.targets || 0,
      }
    })
  }

  const getSessionTotals = (sessionId: string) => {
    const distanceRows = getSessionDistanceRows(sessionId)
    const totalCapacity = distanceRows.reduce((sum, row) => sum + row.capacity, 0)
    const totalReserved = bookingSummaryBySession[sessionId]?.totalReserved || 0
    const availableSlots = Math.max(totalCapacity - totalReserved, 0)
    const occupancyRate = totalCapacity > 0 ? Math.round((totalReserved / totalCapacity) * 100) : 0

    return {
      distanceRows,
      totalCapacity,
      totalReserved,
      availableSlots,
      occupancyRate,
    }
  }

  const cancelSession = async (session: SessionRow, refund: boolean) => {
    const affectedBookings = bookingSummaryBySession[session.id]?.totalReserved || 0
    const impact = buildSessionCancellationImpact(session, affectedBookings, refund)
    const ok = await confirm(impact.message, {
      title: impact.title,
      description: impact.description,
      confirmLabel: impact.confirmLabel,
      tone: impact.tone,
    })
    if (!ok) return

    try {
      const data = await adminCancelSession(supabase as any, {
        sessionId: session.id,
        refund,
      })
      toast.push({ message: `Turno cancelado. Reservas afectadas: ${data ?? 0}`, type: 'success' })
      await loadMonth(year, month)
    } catch (error: any) {
      toast.push({ message: error?.message || 'No se pudo cancelar el turno.', type: 'error' })
    }
  }

  const selectDate = (ymd: string) => {
    const nextDate = dayjs(ymd)
    setSelectedYMD(ymd)
    setYear(nextDate.year())
    setMonth(nextDate.month())
  }

  const moveWeek = (offset: number) => {
    const nextMonday = mondayOfWeek(dayjs(selectedYMD)).add(offset, 'week')
    selectDate(nextMonday.format('YYYY-MM-DD'))
  }

  const goToday = () => {
    selectDate(dayjs().format('YYYY-MM-DD'))
  }

  const moveMonth = (offset: number) => {
    const nextMonth = dayjs().year(year).month(month).add(offset, 'month')
    setYear(nextMonth.year())
    setMonth(nextMonth.month())
    setSelectedYMD(nextMonth.startOf('month').format('YYYY-MM-DD'))
  }

  const weekOperationalMetrics = (() => {
    let weekSessions = 0
    let scheduledSessions = 0
    let totalReserved = 0
    let totalCapacity = 0
    let fullSessions = 0
    let attendancePending = 0

    weekDays.forEach(({ sessions: daySessions }) => {
      daySessions.forEach((session) => {
        const totals = getSessionTotals(session.id)
        weekSessions += 1
        if (session.status === 'scheduled') scheduledSessions += 1
        totalReserved += totals.totalReserved
        totalCapacity += totals.totalCapacity
        if (totals.totalCapacity > 0 && totals.availableSlots <= 0) fullSessions += 1
        if (session.status === 'scheduled' && dayjs(session.end_at).isBefore(dayjs()) && totals.totalReserved > 0) {
          attendancePending += totals.totalReserved
        }
      })
    })

    const availableSlots = Math.max(totalCapacity - totalReserved, 0)
    const occupancyRate = totalCapacity > 0 ? Math.round((totalReserved / totalCapacity) * 100) : 0

    return {
      weekSessions,
      scheduledSessions,
      totalReserved,
      totalCapacity,
      availableSlots,
      occupancyRate,
      fullSessions,
      attendancePending,
    }
  })()

  const selectedDayOperationalSummary = (() => {
    let totalReserved = 0
    let totalCapacity = 0

    selectedDaySessions.forEach((session) => {
      const totals = getSessionTotals(session.id)
      totalReserved += totals.totalReserved
      totalCapacity += totals.totalCapacity
    })

    return {
      sessions: selectedDaySessions.length,
      totalReserved,
      availableSlots: Math.max(totalCapacity - totalReserved, 0),
      occupancyRate: totalCapacity > 0 ? Math.round((totalReserved / totalCapacity) * 100) : 0,
    }
  })()

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Turnos"
        description="Gestiona sesiones, cupos y asistencia de forma simple y eficiente."
        actions={
          <>
            <Link href="/admin/ajustes/infraestructura" className="btn-outline min-h-11 text-center">
              <Boxes className="h-4 w-4" />
              Plantillas e inventario
            </Link>
            <button className="btn min-h-11" onClick={() => router.push('/admin/sesiones/editar/new')}>
              <Plus className="h-4 w-4" />
              Nuevo turno manual
            </button>
          </>
        }
      />

      <SessionsKpiRow metrics={weekOperationalMetrics} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <MonthlySessionsCalendar
            monthLabel={monthLabel}
            cells={monthGrid(year, month)}
            daySummary={daySummary}
            selectedYMD={selectedYMD}
            onSelect={selectDate}
            onPreviousMonth={() => moveMonth(-1)}
            onNextMonth={() => moveMonth(1)}
          />

          <SelectedDaySummary
            dateLabel={selectedDateLabel}
            summary={selectedDayOperationalSummary}
            onCreate={() => router.push('/admin/sesiones/editar/new')}
          />
        </aside>

        <section className="min-w-0 space-y-5">
          <div className="rounded-[1.6rem] border border-slate-200 bg-white p-4 shadow-[0_20px_55px_rgba(15,23,42,0.055)] sm:p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-heading text-2xl font-black tracking-[-0.05em] text-slate-950 sm:text-3xl">
                    Semana {weekRangeLabel}
                  </h2>
                  {liveUpdateAt && (
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                      Live {liveUpdateAt}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-500">Selecciona un dia y despliega solo el turno que necesites operar.</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => moveWeek(-1)} className="inline-flex min-h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => moveWeek(1)} className="inline-flex min-h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700">
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button type="button" onClick={goToday} className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700">
                  Hoy
                </button>
              </div>
            </div>

            <WeekDaySelector
              weekDays={weekDays}
              selectedYMD={selectedYMD}
              onSelect={selectDate}
              getSessionTotals={getSessionTotals}
            />
          </div>

          {loadError && (
            <div className="rounded-[1.35rem] border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
              No pudimos cargar los turnos. {loadError}
              <button type="button" className="ml-2 underline" onClick={() => loadMonth(year, month)}>
                Reintentar
              </button>
            </div>
          )}

          {loading ? (
            <SessionsSkeleton />
          ) : (
            <div className="space-y-3">
              {weekDays.map(({ date, ymd, sessions: daySessions }) => (
                <SessionDaySection
                  key={ymd}
                  date={date}
                  selected={ymd === selectedYMD}
                  sessions={daySessions}
                  onSelect={() => selectDate(ymd)}
                  onCreate={() => router.push('/admin/sesiones/editar/new')}
                  renderSession={(session) => {
                    const totals = getSessionTotals(session.id)
                    const status = sessionStatus(session)
                    const occupancy = occupancyStatus(totals.occupancyRate, totals.availableSlots, totals.totalCapacity)

                    return (
                      <AdminSessionAccordion
                        key={session.id}
                        sessionId={session.id}
                        startAt={session.start_at}
                        endAt={session.end_at}
                        sessionStatusLabel={status.label}
                        sessionStatusTone={status.tone}
                        occupancyLabel={occupancy.label}
                        occupancyTone={occupancy.tone}
                        totalReserved={totals.totalReserved}
                        totalCapacity={totals.totalCapacity}
                        availableSlots={totals.availableSlots}
                        occupancyRate={totals.occupancyRate}
                        distanceRows={totals.distanceRows}
                        bookings={bookingsBySession[session.id] || []}
                        attendanceHref={buildAttendanceHref(session)}
                        editHref={`/admin/sesiones/editar/${session.id}`}
                        onCancelWithoutRefund={() => cancelSession(session, false)}
                        onCancelWithRefund={() => cancelSession(session, true)}
                      />
                    )
                  }}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function SessionsKpiRow({
  metrics,
}: {
  metrics: {
    weekSessions: number
    scheduledSessions: number
    totalReserved: number
    totalCapacity: number
    availableSlots: number
    occupancyRate: number
    fullSessions: number
    attendancePending: number
  }
}) {
  const items = [
    {
      label: 'Turnos esta semana',
      value: metrics.weekSessions,
      helper: `${metrics.scheduledSessions} programados`,
      icon: CalendarDays,
      tone: 'text-accent bg-orange-50',
    },
    {
      label: 'Reservas totales',
      value: metrics.totalReserved,
      helper: 'Reservas activas',
      icon: Users,
      tone: 'text-slate-700 bg-slate-50',
    },
    {
      label: 'Cupos libres',
      value: metrics.availableSlots,
      helper: `${metrics.totalCapacity} cupos configurados`,
      icon: Target,
      tone: 'text-emerald-700 bg-emerald-50',
    },
    {
      label: 'Ocupacion promedio',
      value: `${metrics.occupancyRate}%`,
      helper: `${metrics.fullSessions} turnos llenos`,
      icon: Boxes,
      tone: 'text-blue-700 bg-blue-50',
    },
    {
      label: 'Asistencia pendiente',
      value: metrics.attendancePending,
      helper: 'Reservas sin asistencia',
      icon: UserCheck,
      tone: 'text-amber-700 bg-amber-50',
    },
  ]

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {items.map((item) => {
        const Icon = item.icon

        return (
          <div key={item.label} className="rounded-[1.35rem] border border-slate-200 bg-white p-4 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
            <div className="flex items-start gap-3">
              <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${item.tone}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">{item.label}</p>
                <p className="mt-1 font-heading text-3xl font-black tracking-[-0.05em] text-slate-950">{item.value}</p>
                <p className="mt-1 text-xs font-bold text-slate-500">{item.helper}</p>
              </div>
            </div>
          </div>
        )
      })}
    </section>
  )
}

function MonthlySessionsCalendar({
  monthLabel,
  cells,
  daySummary,
  selectedYMD,
  onSelect,
  onPreviousMonth,
  onNextMonth,
}: {
  monthLabel: string
  cells: { ymd: string; inMonth: boolean; isToday: boolean }[]
  daySummary: Record<string, { scheduled: number; cancelled: number }>
  selectedYMD: string
  onSelect: (ymd: string) => void
  onPreviousMonth: () => void
  onNextMonth: () => void
}) {
  return (
    <section className="rounded-[1.6rem] border border-slate-200 bg-white p-4 shadow-[0_22px_60px_rgba(15,23,42,0.06)]">
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700"
          onClick={onPreviousMonth}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-sm font-black capitalize text-slate-950">{monthLabel}</div>
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700"
          onClick={onNextMonth}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-2 grid grid-cols-7 text-center text-[10px] font-black text-slate-400">
        {['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'].map((day) => <div key={day}>{day}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((cell) => {
          const summary = daySummary[cell.ymd] || { scheduled: 0, cancelled: 0 }
          const isSelected = cell.ymd === selectedYMD
          const hasScheduled = summary.scheduled > 0
          const hasCancelled = !hasScheduled && summary.cancelled > 0

          return (
            <button
              key={cell.ymd}
              type="button"
              onClick={() => onSelect(cell.ymd)}
              className={`relative min-h-11 rounded-xl border p-1.5 text-center text-sm font-black transition ${
                isSelected
                  ? 'border-accent bg-orange-50 text-slate-950 ring-2 ring-accent/20'
                  : hasScheduled
                    ? 'border-blue-100 bg-blue-50 text-slate-900'
                    : hasCancelled
                      ? 'border-rose-100 bg-rose-50 text-slate-700'
                      : cell.inMonth
                        ? 'border-slate-100 bg-slate-50 text-slate-700'
                        : 'border-transparent bg-transparent text-slate-300'
              }`}
            >
              {Number(cell.ymd.slice(8, 10))}
              {(hasScheduled || hasCancelled || cell.isToday) && (
                <span className={`mx-auto mt-1 block h-1.5 w-1.5 rounded-full ${cell.isToday ? 'bg-accent' : hasScheduled ? 'bg-blue-500' : 'bg-rose-500'}`} />
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function SelectedDaySummary({
  dateLabel,
  summary,
  onCreate,
}: {
  dateLabel: string
  summary: {
    sessions: number
    totalReserved: number
    availableSlots: number
    occupancyRate: number
  }
  onCreate: () => void
}) {
  return (
    <section className="rounded-[1.6rem] border border-slate-200 bg-white p-4 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold capitalize text-slate-500">{dateLabel}</p>
          <h3 className="font-heading text-2xl font-black tracking-[-0.05em] text-slate-950">{summary.sessions} turnos</h3>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
          {summary.availableSlots} libres
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <MetricTile label="Reservas" value={summary.totalReserved} />
        <MetricTile label="Ocupacion" value={`${summary.occupancyRate}%`} />
      </div>
      <button type="button" onClick={onCreate} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-accent/40 bg-orange-50 px-4 text-sm font-black text-accent">
        <Plus className="h-4 w-4" />
        Crear turno este dia
      </button>
    </section>
  )
}

function MetricTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-black text-slate-950">{value}</p>
    </div>
  )
}

function WeekDaySelector({
  weekDays,
  selectedYMD,
  onSelect,
  getSessionTotals,
}: {
  weekDays: Array<{ date: dayjs.Dayjs; ymd: string; sessions: SessionRow[] }>
  selectedYMD: string
  onSelect: (ymd: string) => void
  getSessionTotals: (sessionId: string) => {
    totalReserved: number
    totalCapacity: number
  }
}) {
  return (
    <div className="mt-5 overflow-x-auto pb-1">
      <div className="flex min-w-max gap-2">
        {weekDays.map(({ date, ymd, sessions: daySessions }) => {
          const isSelected = ymd === selectedYMD
          const reserved = daySessions.reduce((sum, session) => sum + getSessionTotals(session.id).totalReserved, 0)

          return (
            <button
              key={ymd}
              type="button"
              onClick={() => onSelect(ymd)}
              className={`min-h-20 w-32 rounded-2xl border px-3 py-2 text-left transition ${
                isSelected
                  ? 'border-accent bg-accent text-white shadow-[0_16px_35px_rgba(249,115,22,0.2)]'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-accent/40'
              }`}
            >
              <span className={`block text-[10px] font-black uppercase tracking-[0.12em] ${isSelected ? 'text-white/75' : 'text-slate-400'}`}>
                {date.format('ddd')}
              </span>
              <span className="mt-1 block text-xl font-black">{date.format('D')}</span>
              <span className={`mt-1 block text-xs font-bold ${isSelected ? 'text-white/80' : 'text-slate-500'}`}>
                {daySessions.length} turnos · {reserved} reservas
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SessionDaySection({
  date,
  selected,
  sessions,
  onSelect,
  onCreate,
  renderSession,
}: {
  date: dayjs.Dayjs
  selected: boolean
  sessions: SessionRow[]
  onSelect: () => void
  onCreate: () => void
  renderSession: (session: SessionRow) => ReactNode
}) {
  return (
    <section
      className={`rounded-[1.45rem] border bg-white p-3 shadow-[0_16px_45px_rgba(15,23,42,0.045)] sm:p-4 ${
        selected ? 'border-accent ring-2 ring-accent/10' : 'border-slate-200'
      }`}
    >
      <button type="button" onClick={onSelect} className="mb-3 flex w-full items-center justify-between gap-3 rounded-2xl px-1 text-left">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{date.format('dddd')}</p>
          <h3 className="mt-1 truncate font-heading text-xl font-black tracking-[-0.045em] text-slate-950">
            {date.format('D [de] MMMM')}
          </h3>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${sessions.length > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
          {sessions.length} {sessions.length === 1 ? 'turno' : 'turnos'}
        </span>
      </button>

      <div className="space-y-3">
        {sessions.length === 0 ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-slate-400">
                <Clock3 className="h-5 w-5" />
              </div>
              <div>
                <p className="font-black text-slate-950">No hay turnos programados.</p>
                <p className="text-sm text-slate-500">Este dia esta libre en el calendario operativo.</p>
              </div>
            </div>
            <button type="button" onClick={onCreate} className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700">
              Crear turno este dia
            </button>
          </div>
        ) : (
          sessions.map((session) => renderSession(session))
        )}
      </div>
    </section>
  )
}

function SessionsSkeleton() {
  return (
    <div className="space-y-3" aria-label="Cargando turnos">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="rounded-[1.45rem] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.045)]">
          <div className="animate-pulse space-y-4">
            <div className="flex items-center justify-between">
              <div className="h-5 w-40 rounded-full bg-slate-100" />
              <div className="h-7 w-20 rounded-full bg-slate-100" />
            </div>
            <div className="h-24 rounded-3xl bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  )
}
