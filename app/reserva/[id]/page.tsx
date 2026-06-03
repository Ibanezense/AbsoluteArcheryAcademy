'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import dayjs from 'dayjs'
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

type BookingDetail = {
  booking_id: string
  student_id: string
  status: 'reserved' | 'cancelled' | 'attended' | 'no_show'
  start_at: string
  end_at: string
  distance_m: number | null
  group_type: string | null
  bow_usage_type: 'shared_inventory' | 'assigned' | 'own' | null
  bow_poundage: number | null
}

export default function ReservaConfirm() {
  const { id } = useParams<{ id: string }>()
  const toast = useToast()
  const confirm = useConfirm()
  const { account, activeStudent } = useStudentContext()
  const [data, setData] = useState<BookingDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    const loadDetail = async () => {
      try {
        setLoading(true)
        const { data: detailData, error } = await supabase.rpc('get_booking_detail', {
          p_booking_id: id,
        })

        if (error) throw error
        setData((detailData?.[0] || null) as BookingDetail | null)
      } catch (loadError: any) {
        toast.push({ message: loadError?.message || 'No se pudo cargar la reserva.', type: 'error' })
      } finally {
        setLoading(false)
      }
    }

    loadDetail()
  }, [id, toast])

  if (loading || !data) {
    return <StudentPageSkeleton variant="reservations" />
  }

  const start = dayjs(data.start_at)
  const end = dayjs(data.end_at)
  const canCancel = canStudentCancelBooking(data)
  const cancellationNotice = canCancel
    ? 'Puedes cancelar desde la app hasta el inicio de la clase.'
    : data.status === 'reserved'
      ? 'Esta reserva ya no puede cancelarse desde la app.'
      : 'Esta reserva ya no está activa.'
  const usageLabel =
    data.bow_usage_type === 'own' || data.group_type === 'ownbow'
      ? 'Arco propio'
      : data.bow_usage_type === 'assigned' || data.group_type === 'assigned'
        ? 'Arco asignado'
        : data.bow_poundage
          ? `Arco academia ${data.bow_poundage} lb`
          : 'Arco academia'

  const cancelar = async () => {
    if (!(await confirm('La reserva se cancelará. Tu saldo de clases no cambiará porque el crédito solo se descuenta al registrar asistencia o inasistencia.'))) return

    setWorking(true)
    const { data: cancelData, error } = await supabase.rpc('cancel_booking', { p_booking: data.booking_id })
    setWorking(false)

    if (error) {
      toast.push({ message: error.message, type: 'error' })
      return
    }

    setData({
      booking_id: cancelData.id,
      student_id: cancelData.student_id,
      status: cancelData.status,
      start_at: data.start_at,
      end_at: data.end_at,
      distance_m: data.distance_m,
      group_type: data.group_type,
      bow_usage_type: data.bow_usage_type,
      bow_poundage: data.bow_poundage,
    })

    toast.push({ message: 'Reserva cancelada.', type: 'success' })
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-textpri">
      <MobileStudentHeader
        title={data.status === 'reserved' ? 'Reserva confirmada' : 'Detalle de reserva'}
        showBack
      />

      <div className="space-y-4 px-4 py-5">
        {account?.role === 'guardian' && activeStudent && (
          <StudentCard className="flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-textsec">Reserva de</p>
              <p className="truncate font-semibold">{activeStudent.full_name}</p>
            </div>
            <Link href="/hub" className="btn-outline btn-sm shrink-0">
              Cambiar
            </Link>
          </StudentCard>
        )}

        <StudentCard className="overflow-hidden">
          <div className="bg-[radial-gradient(circle_at_84%_10%,rgba(249,115,22,0.18),transparent_28%),linear-gradient(120deg,#FFF7ED,#FFFFFF)] p-5">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.16em] text-accent">Clase</p>
                <h1 className="mt-1 text-3xl font-black tracking-[-0.05em]">
                  {start.format('ddd, D MMM')}
                </h1>
                <p className="mt-1 text-sm font-medium text-textsec">
                  {start.format('HH:mm')} - {end.format('HH:mm')}
                </p>
              </div>
              <StatusBadge status={data.status} />
            </div>

            <div className="grid gap-3">
              <DetailItem icon={<CalendarClock className="h-5 w-5" />} label="Fecha y hora" value={`${start.format('dddd, D [de] MMMM')} · ${start.format('HH:mm')} - ${end.format('HH:mm')}`} />
              <DetailItem icon={<Target className="h-5 w-5" />} label="Distancia" value={data.distance_m ? `${data.distance_m}m` : '-'} />
              <DetailItem icon={<Ticket className="h-5 w-5" />} label="Equipo" value={usageLabel} />
              <DetailItem icon={<UserRound className="h-5 w-5" />} label="Modalidad" value={data.group_type || 'Clase regular'} />
              <DetailItem icon={<MapPin className="h-5 w-5" />} label="Ubicación" value="Absolute Archery Academy" />
            </div>
          </div>

          <div className="space-y-3 p-5">
            <StudentNotice>{cancellationNotice}</StudentNotice>

            {canCancel && (
              <button className="btn-outline min-h-[50px] w-full justify-center" disabled={working} onClick={cancelar}>
                {working ? 'Cancelando...' : 'Cancelar reserva'}
              </button>
            )}
            <Link className="btn min-h-[50px] w-full" href="/">
              Volver al inicio
            </Link>
            <Link className="btn-outline min-h-[50px] w-full" href="/reservar">
              Ver calendario
            </Link>
          </div>
        </StudentCard>
      </div>
    </div>
  )
}

function DetailItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-white/80 p-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-accent">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-textsec">{label}</p>
        <p className="truncate font-black">{value}</p>
      </div>
    </div>
  )
}
