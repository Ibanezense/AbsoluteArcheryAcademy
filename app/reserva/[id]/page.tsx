"use client"

import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, MapPin, Target, Ticket, UserRound } from 'lucide-react'
import { MobileStudentHeader } from '@/components/student/MobileStudentHeader'
import { StudentCard, StudentNotice } from '@/components/student/StudentCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { StudentPageSkeleton } from '@/components/ui/StudentPageSkeleton'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/ToastProvider'
import { supabase } from '@/lib/supabaseClient'
import { useStudentContext } from '@/lib/hooks/useStudentContext'
import { canStudentCancelBooking } from '@/lib/utils/bookingCancellation'
import { fetchStudentBookingDetail } from '@/lib/services/studentBookingService'
import { bookingCancellationLabel, bookingModeLabel, limaBookingDate } from '@/lib/utils/studentBooking'

export default function ReservaConfirm() {
  const { id } = useParams<{ id: string }>()
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const { activeStudentId, loading: contextLoading } = useStudentContext()
  const [working, setWorking] = useState(false)
  const actionInProgress = useRef(false)
  const selectedStudent = useRef(activeStudentId)
  selectedStudent.current = activeStudentId
  const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '')
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['student-booking-detail', activeStudentId, id],
    queryFn: () => fetchStudentBookingDetail(id, activeStudentId!),
    enabled: !!activeStudentId && !contextLoading && validId,
  })

  if (contextLoading || isLoading) return <StudentPageSkeleton variant="reservations" />
  if (error || !data) return (
    <div className="min-h-screen bg-[#F7F8FA] text-textpri">
      <MobileStudentHeader title="Detalle de reserva" showBack />
      <div className="px-4 py-6 md:px-6"><StudentCard className="mx-auto max-w-xl space-y-4 p-6">
        <h2 className="text-xl font-black">{error ? 'No pudimos cargar la reserva' : 'Reserva no encontrada'}</h2>
        <p role={error ? 'alert' : undefined} className="text-sm text-textsec">{error ? 'Hubo un problema al consultar la reserva. Puedes volver a intentarlo.' : 'No encontramos esta reserva para el alumno seleccionado. Puede que el enlace no sea válido o corresponda a otro alumno.'}</p>
        {error && <button type="button" className="btn w-full" onClick={() => void refetch()}>Reintentar</button>}
        <Link className="btn-outline w-full" href="/mis-reservas">Volver a Mis reservas</Link>
      </StudentCard></div>
    </div>
  )

  const start = limaBookingDate(data.start_at)
  const end = limaBookingDate(data.end_at)
  const canCancel = canStudentCancelBooking(data)
  const cancellationNotice = canCancel ? 'Puedes cancelar desde la app hasta el inicio de la clase.' : data.status === 'reserved' ? 'Esta reserva ya no puede cancelarse desde la app.' : 'Esta reserva ya no está activa.'
  const sourceLabel = bookingCancellationLabel(data.cancellation_source, data.cancellation_resolution)
  const usageLabel = data.bow_usage_type === 'own' || data.group_type === 'ownbow' ? 'Arco propio' : data.bow_usage_type === 'assigned' || data.group_type === 'assigned' ? 'Arco asignado' : data.bow_poundage ? `Arco de academia ${data.bow_poundage} lb` : 'Arco de academia'

  const cancelar = async () => {
    if (actionInProgress.current || !canCancel) return
    actionInProgress.current = true
    setWorking(true)
    const studentId = activeStudentId
    try {
      if (!(await confirm('La reserva se cancelará y el crédito comprometido quedará disponible.', { title: 'Cancelar reserva', confirmLabel: 'Sí, cancelar reserva', cancelLabel: 'Mantener reserva', tone: 'warning' })) || selectedStudent.current !== studentId) return
      const { error: cancelError } = await supabase.rpc('cancel_booking', { p_booking: data.booking_id })
      if (cancelError) throw cancelError
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['student-booking-detail'] }),
        queryClient.invalidateQueries({ queryKey: ['student-booking-agenda'] }),
        queryClient.invalidateQueries({ queryKey: ['student-dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['student-booking-history'] }),
        queryClient.invalidateQueries({ queryKey: ['student-next-booking'] }),
        queryClient.invalidateQueries({ queryKey: ['student-week-overview'] }),
      ])
      toast.push({ message: 'Reserva cancelada.', type: 'success' })
    } catch (cancelError: unknown) {
      toast.push({ message: cancelError && typeof cancelError === 'object' && 'message' in cancelError ? String(cancelError.message) : 'No se pudo cancelar la reserva.', type: 'error' })
    } finally {
      actionInProgress.current = false
      setWorking(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-textpri">
      <MobileStudentHeader title={data.status === 'reserved' ? 'Reserva confirmada' : 'Detalle de reserva'} showBack />
      <div className="space-y-4 px-4 py-5 md:px-6">
        <p className="text-sm text-textsec">Reserva de <strong className="text-textpri">{data.student_name}</strong></p>
        <StudentCard className="overflow-hidden lg:grid lg:grid-cols-[1.3fr_1fr]">
          <div className="bg-[linear-gradient(120deg,#FFF7ED,#FFFFFF)] p-5 sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div><p className="text-sm font-bold uppercase tracking-[0.16em] text-accent">Clase</p><h2 className="mt-1 text-3xl font-black tracking-[-0.04em]">{start.format('ddd, D MMM')}</h2><p className="mt-1 text-sm font-medium text-textsec">{start.format('HH:mm')}–{end.format('HH:mm')}</p></div>
              <StatusBadge status={data.status} />
            </div>
            <div className="grid gap-3">
              <DetailItem icon={<CalendarClock className="h-5 w-5" />} label="Fecha y hora" value={`${start.format('dddd D [de] MMMM [de] YYYY')} · ${start.format('HH:mm')}–${end.format('HH:mm')}`} />
              <DetailItem icon={<Target className="h-5 w-5" />} label="Distancia" value={data.distance_m ? `${data.distance_m} m` : 'Sin distancia registrada'} />
              <DetailItem icon={<Ticket className="h-5 w-5" />} label="Equipo" value={usageLabel} />
              <DetailItem icon={<UserRound className="h-5 w-5" />} label="Modalidad" value={bookingModeLabel(data.group_type || data.booking_mode)} />
              <DetailItem icon={<MapPin className="h-5 w-5" />} label="Sede y dirección" value={data.location_name ? `${data.location_name}${data.location_address ? ` · ${data.location_address}` : ''}` : 'Sede no registrada. Consulta con la academia.'} />
              {data.status === 'cancelled' && sourceLabel && <DetailItem icon={<CalendarClock className="h-5 w-5" />} label="Motivo de cancelación" value={sourceLabel} />}
            </div>
          </div>
          <div className="space-y-3 p-5 sm:p-6">
            <StudentNotice>{cancellationNotice}</StudentNotice>
            {data.cancellation_review_status === 'pending' && <p className="text-sm text-textsec">La academia está revisando la cancelación.</p>}
            {canCancel && <button type="button" className="btn-outline min-h-[50px] w-full justify-center" disabled={working} onClick={() => void cancelar()}>{working ? 'Revisando cancelación…' : 'Cancelar reserva'}</button>}
            <Link className="btn min-h-[50px] w-full" href="/mis-reservas">Ver Mis reservas</Link>
            <Link className="btn-outline min-h-[50px] w-full" href="/reservar">Ver calendario</Link>
            <Link className="block py-2 text-center text-sm font-semibold text-textsec underline underline-offset-2" href="/">Volver al inicio</Link>
          </div>
        </StudentCard>
      </div>
    </div>
  )
}

function DetailItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="flex items-start gap-3 rounded-2xl border border-line bg-white/80 p-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-accent">{icon}</span><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-textsec">{label}</p><p className="break-words font-bold">{value}</p></div></div>
}
