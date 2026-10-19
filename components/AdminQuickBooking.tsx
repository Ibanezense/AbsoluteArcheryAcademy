'use client'

import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { bookingFlowReducer, initialBookingFlow } from '@/lib/utils/adminQuickBookingFlow'
import Avatar from '@/components/ui/Avatar'
import { useAdminBookSession, useAdminStudents, type AdminStudent } from '@/lib/adminBookingQueries'
import { useToast } from '@/components/ui/ToastProvider'
import { supabase } from '@/lib/supabaseClient'
import { getAdminQuickBookingDateRange, getQuickBookingStudentOptions, groupAdminBookingSessions } from '@/lib/utils/adminQuickBooking'
import { getLimaDateKey } from '@/lib/utils/membershipCycles'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Search,
  ShieldAlert,
  Target,
  UserRound,
  X,
} from 'lucide-react'

type AvailableSession = {
  location_name?: string
  session_id: string
  start_at: string
  end_at: string
  status: 'scheduled' | 'cancelled'
  already_reserved: boolean
  distance_m: number
  bow_usage_type: 'shared_inventory' | 'assigned' | 'own'
  slot_capacity: number
  distance_reserved: number
  bow_capacity: number | null
  bow_reserved: number | null
  spots_for_student: number
}

type Props = {
  isOpen: boolean
  onClose: () => void
  studentId?: string
  onBooked?: () => Promise<void>
}

type AlertItem = {
  tone: 'success' | 'warning' | 'danger' | 'neutral'
  message: string
}

function todayLocalValue() {
  return getLimaDateKey(new Date())
}

function formatDateLabel(value?: string | null) {
  if (!value) return 'Por definir'
  return new Date(`${value}T00:00:00`).toLocaleDateString('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatTimeRange(startAt?: string | null, endAt?: string | null) {
  if (!startAt || !endAt) return 'Por definir'
  return `${new Date(startAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })} - ${new Date(endAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })}`
}

function studentStatusLabel(status: AdminStudent['status']) {
  switch (status) {
    case 'active':
      return 'Activo'
    case 'expired':
      return 'Vencido'
    case 'no_classes':
      return 'Sin clases'
    case 'no_membership':
      return 'Sin membresia'
    default:
      return 'Inactivo'
  }
}

function statusToneClass(status: AdminStudent['status']) {
  switch (status) {
    case 'active':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    case 'expired':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    case 'no_classes':
    case 'no_membership':
      return 'border-rose-200 bg-rose-50 text-rose-700'
    default:
      return 'border-slate-200 bg-slate-100 text-slate-600'
  }
}

function equipmentLabel(student: AdminStudent) {
  if (student.has_own_bow) return 'Arco propio'
  if (student.assigned_bow) return 'Arco asignado'
  if (student.bow_poundage) return `Arco academia ${student.bow_poundage} lb`
  return 'Sin equipo definido'
}

function occupancyLabel(session: AvailableSession) {
  if (session.bow_usage_type === 'own' || session.bow_usage_type === 'assigned') {
    return { label: 'Disponibilidad libre', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' }
  }
  const remaining = session.spots_for_student
  if (remaining <= 0) return { label: 'Sin equipo', className: 'border-rose-200 bg-rose-50 text-rose-700' }
  if (remaining <= 2) return { label: 'Pocos equipos', className: 'border-amber-200 bg-amber-50 text-amber-700' }
  return { label: 'Disponible', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' }
}

function equipmentAvailabilityText(session: AvailableSession) {
  if (session.bow_usage_type === 'own') return 'Equipo propio · disponibilidad libre'
  if (session.bow_usage_type === 'assigned') return 'Equipo asignado · disponibilidad libre'
  return `${Math.max(session.spots_for_student, 0)} equipos disponibles`
}

function alertToneClass(tone: AlertItem['tone']) {
  switch (tone) {
    case 'success':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800'
    case 'warning':
      return 'border-amber-200 bg-amber-50 text-amber-800'
    case 'danger':
      return 'border-rose-200 bg-rose-50 text-rose-800'
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700'
  }
}

function AlertIcon({ tone }: { tone: AlertItem['tone'] }) {
  if (tone === 'success') return <CheckCircle2 className="h-4 w-4" />
  if (tone === 'danger') return <ShieldAlert className="h-4 w-4" />
  return <AlertTriangle className="h-4 w-4" />
}

export default function AdminQuickBooking({ isOpen, onClose, studentId, onBooked }: Props) {
  const [flow, dispatchFlow] = useReducer(bookingFlowReducer, undefined, () => initialBookingFlow(todayLocalValue(), studentId))
  const { studentId: selectedStudent, date: selectedDate, sessionId: selectedSession, forceBooking, step } = flow
  const setSelectedStudent = (value: string) => dispatchFlow({ type: 'student', value })
  const setSelectedDate = (value: string) => dispatchFlow({ type: 'date', value })
  const setSelectedSession = (value: string) => dispatchFlow({ type: 'session', value })
  const setForceBooking = (value: boolean) => dispatchFlow({ type: 'force', value })
  const dialogRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const submittingRef = useRef(false)
  const [studentSearch, setStudentSearch] = useState('')
  const [adminNotes, setAdminNotes] = useState('')
  const [sessions, setSessions] = useState<AvailableSession[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [sessionsError, setSessionsError] = useState(false)
  const [retrySessions, setRetrySessions] = useState(0)

  const { data: students = [], isLoading: studentsLoading, isError: studentsError, refetch: retryStudents } = useAdminStudents()
  const bookSessionMutation = useAdminBookSession()
  const toast = useToast()
  const dateRange = useMemo(() => getAdminQuickBookingDateRange(selectedDate), [selectedDate])
  const selectedMonth = selectedDate.slice(0, 7)

  const availableStudents = useMemo(
    () => studentId ? students.filter((student) => student.id === studentId) : getQuickBookingStudentOptions(students, studentSearch, 10),
    [studentId, studentSearch, students],
  )

  const selectedStudentData = students.find((student) => student.id === selectedStudent) || null

  useEffect(() => {
    if (!isOpen) return

    dispatchFlow({ type: 'reset', date: todayLocalValue(), studentId })
    setStudentSearch('')
    setAdminNotes('')
    setSessions([])
  }, [isOpen, studentId])

  useEffect(() => {
    if (!isOpen) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = requestAnimationFrame(() => dialogRef.current?.focus())
    return () => {
      cancelAnimationFrame(frame)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [isOpen])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
    if (isOpen) dialogRef.current?.focus()
  }, [step, isOpen])

  useEffect(() => {
    let current = true
    const loadSessions = async () => {
      if (!isOpen || !selectedStudent) {
        setSessions([])
        setSessionsLoading(false)
        return
      }

      try {
        setSessionsLoading(true)
        setSessionsError(false)
        if (dateRange.fromDate > dateRange.toDate) {
          setSessions([])
          return
        }

        const { data, error } = await supabase.rpc('get_admin_available_sessions_for_student', {
          p_student_id: selectedStudent,
          p_date_from: dateRange.fromDate,
          p_date_to: dateRange.toDate,
        })

        if (error) throw error

        const available = (data || []) as AvailableSession[]
        if (available.length > 0) {
          const { data: locations, error: locationError } = await supabase.from('sessions')
            .select('id, location:academy_locations(name)')
            .in('id', available.map((session) => session.session_id))
          if (locationError) throw locationError
          const names = new Map((locations || []).map((row: any) => [row.id, row.location?.name]))
          if (current) setSessions(available.map((session) => ({ ...session, location_name: names.get(session.session_id) })))
        } else if (current) setSessions([])
      } catch (loadError) {
        console.error('Error loading available sessions for admin booking:', loadError)
        if (current) { setSessions([]); setSessionsError(true) }
      } finally {
        if (current) setSessionsLoading(false)
      }
    }

    void loadSessions()
    return () => { current = false }
  }, [dateRange.fromDate, dateRange.toDate, selectedStudent, isOpen, retrySessions])

  const sessionsByDate = useMemo(() => groupAdminBookingSessions(sessions), [sessions])

  const sessionsForSelectedDate = useMemo(
    () => sessionsByDate[selectedDate] || [],
    [selectedDate, sessionsByDate],
  )

  useEffect(() => {
    if (!selectedSession) return
    if (!sessionsForSelectedDate.some((session) => session.session_id === selectedSession)) {
      setSelectedSession('')
      setForceBooking(false)
    }
  }, [selectedSession, sessionsForSelectedDate])

  const selectedSessionData = sessions.find((session) => session.session_id === selectedSession) || null

  const alerts = useMemo<AlertItem[]>(() => {
    const items: AlertItem[] = []

    if (!selectedStudentData) {
      items.push({ tone: 'neutral', message: 'Selecciona un alumno para validar disponibilidad y reglas reales.' })
      return items
    }

    if (selectedStudentData.status !== 'active') {
      items.push({
        tone: 'danger',
        message: `El alumno esta ${studentStatusLabel(selectedStudentData.status).toLowerCase()} y la reserva no deberia confirmarse.`,
      })
    } else if (selectedStudentData.classes_remaining <= 0) {
      items.push({ tone: 'danger', message: 'El alumno no tiene clases disponibles en su membresia actual.' })
    } else {
      items.push({ tone: 'success', message: 'El alumno tiene una membresia utilizable para crear una reserva manual.' })
    }

    if (!selectedSessionData) {
      items.push({ tone: 'neutral', message: 'Elige fecha y turno para completar el resumen de la reserva.' })
      return items
    }

    if (selectedSessionData.already_reserved) {
      items.push({ tone: 'danger', message: 'El alumno ya tiene una reserva activa en este turno.' })
    }

    if (selectedSessionData.spots_for_student <= 0 && !forceBooking) {
      items.push({ tone: 'warning', message: 'Para este turno ya no tenemos equipo disponible. Por favor, reserva otro turno disponible. Activa forzar reserva solo si corresponde.' })
    }

    if (selectedSessionData.spots_for_student <= 0 && forceBooking) {
      items.push({ tone: 'warning', message: 'Reserva forzada activa: se registrara aunque el turno no tenga equipo libre.' })
    }

    if (selectedSessionData.spots_for_student > 0) {
      items.push({ tone: 'success', message: 'La reserva esta permitida para esta fecha y turno.' })
    }

    if (selectedSessionData.bow_usage_type === 'shared_inventory' && selectedSessionData.bow_capacity !== null) {
      items.push({
        tone: 'neutral',
        message: `Inventario compartido: ${(selectedSessionData.bow_reserved || 0)}/${selectedSessionData.bow_capacity} arcos ocupados.`,
      })
    }

    return items
  }, [forceBooking, selectedSessionData, selectedStudentData])

  const blockingReservation =
    !selectedStudentData
    || !selectedSessionData
    || selectedStudentData.status !== 'active'
    || selectedStudentData.classes_remaining <= 0
    || selectedSessionData.already_reserved
    || (selectedSessionData.spots_for_student <= 0 && !forceBooking)

  const handleBooking = async () => {
    if (blockingReservation || submittingRef.current || bookSessionMutation.isPending) return
    submittingRef.current = true

    try {
      await bookSessionMutation.mutateAsync({
        sessionId: selectedSession,
        studentId: selectedStudent,
        adminNotes: adminNotes.trim() || undefined,
        forceBooking,
      })

      toast.push({ message: 'Reserva creada correctamente.', type: 'success' })
      onClose()
      try {
        await onBooked?.()
      } catch {
        toast.push({ message: 'La reserva se guardó. No se pudo actualizar el perfil; vuelve a abrirlo.', type: 'error' })
      }
    } catch (error: any) {
      toast.push({ message: error?.message || 'No se pudo crear la reserva.', type: 'error' })
    } finally {
      submittingRef.current = false
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[110] bg-slate-950/18 backdrop-blur-[2px]" onClick={() => { if (!bookSessionMutation.isPending) onClose() }}>
      <div className="flex h-[100dvh] min-w-0 items-center justify-center p-2 sm:p-6" onClick={(event) => event.stopPropagation()}>
        <div
          ref={dialogRef}
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !bookSessionMutation.isPending) { event.stopPropagation(); onClose() }
            if (event.key !== 'Tab') return
            const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]') || []).filter((element) => element.getClientRects().length > 0)
            const first = focusable[0]
            const last = focusable[focusable.length - 1]
            if (!first) { event.preventDefault(); return }
            if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus() }
            else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) { event.preventDefault(); first.focus() }
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Reserva rapida"
          className="flex max-h-[calc(100dvh-1rem)] min-w-0 w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_32px_90px_rgba(15,23,42,0.18)]"
        >
          {studentsError && <div role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><p>No pudimos cargar los alumnos.</p><button type="button" className="btn-outline mt-2" onClick={() => retryStudents()}>Reintentar alumnos</button></div>}
          <div className="shrink-0 border-b border-slate-200 px-4 py-3 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="hidden h-10 w-10 shrink-0 place-items-center sm:grid rounded-2xl border border-orange-200 bg-orange-50 text-accent">
                  <CalendarDays className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-accent">Reserva rapida</p>
                  <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-950">Reservar una clase</h2>
                  <p className="mt-1 text-sm text-slate-500">Selecciona el alumno y un turno disponible.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={bookSessionMutation.isPending}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Cerrar reserva rapida"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <ol aria-label="Pasos de la reserva" className="grid shrink-0 grid-cols-3 gap-1 border-b border-slate-200 px-3 py-2 text-xs xl:hidden">
            {['Alumno', 'Fecha y turno', 'Confirmación'].map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined} className={`rounded-lg px-2 py-2 text-center ${step === index ? 'bg-orange-50 font-semibold text-orange-800' : 'text-slate-500'}`}>{index + 1}. {label}</li>)}
          </ol>
          <div ref={scrollRef} className="min-h-0 min-w-0 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <div className="min-w-0 space-y-4">
                <section className={`${step === 0 ? 'block' : 'hidden'} min-w-0 rounded-xl border border-slate-200 bg-white p-4 xl:block`}>
                  <p className="text-lg font-semibold tracking-[-0.02em] text-slate-950">1. Alumno</p>
                  {!studentId && <div className="relative mt-4">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="student-search"
                      aria-label="Buscar alumno"
                      type="search"
                      value={studentSearch}
                      onChange={(event) => setStudentSearch(event.target.value)}
                      className="h-12 min-w-0 max-w-full w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm text-slate-950 outline-none transition focus:border-accent/40 focus:ring-4 focus:ring-orange-100"
                      placeholder="Buscar por nombre, DNI o telefono"
                      disabled={studentsLoading}
                    />
                  </div>}

                  <div className="mt-4 grid gap-3">
                    {availableStudents.map((student) => {
                      const isSelected = student.id === selectedStudent

                      return (
                        <button
                          key={student.id}
                          type="button"
                          disabled={Boolean(studentId)}
                          onClick={() => {
                            setSelectedStudent(student.id)
                            setSelectedSession('')
                            setForceBooking(false)
                          }}
                          className={`min-w-0 rounded-xl border p-4 text-left transition ${
                            isSelected
                              ? 'border-emerald-300 bg-emerald-50/70 shadow-[0_12px_30px_rgba(34,197,94,0.12)]'
                              : 'border-slate-200 bg-white hover:border-orange-200 hover:shadow-[0_14px_35px_rgba(15,23,42,0.06)]'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <Avatar name={student.full_name} url={student.avatar_url || null} size="md" />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <p className="break-words text-sm font-semibold tracking-[-0.02em] text-slate-950">{student.full_name}</p>
                                  <p className="mt-1 text-sm text-slate-500">{student.membership_type || 'Sin membresia activa'}</p>
                                </div>
                                <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusToneClass(student.status)}`}>
                                  {studentStatusLabel(student.status)}
                                </span>
                              </div>

                              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-3">
                                <div>
                                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Clases disponibles</p>
                                  <p className="mt-1 font-semibold text-slate-900">{student.classes_remaining}</p>
                                </div>
                                <div>
                                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Vencimiento</p>
                                  <p className="mt-1 font-semibold text-slate-900">{student.membership_end ? new Date(`${student.membership_end}T00:00:00`).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }) : 'Sin fecha'}</p>
                                </div>
                                <div>
                                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Perfil</p>
                                  <p className="mt-1 font-semibold text-slate-900">{student.distance_m ? `${student.distance_m} m` : 'Sin distancia'} · {equipmentLabel(student)}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>


                  {!studentsLoading && !studentsError && availableStudents.length === 0 && (
                    <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-5 text-sm text-slate-500">
                      No encontramos alumnos con ese criterio.
                    </div>
                  )}
                </section>

                <section className={`${step === 1 ? 'block' : 'hidden'} min-w-0 rounded-xl border border-slate-200 bg-white p-4 xl:block`}>
                  <p className="text-lg font-semibold tracking-[-0.02em] text-slate-950">Fecha y turno</p>
                  <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="relative min-w-0 flex-1">
                      <CalendarDays className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="booking-date"
                        aria-label="Fecha de la reserva"
                        type="date"
                        value={selectedDate}
                        min={dateRange.minDate}
                        onChange={(event) => {
                          setSelectedDate(event.target.value)
                          setSelectedSession('')
                          setForceBooking(false)
                        }}
                        className="h-12 min-w-0 max-w-full w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm text-slate-950 outline-none transition focus:border-accent/40 focus:ring-4 focus:ring-orange-100"
                        disabled={!selectedStudent}
                      />
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                      Mes operativo: <span className="font-bold text-slate-950">{selectedMonth ? new Date(`${selectedMonth}-01T00:00:00`).toLocaleDateString('es-PE', { month: 'long', year: 'numeric' }) : 'Selecciona una fecha'}</span>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    Puedes elegir fechas de otros meses. Los turnos se actualizan según la fecha elegida; la reserva requiere una membresía vigente ese día.
                  </p>
                </section>

                <section className={`${step === 1 ? 'block' : 'hidden'} min-w-0 rounded-xl border border-slate-200 bg-white p-4 xl:block`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-lg font-semibold tracking-[-0.02em] text-slate-950">Turnos disponibles</p>
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                      {sessionsForSelectedDate.length} turnos
                    </span>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {sessionsForSelectedDate.map((session) => {
                      const selected = selectedSession === session.session_id
                      const occupancy = occupancyLabel(session)

                      return (
                        <button
                          key={session.session_id}
                          type="button"
                          onClick={() => {
                            setSelectedSession(session.session_id)
                            if (session.spots_for_student > 0 && session.already_reserved === false) {
                              setForceBooking(false)
                            }
                          }}
                          className={`min-w-0 rounded-xl border bg-white p-4 text-left transition ${
                            selected
                              ? 'border-accent shadow-[0_16px_40px_rgba(249,115,22,0.16)]'
                              : 'border-slate-200 hover:border-orange-200 hover:shadow-[0_14px_35px_rgba(15,23,42,0.06)]'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className={`h-4 w-4 rounded-full border ${selected ? 'border-accent bg-accent' : 'border-slate-300 bg-white'}`} />
                              <p className="text-sm font-semibold tracking-tight text-slate-950">
                                {formatTimeRange(session.start_at, session.end_at)}
                              </p>
                            </div>
                            {selected && <CheckCircle2 className="h-5 w-5 text-accent" />}
                          </div>

                          <div className="mt-4 space-y-2 text-sm text-slate-600">
                            <p className="font-bold text-slate-950">{session.location_name || 'Sede no disponible'}</p>
                            <p className="font-medium text-slate-700">{equipmentAvailabilityText(session)}</p>
                            <div className="flex items-center justify-between">
                              <span>{session.distance_m} m</span>
                              <span>{session.bow_usage_type === 'shared_inventory' ? 'Equipo academia' : 'Equipo definido'}</span>
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <span className={`rounded-full border px-3 py-1 text-xs font-bold ${occupancy.className}`}>
                              {occupancy.label}
                            </span>
                            {session.already_reserved && (
                              <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700">
                                Ya reservado
                              </span>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {!sessionsLoading && !sessionsError && selectedStudent && sessionsForSelectedDate.length === 0 && (
                    <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-5 text-sm text-slate-500">
                      {selectedDate ? `No hay turnos visibles para ${formatDateLabel(selectedDate)}.` : 'Selecciona una fecha para consultar los turnos.'}
                    </div>
                  )}

                  {sessionsError && <div role="alert" className="mt-4 rounded-xl border border-rose-200 p-4 text-sm text-rose-800">No pudimos consultar los turnos. <button type="button" onClick={() => setRetrySessions((value) => value + 1)} className="min-h-11 font-semibold underline">Reintentar</button></div>}
                  {sessionsLoading && (
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">
                      Cargando turnos del alumno para este rango...
                    </div>
                  )}
                </section>

                <section className={`${step === 2 ? 'block' : 'hidden'} min-w-0 rounded-xl border border-slate-200 bg-white p-4 xl:block`}>
                  <p className="text-lg font-semibold tracking-[-0.02em] text-slate-950">Notas y opciones</p>
                  <textarea
                    id="admin-notes"
                    aria-label="Observaciones internas"
                    rows={4}
                    value={adminNotes}
                    onChange={(event) => setAdminNotes(event.target.value)}
                    className="mt-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-accent/40 focus:ring-4 focus:ring-orange-100"
                    placeholder="Observaciones internas"
                    disabled={!selectedStudent || !selectedSession}
                  />
                  <div className="mt-4 flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                    <input
                      id="force-booking"
                      type="checkbox"
                      checked={forceBooking}
                      onChange={(event) => setForceBooking(event.target.checked)}
                      disabled={!selectedStudent || !selectedSession}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-accent focus:ring-accent"
                    />
                    <label htmlFor="force-booking" className="cursor-pointer">
                      Forzar reserva aunque el turno este sin equipo
                    </label>
                  </div>
                </section>
              </div>

              <div className={`${step === 2 ? 'block' : 'hidden'} min-w-0 space-y-4 xl:block`}>
                <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_16px_42px_rgba(15,23,42,0.05)]">
                  <p className="text-lg font-semibold tracking-[-0.02em] text-slate-950">Resumen de la reserva</p>
                  <div className="mt-5 space-y-4 text-sm">
                    <SummaryRow icon={<UserRound className="h-4 w-4" />} label="Alumno" value={selectedStudentData?.full_name || 'Por seleccionar'} />
                    <SummaryRow icon={<CheckCircle2 className="h-4 w-4" />} label="Estado" value={selectedStudentData ? studentStatusLabel(selectedStudentData.status) : 'Sin validar'} badgeClass={selectedStudentData ? statusToneClass(selectedStudentData.status) : undefined} />
                    <SummaryRow icon={<Target className="h-4 w-4" />} label="Membresia" value={selectedStudentData?.membership_type || 'Sin membresia activa'} />
                    <SummaryRow icon={<CalendarDays className="h-4 w-4" />} label="Clases disponibles" value={selectedStudentData ? `${selectedStudentData.classes_remaining} clases` : 'Sin dato'} />
                    <SummaryRow icon={<CalendarDays className="h-4 w-4" />} label="Fecha" value={formatDateLabel(selectedDate)} />
                    <SummaryRow icon={<Clock3 className="h-4 w-4" />} label="Turno" value={selectedSessionData ? formatTimeRange(selectedSessionData.start_at, selectedSessionData.end_at) : 'Por seleccionar'} />
                    <SummaryRow icon={<Target className="h-4 w-4" />} label="Sede" value={selectedSessionData?.location_name || 'Por seleccionar'} />
                    <SummaryRow icon={<Target className="h-4 w-4" />} label="Distancia" value={selectedSessionData ? `${selectedSessionData.distance_m} m` : (selectedStudentData?.distance_m ? `${selectedStudentData.distance_m} m` : 'Sin definir')} />
                    <SummaryRow icon={<ShieldAlert className="h-4 w-4" />} label="Equipo" value={selectedStudentData ? equipmentLabel(selectedStudentData) : 'Sin definir'} />
                  </div>

                  <div className={`mt-5 rounded-2xl border px-4 py-4 ${blockingReservation ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
                    <div className="flex items-start gap-3">
                      {blockingReservation ? (
                        <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
                      ) : (
                        <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-700" />
                      )}
                      <div>
                        <p className={`font-semibold ${blockingReservation ? 'text-amber-800' : 'text-emerald-800'}`}>
                          {blockingReservation ? 'Requiere atencion antes de confirmar' : 'Reserva permitida'}
                        </p>
                        <p className={`mt-1 text-sm ${blockingReservation ? 'text-amber-800/80' : 'text-emerald-800/80'}`}>
                          {blockingReservation
                            ? 'Revisa las alertas activas o usa la reserva forzada solo si el caso lo amerita.'
                            : 'El alumno tiene condiciones validas para reservar este turno.'}
                        </p>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_16px_42px_rgba(15,23,42,0.05)]">
                  <p className="text-lg font-semibold tracking-[-0.02em] text-slate-950">Alertas</p>
                  <div className="mt-4 space-y-3">
                    {alerts.map((alert, index) => (
                      <div
                        key={`${alert.message}-${index}`}
                        className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${alertToneClass(alert.tone)}`}
                      >
                        <AlertIcon tone={alert.tone} />
                        <p>{alert.message}</p>
                      </div>
                    ))}
                  </div>
                </section>


              </div>
            </div>
          </div>

          <div className="sticky bottom-0 shrink-0 border-t border-slate-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-7">
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => { if (window.matchMedia('(min-width: 1280px)').matches || step === 0) onClose(); else dispatchFlow({ type: 'back' }) }}
                disabled={bookSessionMutation.isPending}
                className="h-12 rounded-2xl border border-slate-200 px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
              >
                <span className="xl:hidden">{step > 0 ? 'Volver' : 'Cancelar'}</span><span className="hidden xl:inline">Cancelar</span>
              </button>
              {step < 2 && <button type="button" className="h-12 rounded-xl bg-accent px-5 text-sm font-semibold text-white disabled:bg-slate-300 xl:hidden" disabled={!selectedStudent || (step === 1 && (!selectedSession || sessionsLoading || sessionsError))} onClick={() => dispatchFlow({ type: 'next' })}>Continuar</button>}
              <button
                type="button"
                onClick={handleBooking}
                disabled={blockingReservation || sessionsLoading || sessionsError || bookSessionMutation.isPending}
                className={`${step === 2 ? 'inline-flex' : 'hidden'} xl:inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(249,115,22,0.24)] transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none`}
              >
                <CalendarDays className="h-4 w-4" />
                {bookSessionMutation.isPending ? 'Creando reserva...' : 'Crear reserva'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SummaryRow({
  icon,
  label,
  value,
  badgeClass,
}: {
  icon: React.ReactNode
  label: string
  value: string
  badgeClass?: string
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
      <div className="flex min-w-0 items-center gap-2 text-slate-500">
        {icon}
        <span>{label}</span>
      </div>
      {badgeClass ? (
        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${badgeClass}`}>
          {value}
        </span>
      ) : (
        <span className="min-w-0 max-w-full break-words text-right font-semibold text-slate-950">{value}</span>
      )}
    </div>
  )
}
