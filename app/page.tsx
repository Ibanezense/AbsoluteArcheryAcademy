'use client'

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import { CalendarClock, CalendarPlus, ChevronRight, Headphones, Medal, Target, Ticket } from 'lucide-react'
import { AuthGuard } from '@/components/AuthGuard'
import Avatar from '@/components/ui/Avatar'
import { NextBookingWidget } from '@/components/ui/NextBookingWidget'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { StudentPageSkeleton } from '@/components/ui/StudentPageSkeleton'
import { MobileStudentHeader } from '@/components/student/MobileStudentHeader'
import { StudentCard, StudentNotice } from '@/components/student/StudentCard'
import { useBookingHistory } from '@/lib/hooks/useBookingHistory'
import { useMembershipExpiry } from '@/lib/hooks/useMembershipExpiry'
import { useNextBooking } from '@/lib/hooks/useNextBooking'
import { useStudentContext } from '@/lib/hooks/useStudentContext'
import { useStudentDashboard } from '@/lib/hooks/useStudentDashboard'

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
  const {
    bookings: history,
    isLoading: historyLoading,
    hasMore: hasMoreHistory,
    loadMoreBookings,
  } = useBookingHistory(activeStudentId)
  const { booking: nextBooking } = useNextBooking(activeStudentId)

  const { isExpired, isExpiringSoon } = useMembershipExpiry(dashboard)

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

  useEffect(() => {
    if (activeStudentId && history.length === 0 && !historyLoading && hasMoreHistory) {
      loadMoreBookings()
    }
  }, [activeStudentId, history.length, historyLoading, hasMoreHistory, loadMoreBookings])

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

  const membershipEnd = dashboard.membership_end ? dayjs(dashboard.membership_end) : null
  const membershipStatus = isExpired ? 'expired' : isExpiringSoon ? 'expiring' : 'active'
  const nextReservationLabel = nextBooking ? dayjs(nextBooking.start_at).format('D MMM') : 'Sin reserva'
  const nextReservationDetail = nextBooking ? dayjs(nextBooking.start_at).format('HH:mm') : 'Aún no tienes reservas'
  const recentHistory = history.slice(0, 4)

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-textpri">
      <MobileStudentHeader showLogo />

      <div className="space-y-4 px-4 py-5">
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
          <div className="relative flex items-center gap-4 p-4 pt-8">
            <div className="shrink-0 rounded-full border-4 border-white bg-white shadow-card">
              <Avatar
                url={dashboard.avatar_url}
                name={dashboard.full_name || 'Alumno'}
                size="lg"
                className="!h-24 !w-24 !text-3xl"
              />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[1.7rem] font-black leading-tight tracking-[-0.04em] text-slate-900">
                {dashboard.full_name || 'Alumno'}
              </h1>
              <p className="mt-1 text-sm font-medium text-textsec">
                {dashboard.age ? `${dashboard.age} años` : 'Alumno'}
                {dashboard.current_distance_m ? `  ·  Distancia: ${dashboard.current_distance_m}m` : ''}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <StatusBadge status={dashboard.student_is_active ? 'active' : 'expired'} label={dashboard.student_is_active ? 'Activo' : 'Inactivo'} />
                <StatusBadge status={membershipStatus} label={dashboard.membership_name || 'Sin membresía'} />
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

        <div className="grid grid-cols-2 gap-3">
          <QuickMetric
            icon={<CalendarPlus className="h-5 w-5" />}
            label="Clases disponibles"
            value={`${dashboard.classes_remaining ?? 0}`}
            detail={`de ${dashboard.classes_total ?? 0}`}
            tone="orange"
          />
          <QuickMetric
            icon={<CalendarClock className="h-5 w-5" />}
            label="Vence"
            value={membershipEnd ? membershipEnd.format('D MMM') : '-'}
            detail="Vencimiento"
            tone="green"
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
            label="Plan actual"
            value={dashboard.membership_name || '-'}
            detail="Plan vigente"
            tone="orange"
          />
        </div>

        <Link href="/reservar" className="btn min-h-[56px] w-full rounded-2xl text-lg font-extrabold shadow-[0_12px_24px_rgba(249,115,22,0.25)]">
          <CalendarPlus className="h-7 w-7" />
          Reservar clase
        </Link>

        <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-3">
          <QuickAction href="/mis-reservas" icon={<CalendarPlus className="h-7 w-7" />} title="Mis reservas" subtitle="Ver y gestionar" />
          <QuickAction href="/membresias" icon={<Ticket className="h-7 w-7" />} title="Mi membresía" subtitle="Historial y plan" accent="violet" />
          <button type="button" disabled className="rounded-2xl border border-line bg-white p-4 text-left opacity-70 shadow-card">
            <Headphones className="mb-2 h-7 w-7 text-blue-600" />
            <p className="font-bold">Soporte</p>
            <p className="text-xs text-textsec">Ayuda y contacto</p>
          </button>
        </div>

        <StudentNotice>
          Puedes cancelar desde la app hasta el inicio de la clase.
        </StudentNotice>

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
            {recentHistory.length === 0 && !historyLoading && (
              <div className="p-5 text-sm text-textsec">Aún no hay actividad reciente.</div>
            )}
            {recentHistory.map((booking) => (
              <Link
                key={booking.booking_id}
                href={`/reserva/${booking.booking_id}`}
                className="flex items-center gap-3 p-4 transition hover:bg-slate-50"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600">
                  <CalendarClock className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{dayjs(booking.start_at).format('ddd, D MMM, YYYY')}</p>
                  <p className="truncate text-xs font-medium text-textsec">
                    {dayjs(booking.start_at).format('HH:mm')}
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
}: {
  icon: ReactNode
  label: string
  value: string
  detail: string
  tone: 'orange' | 'green' | 'blue'
}) {
  const toneClasses = {
    orange: 'bg-orange-50 text-accent',
    green: 'bg-green-50 text-success',
    blue: 'bg-blue-50 text-blue-600',
  }

  return (
    <StudentCard className="min-h-[132px] p-4">
      <div className={`mb-4 grid h-10 w-10 place-items-center rounded-full ${toneClasses[tone]}`}>{icon}</div>
      <p className="text-sm font-bold leading-tight">{label}</p>
      <p className="mt-3 text-[1.45rem] font-black leading-tight tracking-[-0.04em] text-slate-950">{value}</p>
      <p className="mt-1 text-sm font-medium leading-tight text-textsec">{detail}</p>
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
