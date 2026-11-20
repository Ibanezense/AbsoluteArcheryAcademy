import Link from 'next/link'
import { ArrowUpRight, CalendarDays, ClipboardCheck, CreditCard, Gauge } from 'lucide-react'
import type { AdminDashboardData } from '@/lib/utils/adminDashboard'

export function DashboardTodayOverview({ today, pendingPayments, locationLabel }: { today: AdminDashboardData['today']; pendingPayments?: number | null; locationLabel?: string }) {
  const cards = [
    { title: 'Reservas de hoy', value: today.reservationsToday, detail: 'Reservas y asistencias del día', href: '/admin/asistencia', icon: CalendarDays, color: 'bg-blue-50 text-blue-700' },
    { title: 'Turnos programados', value: today.scheduledSessionsToday, detail: 'Consultar horarios y cupos', href: '/admin/sesiones', icon: Gauge, color: 'bg-orange-50 text-orange-700' },
    { title: 'Asistencias por marcar', value: today.attendancePending, detail: 'Incluye turnos que aún no comienzan', href: '/admin/asistencia', icon: ClipboardCheck, color: 'bg-teal-50 text-teal-700' },
    ...(pendingPayments === undefined ? [] : [{ title: 'Pagos pendientes', value: pendingPayments ?? 'N/D', detail: 'Toda la academia', href: '/admin/finanzas', icon: CreditCard, color: 'bg-blue-50 text-blue-700' }]),
  ]

  return (
    <section aria-labelledby="dashboard-today-title" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Tu academia</p>
          <h2 id="dashboard-today-title" className="mt-1 font-heading text-2xl font-bold tracking-tight text-slate-950">Hoy en la academia</h2>
        </div>
        <span className="text-sm text-slate-500">{locationLabel ?? 'Todas las sedes'} · hora de Lima</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ title, value, detail, href, icon: Icon, color }) => (
          <Link key={title} href={href} className="group flex min-h-32 items-start gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_3px_16px_rgba(15,35,70,0.04)] transition hover:border-blue-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 sm:p-5">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${color}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-700">{title}</span>
              <span className="mt-1 block font-heading text-3xl font-bold leading-none tabular-nums text-slate-950">{value}</span>
              <span className="mt-2 block text-xs leading-5 text-slate-600">{detail}</span>
            </span>
            <ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-blue-700" />
          </Link>
        ))}
      </div>
    </section>
  )
}
