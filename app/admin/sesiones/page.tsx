'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Boxes, CalendarDays, ChevronLeft, ChevronRight, Plus, UserCheck, Users } from 'lucide-react'
import { AdminSessionAccordion } from '@/components/admin/AdminOperationalComponents'
import { AdminPageHeader } from '@/components/admin/AdminVisualSystem'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/ToastProvider'
import { adminCancelSession } from '@/lib/services/adminBookingService'
import { fetchAdminSessionCalendar, type AdminCalendarSession } from '@/lib/services/adminSessionsService'
import { supabase } from '@/lib/supabaseClient'
import { useAcademyLocations, useGenerateWeeklySessions, useWeeklySessionTemplates } from '@/lib/infrastructureQueries'
import { calendarDate, calendarDayLabel, calendarTime, shiftDate, weekDates } from '@/lib/utils/introCalendar'
import { operationalDate } from '@/lib/utils/adminCalendar'
import { capacityForAdminSession, sessionEditorHref, sessionSite, sessionsHref, type SessionSite } from '@/lib/utils/adminSessionPlanning'

const sites: { value: SessionSite; label: string }[] = [
  { value: 'all', label: 'Todas las sedes' }, { value: 'tiabaya', label: 'Tiabaya' }, { value: 'umacollo', label: 'Umacollo' },
]
const calendarKey = ['admin-session-calendar']

export default function AdminSessionsPage() {
  const today = operationalDate()
  const [date, setDate] = useState(today)
  const [site, setSite] = useState<SessionSite>('all')
  const [openSessionId, setOpenSessionId] = useState<string | undefined>()
  const [initialized, setInitialized] = useState(false)
  const [cancellation, setCancellation] = useState<AdminCalendarSession | null>(null)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const savingRef = useRef(false)
  const [showGenerate, setShowGenerate] = useState(false)
  const [weeksToGenerate, setWeeksToGenerate] = useState(4)
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([])
  const templates = useWeeklySessionTemplates()
  const locations = useAcademyLocations()
  const generateSessions = useGenerateWeeklySessions()
  const toast = useToast()
  const client = useQueryClient()
  const days = weekDates(date)
  const first = days[0]
  const last = days[6]
  const queryKey = useMemo(() => [...calendarKey, first], [first])
  const calendar = useQuery({
    queryKey,
    queryFn: ({ signal }) => fetchAdminSessionCalendar(`${first}T00:00:00-05:00`, `${shiftDate(last, 2)}T00:00:00-05:00`, signal),
    enabled: initialized,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setDate(operationalDate(params.get('date')))
    setSite(sessionSite(params.get('location')))
    setOpenSessionId(params.get('session') ?? undefined)
    setInitialized(true)
  }, [])

  useEffect(() => {
    if (!initialized) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void client.invalidateQueries({ queryKey }), 500)
    }
    const channel = supabase.channel(`admin-turnos-${first}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_distance_allocations' }, refresh)
      .subscribe()
    return () => {
      if (timer) clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [client, first, initialized, queryKey])

  function select(nextDate: string, nextSite = site) {
    setDate(nextDate)
    setSite(nextSite)
    setOpenSessionId(undefined)
    window.history.replaceState(null, '', sessionsHref(nextDate, nextSite))
  }

  const sessions = calendar.isError ? [] : calendar.data?.sessions ?? []
  const bookings = calendar.isError ? [] : calendar.data?.bookings ?? []
  const rosterBySession = bookings.reduce((map, row) => {
    const roster = map.get(row.session_id) ?? []
    roster.push(row)
    map.set(row.session_id, roster)
    return map
  }, new Map<string, typeof bookings>())
  const occupiedBySession = new Map([...rosterBySession].map(([id, roster]) => [id, roster.filter(row => row.status === 'reserved' || row.status === 'attended')]))
  const week = sessions.filter(session => {
    const key = calendarDate(session.startAt)
    return key >= first && key <= last && (site === 'all' || session.location?.code === site)
  })
  const selected = week.filter(session => calendarDate(session.startAt) === date)
  const now = Date.now()
  const scheduled = week.filter(session => session.status === 'scheduled')
  const reserved = (id: string) => (rosterBySession.get(id) ?? []).filter(row => row.status === 'reserved').length
  const activeReservations = scheduled.reduce((sum, session) => sum + reserved(session.id), 0)
  const attendancePending = scheduled.filter(session => Date.parse(session.endAt) <= now).reduce((sum, session) => sum + reserved(session.id), 0)
  const visibleData = !calendar.isPending && !calendar.isError
  const createHref = sessionEditorHref('new', date, site)

  function startCancellation(session: AdminCalendarSession) {
    setReason('')
    setCancelError(null)
    setCancellation(session)
  }

  async function cancelSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!cancellation || !reason.trim() || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setCancelError(null)
    try {
      const count = await adminCancelSession(supabase, { sessionId: cancellation.id, reason: reason.trim() })
      setCancellation(null)
      toast.push({ message: `Turno cancelado. Reservas afectadas: ${count ?? 0}`, type: 'success' })
      await client.invalidateQueries({ queryKey: calendarKey })
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : 'No se pudo cancelar el turno.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Turnos"
        eyebrow="Agenda · hora de Lima"
        description="Consulta horarios y gestiona los turnos de cada sede."
        actions={<>
          <Link href="/admin/ajustes/infraestructura" className="btn-outline btn-sm"><Boxes aria-hidden="true" className="size-4" /> Días y horarios</Link>
          <button type="button" className="btn-outline btn-sm" onClick={() => { setSelectedTemplates([]); setShowGenerate(true) }}><CalendarDays aria-hidden="true" className="size-4" /> Generar turnos</button>
          <Link href={createHref} className="btn btn-sm"><Plus aria-hidden="true" className="size-4" /> Nuevo turno manual</Link>
        </>}
      />

      <Modal isOpen={showGenerate} onClose={() => { if (!generateSessions.isPending) setShowGenerate(false) }} title="Generar turnos">
        <form className="space-y-4" onSubmit={async event => {
          event.preventDefault()
          if (generateSessions.isPending || !selectedTemplates.length || !Number.isInteger(weeksToGenerate) || weeksToGenerate < 1 || weeksToGenerate > 24) return
          try {
            const count = await generateSessions.mutateAsync({ weekStart: first, weeks: weeksToGenerate, templateIds: selectedTemplates })
            await client.invalidateQueries({ queryKey: calendarKey })
            toast.push({ message: count ? `Turnos generados: ${count}.` : 'No se crearon turnos nuevos.', type: 'success' })
            setShowGenerate(false)
          } catch (error) {
            toast.push({ message: error instanceof Error ? error.message : 'No se pudieron generar los turnos.', type: 'error' })
          }
        }}>
          <p className="text-sm text-slate-600">Elige los horarios que deseas generar desde la semana seleccionada. Los turnos existentes no se duplican. La semana completa puede incluir días que ya pasaron.</p>
          <p className="text-sm font-semibold text-slate-800">Semana inicial: {calendarDayLabel(first, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          <fieldset className="space-y-2 rounded-xl border border-blue-100 p-3">
            <legend className="px-1 text-sm font-bold text-slate-800">Horarios que deseas generar</legend>
            {(templates.isLoading || locations.isLoading) && <p className="text-sm text-slate-600">Cargando horarios…</p>}
            {(templates.isError || locations.isError) && <p role="alert" className="text-sm text-red-700">No se pudieron cargar los horarios o las sedes. Inténtalo de nuevo.</p>}
            {!templates.isLoading && !locations.isLoading && !templates.isError && !locations.isError && (templates.data ?? []).filter(item => item.is_active && locations.data?.some(location => location.id === item.location_id && location.is_active)).length === 0 && <p className="text-sm text-slate-600">No hay horarios activos. Agrégalos en Configuración.</p>}
            <div className="max-h-64 space-y-1 overflow-y-auto">{(templates.data ?? []).filter(item => item.is_active && locations.data?.some(location => location.id === item.location_id && location.is_active)).map(item => <label key={item.id} className="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-blue-50">
              <input type="checkbox" checked={selectedTemplates.includes(item.id)} onChange={event => setSelectedTemplates(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))} />
              <span className="text-sm text-slate-800"><strong>{item.label}</strong> · {item.location?.name ?? 'Sede'} · {['','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'][item.weekday]} {item.start_time.slice(0,5)}–{item.end_time.slice(0,5)}</span>
            </label>)}</div>
          </fieldset>
          <label className="grid gap-2 text-sm font-semibold text-slate-700">Semanas a generar
            <input className="input" type="number" min={1} max={24} required value={weeksToGenerate} onChange={event => setWeeksToGenerate(Number(event.target.value))} />
          </label>
          <button type="submit" className="btn" disabled={generateSessions.isPending || !selectedTemplates.length || templates.isError || locations.isError}>{generateSessions.isPending ? 'Generando…' : 'Generar turnos'}</button>
        </form>
      </Modal>

      <div role="note" className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-950">
        <strong>Arcos compartidos entre sedes:</strong> dos arcos de Tiabaya están en Umacollo durante la semana y regresan el fin de semana. Si los horarios coinciden, confirma el equipo antes de reservar: los cupos mostrados no descuentan automáticamente este traslado.
      </div>

      <section aria-label="Calendario de turnos" className="rounded-2xl border border-blue-100 bg-white p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-outline btn-sm" aria-label="Semana anterior" onClick={() => select(shiftDate(date, -7))}><ChevronLeft aria-hidden="true" className="size-4" /></button>
            <h2 className="px-1 text-base font-bold text-[#101e3e]">{calendarDayLabel(first)} – {calendarDayLabel(last, { day: 'numeric', month: 'short', year: 'numeric' })}</h2>
            <button type="button" className="btn-outline btn-sm" aria-label="Semana siguiente" onClick={() => select(shiftDate(date, 7))}><ChevronRight aria-hidden="true" className="size-4" /></button>
            <button type="button" className="btn-outline btn-sm" onClick={() => select(today)}>Hoy</button>
            <label className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-700">
              <span className="sr-only">Ir a una fecha</span>
              <input aria-label="Ir a una fecha" type="date" value={date} onChange={event => { if (event.target.value) select(operationalDate(event.target.value)) }} className="min-h-11 max-w-full rounded-lg border border-blue-100 bg-white px-2 text-sm" />
            </label>
          </div>
          <div role="group" aria-label="Filtrar turnos por sede" className="flex flex-wrap gap-1">
            {sites.map(({ value, label }) => <button key={value} type="button" aria-pressed={site === value} onClick={() => select(date, value)}
              className={`min-h-11 rounded-lg px-3 text-sm font-bold ${site === value ? 'bg-[#0758aa] text-white' : 'bg-blue-50 text-[#0758aa] hover:bg-blue-100'}`}>{label}</button>)}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-7" aria-label="Días de la semana">
          {days.map(day => {
            const count = week.filter(session => session.status === 'scheduled' && calendarDate(session.startAt) === day).length
            return <button key={day} type="button" aria-pressed={day === date} aria-current={day === today ? 'date' : undefined} onClick={() => select(day)}
              className={`min-h-14 min-w-0 rounded-lg border px-1.5 py-1.5 text-center capitalize ${day === date ? 'border-orange-300 bg-orange-50 font-bold text-orange-900' : 'border-blue-100 bg-white text-slate-700 hover:bg-blue-50'}`}>
              <span className="block text-sm">{calendarDayLabel(day, { weekday: 'short', day: 'numeric' })}</span>
              {visibleData && <span className="block text-xs">{count} {count === 1 ? 'turno' : 'turnos'}</span>}
            </button>
          })}
        </div>
      </section>

      <section aria-label="Resumen semanal" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {[
          { label: 'Turnos programados', value: scheduled.length, icon: CalendarDays },
          { label: 'Reservas activas', value: activeReservations, icon: Users },
          { label: 'Asistencias pendientes', value: attendancePending, icon: UserCheck },
        ].map(({ label, value, icon: Icon }) => <div key={label} className="flex min-w-0 items-center gap-2 rounded-xl border border-blue-100 bg-white px-3 py-2">
          <Icon aria-hidden="true" className="size-4 shrink-0 text-accent" /><span className="text-sm text-slate-700">{label}</span>
          <strong className="ml-auto tabular-nums text-[#101e3e]">{visibleData ? value : '—'}</strong>
        </div>)}
      </section>

      <section className="space-y-2.5" aria-labelledby="turnos-del-dia">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="turnos-del-dia" className="text-xl font-bold capitalize text-[#101e3e]">{calendarDayLabel(date, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
            {visibleData && <p className="text-xs text-slate-600">{selected.length} {selected.length === 1 ? 'turno' : 'turnos'}</p>}
          </div>
          <Link href={createHref} className="btn-outline btn-sm text-accent"><Plus aria-hidden="true" className="size-4" /> Crear turno este día</Link>
        </div>
        {calendar.isError ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          No pudimos cargar los turnos. <button type="button" onClick={() => void calendar.refetch()} className="font-bold underline">Reintentar</button>
        </div> : calendar.isPending ? <p role="status" className="rounded-xl border border-blue-100 bg-white p-4 text-sm">Cargando turnos…</p>
          : selected.length === 0 ? <p className="rounded-xl border border-dashed border-blue-200 bg-white p-5 text-sm text-slate-600">No hay turnos programados para ese día y sede.</p>
            : selected.map(session => {
              const start = Date.parse(session.startAt)
              const end = Date.parse(session.endAt)
              const cancelled = session.status === 'cancelled'
              const started = start <= now
              const finished = end <= now
              const count = reserved(session.id)
              const location = sessionSite(session.location?.code ?? null)
              const capacity = !cancelled && !finished && session.locationId && location !== 'all'
                ? capacityForAdminSession(session, location, sessions, occupiedBySession) : null
              const capacityLabel = capacity && (location === 'umacollo'
                ? `${capacity.free}/${capacity.limit} espacios físicos libres`
                : capacity.free === null ? 'Arcos de academia por confirmar' : `${capacity.free}/${capacity.limit} cupos de academia estimados`)
              return <AdminSessionAccordion
                key={`${date}:${site}:${session.id}`}
                sessionId={session.id} startAt={session.startAt} endAt={session.endAt}
                locationName={session.location?.name ?? 'Sede sin asignar'}
                sessionStatusLabel={cancelled ? 'Cancelada' : finished ? 'Finalizada' : started ? 'En curso' : 'Programada'}
                sessionStatusTone={cancelled ? 'danger' : finished ? 'neutral' : started ? 'warning' : 'success'}
                initialExpanded={openSessionId === session.id}
                capacityLabel={capacityLabel || undefined}
                capacityNote={capacity && (location === 'tiabaya'
                  ? 'Arco propio sin límite fijo de sede. Confirma equipo compatible. Se cuentan las pruebas y los horarios simultáneos.'
                  : 'Los cuatro espacios se comparten entre alumnos y pruebas de horarios simultáneos.')}
                totalReserved={count}
                distanceRows={(calendar.data?.allocations ?? []).filter(row => row.session_id === session.id).map(row => ({
                  distance_m: row.distance_m, capacity: row.slot_capacity ?? (row.targets ?? 0) * 4,
                  reserved: (rosterBySession.get(session.id) ?? []).filter(booking => booking.status === 'reserved' && booking.distance_m === row.distance_m).length,
                }))}
                bookings={rosterBySession.get(session.id) ?? []} notes={session.notes}
                attendanceHref={!cancelled && started ? `/admin/asistencia?date=${date}&sessionId=${session.id}` : undefined}
                attendanceLabel={finished && count === 0 ? 'Ver asistencia' : 'Pasar asistencia'}
                editHref={!cancelled ? sessionEditorHref(session.id, date, site) : undefined}
                onCancelByAcademy={!cancelled && !finished ? () => startCancellation(session) : undefined}
              />
            })}
      </section>

      {cancellation && <Modal isOpen title="Cancelar turno por la academia" onClose={() => { if (!savingRef.current) setCancellation(null) }}>
        <form onSubmit={cancelSession} className="space-y-4">
          <div className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm text-slate-800">
            <p className="font-bold capitalize">{calendarDayLabel(calendarDate(cancellation.startAt), { weekday: 'long', day: 'numeric', month: 'long' })} · {calendarTime(cancellation.startAt)}–{calendarTime(cancellation.endAt)} · {cancellation.location?.name}</p>
            <p className="mt-1">Reservas afectadas: <strong>{reserved(cancellation.id)}</strong></p>
            <p className="mt-1">No se consumirá ninguna clase reservada. Se liberarán los cupos y arcos y estas reservas no entrarán en la revisión dominical.</p>
          </div>
          <label className="block text-sm font-semibold">Motivo obligatorio
            <textarea className="input mt-1 min-h-24" required value={reason} disabled={saving} onChange={event => setReason(event.target.value)} />
          </label>
          {cancelError && <p role="alert" className="text-sm text-danger">{cancelError}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-outline btn-sm" disabled={saving} onClick={() => setCancellation(null)}>Volver</button>
            <button type="submit" className="btn-sm bg-rose-700 font-bold text-white hover:bg-rose-800 disabled:opacity-50" disabled={saving || !reason.trim()}>{saving ? 'Cancelando…' : 'Cancelar turno'}</button>
          </div>
        </form>
      </Modal>}
    </div>
  )
}
