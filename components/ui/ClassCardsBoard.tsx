'use client'

import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { CalendarDays, CalendarPlus, CheckCircle2, CircleDot, Clock3, XCircle } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { StudentCard } from '@/components/student/StudentCard'
import type { StudentClassCard } from '@/lib/hooks/useStudentClassCards'
import { useToast } from '@/components/ui/ToastProvider'
import { supabase } from '@/lib/supabaseClient'
import { canStudentCancelBooking } from '@/lib/utils/bookingCancellation'

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
    badgeStatus: 'available',
    icon: CircleDot,
  },
  reserved: {
    label: 'Reservada',
    badgeStatus: 'reserved',
    icon: CalendarDays,
  },
  attended: {
    label: 'Asistió',
    badgeStatus: 'attended',
    icon: CheckCircle2,
  },
  no_show: {
    label: 'No asistió',
    badgeStatus: 'no_show',
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

const cardStatusOrder: Record<StudentClassCard['card_status'], number> = {
  available: 0,
  reserved: 1,
  attended: 2,
  no_show: 3,
}

export function ClassCardsBoard({ cards, loading, error, canReserve, studentId }: Props) {
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
          (session) => session.status === 'scheduled' && dayjs(session.start_at).isAfter(dayjs())
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
  const orderedCards = useMemo(() => {
    return [...localCards].sort((a, b) => {
      const statusDelta = cardStatusOrder[a.card_status] - cardStatusOrder[b.card_status]
      if (statusDelta !== 0) return statusDelta
      return a.card_index - b.card_index
    })
  }, [localCards])

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
      toast.push({ message: 'El turno seleccionado ya no está disponible.', type: 'error' })
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
          if (entry.student_membership_id !== card.student_membership_id) return entry

          if (entry.card_index === card.card_index) {
            return {
              ...entry,
              card_status: 'reserved',
              booking_id: data?.id || null,
              session_id: selectedSession.session_id,
              start_at: selectedSession.start_at,
              end_at: selectedSession.end_at,
              distance_m: selectedSession.distance_m,
              bow_usage_type: selectedSession.bow_usage_type,
            }
          }

          return entry
        })
      )

      setAvailableSessions((current) =>
        current
          .map((session) =>
            session.session_id === selectedSessionId
              ? { ...session, already_reserved: true, spots_for_student: Math.max(session.spots_for_student - 1, 0) }
              : session
          )
          .filter((session) => !session.already_reserved && session.spots_for_student > 0)
      )

      toast.push({ message: 'Clase reservada correctamente.', type: 'success' })
    } catch (loadError: any) {
      toast.push({ message: loadError?.message || 'No se pudo reservar la clase.', type: 'error' })
    } finally {
      setBookingCardKey(null)
    }
  }

  async function handleCancelBooking(card: StudentClassCard) {
    if (!studentId || !card.booking_id) return

    if (!confirm('La reserva se cancelará. Tu saldo de clases no cambiará porque el crédito solo se descuenta al registrar asistencia o inasistencia.')) return

    try {
      const key = cardKey(card)
      setBookingCardKey(key)

      const { error: cancelError } = await supabase.rpc('cancel_booking', {
        p_booking: card.booking_id,
      })

      if (cancelError) throw cancelError

      setLocalCards((current) =>
        current.map((entry) => {
          if (entry.card_index === card.card_index && entry.student_membership_id === card.student_membership_id) {
            return {
              ...entry,
              card_status: 'available',
              booking_id: null,
              session_id: null,
              start_at: null,
              end_at: null,
              distance_m: null,
              bow_usage_type: null,
            }
          }
          return entry
        })
      )

      setAvailableSessions((current) =>
        current.map((session) =>
          session.session_id === card.session_id
            ? { ...session, already_reserved: false, spots_for_student: session.spots_for_student + 1 }
            : session
        )
      )

      toast.push({ message: 'Turno cancelado. Ahora puedes reservar uno nuevo.', type: 'info' })
    } catch (cancelError: any) {
      toast.push({ message: cancelError?.message || 'No se pudo deshacer la reserva.', type: 'error' })
    } finally {
      setBookingCardKey(null)
    }
  }

  if (loading) {
    return (
      <StudentCard className="p-6">
        <div className="flex items-center justify-center py-8">
          <Spinner />
        </div>
      </StudentCard>
    )
  }

  if (error) {
    return (
      <StudentCard variant="danger" className="p-6">
        <p className="text-sm text-danger">{error}</p>
      </StudentCard>
    )
  }

  if (cards.length === 0) {
    return (
      <StudentCard className="p-6">
        <h3 className="text-lg font-semibold text-textpri">Mis clases</h3>
        <p className="mt-2 text-sm text-textsec">Aún no hay una membresía activa o reciente para mostrar cards.</p>
      </StudentCard>
    )
  }

  return (
    <div className="space-y-3">
      {membership && (
        <p className="text-sm font-medium text-textsec">
          {membership.membership_name} · {membership.classes_remaining}/{membership.classes_total} disponibles
        </p>
      )}

      <div className="grid gap-3">
        {orderedCards.map((card) => {
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

          const editable = !!card.start_at && canStudentCancelBooking({
            status: card.card_status,
            start_at: card.start_at,
          })

          return (
            <StudentCard key={`${card.student_membership_id}-${card.card_index}`} className="p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-accent/20 bg-orange-50 text-accent">
                  <Icon className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-black tracking-[-0.03em] text-accent">CLASE {card.card_index}</p>
                      <div className="mt-2">
                        <StatusBadge status={config.badgeStatus} label={config.label} />
                      </div>
                    </div>
                    {card.start_at && (
                      <div className="shrink-0 text-right text-xs font-medium text-textsec">
                        <div>{dayjs(card.start_at).format('DD/MM')}</div>
                        <div>{dayjs(card.start_at).format('HH:mm')}</div>
                      </div>
                    )}
                  </div>

                  {card.start_at ? (
                    <div className="mt-4">
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2 text-textpri">
                          <Clock3 className="h-4 w-4 text-textsec" />
                          <span>{dayjs(card.start_at).format('dddd, D [de] MMMM')}</span>
                        </div>
                        {card.distance_m && <p className="text-textsec">Distancia: {card.distance_m}m</p>}
                        {usage && <p className="text-textsec">{usage}</p>}
                      </div>
                      {editable && card.booking_id && (
                        <div className="mt-4 border-t border-line pt-4">
                          <button
                            onClick={() => handleCancelBooking(card)}
                            disabled={bookingCardKey === key}
                            className="btn-outline min-h-[44px] w-full justify-center text-sm"
                          >
                            {bookingCardKey === key ? 'Cancelando...' : 'Cancelar reserva'}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-4">
                      <p className="text-sm font-medium text-textsec">Esta clase aún no tiene turno asignado.</p>
                      {canReserve && (
                        <div className="mt-4 grid gap-3">
                          {sessionsLoading ? (
                            <div className="text-sm text-textsec">Cargando turnos programados...</div>
                          ) : sessionsError ? (
                            <div className="text-sm text-danger">{sessionsError}</div>
                          ) : availableDates.length === 0 ? (
                            <div className="text-sm text-textsec">No hay turnos programados disponibles.</div>
                          ) : (
                            <>
                              <label className="grid gap-2">
                                <span className="text-sm font-medium text-textsec">Fecha</span>
                                <select
                                  className="input min-h-[44px] text-sm !px-3 !py-2"
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
                              </label>

                              <label className="grid gap-2">
                                <span className="text-sm font-medium text-textsec">Turno</span>
                                <select
                                  className="input min-h-[44px] min-w-0 text-sm !px-3 !py-2"
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
                              </label>

                              <button
                                type="button"
                                className="btn min-h-[56px] w-full rounded-xl text-sm font-extrabold"
                                onClick={() => handleBook(card)}
                                disabled={!selectedSessionId || bookingCardKey === key || !selectedSessionIsBookable}
                              >
                                <CalendarPlus className="h-5 w-5" />
                                {bookingCardKey === key ? 'Reservando...' : 'Reservar esta clase'}
                              </button>

                              {selectedSessionId && selectedSession && (
                                <p className="text-xs font-medium text-textsec">
                                  {selectedSession.already_reserved
                                    ? `Ya existe una reserva para este turno · ${sessionUsageLabel(selectedSession)}`
                                    : selectedSession.spots_for_student > 0
                                      ? `${selectedSession.spots_for_student} cupos · ${sessionUsageLabel(selectedSession)} · ${selectedSession.distance_m}m`
                                      : `Sin cupos disponibles · ${sessionUsageLabel(selectedSession)}`}
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </StudentCard>
          )
        })}
      </div>
    </div>
  )
}
