'use client'

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarClock, CalendarPlus, ChevronRight, Target, Ticket, UserRound } from 'lucide-react'
import { AuthGuard } from '@/components/AuthGuard'
import { NextBookingWidget } from '@/components/ui/NextBookingWidget'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { StudentPageSkeleton } from '@/components/ui/StudentPageSkeleton'
import { MobileStudentHeader } from '@/components/student/MobileStudentHeader'
import { StudentCard, StudentNotice } from '@/components/student/StudentCard'
import StudentRenewalActions from '@/components/student/StudentRenewalActions'
import { StudentWeekOverview } from '@/components/student/StudentWeekOverview'
import { StudentHomeProgress } from '@/components/student/StudentHomeProgress'
import { useProgressAvailability } from '@/components/student/progress/ProgressAvailability'
import { useStudentContext } from '@/lib/hooks/useStudentContext'
import { useStudentDashboard, useStudentMembershipBalance, useStudentMembershipCoverageEnd } from '@/lib/hooks/useStudentDashboard'
import { getDashboardMembershipBadge } from '@/lib/utils/dashboardMembershipStatus'
import { getStudentRenewalDateState } from '@/lib/utils/studentRenewalDate'

function StudentHomeContent() {
  const router = useRouter()
  const progressEnabled = useProgressAvailability()
  const {
    account,
    students,
    activeStudent,
    activeStudentId,
    loading: contextLoading,
    error: contextError,
  } = useStudentContext()
  const {
    dashboard,
    loading: dashboardLoading,
    error: dashboardError,
  } = useStudentDashboard(activeStudentId)
  const coverage = useStudentMembershipCoverageEnd(activeStudentId)
  const balance = useStudentMembershipBalance(activeStudentId)

  useEffect(() => {
    if (account?.role === 'admin') {
      router.replace('/admin')
    }
  }, [account?.role, router])

  useEffect(() => {
    if (account?.role === 'guardian' && students.length > 1 && !activeStudentId) {
      router.replace('/hub')
    }
  }, [account?.role, students.length, activeStudentId, router])

  const loading = contextLoading || dashboardLoading
  const error = contextError || dashboardError

  if (loading) {
    return <StudentPageSkeleton variant="home" />
  }

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg px-4">
        <StudentCard className="w-full p-6 text-center">
          <p className="mb-4 text-sm font-medium text-danger">{error}</p>
          <button className="btn w-full" onClick={() => window.location.reload()}>
            Reintentar
          </button>
        </StudentCard>
      </div>
    )
  }

  if (account?.role === 'guardian' && !activeStudentId && students.length > 1) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg px-4">
        <StudentCard className="w-full p-6 text-center">
          <p className="mb-4 text-sm text-textsec">Selecciona un hijo en el hub para ver su información.</p>
          <Link href="/hub" className="btn inline-flex w-full justify-center">
            Ir al hub
          </Link>
        </StudentCard>
      </div>
    )
  }

  if (!dashboard) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg px-4">
        <StudentCard className="w-full p-6 text-center">
          <p className="mb-4 text-sm font-medium text-danger">No se pudo cargar el resumen del alumno</p>
          <button className="btn w-full" onClick={() => window.location.reload()}>
            Reintentar
          </button>
        </StudentCard>
      </div>
    )
  }

  const renewalDate = getStudentRenewalDateState(coverage.data)
  const membershipBadge = getDashboardMembershipBadge({
    membershipStatus: dashboard.membership_status,
    membershipEnd: dashboard.membership_end,
  })
  const membershipPlanCopy = membershipBadge.status === 'scheduled'
    ? { label: 'Plan programado', detail: 'Próximo plan' }
    : membershipBadge.status === 'expired'
      ? { label: 'Último plan', detail: 'Membresía vencida' }
      : membershipBadge.status === 'no_membership'
        ? { label: 'Plan', detail: 'Sin membresía' }
        : membershipBadge.status === 'no_classes'
          ? { label: 'Plan actual', detail: 'Sin clases disponibles' }
          : { label: 'Plan actual', detail: 'Plan vigente' }

  return (
    <div className="min-h-screen bg-[#f3f7fc] text-[#101e3e]">
      <MobileStudentHeader showLogo />

      <div className="space-y-4 px-4 py-4 sm:px-6 md:space-y-6 md:px-8 md:py-6">
        {account?.role === 'guardian' && activeStudent && students.length > 1 && (
          <StudentCard className="flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-textsec">Viendo alumno</p>
              <p className="truncate font-semibold">{activeStudent.full_name}</p>
            </div>
            <Link href="/hub" className="btn-outline btn-sm shrink-0">
              Cambiar
            </Link>
          </StudentCard>
        )}

        <section aria-label="Resumen del alumno" className="relative isolate overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-br from-white to-blue-50 px-5 py-5 sm:px-7">
          <Target aria-hidden="true" className="pointer-events-none absolute -right-12 -top-16 -z-10 h-52 w-52 text-blue-200/60" strokeWidth={0.85} />
          <div aria-hidden="true" className="absolute -right-6 -top-9 -z-10 h-36 w-36 rounded-full border-[9px] border-orange-300/90" />
          <h1 className="font-sans text-2xl font-extrabold leading-tight tracking-tight text-[#101e3e] sm:text-4xl">
            {dashboard.full_name ? `¡Hola, ${dashboard.full_name.trim().split(/\s+/)[0]}!` : '¡Hola!'}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <StatusBadge status={membershipBadge.status} label={membershipBadge.label} />
            {dashboard.current_distance_m != null && <span className="text-sm font-medium text-slate-600">Distancia asignada: {dashboard.current_distance_m} m</span>}
          </div>
        </section>

        <div className="grid items-start gap-4 md:grid-cols-2">
        <section aria-labelledby="student-home-next" className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 id="student-home-next" className="text-lg font-bold text-[#101e3e]">Próxima reserva</h2>
            <Link href="/mis-reservas" className="inline-flex min-h-11 items-center text-sm font-bold text-[#0758aa]">Ver reservas</Link>
          </div>
          <NextBookingWidget studentId={activeStudentId} reserveAction={
            <Link href="/mis-reservas#planificador" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-orange-800">
              <CalendarPlus aria-hidden="true" className="h-5 w-5" /> Reservar clase
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          } />
        </section>

        <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <QuickMetric
            icon={<CalendarPlus className="h-5 w-5" />}
            label="Clases pendientes"
            value={balance.isError ? '—' : String(balance.data?.total ?? '…')}
            detail={balance.isError ? 'Consulta en Membresías' : balance.data ? `${balance.data.current} disponibles ahora` : 'Consultando saldo'}
            tone="orange"
          />
          <QuickMetric
            icon={<CalendarClock className="h-5 w-5" />}
            label="Vencimiento"
            value={coverage.isLoading ? '…' : renewalDate.value}
            detail={coverage.isError ? 'No se pudo consultar la vigencia' : coverage.isLoading ? 'Consultando vigencia' : renewalDate.detail}
            tone={renewalDate.tone}
            emphasizeTone={true}
          />
        </div>
        </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <QuickAction href="/membresias" icon={<Ticket className="h-6 w-6" />} title={membershipPlanCopy.label} subtitle={dashboard.membership_name || membershipPlanCopy.detail} />
          <QuickAction href="/perfil" icon={<UserRound className="h-6 w-6" />} title="Mi perfil" subtitle="Ver mis datos" />
        </div>

        {activeStudentId && <StudentRenewalActions studentId={activeStudentId} />}

        {activeStudentId && <StudentWeekOverview studentId={activeStudentId} />}

        <StudentNotice>
          Puedes cancelar desde la app hasta el inicio de la clase.
        </StudentNotice>

        {progressEnabled && account?.id && activeStudentId && <StudentHomeProgress accountId={account.id} studentId={activeStudentId} />}
      </div>
    </div>
  )
}

function QuickMetric({
  icon,
  label,
  value,
  detail,
  tone,
  emphasizeTone = false,
}: {
  icon: ReactNode
  label: string
  value: string
  detail: string
  tone: 'orange' | 'green' | 'blue' | 'red' | 'neutral'
  emphasizeTone?: boolean
}) {
  const toneClasses = {
    orange: 'bg-orange-50 text-accent',
    green: 'bg-green-50 text-success',
    blue: 'bg-blue-50 text-blue-600',
    red: 'bg-red-50 text-red-600',
    neutral: 'bg-slate-100 text-slate-500',
  }
  const emphasisClasses = {
    orange: 'text-orange-600',
    green: 'text-success',
    blue: 'text-blue-600',
    red: 'text-red-600',
    neutral: 'text-slate-500',
  }
  const emphasizedText = emphasizeTone ? emphasisClasses[tone] : ''
  const valueStyle = typeof value === 'string' && value.length > 22
    ? 'font-sans text-base font-bold leading-6'
    : 'font-heading text-3xl font-bold leading-tight tracking-tight sm:text-4xl'

  return (
    <StudentCard className="min-h-[120px] p-4">
      <div className={`mb-3 grid h-9 w-9 place-items-center rounded-xl ${toneClasses[tone]}`}>{icon}</div>
      <p className={`text-sm font-bold leading-tight ${emphasizedText}`}>{label}</p>
      <p className={`mt-2 break-words ${valueStyle} ${emphasizedText || 'text-slate-950'}`}>{value}</p>
      <p className={`mt-1 text-sm font-medium leading-tight ${emphasizedText || 'text-textsec'}`}>{detail}</p>
    </StudentCard>
  )
}

function QuickAction({
  href,
  icon,
  title,
  subtitle,
}: {
  href: string
  icon: ReactNode
  title: string
  subtitle: string
}) {
  return (
    <Link href={href} className="group flex min-h-[76px] items-center gap-4 rounded-2xl border border-line bg-white p-4 shadow-card transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:p-5">
      <div aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#0758aa]">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="font-bold leading-tight">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-textsec">{subtitle}</p>
      </div>
      <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400 transition-colors group-hover:text-accent" />
    </Link>
  )
}

export default function HomePage() {
  return (
    <AuthGuard>
      <StudentHomeContent />
    </AuthGuard>
  )
}
