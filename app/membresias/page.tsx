'use client'

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import { CalendarClock, CheckCircle2, ChevronRight, Target, Ticket, UserX, XCircle } from 'lucide-react'
import { AuthGuard } from '@/components/AuthGuard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { StudentPageSkeleton } from '@/components/ui/StudentPageSkeleton'
import { MobileStudentHeader } from '@/components/student/MobileStudentHeader'
import { StudentCard } from '@/components/student/StudentCard'
import StudentBookingHistory from '@/components/student/StudentBookingHistory'
import StudentRenewalActions from '@/components/student/StudentRenewalActions'
import { useStudentBookingHistory } from '@/lib/hooks/useStudentBookingHistory'
import { useMembershipExpiry } from '@/lib/hooks/useMembershipExpiry'
import { useNextBooking } from '@/lib/hooks/useNextBooking'
import { useStudentContext } from '@/lib/hooks/useStudentContext'
import { useStudentDashboard } from '@/lib/hooks/useStudentDashboard'
import { getDashboardMembershipBadge } from '@/lib/utils/dashboardMembershipStatus'
import { formatStudentHistoryDate } from '@/lib/utils/studentHistoryDates'

export default function MembresiasPage() {
  const router = useRouter()
  const { account, activeStudentId, loading: contextLoading } = useStudentContext()
  const { dashboard, loading: dashboardLoading } = useStudentDashboard(activeStudentId)
  const { daysUntilExpiry } = useMembershipExpiry(dashboard)
  const { booking: nextBooking } = useNextBooking(activeStudentId)
  const historyQuery = useStudentBookingHistory(activeStudentId)

  useEffect(() => {
    if (contextLoading) return

    if (account?.role === 'guardian' && !activeStudentId) {
      router.replace('/hub')
    }
  }, [account?.role, activeStudentId, contextLoading, router])

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
  const membershipBadge = getDashboardMembershipBadge({
    membershipStatus: dashboard.membership_status,
    membershipEnd: dashboard.membership_end,
  })

  return (
    <AuthGuard>
      <div className="min-h-screen bg-[#F7F8FA] text-textpri">
        <MobileStudentHeader title="Mi Membresía" subtitle="Historial y estado de cuenta" showBack />

        <div className="mx-auto max-w-6xl space-y-5 px-4 py-5 sm:px-6">
          <StudentCard className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-black tracking-[-0.04em]">Estado de cuenta</h2>
              <StatusBadge status={membershipBadge.status} label={membershipBadge.label} />
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
            <div className="grid grid-cols-2 gap-4">
              <PlanFact icon={<CalendarClock className="h-6 w-6" />} label="Inicio" value={formatStudentHistoryDate(dashboard.membership_start) || '-'} />
              <PlanFact icon={<CalendarClock className="h-6 w-6" />} label="Vencimiento" value={formatStudentHistoryDate(dashboard.membership_end) || '-'} />
              <PlanFact className="col-span-2" icon={<Ticket className="h-6 w-6" />} label="Plan" value={dashboard.membership_name || '-'} />
            </div>
          </StudentCard>

          {activeStudentId && <StudentRenewalActions studentId={activeStudentId} />}

          <section className="space-y-3">
            <h2 className="text-lg font-black tracking-[-0.03em]">Uso del plan mostrado</h2>
            <p className="text-sm text-textsec">Solo este plan. El historial de abajo incluye todos tus planes.</p>
            <div className="grid grid-cols-2 gap-3 min-[390px]:grid-cols-4">
              <UsageCard icon={<Target className="h-5 w-5" />} label="Disponibles" value={remainingClasses} tone="green" />
              <UsageCard icon={<CheckCircle2 className="h-5 w-5" />} label="Usadas" value={usedClasses} tone="blue" />
              <UsageCard icon={<XCircle className="h-5 w-5" />} label="Canceladas" value={historyQuery.data?.summary.currentCancelled ?? '—'} tone="orange" />
              <UsageCard icon={<UserX className="h-5 w-5" />} label="No asistió" value={historyQuery.data?.summary.currentNoShow ?? '—'} tone="red" />
            </div>
            {historyQuery.isError && <p role="alert" className="text-sm text-danger">No se pudo cargar el uso completo. <button className="font-bold underline" onClick={() => historyQuery.refetch()}>Reintentar</button></p>}
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
                  <p className="truncate text-lg font-black">{dayjs(nextBooking.start_at).tz('America/Lima').format('ddd, D MMM YYYY')}</p>
                  <p className="truncate text-sm font-medium text-textsec">
                    {dayjs(nextBooking.start_at).tz('America/Lima').format('HH:mm')}
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
            {activeStudentId && <StudentBookingHistory key={activeStudentId} studentId={activeStudentId} />}
          </section>
        </div>
      </div>
    </AuthGuard>
  )
}

function PlanFact({ icon, label, value, className = '' }: { icon: ReactNode; label: string; value: string; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <span className="mb-2 grid h-11 w-11 place-items-center rounded-xl bg-orange-50 text-accent">{icon}</span>
      <p className="text-sm font-medium text-textsec">{label}</p>
      <p className="break-words font-black">{value}</p>
    </div>
  )
}

function UsageCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number | string; tone: 'green' | 'blue' | 'orange' | 'red' }) {
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
