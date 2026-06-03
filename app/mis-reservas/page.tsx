'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import dayjs from 'dayjs'
import { CalendarClock, CheckCircle2, ChevronRight, XCircle } from 'lucide-react'
import { MobileStudentHeader } from '@/components/student/MobileStudentHeader'
import { StudentCard, StudentNotice } from '@/components/student/StudentCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { StudentPageSkeleton } from '@/components/ui/StudentPageSkeleton'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/ToastProvider'
import { supabase } from '@/lib/supabaseClient'
import { useStudentContext } from '@/lib/hooks/useStudentContext'
import { canStudentCancelBooking } from '@/lib/utils/bookingCancellation'

type Row = {
  booking_id: string
  status: 'reserved' | 'cancelled' | 'attended' | 'no_show'
  group_type: 'children' | 'youth' | 'adult' | 'assigned' | 'ownbow' | null
  distance_m: number | null
  bow_usage_type: 'shared_inventory' | 'assigned' | 'own' | null
  bow_poundage: number | null
  start_at: string
  end_at: string
  booking_day_cutoff_at: string | null
}

function labelBowUsage(row: Row) {
  if (row.bow_usage_type === 'own' || row.group_type === 'ownbow') return 'Arco propio'
  if (row.bow_usage_type === 'assigned' || row.group_type === 'assigned') return 'Arco asignado'
  if (row.bow_poundage) return `Arco academia ${row.bow_poundage} lb`
  return 'Arco academia'
}

export default function MisReservasPage() {
  const toast = useToast()
  const confirm = useConfirm()
  const { account, activeStudent, activeStudentId, loading: contextLoading } = useStudentContext()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'upcoming' | 'history'>('upcoming')

  useEffect(() => {
    const loadRows = async () => {
      if (!activeStudentId) {
        setRows([])
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const { data, error } = await supabase.rpc('get_student_bookings', {
          p_student_id: activeStudentId,
        })

        if (error) throw error
        setRows((data || []) as Row[])
      } catch (loadError: any) {
        toast.push({ message: loadError?.message || 'No se pudo cargar las reservas.', type: 'error' })
      } finally {
        setLoading(false)
      }
    }

    loadRows()
  }, [activeStudentId, toast])

  const { upcoming, history, attendedCount } = useMemo(() => {
    const now = Date.now()
    const upcomingRows = rows.filter((row) => row.status === 'reserved' && new Date(row.start_at).getTime() > now)
    const historyRows = rows.filter((row) => row.status !== 'reserved' || new Date(row.start_at).getTime() <= now)
    const attended = rows.filter((row) => row.status === 'attended').length
    return { upcoming: upcomingRows, history: historyRows, attendedCount: attended }
  }, [rows])

  const cancelar = async (id: string) => {
    if (!(await confirm('La reserva se cancelará. Tu saldo de clases no cambiará porque el crédito solo se descuenta al registrar asistencia o inasistencia.'))) return

    const { error } = await supabase.rpc('cancel_booking', { p_booking: id })
    if (error) {
      toast.push({ message: error.message, type: 'error' })
      return
    }

    setRows((prev) => prev.map((row) => row.booking_id === id ? { ...row, status: 'cancelled' } : row))
    toast.push({ message: 'Reserva cancelada.', type: 'success' })
  }

  if (contextLoading || loading) {
    return <StudentPageSkeleton variant="reservations" />
  }

  const visibleRows = activeTab === 'upcoming' ? upcoming : history

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-textpri">
      <MobileStudentHeader title="Mis reservas" subtitle="Gestiona tus próximas clases e historial" showBack />

      <div className="space-y-4 px-4 py-5">
        {account?.role === 'guardian' && activeStudent && (
          <StudentCard className="flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-textsec">Viendo reservas de</p>
              <p className="truncate font-semibold">{activeStudent.full_name}</p>
            </div>
            <Link href="/hub" className="btn-outline btn-sm shrink-0">
              Cambiar
            </Link>
          </StudentCard>
        )}

        <div className="grid grid-cols-3 gap-3">
          <MiniStat icon={<CalendarClock className="h-5 w-5" />} label="Próximas" value={upcoming.length} />
          <MiniStat icon={<XCircle className="h-5 w-5" />} label="Historial" value={history.length} tone="slate" />
          <MiniStat icon={<CheckCircle2 className="h-5 w-5" />} label="Asistidas" value={attendedCount} tone="green" />
        </div>

        <StudentNotice>Puedes cancelar tu reserva hasta el inicio de la clase.</StudentNotice>

        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-line bg-white p-1 shadow-card">
          <button
            type="button"
            className={`min-h-[44px] rounded-xl text-sm font-bold ${activeTab === 'upcoming' ? 'bg-accent text-white shadow-card' : 'text-textsec'}`}
            onClick={() => setActiveTab('upcoming')}
          >
            Próximas
          </button>
          <button
            type="button"
            className={`min-h-[44px] rounded-xl text-sm font-bold ${activeTab === 'history' ? 'bg-accent text-white shadow-card' : 'text-textsec'}`}
            onClick={() => setActiveTab('history')}
          >
            Historial
          </button>
        </div>

        {!activeStudentId && (
          <StudentCard className="p-5 text-sm text-textsec">Selecciona un alumno antes de continuar.</StudentCard>
        )}

        {activeStudentId && visibleRows.length === 0 && (
          <StudentCard className="p-6 text-center">
            <p className="font-bold">{activeTab === 'upcoming' ? 'Aún no tienes reservas próximas.' : 'Aún no hay historial.'}</p>
            {activeTab === 'upcoming' && (
              <Link href="/reservar" className="btn mt-4 w-full">
                Reservar clase
              </Link>
            )}
          </StudentCard>
        )}

        <div className="grid gap-3">
          {visibleRows.map((row) => (
            <ReservationCard key={row.booking_id} row={row} onCancel={cancelar} />
          ))}
        </div>
      </div>
    </div>
  )
}

function ReservationCard({ row, onCancel }: { row: Row; onCancel: (id: string) => void }) {
  const start = dayjs(row.start_at)
  const end = dayjs(row.end_at)
  const cancelable = canStudentCancelBooking(row)

  return (
    <StudentCard className="p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-orange-50 text-accent">
          <CalendarClock className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-lg font-black tracking-[-0.03em]">{start.format('ddd, D MMM YYYY')}</p>
              <p className="mt-1 truncate text-sm font-medium text-textsec">
                {start.format('HH:mm')} - {end.format('HH:mm')} · {labelBowUsage(row)}
                {row.distance_m ? ` · ${row.distance_m}m` : ''}
              </p>
            </div>
            <StatusBadge status={row.status} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link className="btn-outline btn-sm min-h-[44px]" href={`/reserva/${row.booking_id}`}>
              Ver detalle
            </Link>
            {cancelable && (
              <button className="btn-outline btn-sm min-h-[44px]" onClick={() => onCancel(row.booking_id)}>
                Cancelar reserva
              </button>
            )}
          </div>
        </div>
        <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-textsec" />
      </div>
    </StudentCard>
  )
}

function MiniStat({
  icon,
  label,
  value,
  tone = 'orange',
}: {
  icon: ReactNode
  label: string
  value: number
  tone?: 'orange' | 'green' | 'slate'
}) {
  const toneClass = {
    orange: 'bg-orange-50 text-accent',
    green: 'bg-green-50 text-success',
    slate: 'bg-slate-100 text-slate-600',
  }[tone]

  return (
    <StudentCard className="p-3 text-center">
      <div className={`mx-auto mb-2 grid h-9 w-9 place-items-center rounded-full ${toneClass}`}>{icon}</div>
      <p className="text-2xl font-black leading-none">{value}</p>
      <p className="mt-1 text-xs font-medium text-textsec">{label}</p>
    </StudentCard>
  )
}
