'use client'

import { useState } from 'react'
import Link from 'next/link'
import dayjs from 'dayjs'
import { CalendarPlus, ChevronRight, Target } from 'lucide-react'
import { useNextBooking } from '@/lib/hooks/useNextBooking'
import { useToast } from '@/components/ui/ToastProvider'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { StudentCard } from '@/components/student/StudentCard'
import { supabase } from '@/lib/supabaseClient'
import { canStudentCancelBooking } from '@/lib/utils/bookingCancellation'

export function NextBookingWidget({ studentId }: { studentId?: string | null }) {
  const { booking, isLoading, error, refetch } = useNextBooking(studentId)
  const [isCancelling, setIsCancelling] = useState(false)
  const toast = useToast()

  async function handleCancelBooking() {
    if (!booking?.booking_id) return
    if (!confirm('La reserva se cancelará. Tu saldo de clases no cambiará porque el crédito solo se descuenta al registrar asistencia o inasistencia.')) return

    try {
      setIsCancelling(true)

      const { error: cancelError } = await supabase.rpc('cancel_booking', {
        p_booking: booking.booking_id,
      })

      if (cancelError) throw cancelError

      toast.push({ message: 'Reserva cancelada correctamente.', type: 'info' })
      await refetch()
    } catch (cancelError: any) {
      toast.push({ message: cancelError?.message || 'No se pudo cancelar la reserva.', type: 'error' })
    } finally {
      setIsCancelling(false)
    }
  }

  if (isLoading) {
    return (
      <StudentCard className="p-5">
        <div className="animate-pulse space-y-4">
          <div className="h-5 w-36 rounded-full bg-line" />
          <div className="h-4 w-56 rounded-full bg-line" />
          <div className="h-11 w-40 rounded-xl bg-line" />
        </div>
      </StudentCard>
    )
  }

  if (error) {
    return (
      <StudentCard variant="danger" className="p-5">
        <p className="text-sm font-medium text-danger">{error}</p>
      </StudentCard>
    )
  }

  if (!booking) {
    return (
      <StudentCard className="relative overflow-hidden p-5">
        <Target className="absolute -left-3 top-5 h-28 w-28 text-slate-200" strokeWidth={1.2} />
        <div className="relative ml-24 space-y-3">
          <h3 className="text-base font-black">Aún no tienes reservas</h3>
          <p className="text-sm font-medium text-textsec">Reserva tu próxima clase y sigue mejorando.</p>
          <Link href="/reservar" className="btn-outline btn-sm border-accent/40 text-accent">
            <CalendarPlus className="h-5 w-5" />
            Reservar ahora
          </Link>
        </div>
      </StudentCard>
    )
  }

  const date = dayjs(booking.start_at)
  const isCancelable = !!booking.booking_id && !!booking.start_at && canStudentCancelBooking({
    status: booking.status || 'reserved',
    start_at: booking.start_at,
  })

  return (
    <StudentCard className="overflow-hidden p-4">
      <div className="flex items-center gap-4">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-orange-50 text-accent">
          <CalendarPlus className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-black tracking-[-0.03em]">{date.format('ddd, D MMM YYYY')}</p>
          <p className="truncate text-sm font-medium text-textsec">
            {date.format('HH:mm')}
            {booking.distance_m ? ` · ${booking.distance_m}m` : ''}
          </p>
        </div>
        <StatusBadge status={booking.status || 'reserved'} />
        {booking.booking_id && (
          <Link href={`/reserva/${booking.booking_id}`} aria-label="Ver detalle">
            <ChevronRight className="h-6 w-6 text-textsec" />
          </Link>
        )}
      </div>

      {isCancelable && (
        <div className="mt-4 border-t border-line pt-4">
          <button
            type="button"
            onClick={handleCancelBooking}
            disabled={isCancelling}
            className="btn-outline min-h-[44px] w-full justify-center text-sm"
          >
            {isCancelling ? 'Cancelando...' : 'Cancelar reserva'}
          </button>
        </div>
      )}
    </StudentCard>
  )
}
