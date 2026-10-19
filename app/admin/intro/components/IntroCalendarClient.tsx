'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, rectIntersection, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { CalendarDays, Loader2, Plus, RefreshCw } from 'lucide-react'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useAcademyLocations } from '@/lib/infrastructureQueries'
import { useIntroCalendar } from '@/lib/hooks/useIntroCalendar'
import { useIntroAppointmentActions } from '@/lib/hooks/useIntroAppointmentActions'
import { IntroClassesService, type IntroAppointmentDetails } from '@/lib/services/IntroClassesService'
import { INTRO_STATES, appointmentStatus, calendarDate, calendarDayLabel, calendarTime, canReschedule, filterAppointments, shiftDate, weekDates, type IntroAppointment, type IntroCalendarFilters, type IntroCalendarSession, type IntroState } from '@/lib/utils/introCalendar'
import IntroCalendarToolbar from './IntroCalendarToolbar'
import IntroWeekCalendar from './IntroWeekCalendar'
import IntroDayAgenda from './IntroDayAgenda'
import IntroStatusBoard from './IntroStatusBoard'
import IntroAppointmentCard from './IntroAppointmentCard'
import IntroAppointmentForm from './IntroAppointmentForm'
import IntroAppointmentDetail from './IntroAppointmentDetail'
import RegisterIntroModal from './RegisterIntroModal'

type FormSelection = { client?: IntroAppointment; initialSession?: IntroCalendarSession; requestedState?: IntroState }
const initialFilters: IntroCalendarFilters = { locationId: '', states: [], payment: 'all', search: '' }

export default function IntroCalendarClient() {
  const [date, setDate] = useState(() => calendarDate(new Date()))
  const [view, setView] = useState<'day' | 'week' | 'states'>('day')
  const [filters, setFilters] = useState(initialFilters)
  const [selected, setSelected] = useState<IntroAppointment | null>(null)
  const [form, setForm] = useState<FormSelection | null>(null)
  const [active, setActive] = useState<IntroAppointment | null>(null)
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const operationLock = useRef(false)
  const handledDeepLink = useRef(false)
  const confirm = useConfirm()
  const dates = useMemo(() => weekDates(date), [date])
  const { data: locations = [], error: locationsError } = useAcademyLocations()
  const calendar = useIntroCalendar(dates[0], dates[6], filters.locationId)
  const actions = useIntroAppointmentActions()
  const sessions = calendar.data || []
  const allRows = sessions.flatMap((session) => session.clients)
  const rows = filterAppointments(allRows, filters)
  const visibleRows = view === 'day' ? rows.filter((row) => calendarDate(row.session_start) === date) : rows
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 7 } }), useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }), useSensor(KeyboardSensor))
  const disabled = actions.isPending || confirming || Boolean(form)

  useEffect(() => {
    if (window.matchMedia('(min-width: 1024px)').matches) setView('week')
  }, [])

  useEffect(() => {
    const bookingId = new URLSearchParams(window.location.search).get('editBookingId')
    if (!bookingId || handledDeepLink.current) return
    handledDeepLink.current = true
    let cancelled = false
    void IntroClassesService.getAppointment(bookingId).then((row) => {
      if (cancelled) return
      if (!row) { setFeedback({ error: true, text: 'La cita solicitada no está disponible.' }); return }
      setDate(calendarDate(row.session_start)); setFilters({ ...initialFilters, locationId: row.location_id }); setForm({ client: row })
    }).catch((error) => { if (!cancelled) setFeedback({ error: true, text: error.message }) })
    return () => { cancelled = true; handledDeepLink.current = false }
  }, [])

  const edit = (row: IntroAppointment) => { setSelected(null); setForm({ client: row }); setFeedback(null) }
  const changeState = async (row: IntroAppointment, state: IntroState) => {
    if (operationLock.current || actions.isPending || appointmentStatus(row) === state) return
    setSelected(null); setFeedback(null)
    if (state === 'paid' || (state === 'pending' && row.intro_class_type !== 'paid') || (state === 'reserved' && row.intro_class_type === 'paid')) {
      setForm({ client: row, requestedState: state }); return
    }
    operationLock.current = true; setConfirming(true)
    try {
      const message = state === 'cancelled' ? `¿Cancelar la cita de ${row.full_name}? Se liberará su cupo y se conservará el pago registrado.`
        : state === 'pending' && row.payment_status === 'paid' ? `¿Cambiar a Por pagar el pago confirmado de ${row.full_name}? Esta corrección cambiará el ingreso registrado.`
          : row.booking_status !== 'reserved' && ['reserved', 'pending'].includes(state) ? `¿Reactivar la cita de ${row.full_name}? Se comprobará que su turno tenga cupo disponible.`
            : `¿Cambiar la cita de ${row.full_name} a ${state === 'attended' ? 'Asistido' : state === 'no_show' ? 'No show' : 'Reservado'}?`
      if (!await confirm(message, { title: 'Cambiar estado de la cita', confirmLabel: 'Guardar cambio' })) return
      await actions.mutateAsync({ bookingId: row.booking_id, expectedUpdatedAt: row.updated_at, action: 'state', state })
      setFeedback({ error: false, text: 'Estado actualizado.' })
    } catch (error) { setFeedback({ error: true, text: error instanceof Error ? error.message : 'No se pudo cambiar el estado.' }) }
    finally { operationLock.current = false; setConfirming(false) }
  }

  const move = async (row: IntroAppointment, target: IntroCalendarSession) => {
    if (operationLock.current || actions.isPending || target.session_id === row.session_id) return
    if (!canReschedule(row) || !target.can_book) { setFeedback({ error: true, text: 'Elige un turno disponible para una cita activa.' }); return }
    operationLock.current = true; setConfirming(true); setFeedback(null)
    try {
      if (row.location_id !== target.location_id && !await confirm(
        `${row.full_name}: ${row.location_name}, ${calendarDayLabel(calendarDate(row.session_start))} ${calendarTime(row.session_start)} → ${target.location_name}, ${calendarDayLabel(calendarDate(target.start_at))} ${calendarTime(target.start_at)}.`,
        { title: 'Cambiar sede y horario', confirmLabel: 'Reprogramar' },
      )) return
      await actions.mutateAsync({ bookingId: row.booking_id, expectedUpdatedAt: row.updated_at, action: 'move', sessionId: target.session_id })
      setFeedback({ error: false, text: 'Cita reprogramada.' })
    } catch (error) { setFeedback({ error: true, text: error instanceof Error ? error.message : 'No se pudo mover la cita.' }) }
    finally { operationLock.current = false; setConfirming(false) }
  }

  const onDragEnd = (event: DragEndEvent) => {
    setActive(null)
    const row = event.active.data.current?.row as IntroAppointment | undefined
    if (!row || !event.over) return
    if (event.over.data.current?.session) void move(row, event.over.data.current.session)
    else if (event.over.data.current?.state) void changeState(row, event.over.data.current.state)
  }

  const save = async (details: IntroAppointmentDetails, sessionId: string, requestId: string) => {
    if (!form) return
    if (form.client) {
      await actions.mutateAsync({ bookingId: form.client.booking_id, expectedUpdatedAt: form.client.updated_at, action: 'edit', sessionId,
        state: form.requestedState ? appointmentStatus({ booking_status: 'reserved', payment_status: details.paymentStatus }) : undefined, details })
    } else {
      await IntroClassesService.registerAppointment({ ...details, sessionId, requestId })
      await actions.refresh()
    }
    setForm(null); setSelected(null); setFeedback({ error: false, text: 'Cita guardada.' })
    if (window.location.search.includes('editBookingId')) window.history.replaceState({}, '', window.location.pathname)
  }

  const latestSelected = selected && (allRows.find((row) => row.booking_id === selected.booking_id) || selected)
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-orange-50 text-accent"><CalendarDays size={21} /></span><div><h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900">Calendario de clases de prueba</h1><p className="mt-1 text-sm text-slate-500">Citas y disponibilidad por sede</p></div></div>
      <div className="flex gap-2"><button type="button" disabled={disabled || calendar.isFetching} aria-label="Actualizar calendario" onClick={() => void calendar.refetch()} className="rounded-xl border border-slate-200 bg-white p-3 text-slate-500"><RefreshCw size={17} className={calendar.isFetching ? 'animate-spin' : ''} /></button><button type="button" disabled={disabled} onClick={() => { setFeedback(null); setForm({}) }} className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-bold text-white shadow-sm"><Plus size={17} />Nueva cita</button></div>
    </div>
    <IntroCalendarToolbar dates={dates} date={date} onDateChange={setDate} onNavigate={(days) => setDate(days ? shiftDate(date, days) : calendarDate(new Date()))} filters={filters} onFilters={setFilters} locations={locations} view={view} onView={setView} />
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-xs text-slate-500"><span><strong className="text-slate-900">{visibleRows.length}</strong> citas visibles</span><span><strong className="text-amber-700">{visibleRows.filter((row) => row.payment_status === 'pending').length}</strong> por pagar</span><span><strong className="text-emerald-700">{visibleRows.filter((row) => row.payment_status === 'paid').length}</strong> pagadas</span><span className={`ml-auto ${view === 'day' ? 'hidden' : 'hidden lg:block'}`}>Arrastra las tarjetas para {view === 'week' ? 'cambiar de turno' : 'cambiar de estado'}</span>{(actions.isPending || confirming) && <span className="flex items-center gap-1 text-accent"><Loader2 size={13} className="animate-spin" />{actions.isPending ? 'Guardando…' : 'Confirmación pendiente'}</span>}</div>
    {feedback && <p role={feedback.error ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${feedback.error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{feedback.text}</p>}
    {locationsError && <p role="alert" className="text-sm text-rose-700">No se pudieron cargar las sedes.</p>}
    {calendar.isLoading ? <div aria-label="Cargando calendario" className="grid h-96 grid-cols-7 gap-2 rounded-2xl bg-white p-4">{dates.map((day) => <div key={day} className="animate-pulse rounded-xl bg-slate-100" />)}</div>
      : calendar.isError ? <div role="alert" className="rounded-2xl border border-rose-200 bg-white p-8 text-center"><p className="font-bold text-slate-800">No pudimos cargar las citas.</p><p className="mt-2 text-sm text-rose-700">{calendar.error.message}</p><button type="button" onClick={() => void calendar.refetch()} className="mt-4 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white">Reintentar</button></div>
        : <DndContext sensors={sensors} collisionDetection={rectIntersection} onDragStart={(event) => setActive(event.active.data.current?.row || null)} onDragCancel={() => setActive(null)} onDragEnd={onDragEnd} accessibility={{ screenReaderInstructions: { draggable: 'Pulsa espacio para recoger una cita. Usa las flechas para moverla y espacio para soltarla. Escape cancela. También puedes usar Editar o Cambiar estado.' }, announcements: {
          onDragStart: ({ active: item }) => `Has recogido la cita de ${item.data.current?.row.full_name || 'prueba'}.`,
          onDragOver: ({ over }) => over?.data.current?.session
            ? `Destino: ${over.data.current.session.location_name}, ${calendarTime(over.data.current.session.start_at)}.`
            : over?.data.current?.state ? `Destino: ${INTRO_STATES.find((state) => state.value === over.data.current?.state)?.label}.` : 'No hay un destino disponible.',
          onDragEnd: ({ over }) => over ? 'Cita soltada. Se comprobará el cambio antes de guardarlo.' : 'Movimiento cancelado.',
          onDragCancel: () => 'Movimiento cancelado.',
        } }}>
          {view === 'day' ? <IntroDayAgenda sessions={sessions} rows={rows} date={date} onCreate={(initialSession) => setForm({ initialSession })} active={active} onSelect={setSelected} onEdit={edit} disabled={disabled} /> : view === 'week' ? <IntroWeekCalendar sessions={sessions} rows={rows} dates={dates} selectedDay={date} onDayChange={setDate} onCreate={(initialSession) => setForm({ initialSession })} active={active} onSelect={setSelected} onEdit={edit} disabled={disabled} />
            : <IntroStatusBoard rows={rows} onSelect={setSelected} onEdit={edit} disabled={disabled} />}
          <DragOverlay>{active && <IntroAppointmentCard row={active} onSelect={() => {}} onEdit={() => {}} disabled overlay />}</DragOverlay>
        </DndContext>}
    {latestSelected && !form && <IntroAppointmentDetail row={latestSelected} onClose={() => setSelected(null)} onEdit={() => edit(latestSelected)} onState={(state) => void changeState(latestSelected, state)} busy={disabled} />}
    {form?.client && <IntroAppointmentForm key={form.client.booking_id} {...form} onClose={() => { setForm(null); if (window.location.search.includes('editBookingId')) window.history.replaceState({}, '', window.location.pathname) }} onSave={save} />}
    {form && !form.client && <RegisterIntroModal key={form.initialSession?.session_id || 'new'} isOpen initialSession={form.initialSession} onClose={() => setForm(null)} onSave={save} />}
  </div>
}
