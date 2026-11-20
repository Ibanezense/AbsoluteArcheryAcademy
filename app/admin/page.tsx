'use client'

import Link from 'next/link'
import { useDeferredValue, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCcw,
  Search,
  Settings,
  Target,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react'
import AdminMembershipRenewalRequests from '@/components/AdminMembershipRenewalRequests'
import AdminQuickBooking from '@/components/AdminQuickBooking'
import { AdminDonutChart, AdminPageHeader } from '@/components/admin/AdminVisualSystem'
import MembershipGrowthChart from '@/components/admin/MembershipGrowthChart'
import TrialConversionPanel from '@/components/admin/TrialConversionPanel'
import { DashboardTodayOverview } from '@/components/admin/DashboardTodayOverview'
import DashboardSiteCapacity from '@/components/admin/DashboardSiteCapacity'
import DashboardBirthdays from '@/components/admin/DashboardBirthdays'
import DashboardMembershipFollowups from '@/components/admin/DashboardMembershipFollowups'
import { useDashboardSite } from '@/lib/hooks/useDashboardSite'
import { dashboardSiteLabels, type DashboardSite } from '@/lib/utils/adminDashboardSite'
import { formatWeeklyRange, type AdminWeeklySummary } from '@/lib/utils/adminWeeklySummary'
import { attendanceHref, administrativeBookingHref } from '@/lib/utils/adminNavigation'
import { formatAdminDate } from '@/lib/utils/adminPresentation'
import {
  useAdminDashboardData,
  useAdminStudentSearch,
  useAdminWeekendIntroCapacity,
} from '@/lib/hooks/useAdminDashboardData'
import {
  type AdminDashboardAgendaItem,
  type DashboardAgendaFilter,
  filterAgendaItems,
  getAlertSeverity,
} from '@/lib/utils/adminDashboard'

const agendaFilters: Array<{ key: DashboardAgendaFilter; label: string }> = [
  { key: 'today', label: 'Hoy' },
  { key: 'tomorrow', label: 'Mañana' },
  { key: 'week', label: 'Semana' },
  { key: 'pending', label: 'Pendientes' },
  { key: 'confirmed', label: 'Confirmadas' },
  { key: 'no_show', label: 'No asistieron' },
]

const quickActions = [
  { label: 'Nuevo alumno', href: '/admin/alumnos/editar/new', icon: <UserPlus className="h-4 w-4" /> },
  { label: 'Clase de prueba', href: '/admin/intro', icon: <Target className="h-4 w-4" /> },
  { label: 'Pasar asistencia', href: '/admin/asistencia', icon: <ClipboardCheck className="h-4 w-4" /> },
  { label: 'Renovar membresia', href: '/admin/membresias', icon: <BadgeCheck className="h-4 w-4" /> },
  { label: 'Ver finanzas', href: '/admin/finanzas', icon: <CreditCard className="h-4 w-4" /> },
  { label: 'Configuracion', href: '/admin/ajustes', icon: <Settings className="h-4 w-4" /> },
]

function todayInLima() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())
}

function todayLongLabel() {
  return new Intl.DateTimeFormat('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Lima',
  }).format(new Date())
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    maximumFractionDigits: 0,
  }).format(value || 0)
}

function statusLabel(status: AdminDashboardAgendaItem['status']) {
  switch (status) {
    case 'pending':
      return 'Pendiente'
    case 'confirmed':
      return 'Confirmada'
    case 'attended':
      return 'Asistio'
    case 'no_show':
      return 'No asistio'
    case 'converted':
      return 'Convertido'
    case 'cancelled':
      return 'Cancelada'
    default:
      return status
  }
}

function typeLabel(type: AdminDashboardAgendaItem['type']) {
  switch (type) {
    case 'trial':
      return 'Clase de prueba'
    case 'regular':
      return 'Clase regular'
    case 'cct':
      return 'CCT'
    default:
      return 'Otro'
  }
}

function statusClasses(status: AdminDashboardAgendaItem['status']) {
  switch (status) {
    case 'pending':
      return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'confirmed':
      return 'bg-sky-50 text-sky-700 border-sky-200'
    case 'attended':
    case 'converted':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'no_show':
    case 'cancelled':
      return 'bg-rose-50 text-rose-700 border-rose-200'
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200'
  }
}

function whatsappHref(phone?: string | null) {
  const digits = (phone || '').replace(/\D/g, '')
  if (!digits) return null
  const normalized = digits.startsWith('51') ? digits : `51${digits}`
  return `https://wa.me/${normalized}`
}

function SectionHeader({ title, helper }: { title: string; helper?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 className="font-heading text-2xl font-bold tracking-tight text-slate-950">{title}</h2>
      {helper && (
        <>
          <span aria-hidden="true" className="hidden h-1 w-4 bg-accent sm:block" />
          <p className="text-sm text-slate-500">{helper}</p>
        </>
      )}
    </div>
  )
}

function AdminSurface({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`surface-panel ${className}`}>
      {children}
    </section>
  )
}

function IconBadge({ icon, tone = 'orange' }: { icon: ReactNode; tone?: 'orange' | 'green' | 'blue' | 'red' | 'amber' | 'teal' | 'purple' }) {
  const toneClass =
    tone === 'green'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
      : tone === 'blue'
        ? 'border-blue-200 bg-blue-50 text-blue-600'
        : tone === 'red'
          ? 'border-rose-200 bg-rose-50 text-rose-600'
          : tone === 'amber'
            ? 'border-amber-200 bg-amber-50 text-amber-600'
            : tone === 'teal'
              ? 'border-teal-200 bg-teal-50 text-teal-600'
              : tone === 'purple'
                ? 'border-violet-200 bg-violet-50 text-violet-600'
                : 'border-orange-200 bg-orange-50 text-accent'

  return (
    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${toneClass}`}>
      {icon}
    </div>
  )
}
function StudentSearchBox() {
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const resultsQuery = useAdminStudentSearch(deferredSearch)
  const showResults = search.trim().length >= 2

  return (
    <div className="relative w-full lg:max-w-md">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        aria-label="Buscar alumno, DNI o teléfono"
        placeholder="Buscar alumno, DNI o telefono..."
        className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-accent/40 focus:ring-2 focus:ring-orange-100"
      />

      {showResults && (
        <div className="absolute left-0 right-0 top-14 z-20 max-h-80 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.16)]">
          {resultsQuery.isLoading && (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-textsec">
              <Loader2 className="h-4 w-4 animate-spin" />
              Buscando alumnos...
            </div>
          )}

          {resultsQuery.isError && <p role="alert" className="px-4 py-3 text-sm text-rose-700">No pudimos buscar. Intenta nuevamente.</p>}
          {!resultsQuery.isLoading && resultsQuery.data?.length === 0 && (
            <div className="px-4 py-3 text-sm text-textsec">No se encontraron alumnos.</div>
          )}

          {!resultsQuery.isLoading &&
            resultsQuery.data?.map((student) => (
              <Link
                key={student.id}
                href={student.href}
                className="block border-b border-line px-4 py-3 last:border-b-0 hover:bg-slate-50"
                onClick={() => setSearch('')}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-textpri">{student.fullName}</p>
                    <p className="truncate text-xs text-textsec">
                      {student.dni || 'Sin DNI'} - {student.phone || 'Sin telefono'}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-line px-2 py-1 text-xs text-textsec">
                    {student.classesRemaining} clases
                  </span>
                </div>
              </Link>
            ))}
        </div>
      )}
    </div>
  )
}

function WeeklyCard({
  title,
  value,
  helper,
  action,
  href,
  icon,
  tone = 'neutral',
}: {
  title: string
  value: string | number
  helper: string
  action: string
  href: string
  icon: ReactNode
  tone?: 'neutral' | 'warning' | 'critical'
}) {
  const needsAttention = tone !== 'neutral'

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_3px_16px_rgba(15,35,70,0.04)] transition-colors hover:border-blue-300 sm:p-5">
      <Link href={href} aria-label={action} className="absolute inset-0 z-10 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700" />
      <div className="relative flex items-start justify-between gap-3">
        <IconBadge icon={icon} tone={needsAttention ? 'orange' : 'blue'} />
        <ArrowRight className="mt-3 h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-700" />
      </div>
      <div className="relative mt-4">
        <p className="text-xs font-semibold leading-5 text-slate-600 sm:text-sm">{title}</p>
        <div className="mt-2 flex items-end justify-between gap-3">
          <p className="font-heading text-3xl font-bold tabular-nums leading-none tracking-tight text-slate-950 sm:text-4xl">{value}</p>
          <span className="hidden border-l border-slate-200 pl-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 sm:inline-flex">
            Semana
          </span>
        </div>
        <p className="mt-3 hidden max-w-[14rem] text-xs leading-5 text-slate-600 sm:block">{helper}</p>
      </div>
    </article>
  )
}


function WeeklySummary({ summary }: { summary: AdminWeeklySummary }) {
  return <section aria-labelledby="weekly-summary-title" className="space-y-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <div><h2 id="weekly-summary-title" className="font-heading text-2xl font-bold tracking-tight text-slate-950">Esta semana</h2><p className="mt-1 text-sm text-slate-500">Lunes a domingo · {formatWeeklyRange(summary.startDate, summary.endDate)}</p></div>
      <p className="text-xs text-slate-500">Se actualiza cada lunes · hora de Lima</p>
    </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <WeeklyCard title="Reservas de la semana" value={summary.reservations} helper="Alumnos y pruebas, sin canceladas" action="Ver agenda" href="/admin/asistencia" icon={<CalendarDays className="h-5 w-5" />} />
        <WeeklyCard title="Clases programadas" value={summary.scheduledSessions} helper="Turnos de lunes a domingo" action="Ver turnos" href="/admin/sesiones" icon={<CalendarClock className="h-5 w-5" />} />
        <WeeklyCard title="Pendientes de confirmar" value={summary.pendingConfirmations} helper="Pruebas reservadas de esta semana" action="Confirmar" href="/admin/intro" icon={<AlertTriangle className="h-5 w-5" />} tone={summary.pendingConfirmations > 0 ? 'warning' : 'neutral'} />
        <WeeklyCard title="Asistencias por marcar" value={summary.attendancePending} helper="Reservas de la semana sin asistencia" action="Marcar asistencia" href="/admin/asistencia" icon={<ClipboardCheck className="h-5 w-5" />} tone={summary.attendancePending > 0 ? 'critical' : 'neutral'} />
      </div>
  </section>
}

function AlertTask({
  title,
  count,
  description,
  action,
  href,
}: {
  title: string
  count: number | null
  description: string
  action: string
  href: string
}) {
  const numericCount = count ?? 0
  const isCritical = getAlertSeverity(numericCount) === 'critical'
  const isWarning = getAlertSeverity(numericCount) === 'warning'
  const badgeClass = isCritical
    ? 'bg-orange-700 text-white'
    : isWarning
      ? 'bg-orange-50 text-orange-800'
      : 'bg-blue-50 text-blue-800'

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="max-w-[11rem] text-sm font-bold leading-5 text-slate-950">{title}</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">{description}</p>
        </div>
        <span className={`rounded-lg px-2.5 py-1 font-heading text-2xl font-bold tabular-nums ${badgeClass}`}>
          {count === null ? 'N/D' : count}
        </span>
      </div>
      <Link href={href} className="mt-3 inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-blue-700">
        {action}
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </article>
  )
}

function MonthlyMetric({
  title,
  value,
  helper,
  icon,
}: {
  title: string
  value: string | number
  helper: string
  icon: ReactNode
}) {
  return (
    <article className="surface-panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="max-w-[8rem] text-sm font-semibold leading-5 text-slate-700">{title}</p>
          <p className="mt-3 font-heading text-4xl font-bold tabular-nums tracking-tight text-slate-950">{value}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2 text-slate-500">{icon}</div>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3 border-t border-slate-100 pt-3">
        <p className="text-xs leading-4 text-slate-500">{helper}</p>

      </div>
    </article>
  )
}

function StudentsLevelDistribution({
  levels,
}: {
  levels: {
    beginner: number
    developing: number
    advanced: number
    competitive: number
    unclassified?: number
  }
}) {
  const data = [
    { name: 'Principiantes', code: 'P1', value: levels.beginner, color: '#2563eb' },
    { name: 'En desarrollo', code: 'D2', value: levels.developing, color: '#14b8a6' },
    { name: 'Avanzados', code: 'A3', value: levels.advanced, color: '#f97316' },
    { name: 'Competitivos', code: 'C4', value: levels.competitive, color: '#8b5cf6' },
    { name: 'Sin clasificar', code: '—', value: levels.unclassified ?? 0, color: '#94a3b8' },
  ]
  const total = data.reduce((sum, item) => sum + item.value, 0)

  return (
    <AdminSurface className="p-5">
      <SectionHeader title="Distribucion de alumnos" helper="Alumnos activos y niveles pendientes de clasificación." />
      <div className="mt-5 grid gap-5 sm:grid-cols-[0.9fr_1.1fr] xl:grid-cols-1 2xl:grid-cols-[0.9fr_1.1fr]">
        <AdminDonutChart data={data} total={total} label="Total" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
          {data.map((item) => {
            const percent = total > 0 ? Math.round((item.value / total) * 100) : 0
            return (
              <div key={item.name} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                    <p className="truncate text-sm font-bold text-slate-950">{item.name}</p>
                  </div>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-500">{item.code}</span>
                </div>
                <div className="mt-3 flex items-end justify-between gap-2">
                  <p className="font-heading text-3xl font-black tracking-[-0.04em] text-slate-950">{item.value}</p>
                  <p className="text-sm font-black text-accent">{percent}%</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </AdminSurface>
  )
}

function AgendaItem({ item }: { item: AdminDashboardAgendaItem }) {
  const whatsApp = whatsappHref(item.phone)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="space-y-2">
            <p className="font-semibold text-textpri">{item.personName}</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClasses(item.status)}`}>
                {statusLabel(item.status)}
              </span>
              <span className="rounded-full border border-line px-2 py-0.5 text-xs text-textsec">
                {typeLabel(item.type)}
              </span>
            </div>
          </div>
          <p className="mt-1 text-sm text-textsec">
            {formatAdminDate(item.date)} · {item.startTime} - {item.durationMinutes} min
            {item.distanceM ? ` - ${item.distanceM}m` : ''}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {item.status === 'pending' && (
            <Link href="/admin/intro" className="btn-outline btn-sm">
              Confirmar
            </Link>
          )}
          {item.status === 'confirmed' && (
            <Link href={attendanceHref(item.date, item.sessionId)} className="btn-outline btn-sm">
              Marcar asistencia
            </Link>
          )}
          {item.status === 'confirmed' && item.bookingId && (
            <Link href={administrativeBookingHref(item.studentId)} className="btn-ghost btn-sm">
              Reprogramar
            </Link>
          )}
          {item.type === 'trial' && item.status !== 'converted' && (
            <Link href="/admin/intro" className="btn-ghost btn-sm">
              Convertir
            </Link>
          )}
          {item.href && (
            <Link href={item.href} className="btn-ghost btn-sm">
              Ver ficha
            </Link>
          )}
          {whatsApp && (
            <a href={whatsApp} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">
              <MessageCircle className="h-4 w-4" />
              Contactar
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

function WeeklyAgenda({
  agenda,
  today,
}: {
  agenda: AdminDashboardAgendaItem[]
  today: string
}) {
  const [filter, setFilter] = useState<DashboardAgendaFilter>('today')
  const filteredAgenda = useMemo(() => filterAgendaItems(agenda, filter, today), [agenda, filter, today])

  return (
    <AdminSurface className="p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <SectionHeader title="Agenda" helper="Asistencia y reservas por atender." />
        <div className="flex flex-wrap gap-2">
          {agendaFilters.map((item) => (
            <button
              key={item.key}
              onClick={() => setFilter(item.key)}
              aria-pressed={filter === item.key}
              className={`min-h-11 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                filter === item.key
                  ? 'border-[#101e2a] bg-[#101e2a] text-white'
                  : 'border-slate-200 bg-slate-50 text-slate-500 hover:text-slate-950'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {filteredAgenda.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
            <p className="text-sm font-medium text-slate-950">No hay reservas para este filtro.</p>
            <Link href="/admin/sesiones" className="mt-3 inline-flex text-sm font-semibold text-accent">
              Ver turnos
            </Link>
          </div>
        ) : (
          filteredAgenda.map((item) => <AgendaItem key={item.id} item={item} />)
        )}
      </div>
    </AdminSurface>
  )
}

function WeeklyReservations({
  rows,
}: {
  rows: Array<{ day: string; usedSlots: number }>
}) {
  const maxReservations = Math.max(1, ...rows.map(row => row.usedSlots))
  return (
    <AdminSurface className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-slate-950">Reservas por día</h2>
        <Link href="/admin/asistencia" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-blue-700">
          <CalendarDays size={17} /> Ver calendario
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="py-8 text-sm text-slate-600">Aún no hay reservas para mostrar.</p>
      ) : (
        <ul aria-label="Reservas por día" className="mt-3 grid grid-flow-col auto-cols-fr gap-1 border-b border-slate-200 sm:gap-2">
          {rows.map(row => (
            <li key={row.day} className="flex min-w-0 flex-col items-center gap-2 pb-2" title={`${row.day} · ${row.usedSlots} reservas`}>
              <div className="flex h-36 w-full flex-col justify-end rounded-md bg-slate-50 px-1 sm:px-2">
                <span className="mb-1 text-center text-[11px] font-bold text-slate-700 sm:text-xs">
                  {row.usedSlots}
                </span>
                <span aria-hidden="true" className={`block rounded-t-md ${row.usedSlots === maxReservations ? 'bg-gradient-to-t from-orange-200 to-orange-500' : 'bg-gradient-to-t from-blue-200 to-blue-500'}`}
                  style={{ height: `${(row.usedSlots / maxReservations) * 80}%` }} />
              </div>
              <span className="text-xs font-semibold text-slate-700">{row.day.slice(0, 3)}</span>
            </li>
          ))}
        </ul>
      )}
    </AdminSurface>
  )
}

const trialDateTime = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
})

function UpcomingTrialSessions({ site }: { site: DashboardSite }) {
  const { sessions, isLoading, error } = useAdminWeekendIntroCapacity()
  const upcoming = sessions.filter(session => (site === 'all' || session.locationCode === site) && Date.parse(session.startAt) >= Date.now())
    .sort((a, b) => a.startAt.localeCompare(b.startAt)).slice(0, 3)
  return (
    <AdminSurface className="p-5">
      <h2 className="text-xl font-bold text-slate-950">Próximas clases de prueba</h2>
      {isLoading ? <p role="status" className="mt-3 text-sm text-slate-600">Cargando horarios…</p>
        : error ? <p className="mt-3 text-sm text-slate-600">Consulta los horarios en el calendario.</p>
        : !upcoming.length ? <p className="mt-3 text-sm text-slate-600">No quedan horarios de prueba esta semana.</p>
        : <ul className="mt-3 divide-y divide-slate-100">
          {upcoming.map(session => <li key={session.sessionId} className="flex flex-wrap justify-between gap-2 py-2.5 text-sm">
            <span className="font-semibold">{session.locationName}</span>
            <span className="text-slate-600">{trialDateTime.format(new Date(session.startAt))}</span>
          </li>)}
        </ul>}
      <Link href="/admin/intro" className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-blue-700">
        <CalendarDays size={17} /> Abrir calendario de pruebas
      </Link>
    </AdminSurface>
  )
}

export default function AdminDashboard() {
  const [isQuickBookingOpen, setIsQuickBookingOpen] = useState(false)
  const [site, setSite] = useState<DashboardSite>('all')
  const today = todayInLima()
  const currentDate = useMemo(() => todayLongLabel(), [])
  const { dashboard, isLoading, isFetching, error, refetch } = useAdminDashboardData()
  const siteQuery = useDashboardSite(site)
  const scoped = siteQuery.isError ? undefined : siteQuery.data
  const selectedSiteLabel = dashboardSiteLabels[site]

  if (isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-[1.5rem] border border-slate-200 bg-white p-8 shadow-[0_20px_55px_rgba(15,23,42,0.06)]">
        <div className="flex items-center gap-3 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
          Cargando dashboard administrativo...
        </div>
      </div>
    )
  }

  if (error) return (
    <section role="alert" className="rounded-xl border border-rose-200 bg-white p-6">
      <h1 className="text-xl font-semibold">Datos no disponibles</h1>
      <p className="mt-2 text-sm text-slate-600">No pudimos cargar la información de hoy. No se muestran cifras incompletas.</p>
      <button type="button" onClick={() => refetch()} className="btn-outline mt-4"><RefreshCcw className="h-4 w-4" />Reintentar</button>
    </section>
  )

  return (
    <div className="space-y-5">
        <AdminPageHeader variant="dashboard" title="Panel de administración" eyebrow={currentDate} actions={
          <>
              <label className="flex min-h-12 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700">
                Sede
                <select aria-label="Sede" value={site} onChange={event => setSite(event.target.value as DashboardSite)} className="h-11 bg-white pl-1 text-[#084681]">
                  {Object.entries(dashboardSiteLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <StudentSearchBox />
              <button
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#0758aa] px-4 text-sm font-bold text-white transition-colors hover:bg-[#084681]"
                onClick={() => setIsQuickBookingOpen(true)}
              >
                <Plus className="h-5 w-5" />
                Reserva rápida
              </button>
          </>
        } />

        {siteQuery.isPending && <p role="status" className="rounded-xl bg-white p-4">Cargando datos · {selectedSiteLabel}</p>}
        {siteQuery.isError && <div role="alert" className="rounded-xl bg-white p-4">
          No se pudo cargar el resumen · {selectedSiteLabel}. <button type="button" onClick={() => void siteQuery.refetch()} className="text-blue-700 underline">Reintentar</button>
        </div>}
        {scoped && <>
        <DashboardTodayOverview today={scoped.today} pendingPayments={dashboard.alerts.pendingPayments} locationLabel={selectedSiteLabel} />

        <div className="grid items-start gap-4 xl:grid-cols-[1.12fr_1fr]">
          <WeeklyReservations rows={scoped.chart} />
          <DashboardSiteCapacity key={site} site={site} />
        </div>
        <div className="grid items-start gap-4 xl:grid-cols-2">
          <DashboardMembershipFollowups studentIds={scoped.studentIds} />
          <DashboardBirthdays studentIds={scoped.studentIds} />
        </div>
        <div className="grid items-start gap-4 xl:grid-cols-2">
          <WeeklyAgenda agenda={site === 'all' ? dashboard.weeklyAgenda : dashboard.weeklyAgenda.filter(row => row.sessionId && scoped.sessionIds.has(row.sessionId))} today={today} />
          <UpcomingTrialSessions site={site} />
        </div>
        <WeeklySummary summary={scoped.weekly} />
        </>}

        <section aria-label="Indicadores de toda la academia" className="space-y-5">
        <SectionHeader title="Toda la academia" />
        <section className="space-y-3">
          <SectionHeader title="Pendientes importantes" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <AlertTask
              title="Alumnos sin clases"
              count={dashboard.alerts.studentsWithoutClasses}
              description="Activos sin saldo disponible."
              action="Ver alumnos"
              href="/admin/alumnos"
            />
            <AlertTask
              title="Pruebas pasadas"
              count={dashboard.alerts.trialClassesWithoutFollowUp}
              description="Últimos 30 días: revisar continuidad."
              action="Revisar pruebas"
              href="/admin/seguimiento?type=trial"
            />
            <AlertTask
              title="Inasistencias recientes"
              count={dashboard.alerts.recentNoShows}
              description="Últimos 14 días."
              action="Revisar inasistencias"
              href="/admin/seguimiento?type=no_show"
            />
          </div>
        </section>

        <MembershipGrowthChart />
        <TrialConversionPanel />

        <AdminMembershipRenewalRequests />

        <details className="admin-monthly-summary surface-panel p-5">
          <summary className="min-h-11 cursor-pointer py-2 font-heading text-xl font-semibold text-slate-800">Resultados y análisis del mes</summary>
          <div className="mt-4 space-y-4">
        <section className="space-y-3">
          <SectionHeader title="Resumen del mes" helper="Resultados del mes actual." />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MonthlyMetric
              title="Alumnos activos"
              value={dashboard.monthly.activeStudents}
              helper="Base actual"
              icon={<Users className="h-5 w-5" />}
            />
            <MonthlyMetric
              title="Fichas creadas"
              value={dashboard.monthly.newStudentsThisMonth}
              helper="Registros creados este mes"
              icon={<UserPlus className="h-5 w-5" />}
            />
            <MonthlyMetric
              title="Clases de prueba"
              value={dashboard.monthly.trialClassesThisMonth}
              helper="Reservadas/atendidas/no-show"
              icon={<Target className="h-5 w-5" />}
            />
            <MonthlyMetric
              title="Facturacion"
              value={formatCurrency(dashboard.monthly.revenueThisMonth)}
              helper="Ventas de membresías pagadas"
              icon={<Wallet className="h-5 w-5" />}
            />
          </div>
        </section>

            <div className="grid gap-4 xl:grid-cols-2">
              <StudentsLevelDistribution levels={dashboard.studentsByLevel} />
            </div>
          </div>
        </details>

        </section>
        <AdminSurface className="p-5">
          <SectionHeader title="Acciones rapidas" helper="Accesos operativos frecuentes." />
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <button
              onClick={() => setIsQuickBookingOpen(true)}
              className="flex min-h-12 items-center gap-2 rounded-xl border border-[#0758aa] bg-[#0758aa] px-3 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#084681]"
            >
              <Plus className="h-4 w-4" />
              Nueva reserva
            </button>
            {quickActions.map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className="flex min-h-12 items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-3 text-sm font-semibold text-[#084681] transition-colors hover:border-blue-300 hover:bg-blue-100"
              >
                {action.icon}
                {action.label}
              </Link>
            ))}
          </div>
        </AdminSurface>

        <AdminQuickBooking isOpen={isQuickBookingOpen} onClose={() => setIsQuickBookingOpen(false)} />
    </div>
  )
}
