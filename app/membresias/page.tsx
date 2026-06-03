'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import { CalendarClock, CheckCircle2, ChevronRight, RotateCw, Target, Ticket, UserX, XCircle } from 'lucide-react'
import { AuthGuard } from '@/components/AuthGuard'
import { Spinner } from '@/components/ui/Spinner'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { StudentPageSkeleton } from '@/components/ui/StudentPageSkeleton'
import { MobileStudentHeader } from '@/components/student/MobileStudentHeader'
import { StudentCard } from '@/components/student/StudentCard'
import { useBookingHistory, type BookingHistoryItem } from '@/lib/hooks/useBookingHistory'
import { useMembershipExpiry } from '@/lib/hooks/useMembershipExpiry'
import { useNextBooking } from '@/lib/hooks/useNextBooking'
import { useStudentContext } from '@/lib/hooks/useStudentContext'
import { useStudentDashboard } from '@/lib/hooks/useStudentDashboard'
import { formatDateOnly } from '@/lib/utils/dateUtils'

type HistoryFilter = 'all' | 'attended' | 'cancelled' | 'no_show'

export default function MembresiasPage() {
  const router = useRouter()
  const { account, activeStudentId, loading: contextLoading } = useStudentContext()
  const { dashboard, loading: dashboardLoading } = useStudentDashboard(activeStudentId)
  const { daysUntilExpiry, isExpired, isExpiringSoon } = useMembershipExpiry(dashboard)
  const { booking: nextBooking } = useNextBooking(activeStudentId)
  const [filter, setFilter] = useState<HistoryFilter>('all')

  const {
    bookings: history,
    isLoading: isHistoryLoading,
    error: historyError,
    hasMore: hasMoreHistory,
    loadMoreBookings,
  } = useBookingHistory(activeStudentId)

  useEffect(() => {
    if (contextLoading) return

    if (account?.role === 'guardian' && !activeStudentId) {
      router.replace('/hub')
    }
  }, [account?.role, activeStudentId, contextLoading, router])

  useEffect(() => {
    if (dashboard && history.length === 0 && !isHistoryLoading && hasMoreHistory) {
      loadMoreBookings()
    }
  }, [dashboard, history.length, isHistoryLoading, hasMoreHistory, loadMoreBookings])

  const usage = useMemo(() => {
    const cancelled = history.filter((booking) => booking.status === 'cancelled').length
    const noShow = history.filter((booking) => booking.status === 'no_show').length
    const attended = history.filter((booking) => booking.status === 'attended').length
    return { cancelled, noShow, attended }
  }, [history])

  const filteredHistory = useMemo(() => {
    if (filter === 'all') return history
    return history.filter((booking) => booking.status === filter)
  }, [filter, history])

  if (contextLoading || dashboardLoading) {
    return <StudentPageSkeleton variant="membership" />
  }

  if (!dashboard) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-[#F7F8FA]">
          <MobileStudentHeader title="Mi Membresía" subtitle="Historial y estado de cuenta" showBack />
          <div className="px-4 py-5">
            <StudentCard className="p-5 text-center text-textsec">Datos de membresía no disponibles.</StudentCard>
          </div>
        </div>
      </AuthGuard>
    )
  }

  const totalClasses = dashboard.classes_total ?? 0
  const remainingClasses = dashboard.classes_remaining ?? 0
  const usedClasses = dashboard.classes_used ?? Math.max(totalClasses - remainingClasses, 0)
  const percentUsed = totalClasses > 0 ? Math.min(Math.round((usedClasses / totalClasses) * 100), 100) : 0
  const status = isExpired ? 'expired' : isExpiringSoon ? 'expiring' : 'active'

  return (
    <AuthGuard>
      <div className="min-h-screen bg-[#F7F8FA] text-textpri">
        <MobileStudentHeader title="Mi Membresía" subtitle="Historial y estado de cuenta" showBack />

        <div className="space-y-4 px-4 py-5">
          <StudentCard className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h1 className="text-xl font-black tracking-[-0.04em]">Estado de cuenta</h1>
              <StatusBadge status={status} label={isExpired ? 'Vencida' : 'Activa'} />
            </div>
            <div className="grid grid-cols-[112px_1fr] items-center gap-4">
              <div
                className="grid h-28 w-28 place-items-center rounded-full"
                style={{ background: `conic-gradient(#22c55e ${Math.max(remainingClasses / Math.max(totalClasses, 1), 0) * 360}deg, #E5E7EB 0deg)` }}
              >
                <div className="grid h-[90px] w-[90px] place-items-center rounded-full bg-white text-center">
                  <div>
                    <p className="text-3xl font-black leading-none text-success">{remainingClasses}</p>
                    <p className="text-base font-medium leading-none">/ {totalClasses}</p>
                    <p className="mt-1 px-2 text-[0.62rem] font-semibold leading-[1.05] text-textsec">clases disponibles</p>
                  </div>
                </div>
              </div>
              <div className="min-w-0 border-l border-line pl-5">
                <div className="flex items-center gap-3">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600">
                    <CalendarClock className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="text-3xl font-black leading-none">{usedClasses} <span className="text-base font-bold">clases usadas</span></p>
                    <p className="mt-3 text-sm font-medium text-textsec">{percentUsed}% del plan utilizado</p>
                  </div>
                </div>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-success" style={{ width: `${percentUsed}%` }} />
                </div>
              </div>
            </div>
          </StudentCard>

          <StudentCard className="p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-black tracking-[-0.04em]">Vigencia del plan</h2>
              <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-bold text-accent">
                {typeof daysUntilExpiry === 'number' ? `${Math.max(daysUntilExpiry, 0)} días restantes` : 'Sin fecha'}
              </span>
            </div>
            <div className="grid gap-3 min-[360px]:grid-cols-3">
              <PlanFact icon={<CalendarClock className="h-6 w-6" />} label="Inicio" value={formatDateOnly(dashboard.membership_start) || '-'} />
              <PlanFact icon={<CalendarClock className="h-6 w-6" />} label="Vencimiento" value={formatDateOnly(dashboard.membership_end) || '-'} />
              <PlanFact icon={<Ticket className="h-6 w-6" />} label="Plan" value={dashboard.membership_name || '-'} />
            </div>
          </StudentCard>

          <section className="space-y-3">
            <h2 className="text-lg font-black tracking-[-0.03em]">Resumen de uso</h2>
            <div className="grid grid-cols-2 gap-3 min-[390px]:grid-cols-4">
              <UsageCard icon={<Target className="h-5 w-5" />} label="Disponibles" value={remainingClasses} tone="green" />
              <UsageCard icon={<CheckCircle2 className="h-5 w-5" />} label="Usadas" value={usedClasses} tone="blue" />
              <UsageCard icon={<XCircle className="h-5 w-5" />} label="Canceladas" value={usage.cancelled} tone="orange" />
              <UsageCard icon={<UserX className="h-5 w-5" />} label="No asistió" value={usage.noShow} tone="red" />
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black tracking-[-0.03em]">Próximas reservas</h2>
              <Link href="/mis-reservas" className="text-sm font-bold text-accent">Ver todas</Link>
            </div>
            {nextBooking ? (
              <StudentCard className="flex items-center gap-3 p-4">
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-orange-50 text-accent">
                  <CalendarClock className="h-7 w-7" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-black">{dayjs(nextBooking.start_at).format('ddd, D MMM YYYY')}</p>
                  <p className="truncate text-sm font-medium text-textsec">
                    {dayjs(nextBooking.start_at).format('HH:mm')}
                    {nextBooking.distance_m ? ` · ${nextBooking.distance_m}m` : ''}
                  </p>
                </div>
                <StatusBadge status={nextBooking.status || 'reserved'} />
                {nextBooking.booking_id && (
                  <Link href={`/reserva/${nextBooking.booking_id}`} aria-label="Ver detalle">
                    <ChevronRight className="h-6 w-6 text-textsec" />
                  </Link>
                )}
              </StudentCard>
            ) : (
              <StudentCard className="p-5 text-sm text-textsec">No tienes reservas próximas.</StudentCard>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black tracking-[-0.03em]">Historial de clases</h2>
            <div className="flex gap-2 overflow-x-auto pb-1">
              <FilterButton label="Todas" active={filter === 'all'} onClick={() => setFilter('all')} />
              <FilterButton label="Asistidas" active={filter === 'attended'} onClick={() => setFilter('attended')} />
              <FilterButton label="Canceladas" active={filter === 'cancelled'} onClick={() => setFilter('cancelled')} />
              <FilterButton label="No asistió" active={filter === 'no_show'} onClick={() => setFilter('no_show')} />
            </div>

            <StudentCard className="divide-y divide-line overflow-hidden">
              {filteredHistory.length === 0 && !isHistoryLoading && (
                <div className="p-5 text-sm text-textsec">No hay clases para este filtro.</div>
              )}
              {filteredHistory.map((booking) => (
                <HistoryRow key={booking.booking_id} booking={booking} />
              ))}

              {isHistoryLoading && (
                <div className="flex justify-center py-6">
                  <Spinner />
                </div>
              )}

              {historyError && (
                <p className="px-5 py-4 text-center text-sm text-danger">{historyError}</p>
              )}

              {hasMoreHistory && !isHistoryLoading && (
                <div className="p-3">
                  <button onClick={loadMoreBookings} className="btn-outline min-h-[44px] w-full bg-white">
                    <RotateCw className="h-5 w-5" />
                    Cargar más historial
                  </button>
                </div>
              )}
            </StudentCard>
          </section>
        </div>
      </div>
    </AuthGuard>
  )
}

function PlanFact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="mb-2 grid h-11 w-11 place-items-center rounded-xl bg-orange-50 text-accent">{icon}</span>
      <p className="text-sm font-medium text-textsec">{label}</p>
      <p className="truncate font-black">{value}</p>
    </div>
  )
}

function UsageCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone: 'green' | 'blue' | 'orange' | 'red' }) {
  const toneClass = {
    green: 'bg-green-50 text-success',
    blue: 'bg-blue-50 text-blue-600',
    orange: 'bg-orange-50 text-accent',
    red: 'bg-red-50 text-danger',
  }[tone]

  return (
    <StudentCard className="p-3">
      <div className={`mb-2 grid h-10 w-10 place-items-center rounded-full ${toneClass}`}>{icon}</div>
      <p className="text-xs font-medium text-textsec">{label}</p>
      <p className="mt-1 text-3xl font-black">{value}</p>
      <p className="text-xs text-textsec">clases</p>
    </StudentCard>
  )
}

function FilterButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[40px] shrink-0 rounded-full border px-5 text-sm font-bold ${
        active ? 'border-accent bg-accent text-white shadow-card' : 'border-line bg-white text-textsec'
      }`}
    >
      {label}
    </button>
  )
}

function HistoryRow({ booking }: { booking: BookingHistoryItem }) {
  return (
    <Link href={`/reserva/${booking.booking_id}`} className="flex items-center gap-3 p-4 transition hover:bg-slate-50">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600">
        <CalendarClock className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-black">{dayjs(booking.start_at).format('ddd, D MMM, YYYY')}</p>
        <p className="truncate text-xs font-medium text-textsec">
          {dayjs(booking.start_at).format('HH:mm')}
          {booking.distance_m ? ` · ${booking.distance_m}m` : ''}
        </p>
      </div>
      <StatusBadge status={booking.status} />
      <ChevronRight className="h-5 w-5 shrink-0 text-textsec" />
    </Link>
  )
}
