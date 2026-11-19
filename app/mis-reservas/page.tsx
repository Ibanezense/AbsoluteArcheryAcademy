'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { CalendarCheck, CalendarDays, ChevronRight, Clock3, GraduationCap, Search, type LucideIcon } from 'lucide-react'
import { MobileStudentHeader } from '@/components/student/MobileStudentHeader'
import { StudentCard } from '@/components/student/StudentCard'
import StudentBookingHistory from '@/components/student/StudentBookingHistory'
import { StudentReservationPlanner } from '@/components/student/StudentReservationPlanner'
import { StudentPageSkeleton } from '@/components/ui/StudentPageSkeleton'
import { useStudentContext } from '@/lib/hooks/useStudentContext'
import { useStudentBookingHistory } from '@/lib/hooks/useStudentBookingHistory'
import { limaBookingDate } from '@/lib/utils/studentBooking'

export default function MisReservasPage() {
  const { account, activeStudent, activeStudentId, loading } = useStudentContext()
  const upcoming = useStudentBookingHistory(activeStudentId, { scope: 'upcoming' })
  const next = upcoming.isError ? null : upcoming.data?.rows[0]
  const summary = upcoming.isError ? null : upcoming.data?.summary

  useEffect(() => {
    const target = window.location.hash.slice(1)
    if (!loading && activeStudentId && ['planificador', 'clases-reservadas', 'historial'].includes(target)) {
      document.getElementById(target)?.scrollIntoView()
    }
  }, [loading, activeStudentId])

  if (loading) return <StudentPageSkeleton variant="reservations" />

  return (
    <div className="min-h-screen bg-[#F5F8FC] text-textpri">
      <MobileStudentHeader title="Mis reservas" subtitle="Planifica tus clases y consulta tus reservas" showBack />
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-4 sm:space-y-5 sm:px-6 sm:py-6">
        {account?.role === 'guardian' && activeStudent && (
          <StudentCard className="flex items-center justify-between gap-4 border-blue-100 px-4 py-2">
            <p className="min-w-0 text-sm text-slate-600">Reservas de <strong className="break-words text-[#101e3e]">{activeStudent.full_name}</strong></p>
            <Link href="/hub" className="inline-flex min-h-11 shrink-0 items-center text-sm font-bold text-[#0758aa] underline">Cambiar</Link>
          </StudentCard>
        )}
        {activeStudentId ? (
          <>
            <div className="relative overflow-hidden rounded-2xl border border-blue-100 bg-white px-4 pb-4 pt-5 sm:px-6 sm:pb-5">
              <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full border-[20px] border-blue-100/80 sm:size-72">
                <div className="absolute inset-3 rounded-full border-[17px] border-orange-200" />
                <div className="absolute inset-12 rounded-full border-[13px] border-blue-100/70" />
              </div>
              <div className="relative">
                <h2 className="text-2xl font-bold tracking-tight text-[#101e3e]">Organiza tus entrenamientos</h2>
                <p className="mt-1 text-sm text-slate-600">Reserva por semana o por mes.</p>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:gap-3">
                  <a href="#planificador" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-2 text-center text-sm font-bold text-white hover:bg-orange-800 sm:px-4">
                    <CalendarDays aria-hidden="true" className="size-4 shrink-0" /> Reservar clases
                  </a>
                  <a href="#clases-reservadas" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-blue-300 bg-white px-2 text-center text-sm font-bold text-[#0758aa] hover:bg-blue-50 sm:px-4">
                    <Search aria-hidden="true" className="size-4 shrink-0" /> Consultar
                  </a>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <SummaryLink href="#clases-reservadas" icon={CalendarCheck} label="Reservadas" value={summary ? String(summary.upcoming) : '—'} />
              <SummaryLink href={next ? `/reserva/${next.booking_id}` : '#clases-reservadas'} icon={GraduationCap} label="Próxima clase" value={next ? limaBookingDate(next.start_at).format('ddd D [·] HH:mm') : upcoming.isPending ? '—' : upcoming.isError ? 'No disponible' : 'Sin reserva'} orange />
              <SummaryLink href="#historial" icon={Clock3} label="Historial" value={summary ? `${summary.attended} asistidas` : '—'} />
            </div>
            <StudentReservationPlanner key={activeStudentId} studentId={activeStudentId} studentName={activeStudent?.full_name} />
            <div className="grid items-start gap-4 lg:grid-cols-2">
              <section id="clases-reservadas" className="scroll-mt-6 space-y-3 rounded-2xl border border-blue-100 bg-white p-4" aria-labelledby="reserved-heading">
                <h2 id="reserved-heading" className="flex items-center gap-2 text-lg font-bold text-[#101e3e]"><CalendarCheck aria-hidden="true" className="size-5 text-[#0758aa]" /> Clases reservadas</h2>
                <p className="text-sm text-slate-600">Puedes cancelar tu reserva hasta el inicio de la clase.</p>
                <StudentBookingHistory key={`upcoming-${activeStudentId}`} studentId={activeStudentId} scope="upcoming" compact />
              </section>
              <section id="historial" className="scroll-mt-6 space-y-3 rounded-2xl border border-blue-100 bg-white p-4" aria-labelledby="history-heading">
                <h2 id="history-heading" className="flex items-center gap-2 text-lg font-bold text-[#101e3e]"><Clock3 aria-hidden="true" className="size-5 text-[#0758aa]" /> Historial</h2>
                <p className="text-sm text-slate-600">Actividad reciente y clases de todos tus planes.</p>
                <StudentBookingHistory key={`history-${activeStudentId}`} studentId={activeStudentId} scope="history" compact />
              </section>
            </div>
          </>
        ) : (
          <StudentCard className="p-5 text-sm text-textsec">Selecciona un alumno antes de continuar. <Link href="/hub" className="font-bold text-[#0758aa] underline">Elegir alumno</Link></StudentCard>
        )}
      </div>
    </div>
  )
}

function SummaryLink({ href, icon: Icon, label, value, orange = false }: { href: string; icon: LucideIcon; label: string; value: string; orange?: boolean }) {
  return (
    <Link href={href} className="relative flex min-w-0 flex-col gap-1.5 rounded-xl border border-blue-100 bg-white p-2.5 hover:border-blue-400 sm:flex-row sm:items-center sm:gap-3 sm:p-3">
      <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${orange ? 'bg-orange-100 text-orange-800' : 'bg-blue-50 text-[#0758aa]'}`}><Icon aria-hidden="true" className="size-4" /></span>
      <span className="min-w-0">
        <span className="block text-xs font-bold text-[#101e3e] sm:text-sm">{label}</span>
        <span className="block text-xs capitalize text-slate-600">{value}</span>
      </span>
      <ChevronRight aria-hidden="true" className="absolute right-2 top-3 size-4 text-[#0758aa] sm:static sm:ml-auto" />
    </Link>
  )
}
