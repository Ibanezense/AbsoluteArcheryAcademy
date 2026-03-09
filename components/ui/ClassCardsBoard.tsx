'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import { CalendarDays, CheckCircle2, CircleDot, Clock3, XCircle } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import type { StudentClassCard } from '@/lib/hooks/useStudentClassCards'
import { useToast } from '@/components/ui/ToastProvider'
import { supabase } from '@/lib/supabaseClient'

type Props = {
  cards: StudentClassCard[]
  loading: boolean
  error: string | null
  canReserve: boolean
  studentId?: string | null
}

type AvailableSessionRow = {
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

const statusConfig = {
  available: {
    label: 'Disponible',
    className: 'border-dashed border-accent/40 bg-accent/5',
    badgeClass: 'bg-accent/12 text-accent',
    icon: CircleDot,
  },
  reserved: {
    label: 'Reservada',
    className: 'border-info/30 bg-info/5',
    badgeClass: 'bg-info/12 text-info',
    icon: CalendarDays,
  },
  attended: {
    label: 'Asistida',
    className: 'border-success/30 bg-success/5',
    badgeClass: 'bg-success/12 text-success',
    icon: CheckCircle2,
  },
  no_show: {
    label: 'Perdida',
    className: 'border-danger/30 bg-danger/5',
    badgeClass: 'bg-danger/12 text-danger',
    icon: XCircle,
  },
} as const

function bowUsageLabel(card: StudentClassCard) {
  if (card.bow_usage_type === 'own') return 'Arco propio'
  if (card.bow_usage_type === 'assigned') return 'Arco asignado'
  if (card.bow_usage_type === 'shared_inventory') return 'Arco academia'
  return null
}

function sessionUsageLabel(session: AvailableSessionRow) {
  if (session.bow_usage_type === 'own') return 'Arco propio'
  if (session.bow_usage_type === 'assigned') return 'Arco asignado'
  return 'Arco academia'
}

function cardKey(card: StudentClassCard) {
  return `${card.student_membership_id}-${card.card_index}`
}

function isSessionBookable(session: AvailableSessionRow) {
  return !session.already_reserved && session.spots_for_student > 0
}

export function ClassCardsBoard({ cards, loading, error, canReserve, studentId }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [localCards, setLocalCards] = useState<StudentClassCard[]>(cards)
  const [availableSessions, setAvailableSessions] = useState<AvailableSessionRow[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [sessionsError, setSessionsError] = useState<string | null>(null)
  const [selectedDateByCard, setSelectedDateByCard] = useState<Record<string, string>>({})
  const [selectedSessionByCard, setSelectedSessionByCard] = useState<Record<string, string>>({})
  const [bookingCardKey, setBookingCardKey] = useState<string | null>(null)

  useEffect(() => {
    setLocalCards(cards)
  }, [cards])

  useEffect(() => {
    const loadAvailableSessions = async () => {
      if (!canReserve || !studentId) {
        setAvailableSessions([])
        setSessionsError(null)
        setSessionsLoading(false)
        return
      }

      try {
        setSessionsLoading(true)
        setSessionsError(null)

        const dateFrom = dayjs().format('YYYY-MM-DD')
        const dateTo = dayjs().add(90, 'day').format('YYYY-MM-DD')

        const { data, error: rpcError } = await supabase.rpc('get_available_sessions_for_student', {
          p_student_id: studentId,
          p_date_from: dateFrom,
          p_date_to: dateTo,
        })

        if (rpcError) throw rpcError

        const normalized = ((data || []) as AvailableSessionRow[]).filter(
          (session) =>
            session.status === 'scheduled' &&
            dayjs(session.start_at).isAfter(dayjs())
        )

        setAvailableSessions(normalized)
      } catch (loadError: any) {
        setSessionsError(loadError?.message || 'No se pudieron cargar los turnos programados.')
        setAvailableSessions([])
      } finally {
        setSessionsLoading(false)
      }
    }

    loadAvailableSessions()
  }, [canReserve, studentId])

  const membership = localCards[0] || null
  const availableDates = useMemo(() => {
    const dates = new Map<string, string>()
    availableSessions.forEach((session) => {
      const key = dayjs(session.start_at).format('YYYY-MM-DD')
      if (!dates.has(key)) {
        dates.set(key, dayjs(session.start_at).format('ddd DD/MM'))
      }
    })
    return Array.from(dates.entries()).map(([value, label]) => ({ value, label }))
  }, [availableSessions])

  function getSessionsForDate(dateValue: string) {
    return availableSessions.filter(
      (session) => dayjs(session.start_at).format('YYYY-MM-DD') === dateValue
    )
  }

  function getDefaultSessionIdForDate(dateValue: string) {
    const sessionsForDate = getSessionsForDate(dateValue)
    return sessionsForDate.find(isSessionBookable)?.session_id || sessionsForDate[0]?.session_id || ''
  }

  async function handleBook(card: StudentClassCard) {
    if (!studentId) return

    const key = cardKey(card)
    const fallbackDate = selectedDateByCard[key] || availableDates[0]?.value || ''
    const selectedSessionId = selectedSessionByCard[key] || (fallbackDate ? getDefaultSessionIdForDate(fallbackDate) : '')
    if (!selectedSessionId) {
      toast.push({ message: 'Selecciona un turno antes de reservar.', type: 'error' })
      return
    }

    const selectedSession = availableSessions.find((session) => session.session_id === selectedSessionId)
    if (!selectedSession) {
      toast.push({ message: 'El turno seleccionado ya no esta disponible.', type: 'error' })
      return
    }

    try {
      setBookingCardKey(key)

      const { data, error: bookingError } = await supabase.rpc('book_session', {
        p_session: selectedSessionId,
        p_student_id: studentId,
      })

      if (bookingError) throw bookingError

      setLocalCards((current) =>
        current.map((entry) => {
          if (entry.student_membership_id !== card.student_membership_id) {
            return entry
          }

          const nextRemaining = Math.max((entry.classes_remaining ?? 0) - 1, 0)

          if (entry.card_index === card.card_index) {
            return {
              ...entry,
              classes_remaining: nextRemaining,
              card_status: 'reserved',
              booking_id: data?.id || null,
              session_id: selectedSession.session_id,
              start_at: selectedSession.start_at,
              end_at: selectedSession.end_at,
              distance_m: selectedSession.distance_m,
              bow_usage_type: selectedSession.bow_usage_type,
            }
          }

          return {
            ...entry,
            classes_remaining: nextRemaining,
          }
        })
      )

      setAvailableSessions((current) =>
        current.map((session) =>
          session.session_id === selectedSessionId
            ? { ...session, already_reserved: true, spots_for_student: Math.max(session.spots_for_student - 1, 0) }
            : session
        ).filter((session) => !session.already_reserved && session.spots_for_student > 0)
      )

      toast.push({ message: 'Clase reservada correctamente.', type: 'success' })
    } catch (loadError: any) {
      toast.push({ message: loadError?.message || 'No se pudo reservar la clase.', type: 'error' })
    } finally {
      setBookingCardKey(null)
    }
  }

  if (loading) {
    return (
      <div className="card p-6">
        <div className="flex items-center justify-center py-8">
          <Spinner />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card border-danger/30 bg-danger/5 p-6">
        <p className="text-sm text-danger">{error}</p>
      </div>
    )
  }

  if (cards.length === 0) {
    return (
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-textpri">Mis clases</h3>
        <p className="mt-2 text-sm text-textsec">Aun no hay una membresia activa o reciente para mostrar cards.</p>
      </div>
    )
  }

  return (
    <div className="card p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-textpri">Mis clases</h3>
          <p className="mt-1 text-sm text-textsec">
            {membership?.membership_name} · {membership?.classes_remaining}/{membership?.classes_total} disponibles
          </p>
        </div>
        {canReserve && localCards.some((card) => card.card_status === 'available') && (
          <Link href="/reservar" className="btn-outline text-sm">
            Ver calendario completo
          </Link>
        )}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {localCards.map((card) => {
          const config = statusConfig[card.card_status]
          const Icon = config.icon
          const usage = bowUsageLabel(card)
          const key = cardKey(card)
          const selectedDate = selectedDateByCard[key] || availableDates[0]?.value || ''
          const sessionsForDate = selectedDate ? getSessionsForDate(selectedDate) : []
          const selectedSessionId =
            selectedSessionByCard[key] ||
            (selectedDate ? getDefaultSessionIdForDate(selectedDate) : '') ||
            ''
          const selectedSession = sessionsForDate.find((session) => session.session_id === selectedSessionId) || null
          const selectedSessionIsBookable = !!selectedSession && isSessionBookable(selectedSession)

          return (
            <div
              key={`${card.student_membership_id}-${card.card_index}`}
              className={`rounded-2xl border p-4 shadow-card ${config.className}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs uppercase tracking-[0.18em] text-textsec">Clase {card.card_index}</p>
                  <div className={`mt-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${config.badgeClass}`}>
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{config.label}</span>
                  </div>
                </div>
                {card.start_at && (
                  <div className="shrink-0 text-right text-xs text-textsec">
                    <div>{dayjs(card.start_at).format('DD/MM')}</div>
                    <div>{dayjs(card.start_at).format('HH:mm')}</div>
                  </div>
                )}
              </div>

              {card.start_at ? (
                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-textpri">
                    <Clock3 className="h-4 w-4 text-textsec" />
                    <span>{dayjs(card.start_at).format('dddd, D [de] MMMM')}</span>
                  </div>
                  {card.distance_m && (
                    <p className="text-textsec">Distancia: {card.distance_m} m</p>
                  )}
                  {usage && (
                    <p className="text-textsec">{usage}</p>
                  )}
                </div>
              ) : (
                <div className="mt-4">
                  <p className="text-sm text-textsec">
                    Esta clase aun no tiene turno asignado.
                  </p>
                  {canReserve && (
                    <div className="mt-4 space-y-3">
                      {sessionsLoading ? (
                        <div className="text-sm text-textsec">Cargando turnos programados...</div>
                      ) : sessionsError ? (
                        <div className="text-sm text-danger">{sessionsError}</div>
                      ) : availableDates.length === 0 ? (
                        <div className="text-sm text-textsec">No hay turnos programados disponibles.</div>
                      ) : (
                        <>
                          <div className="grid gap-2">
                            <label className="text-xs uppercase tracking-[0.16em] text-textsec">Fecha</label>
                            <select
                              className="input text-sm !py-2 !px-3"
                              value={selectedDate}
                              onChange={(event) => {
                                const nextDate = event.target.value
                                setSelectedDateByCard((current) => ({ ...current, [key]: nextDate }))
                                setSelectedSessionByCard((current) => ({
                                  ...current,
                                  [key]: getDefaultSessionIdForDate(nextDate),
                                }))
                              }}
                            >
                              {availableDates.map((dateOption) => (
                                <option key={dateOption.value} value={dateOption.value}>
                                  {dateOption.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="grid gap-2">
                            <label className="text-xs uppercase tracking-[0.16em] text-textsec">Turno</label>
                            <select
                              className="input min-w-0 text-sm !py-2 !px-3"
                              value={selectedSessionId}
                              onChange={(event) =>
                                setSelectedSessionByCard((current) => ({
                                  ...current,
                                  [key]: event.target.value,
                                }))
                              }
                            >
                              {sessionsForDate.map((session) => (
                                <option key={session.session_id} value={session.session_id}>
                                  {dayjs(session.start_at).format('HH:mm')}-{dayjs(session.end_at).format('HH:mm')} · {session.distance_m}m
                                  {session.already_reserved
                                    ? ' · ya reservado'
                                    : session.spots_for_student > 0
                                      ? ''
                                      : ' · sin cupos'}
                                </option>
                              ))}
                            </select>
                          </div>

                          {selectedSessionId && (() => {
                            const sel = sessionsForDate.find(s => s.session_id === selectedSessionId)
                            return sel ? (
                              <p className="text-xs text-textsec">
                                {sel.already_reserved
                                  ? `Ya existe una reserva para este turno · ${sessionUsageLabel(sel)}`
                                  : sel.spots_for_student > 0
                                    ? `${sel.spots_for_student} cupos · ${sessionUsageLabel(sel)}`
                                    : `Sin cupos disponibles · ${sessionUsageLabel(sel)}`}
                              </p>
                            ) : null
                          })()}

                          <button
                            type="button"
                            className="btn w-full"
                            onClick={() => handleBook(card)}
                            disabled={!selectedSessionId || bookingCardKey === key || !selectedSessionIsBookable}
                          >
                            {bookingCardKey === key ? 'Reservando...' : 'Reservar esta clase'}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
