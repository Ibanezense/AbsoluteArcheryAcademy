'use client'

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import { CalendarClock, CalendarPlus, ChevronRight, Medal, Target, Ticket, UserRound } from 'lucide-react'
import { AuthGuard } from '@/components/AuthGuard'
import Avatar from '@/components/ui/Avatar'
import { NextBookingWidget } from '@/components/ui/NextBookingWidget'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { StudentPageSkeleton } from '@/components/ui/StudentPageSkeleton'
import { MobileStudentHeader } from '@/components/student/MobileStudentHeader'
import { StudentCard, StudentNotice } from '@/components/student/StudentCard'
import StudentRenewalActions from '@/components/student/StudentRenewalActions'
import { StudentWeekOverview } from '@/components/student/StudentWeekOverview'
import { useStudentBookingHistory } from '@/lib/hooks/useStudentBookingHistory'
import { useNextBooking } from '@/lib/hooks/useNextBooking'
import { useStudentContext } from '@/lib/hooks/useStudentContext'
import { useStudentDashboard } from '@/lib/hooks/useStudentDashboard'
import { getDashboardMembershipBadge } from '@/lib/utils/dashboardMembershipStatus'
import { getStudentRenewalDateState } from '@/lib/utils/studentRenewalDate'
import { formatDateOnly } from '@/lib/utils/dateUtils'

function StudentHomeContent() {
  const router = useRouter()
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
  const historyQuery = useStudentBookingHistory(activeStudentId)
  const history = historyQuery.data?.rows || []
  const historyLoading = historyQuery.isLoading
  const { booking: nextBooking } = useNextBooking(activeStudentId)

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

  const renewalDate = getStudentRenewalDateState(dashboard.membership_end)
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
  const nextReservationLabel = nextBooking ? dayjs(nextBooking.start_at).format('D MMM') : 'Sin reserva'
  const nextReservationDetail = nextBooking ? dayjs(nextBooking.start_at).format('HH:mm') : 'Aún no tienes reservas'
  const recentHistory = history.slice(0, 4)

  return (
    <div className="min-h-screen bg-bg text-textpri">
      <MobileStudentHeader showLogo />

      <div className="space-y-6 px-4 py-5 sm:px-6 md:space-y-8 md:px-8 md:py-8">
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

        <section className="sport-dark relative isolate overflow-hidden rounded-[1.5rem] bg-navy px-5 py-6 text-white shadow-soft sm:p-8" aria-label="Resumen del alumno">
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[linear-gradient(120deg,transparent_35%,rgba(255,255,255,0.04)_35%,rgba(255,255,255,0.04)_36%,transparent_36%,transparent_65%,rgba(255,255,255,0.04)_65%,rgba(255,255,255,0.04)_66%,transparent_66%)]" />
          <Target aria-hidden="true" className="pointer-events-none absolute -right-10 -top-8 h-64 w-64 text-white/[0.045]" strokeWidth={0.8} />
          <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-start gap-4 sm:gap-5">
              <div className="mt-1 shrink-0 rounded-full border border-white/20 bg-white/10 p-1.5">
                <Avatar
                  url={dashboard.avatar_url}
                  name={dashboard.full_name || 'Alumno'}
                  size="lg"
                  className="!h-14 !w-14 !text-xl text-white sm:!h-20 sm:!w-20"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-orange-300">Tu espacio de entrenamiento</p>
                <h1 className="break-words font-heading text-3xl font-bold leading-[1.05] tracking-tight text-white sm:text-4xl lg:text-5xl">
                  {dashboard.full_name || 'Alumno'}
                </h1>
                <p className="mt-3 text-sm font-medium text-slate-300">
                  {dashboard.age ? `${dashboard.age} años` : 'Alumno'}
                  {dashboard.current_distance_m ? `  ·  Distancia: ${dashboard.current_distance_m}m` : ''}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-white"><StatusBadge status={membershipBadge.status} label={membershipBadge.label} /></span>
                </div>
                {(dashboard.category || dashboard.level) && (
                  <p className="mt-3 break-words text-xs font-medium text-slate-300">
                    {dashboard.category || 'Categoría pendiente'}
                    {dashboard.level ? ` · ${dashboard.level}` : ''}
                  </p>
                )}
              </div>
            </div>
            <Link href="/reservar" className="inline-flex min-h-[52px] shrink-0 items-center justify-center gap-3 rounded-xl bg-accent px-6 py-3 font-bold text-white shadow-lg transition-colors hover:bg-orange-800 active:bg-orange-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300 md:self-end">
              <CalendarPlus aria-hidden="true" className="h-5 w-5" />
              Reservar clase
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <QuickMetric
            icon={<CalendarPlus className="h-5 w-5" />}
            label="Clases disponibles"
            value={`${dashboard.classes_remaining ?? 0}`}
            detail={`de ${dashboard.classes_total ?? 0}`}
            tone="orange"
          />
          <QuickMetric
            icon={<CalendarClock className="h-5 w-5" />}
            label={renewalDate.label}
            value={renewalDate.value}
            detail={renewalDate.detail}
            tone={renewalDate.tone}
            emphasizeTone={true}
          />
          <QuickMetric
            icon={<Target className="h-5 w-5" />}
            label="Próxima reserva"
            value={nextReservationLabel}
            detail={nextReservationDetail}
            tone="blue"
          />
          <QuickMetric
            icon={<Medal className="h-5 w-5" />}
            label={membershipPlanCopy.label}
            value={dashboard.membership_name || '-'}
            detail={membershipPlanCopy.detail}
            tone="orange"
          />
        </div>


        <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 md:grid-cols-3">
          <QuickAction href="/mis-reservas" icon={<CalendarPlus className="h-7 w-7" />} title="Mis reservas" subtitle="Ver y gestionar" />
          <QuickAction href="/membresias" icon={<Ticket className="h-7 w-7" />} title="Mi membresía" subtitle="Historial y plan" accent="violet" />
          <QuickAction href="/perfil" icon={<UserRound className="h-7 w-7" />} title="Mi perfil" subtitle="Datos y progreso" />

        </div>

        {activeStudentId && <StudentRenewalActions studentId={activeStudentId} />}

        <StudentNotice>
          Puedes cancelar desde la app hasta el inicio de la clase.
        </StudentNotice>

        {activeStudentId && <StudentWeekOverview studentId={activeStudentId} />}

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-2xl font-bold tracking-tight">Próxima reserva</h2>
            <Link href="/mis-reservas" className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-bold text-accent transition-colors hover:bg-orange-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">Ver todas</Link>
          </div>
          <NextBookingWidget studentId={activeStudentId} />
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-2xl font-bold tracking-tight">Actividad reciente</h2>
            <Link href="/membresias" className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-bold text-accent transition-colors hover:bg-orange-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">Ver historial</Link>
          </div>
          <StudentCard className="divide-y divide-line overflow-hidden">
            {historyQuery.error && <div className="p-5 text-sm text-danger">No pudimos cargar la actividad. <button type="button" onClick={() => void historyQuery.refetch()} className="font-bold text-accent">Reintentar</button></div>}
            {recentHistory.length === 0 && !historyLoading && !historyQuery.error && (
              <div className="p-5 text-sm text-textsec">Aún no hay actividad reciente.</div>
            )}
            {recentHistory.map((booking) => (
              <Link
                key={booking.booking_id}
                href={booking.event_source === 'booking' ? `/reserva/${booking.booking_id}` : '/membresias'}
                className="flex min-h-[80px] items-center gap-3 p-4 transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-accent sm:px-5"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
                  <CalendarClock className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{booking.event_source === 'booking' ? dayjs(booking.start_at).format('ddd, D MMM, YYYY') : formatDateOnly(booking.start_at)}</p>
                  <p className="truncate text-xs font-medium text-textsec">
                    {booking.event_source === 'booking' ? dayjs(booking.start_at).format('HH:mm') : booking.membership_code}
                    {booking.distance_m ? ` · ${booking.distance_m}m` : ''}
                  </p>
                </div>
                <StatusBadge status={booking.status} />
                <ChevronRight className="h-5 w-5 shrink-0 text-textsec" />
              </Link>
            ))}
          </StudentCard>
        </section>
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
  const emphasisCardVariants = {
    orange: 'warning',
    green: 'success',
    blue: 'info',
    red: 'danger',
    neutral: 'neutral',
  } as const
  const emphasizedText = emphasizeTone ? emphasisClasses[tone] : ''
  const cardVariant = emphasizeTone ? emphasisCardVariants[tone] : 'default'
  const valueStyle = typeof value === 'string' && value.length > 22
    ? 'font-sans text-base font-bold leading-6'
    : 'font-heading text-3xl font-bold leading-tight tracking-tight sm:text-4xl'

  return (
    <StudentCard variant={cardVariant} className="min-h-[120px] p-4">
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
  accent = 'orange',
}: {
  href: string
  icon: ReactNode
  title: string
  subtitle: string
  accent?: 'orange' | 'violet'
}) {
  return (
    <Link href={href} className="group flex min-h-[104px] items-center gap-4 rounded-2xl border border-line bg-white p-4 shadow-card transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:p-5">
      <div aria-hidden="true" className={accent === 'orange' ? 'grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-orange-50 text-accent' : 'grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-navy'}>{icon}</div>
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
