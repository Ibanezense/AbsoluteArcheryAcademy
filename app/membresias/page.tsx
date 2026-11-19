'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarDays, ChevronDown, ChevronRight, Ticket } from 'lucide-react'
import { AuthGuard } from '@/components/AuthGuard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { StudentPageSkeleton } from '@/components/ui/StudentPageSkeleton'
import { MobileStudentHeader } from '@/components/student/MobileStudentHeader'
import { StudentCard } from '@/components/student/StudentCard'
import StudentRenewalActions from '@/components/student/StudentRenewalActions'
import { useStudentBookingHistory } from '@/lib/hooks/useStudentBookingHistory'
import { useStudentContext } from '@/lib/hooks/useStudentContext'
import { useStudentDashboard, useStudentMembershipBalance, useStudentMembershipCoverageEnd, useStudentNextMembership } from '@/lib/hooks/useStudentDashboard'
import { getDashboardMembershipBadge } from '@/lib/utils/dashboardMembershipStatus'
import { formatStudentHistoryDate } from '@/lib/utils/studentHistoryDates'

export default function MembresiasPage() {
  const router = useRouter()
  const { account, activeStudent, activeStudentId, loading: contextLoading } = useStudentContext()
  const { dashboard, loading: dashboardLoading } = useStudentDashboard(activeStudentId)
  const coverage = useStudentMembershipCoverageEnd(activeStudentId)
  const balance = useStudentMembershipBalance(activeStudentId)
  const nextMembership = useStudentNextMembership(activeStudentId)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const history = useStudentBookingHistory(detailsOpen ? activeStudentId : null)

  useEffect(() => {
    if (!contextLoading && account?.role === 'guardian' && !activeStudentId) router.replace('/hub')
  }, [account?.role, activeStudentId, contextLoading, router])

  if (contextLoading || dashboardLoading) return <StudentPageSkeleton variant="membership" />

  const membershipBadge = getDashboardMembershipBadge({
    membershipStatus: dashboard?.membership_status,
    membershipEnd: dashboard?.membership_end,
  })
  const scheduled = membershipBadge.status === 'scheduled'
  const hasPlan = membershipBadge.status !== 'no_membership'
  const expired = membershipBadge.status === 'expired'
  const total = dashboard?.classes_total ?? 0
  const used = dashboard?.classes_used ?? 0
  const usagePercent = total > 0 ? Math.max(0, Math.min(100, (used / total) * 100)) : 0
  const coverageEnd = coverage.isError ? null : coverage.data
  const next = nextMembership.isError ? null : nextMembership.data
  const planEnd = dashboard?.membership_end
  const heading = scheduled ? 'Membresía programada' : expired ? 'Último plan' : hasPlan ? 'Plan actual' : 'Tu membresía'
  const showPlanEnd = hasPlan && !scheduled && !!planEnd && (expired || coverageEnd !== planEnd)
  const summaries = history.isError ? undefined : history.data?.summary

  return (
    <AuthGuard>
      <div className="min-h-screen bg-[#F5F8FC] text-textpri">
        <MobileStudentHeader title="Membresías" subtitle="Tu plan, clases y renovación" showBack />
        <div className="mx-auto max-w-3xl space-y-4 px-4 py-4 sm:px-6 sm:py-6">
          {account?.role === 'guardian' && activeStudent && (
            <StudentCard className="flex items-center justify-between gap-3 border-blue-100 px-4 py-2">
              <p className="min-w-0 text-sm text-slate-600">Membresía de <strong className="break-words text-[#101e3e]">{activeStudent.full_name}</strong></p>
              <Link href="/hub" className="inline-flex min-h-11 shrink-0 items-center text-sm font-bold text-[#0758aa] underline">Cambiar</Link>
            </StudentCard>
          )}
          {dashboard ? (
            <StudentCard className="overflow-hidden border-blue-100">
              <div className="border-b border-blue-100 bg-blue-50/60 px-4 py-4 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-lg font-bold text-[#101e3e]">
                    <Ticket aria-hidden="true" className="size-5 text-accent" /> {heading}
                  </h2>
                  <StatusBadge status={membershipBadge.status} label={membershipBadge.label} />
                </div>
                {hasPlan && <p className="mt-1 text-sm font-medium text-slate-700">{dashboard.membership_name || 'Membresía de la academia'}</p>}
              </div>
              <div className="space-y-4 p-4 sm:p-6">
                {hasPlan && !expired && (
                  <section aria-label="Saldo de clases" className="space-y-1">
                    {balance.isError ? (
                      <p role="alert" className="text-sm text-slate-600">No pudimos consultar el saldo de clases.{' '}
                        <button type="button" className="min-h-11 font-bold text-[#0758aa] underline" onClick={() => void balance.refetch()}>Reintentar</button>
                      </p>
                    ) : (
                      <>
                        <p className="font-semibold text-[#101e3e]"><strong className="mr-1 text-3xl font-black leading-none tabular-nums text-accent">{balance.data?.total ?? '—'}</strong> clases pendientes de usar</p>
                        {balance.data && <p className="text-sm text-slate-600">
                          {balance.data.current} disponibles ahora
                          {(balance.data.scheduled > 0 || !!next || scheduled) && ` · ${balance.data.scheduled} de planes programados`}
                        </p>}
                      </>
                    )}
                  </section>
                )}
                {hasPlan && !scheduled && !expired && total > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-slate-600">Plan actual: {used} de {total} clases usadas</p>
                    <div role="progressbar" aria-label="Clases usadas del plan actual" aria-valuenow={Math.min(Math.max(used, 0), total)} aria-valuemin={0} aria-valuemax={total} className="h-2 overflow-hidden rounded-full bg-blue-100">
                      <div className="h-full rounded-full bg-orange-600" style={{ width: `${usagePercent}%` }} />
                    </div>
                  </div>
                )}
                <dl className="divide-y divide-blue-100 rounded-xl bg-slate-50 px-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2.5">
                    <dt className="text-sm font-semibold text-slate-700">Vigencia total</dt>
                    <dd className="text-sm font-bold tabular-nums text-[#0758aa]">
                      {coverage.isLoading ? 'Consultando…' : coverage.isError ? 'Fecha no disponible' : coverageEnd ? formatStudentHistoryDate(coverageEnd) : 'Sin fecha registrada'}
                    </dd>
                  </div>
                  {showPlanEnd && (
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2.5">
                      <dt className="text-sm text-slate-600">{expired ? 'Fin del último plan' : 'Fin del plan actual'}</dt>
                      <dd className="text-sm font-semibold tabular-nums text-slate-800">{formatStudentHistoryDate(planEnd)}</dd>
                    </div>
                  )}
                  {scheduled && <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2.5">
                    <dt className="text-sm text-slate-600">Inicio del plan programado</dt>
                    <dd className="text-sm font-semibold tabular-nums text-slate-800">{formatStudentHistoryDate(dashboard.membership_start)}</dd>
                  </div>}
                </dl>
                {coverage.isError && <button type="button" className="min-h-11 text-sm font-bold text-[#0758aa] underline" onClick={() => void coverage.refetch()}>Reintentar vigencia</button>}
                {next && !scheduled && (
                  <div className="flex items-start gap-3 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2.5">
                    <CalendarDays aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent" />
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-[#101e3e]">Próxima membresía programada</h3>
                      {next.custom_name && <p className="mt-0.5 text-sm text-slate-700">{next.custom_name}</p>}
                      <p className="mt-0.5 text-sm text-slate-600">
                        {formatStudentHistoryDate(next.start_date)}{next.end_date && ` al ${formatStudentHistoryDate(next.end_date)}`}
                      </p>
                    </div>
                  </div>
                )}
                {nextMembership.isError && !scheduled && (
                  <p className="text-sm text-slate-600">No pudimos consultar el siguiente plan.{' '}
                    <button type="button" className="min-h-11 font-bold text-[#0758aa] underline" onClick={() => void nextMembership.refetch()}>Reintentar</button>
                  </p>
                )}
                {activeStudentId && <StudentRenewalActions studentId={activeStudentId} membershipPage hasScheduledMembership={scheduled || !!next} />}
              </div>
            </StudentCard>
          ) : (
            <StudentCard className="p-5 text-sm text-slate-600">Datos de membresía no disponibles.</StudentCard>
          )}
          {dashboard && hasPlan && !scheduled && (
            <details className="group rounded-2xl border border-blue-100 bg-white" onToggle={event => setDetailsOpen(event.currentTarget.open)}>
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-[#101e3e] [&::-webkit-details-marker]:hidden">
                Detalle del plan
                <ChevronDown aria-hidden="true" className="size-5 text-[#0758aa] transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-2 border-t border-blue-100 px-4 py-3">
                <dl className="grid gap-2 text-sm">
                  <div className="flex justify-between gap-3"><dt className="text-slate-600">Inicio del plan</dt><dd className="font-semibold">{formatStudentHistoryDate(dashboard.membership_start)}</dd></div>
                  {summaries?.currentMembershipId && <>
                    <div className="flex justify-between gap-3"><dt className="text-slate-600">Clases canceladas</dt><dd className="font-semibold">{summaries.currentCancelled}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-slate-600">Inasistencias</dt><dd className="font-semibold">{summaries.currentNoShow}</dd></div>
                  </>}
                </dl>
                {detailsOpen && history.isLoading && <p role="status" className="text-sm text-slate-600">Consultando el uso del plan…</p>}
                {detailsOpen && history.isError && <p role="alert" className="text-sm text-slate-600">No pudimos consultar el uso del plan. <button type="button" className="min-h-11 font-bold text-[#0758aa] underline" onClick={() => void history.refetch()}>Reintentar</button></p>}
              </div>
            </details>
          )}
          <Link href="/mis-reservas#historial" className="flex min-h-12 items-center gap-3 rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-bold text-[#0758aa] hover:border-blue-300">
            <CalendarDays aria-hidden="true" className="size-5 shrink-0" />
            Ver reservas e historial de clases
            <ChevronRight aria-hidden="true" className="ml-auto size-5 shrink-0" />
          </Link>
        </div>
      </div>
    </AuthGuard>
  )
}
