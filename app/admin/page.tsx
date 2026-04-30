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
  Gauge,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCcw,
  Search,
  Settings,
  Target,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react'
import AdminGuard from '@/components/AdminGuard'
import AdminMembershipRenewalRequests from '@/components/AdminMembershipRenewalRequests'
import AdminQuickBooking from '@/components/AdminQuickBooking'
import { Modal } from '@/components/ui/Modal'
import {
  useAdminDashboardData,
  useAdminStudentSearch,
} from '@/lib/hooks/useAdminDashboardData'
import {
  type AdminDashboardAgendaItem,
  type DashboardAgendaFilter,
  filterAgendaItems,
  getAlertSeverity,
} from '@/lib/utils/adminDashboard'

const agendaFilters: Array<{ key: DashboardAgendaFilter; label: string }> = [
  { key: 'today', label: 'Hoy' },
  { key: 'tomorrow', label: 'Manana' },
  { key: 'week', label: 'Semana' },
  { key: 'pending', label: 'Pendientes' },
  { key: 'confirmed', label: 'Confirmadas' },
  { key: 'no_show', label: 'No asistieron' },
]

const quickActions = [
  { label: 'Nuevo alumno', href: '/admin/alumnos', icon: <UserPlus className="h-4 w-4" /> },
  { label: 'Clase de prueba', href: '/admin/intro', icon: <Target className="h-4 w-4" /> },
  { label: 'Pasar asistencia', href: '/admin/asistencia', icon: <ClipboardCheck className="h-4 w-4" /> },
  { label: 'Renovar membresia', href: '/admin/membresias', icon: <BadgeCheck className="h-4 w-4" /> },
  { label: 'Registrar pago', href: '/admin/finanzas', icon: <CreditCard className="h-4 w-4" /> },
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

function formatPercent(value: number | null) {
  return value === null ? 'Sin datos' : `${value}%`
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

function severityClasses(count: number) {
  const severity = getAlertSeverity(count)
  if (severity === 'critical') return 'border-danger/30 bg-danger/5 text-danger'
  if (severity === 'warning') return 'border-warning/30 bg-warning/5 text-warning'
  return 'border-line bg-card text-textsec'
}

function whatsappHref(phone?: string | null) {
  const digits = (phone || '').replace(/\D/g, '')
  if (!digits) return null
  const normalized = digits.startsWith('51') ? digits : `51${digits}`
  return `https://wa.me/${normalized}`
}

function SectionHeader({ title, helper }: { title: string; helper?: string }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold text-textpri">{title}</h2>
        {helper && <p className="mt-0.5 text-sm text-textsec">{helper}</p>}
      </div>
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
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-textsec" />
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Buscar alumno, DNI o telefono..."
        className="input h-11 pl-9 pr-3 text-sm"
      />

      {showResults && (
        <div className="absolute left-0 right-0 top-12 z-20 max-h-80 overflow-y-auto rounded-xl border border-line bg-card shadow-soft">
          {resultsQuery.isLoading && (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-textsec">
              <Loader2 className="h-4 w-4 animate-spin" />
              Buscando alumnos...
            </div>
          )}

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

function TodayCard({
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
  const toneClass =
    tone === 'critical'
      ? 'border-danger/30 bg-danger/5'
      : tone === 'warning'
        ? 'border-warning/30 bg-warning/5'
        : 'border-line bg-card'

  return (
    <article className={`rounded-xl border p-4 shadow-card ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-textsec">{title}</p>
          <p className="mt-2 text-3xl font-bold text-textpri">{value}</p>
          <p className="mt-1 text-xs text-textsec">{helper}</p>
        </div>
        <div className="rounded-lg border border-line bg-white p-2 text-accent">{icon}</div>
      </div>
      <Link href={href} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-accent">
        {action}
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </article>
  )
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

  return (
    <article className={`rounded-xl border p-4 ${severityClasses(numericCount)}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-textpri">{title}</p>
          <p className="mt-1 text-xs text-textsec">{description}</p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-sm font-bold text-textpri shadow-card">
          {count === null ? 'N/D' : count}
        </span>
      </div>
      <Link href={href} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent">
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
    <article className="rounded-xl border border-line bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-textsec">{title}</p>
          <p className="mt-2 text-2xl font-bold text-textpri">{value}</p>
        </div>
        <div className="rounded-lg border border-line bg-slate-50 p-2 text-textsec">{icon}</div>
      </div>
      <p className="mt-3 border-t border-line pt-2 text-xs text-textsec">{helper}</p>
    </article>
  )
}

function AgendaItem({ item }: { item: AdminDashboardAgendaItem }) {
  const whatsApp = whatsappHref(item.phone)

  return (
    <div className="rounded-xl border border-line bg-white p-4 shadow-card">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="space-y-2">
            <p className="truncate font-semibold text-textpri">{item.personName}</p>
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
            {item.date} - {item.startTime} - {item.durationMinutes} min
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
            <Link href="/admin/asistencia" className="btn-outline btn-sm">
              Marcar asistencia
            </Link>
          )}
          {item.status === 'confirmed' && item.bookingId && (
            <Link href={`/reserva/${item.bookingId}/editar`} className="btn-ghost btn-sm">
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
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <SectionHeader title="Agenda semanal" helper="Reservas accionables de la semana actual." />
        <div className="flex flex-wrap gap-2">
          {agendaFilters.map((item) => (
            <button
              key={item.key}
              onClick={() => setFilter(item.key)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                filter === item.key
                  ? 'border-accent bg-accent text-white'
                  : 'border-line bg-white text-textsec hover:text-textpri'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {filteredAgenda.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line p-6 text-center">
            <p className="text-sm font-medium text-textpri">No hay reservas para este filtro.</p>
            <Link href="/admin/sesiones" className="mt-3 inline-flex text-sm font-semibold text-accent">
              Ver turnos
            </Link>
          </div>
        ) : (
          filteredAgenda.map((item) => <AgendaItem key={item.id} item={item} />)
        )}
      </div>
    </section>
  )
}

function WeeklyOccupancy({
  rows,
}: {
  rows: Array<{ day: string; usedSlots: number; totalSlots: number | null; occupancyRate: number | null }>
}) {
  return (
    <section className="card p-5">
      <SectionHeader
        title="Ocupacion semanal"
        helper="Cupos usados contra capacidad configurada por dia."
      />

      {rows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-line p-6 text-center text-sm text-textsec">
          Todavia no hay suficientes datos para calcular la ocupacion semanal.
        </div>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-3">
            {rows.map((row) => {
              const rate = row.occupancyRate ?? 0
              const bar =
                row.occupancyRate === null
                  ? 'bg-slate-300'
                  : rate >= 80
                    ? 'bg-danger'
                    : rate >= 55
                      ? 'bg-warning'
                      : 'bg-success'

              return (
                <div key={row.day} className="grid grid-cols-[3rem_1fr_4rem] items-center gap-3">
                  <span className="text-sm font-semibold text-textpri">{row.day}</span>
                  <div className="h-3 overflow-hidden rounded-full bg-line">
                    <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(rate, 100)}%` }} />
                  </div>
                  <span className="text-right text-sm font-semibold text-textpri">
                    {row.occupancyRate === null ? 'N/D' : `${row.occupancyRate}%`}
                  </span>
                </div>
              )
            })}
          </div>

          <div className="rounded-xl border border-line bg-slate-50 p-3">
            <div className="space-y-2">
              {rows.map((row) => (
                <div key={row.day} className="flex items-center justify-between text-sm">
                  <span className="font-medium text-textpri">{row.day}</span>
                  <span className="text-textsec">
                    {row.totalSlots === null ? `${row.usedSlots} reservas` : `${row.usedSlots}/${row.totalSlots} cupos`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default function AdminDashboard() {
  const [isQuickBookingOpen, setIsQuickBookingOpen] = useState(false)
  const today = useMemo(() => todayInLima(), [])
  const currentDate = useMemo(() => todayLongLabel(), [])
  const { dashboard, isLoading, isFetching, error, refetch } = useAdminDashboardData()

  if (isLoading) {
    return (
      <AdminGuard>
        <div className="card flex min-h-[420px] items-center justify-center p-8">
          <div className="flex items-center gap-3 text-textsec">
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
            Cargando dashboard administrativo...
          </div>
        </div>
      </AdminGuard>
    )
  }

  return (
    <AdminGuard>
      <div className="space-y-6">
        <section className="rounded-2xl border border-line bg-card p-4 shadow-card">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-accent">{currentDate}</p>
              <h1 className="mt-1 text-2xl font-bold text-textpri">Dashboard administrativo</h1>
              <p className="mt-1 text-sm text-textsec">Operacion diaria, reservas, alumnos y membresias</p>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <StudentSearchBox />
              <button className="btn h-11 shrink-0 px-4 py-2.5" onClick={() => setIsQuickBookingOpen(true)}>
                <Plus className="h-4 w-4" />
                Reserva rapida
              </button>
            </div>
          </div>
        </section>

        {error && (
          <section className="rounded-xl border border-danger/30 bg-danger/5 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-danger">No se pudo cargar el dashboard administrativo.</p>
                <p className="text-sm text-textsec">Intenta nuevamente. Detalle: {error}</p>
              </div>
              <button onClick={() => refetch()} className="btn-outline btn-sm">
                <RefreshCcw className="h-4 w-4" />
                Reintentar
              </button>
            </div>
          </section>
        )}

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <SectionHeader title="Hoy" helper={isFetching ? 'Actualizando datos...' : 'Operacion del dia actual.'} />
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <TodayCard
              title="Reservas de hoy"
              value={dashboard.today.reservationsToday}
              helper="Alumnos y pruebas en agenda"
              action="Ver agenda"
              href="/admin/asistencia"
              icon={<CalendarDays className="h-5 w-5" />}
            />
            <TodayCard
              title="Clases programadas"
              value={dashboard.today.scheduledSessionsToday}
              helper="Turnos scheduled de hoy"
              action="Ver turnos"
              href="/admin/sesiones"
              icon={<CalendarClock className="h-5 w-5" />}
            />
            <TodayCard
              title="Cupos libres hoy"
              value={dashboard.today.availableSlotsToday ?? 'N/D'}
              helper="Segun capacidad configurada"
              action="Nueva reserva"
              href="/admin/sesiones"
              icon={<Gauge className="h-5 w-5" />}
            />
            <TodayCard
              title="Pendientes de confirmar"
              value={dashboard.today.pendingConfirmations}
              helper="Pruebas reservadas por validar"
              action="Confirmar"
              href="/admin/intro"
              icon={<AlertTriangle className="h-5 w-5" />}
              tone={dashboard.today.pendingConfirmations > 0 ? 'warning' : 'neutral'}
            />
            <TodayCard
              title="Asistencias por marcar"
              value={dashboard.today.attendancePending}
              helper="Reservas sin asistencia"
              action="Marcar asistencia"
              href="/admin/asistencia"
              icon={<ClipboardCheck className="h-5 w-5" />}
              tone={dashboard.today.attendancePending > 0 ? 'critical' : 'neutral'}
            />
          </div>
        </section>

        <section className="space-y-3">
          <SectionHeader title="Pendientes importantes" helper="Tareas que requieren seguimiento operativo." />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <AlertTask
              title="Membresias por vencer"
              count={dashboard.alerts.expiringMemberships}
              description="Proximos 7 dias."
              action="Ver renovaciones"
              href="/admin/membresias"
            />
            <AlertTask
              title="Alumnos sin clases"
              count={dashboard.alerts.studentsWithoutClasses}
              description="Activos sin saldo disponible."
              action="Ver alumnos"
              href="/admin/alumnos"
            />
            <AlertTask
              title="Pagos pendientes"
              count={dashboard.alerts.pendingPayments}
              description="Pagos pendientes o atrasados."
              action="Ver finanzas"
              href="/admin/finanzas"
            />
            <AlertTask
              title="Pruebas sin seguimiento"
              count={dashboard.alerts.trialClassesWithoutFollowUp}
              description="Fallback: intros pasadas sin trazabilidad de conversion."
              action="Dar seguimiento"
              href="/admin/intro"
            />
            <AlertTask
              title="No-shows recientes"
              count={dashboard.alerts.recentNoShows}
              description="Ultimos 14 dias."
              action="Revisar"
              href="/admin/asistencia"
            />
          </div>
        </section>

        <AdminMembershipRenewalRequests />

        <section className="space-y-3">
          <SectionHeader title="Resumen del mes" helper="KPIs generales sin duplicar la operacion diaria." />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <MonthlyMetric
              title="Alumnos activos"
              value={dashboard.monthly.activeStudents}
              helper="Base actual"
              icon={<Users className="h-5 w-5" />}
            />
            <MonthlyMetric
              title="Nuevos alumnos"
              value={dashboard.monthly.newStudentsThisMonth}
              helper="Altas del mes"
              icon={<UserPlus className="h-5 w-5" />}
            />
            <MonthlyMetric
              title="Clases de prueba"
              value={dashboard.monthly.trialClassesThisMonth}
              helper="Reservadas/atendidas/no-show"
              icon={<Target className="h-5 w-5" />}
            />
            <MonthlyMetric
              title="Conversion de pruebas"
              value={formatPercent(dashboard.monthly.trialConversionRate)}
              helper="Requiere trazabilidad exacta"
              icon={<CheckCircle2 className="h-5 w-5" />}
            />
            <MonthlyMetric
              title="Facturacion"
              value={formatCurrency(dashboard.monthly.revenueThisMonth)}
              helper="Pagos de membresias"
              icon={<Wallet className="h-5 w-5" />}
            />
            <MonthlyMetric
              title="Ocupacion semanal"
              value={formatPercent(dashboard.monthly.weeklyOccupancyRate)}
              helper="Promedio de la semana"
              icon={<TrendingUp className="h-5 w-5" />}
            />
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
          <WeeklyAgenda agenda={dashboard.weeklyAgenda} today={today} />

          <div className="space-y-6">
            <WeeklyOccupancy rows={dashboard.weeklyOccupancy} />

            <section className="space-y-4">
              <SectionHeader title="Distribucion de alumnos" helper="Solo alumnos activos." />
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Principiantes', 'P1', dashboard.studentsByLevel.beginner],
                  ['En desarrollo', 'D2', dashboard.studentsByLevel.developing],
                  ['Avanzados', 'A3', dashboard.studentsByLevel.advanced],
                  ['Competitivos', 'C4', dashboard.studentsByLevel.competitive],
                ].map(([label, code, value]) => (
                  <div key={label} className="rounded-xl border border-line bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-textpri">{label}</p>
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs text-textsec">{code}</span>
                    </div>
                    <p className="mt-2 text-2xl font-bold text-textpri">{value}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        <section className="card p-5">
          <SectionHeader title="Acciones rapidas" helper="Accesos operativos frecuentes." />
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <button
              onClick={() => setIsQuickBookingOpen(true)}
              className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-3 text-sm font-semibold text-accent transition hover:bg-accent/15"
            >
              <Plus className="h-4 w-4" />
              Nueva reserva
            </button>
            {quickActions.map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-3 text-sm font-semibold text-textpri transition hover:border-accent/30 hover:text-accent"
              >
                {action.icon}
                {action.label}
              </Link>
            ))}
          </div>
        </section>

        <Modal title="Reserva rapida" isOpen={isQuickBookingOpen} onClose={() => setIsQuickBookingOpen(false)}>
          <AdminQuickBooking />
        </Modal>
      </div>
    </AdminGuard>
  )
}
