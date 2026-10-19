'use client'

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import { CalendarClock, CalendarPlus, ChevronRight, Medal, Target, Ticket } from 'lucide-react'
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
    <div className="min-h-screen bg-[#F7F8FA] text-textpri">
      <MobileStudentHeader showLogo />

      <div className="space-y-4 px-4 py-5 md:px-8 md:py-6">
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

        <StudentCard className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_88%_26%,rgba(249,115,22,0.14),transparent_28%),linear-gradient(105deg,#FFF3E9,#FFFFFF)]" />
          <Target className="absolute right-6 top-6 h-28 w-28 text-accent/10" strokeWidth={1.2} />
          <div className="relative flex items-center gap-3 p-4">
            <div className="shrink-0 rounded-full border-4 border-white bg-white shadow-card">
              <Avatar
                url={dashboard.avatar_url}
                name={dashboard.full_name || 'Alumno'}
                size="lg"
                className="!h-14 !w-14 !text-xl"
              />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="break-words text-[1.35rem] font-black leading-tight tracking-[-0.04em] text-slate-900">
                {dashboard.full_name || 'Alumno'}
              </h1>
              <p className="mt-1 text-sm font-medium text-textsec">
                {dashboard.age ? `${dashboard.age} años` : 'Alumno'}
                {dashboard.current_distance_m ? `  ·  Distancia: ${dashboard.current_distance_m}m` : ''}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <StatusBadge status={dashboard.student_is_active ? 'active' : 'expired'} label={dashboard.student_is_active ? 'Activo' : 'Inactivo'} />
                <StatusBadge status={membershipBadge.status} label={membershipBadge.label} />
              </div>
              {(dashboard.category || dashboard.level) && (
                <div className="mt-2 inline-flex max-w-full rounded-full border border-line bg-white/80 px-3 py-1 text-xs font-semibold text-textsec">
                  <span className="truncate">
                    {dashboard.category || 'Categoría pendiente'}
                    {dashboard.level ? ` · ${dashboard.level}` : ''}
                  </span>
                </div>
              )}
            </div>
          </div>
        </StudentCard>

        <Link href="/reservar" className="btn min-h-[56px] w-full rounded-2xl text-lg font-extrabold shadow-[0_12px_24px_rgba(249,115,22,0.25)]">
          <CalendarPlus className="h-7 w-7" />
          Reservar clase
        </Link>

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


        <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
          <QuickAction href="/mis-reservas" icon={<CalendarPlus className="h-7 w-7" />} title="Mis reservas" subtitle="Ver y gestionar" />
          <QuickAction href="/membresias" icon={<Ticket className="h-7 w-7" />} title="Mi membresía" subtitle="Historial y plan" accent="violet" />

        </div>

        {activeStudentId && <StudentRenewalActions studentId={activeStudentId} />}

        <StudentNotice>
          Puedes cancelar desde la app hasta el inicio de la clase.
        </StudentNotice>

        {activeStudentId && <StudentWeekOverview studentId={activeStudentId} />}

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black tracking-[-0.03em]">Próxima reserva</h2>
            <Link href="/mis-reservas" className="text-sm font-bold text-accent">Ver todas</Link>
          </div>
          <NextBookingWidget studentId={activeStudentId} />
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black tracking-[-0.03em]">Actividad reciente</h2>
            <Link href="/membresias" className="text-sm font-bold text-accent">Ver historial</Link>
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
                className="flex items-center gap-3 p-4 transition hover:bg-slate-50"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600">
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

  return (
    <StudentCard variant={cardVariant} className="min-h-[120px] p-4">
      <div className={`mb-2 grid h-8 w-8 place-items-center rounded-full ${toneClasses[tone]}`}>{icon}</div>
      <p className={`text-sm font-bold leading-tight ${emphasizedText}`}>{label}</p>
      <p className={`mt-2 break-words text-[1.25rem] font-black leading-tight tracking-[-0.04em] ${emphasizedText || 'text-slate-950'}`}>{value}</p>
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
    <Link href={href} className="rounded-2xl border border-line bg-white p-4 shadow-card transition active:scale-[0.98]">
      <div className={accent === 'orange' ? 'mb-2 text-accent' : 'mb-2 text-violet-600'}>{icon}</div>
      <p className="font-bold leading-tight">{title}</p>
      <p className="text-xs text-textsec">{subtitle}</p>
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
