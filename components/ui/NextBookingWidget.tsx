'use client'

import { useState, useRef, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import Link from 'next/link'
import dayjs from 'dayjs'
import { CalendarPlus, ChevronRight, MapPin } from 'lucide-react'
import { useNextBooking } from '@/lib/hooks/useNextBooking'
import { useToast } from '@/components/ui/ToastProvider'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { StudentCard } from '@/components/student/StudentCard'
import { supabase } from '@/lib/supabaseClient'
import { canStudentCancelBooking } from '@/lib/utils/bookingCancellation'
import { BOOKING_TIMEZONE } from '@/lib/utils/bookingCutoff'
import { fetchStudentBookingChangeWindow, fetchStudentBookingDetail } from '@/lib/services/studentBookingService'
import { canStudentChangeBooking, limaBookingDate } from '@/lib/utils/studentBooking'

export function NextBookingWidget({ studentId, reserveAction }: { studentId?: string | null; reserveAction?: ReactNode }) {
  const { booking, isLoading, error, refetch } = useNextBooking(studentId)
  const bookingId = booking?.booking_id
  const detail = useQuery({
    queryKey: ['student-booking-detail', studentId, bookingId],
    enabled: !!studentId && !!bookingId,
    queryFn: () => fetchStudentBookingDetail(bookingId!, studentId!),
  })
  const changeWindow = useQuery({
    queryKey: ['student-booking-detail', studentId, bookingId, 'change-window'],
    enabled: !!studentId && !!bookingId,
    queryFn: () => fetchStudentBookingChangeWindow(bookingId!, studentId!),
  })
  const [isCancelling, setIsCancelling] = useState(false)
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const actionInProgress = useRef(false)

  async function handleCancelBooking() {
    if (!booking?.booking_id || actionInProgress.current) return
    actionInProgress.current = true
    setIsCancelling(true)
    try {
      if (!await confirm('La reserva se cancelará y el crédito quedará disponible inmediatamente.', { title: 'Cancelar reserva', confirmLabel: 'Sí, cancelar reserva', cancelLabel: 'Conservar reserva', tone: 'warning' })) return

      const { error: cancelError } = await supabase.rpc('cancel_booking', {
        p_booking: booking.booking_id,
      })

      if (cancelError) throw cancelError

      toast.push({ message: 'Reserva cancelada correctamente.', type: 'info' })
      for (const key of ['student-booking-history', 'student-booking-agenda', 'student-booking-detail', 'student-dashboard', 'student-week-overview', 'student-next-booking']) {
        queryClient.invalidateQueries({ queryKey: [key] })
      }
      await refetch()
    } catch (cancelError: any) {
      toast.push({ message: cancelError?.message || 'No se pudo cancelar la reserva.', type: 'error' })
    } finally {
      actionInProgress.current = false
      setIsCancelling(false)
    }
  }

  if (isLoading) {
    return (
      <StudentCard className="p-5">
        <div className="animate-pulse space-y-4">
          <div className="h-5 w-36 rounded-full bg-line" />
          <div className="h-4 w-56 max-w-full rounded-full bg-line" />
        </div>
        {reserveAction && <div className="mt-3">{reserveAction}</div>}
      </StudentCard>
    )
  }

  if (error) {
    return (
      <StudentCard variant="danger" className="p-5">
        <p className="text-sm font-medium text-danger">{error}</p>
        <button type="button" onClick={() => void refetch()} className="mt-2 text-sm font-bold text-accent">Reintentar</button>
        {reserveAction && <div className="mt-3">{reserveAction}</div>}
      </StudentCard>
    )
  }

  if (!booking) {
    return (
      <StudentCard className="p-4">
        <div className="space-y-3">
          <h3 className="text-base font-black">Aún no tienes reservas</h3>
          {reserveAction ?? <Link href="/mis-reservas#planificador" className="btn-outline btn-sm border-accent/40 text-accent">
            <CalendarPlus className="h-5 w-5" />
            Reservar ahora
          </Link>}
        </div>
      </StudentCard>
    )
  }

  const date = dayjs(booking.start_at).tz(BOOKING_TIMEZONE).locale('es')
  const isCancelable = !!booking.booking_id && !!booking.start_at && canStudentCancelBooking({
    status: booking.status || 'reserved',
    start_at: booking.start_at,
  })
  const change = changeWindow.data
  const canChange = !changeWindow.isError && !!change && canStudentChangeBooking(change, change.booking_day_cutoff_at)

  return (
    <StudentCard className="overflow-hidden p-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-blue-50 p-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-[#0758aa]">
          <CalendarPlus className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold capitalize text-[#101e3e]">{date.format('dddd D [de] MMMM')}</p>
          <p className="text-sm font-medium text-textsec">
            {date.format('HH:mm')}
            {booking.end_at && ` – ${dayjs(booking.end_at).tz(BOOKING_TIMEZONE).format('HH:mm')}`}
            {booking.distance_m ? ` · ${booking.distance_m} m` : ''}
          </p>
          {detail.data?.location_name && <p className="mt-1 flex items-center gap-1 text-sm text-slate-700"><MapPin aria-hidden="true" size={14} />{detail.data.location_name}</p>}
        </div>
        <StatusBadge status={booking.status || 'reserved'} />
        {booking.booking_id && (
          <Link href={`/reserva/${booking.booking_id}`} aria-label="Ver detalle de la reserva" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-[#0758aa] hover:bg-white">
            <ChevronRight className="h-6 w-6 text-textsec" />
          </Link>
        )}
      </div>

      {reserveAction && <div className="mt-3">{reserveAction}</div>}

      {isCancelable && (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3">
          <button
            type="button"
            onClick={handleCancelBooking}
            disabled={isCancelling}
            className={`min-h-11 rounded-lg border border-slate-200 px-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 ${canChange ? '' : 'col-span-full'}`}
          >
            {isCancelling ? 'Cancelando...' : 'Cancelar reserva'}
          </button>
          {canChange && <Link href={`/reserva/${booking.booking_id}/editar`} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-blue-200 px-2 text-center text-sm font-semibold text-[#0758aa] hover:bg-blue-50">
            Cambiar turno
          </Link>}
          {change?.booking_day_cutoff_at && !changeWindow.isError && <p className="col-span-full text-xs text-slate-600">
            {canChange ? 'Puedes cambiar hasta el' : 'El plazo para cambiar cerró el'}{' '}
            {limaBookingDate(change.booking_day_cutoff_at).format('D [de] MMMM [a las] HH:mm')}.
          </p>}
          {changeWindow.isError && <p className="col-span-full text-xs text-slate-600">No pudimos comprobar el plazo para cambiar. <button type="button" onClick={() => void changeWindow.refetch()} className="text-blue-700 underline">Reintentar</button></p>}
        </div>
      )}
    </StudentCard>
  )
}
