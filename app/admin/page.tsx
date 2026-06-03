'use client'

import Link from 'next/link'
import { useDeferredValue, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Bell,
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
import AdminMembershipRenewalRequests from '@/components/AdminMembershipRenewalRequests'
import AdminQuickBooking from '@/components/AdminQuickBooking'
import { AdminDonutChart, AdminMiniBarChart, AdminPageHeader } from '@/components/admin/AdminVisualSystem'
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

function whatsappHref(phone?: string | null) {
  const digits = (phone || '').replace(/\D/g, '')
  if (!digits) return null
  const normalized = digits.startsWith('51') ? digits : `51${digits}`
  return `https://wa.me/${normalized}`
}

function SectionHeader({ title, helper }: { title: string; helper?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <h2 className="text-lg font-bold tracking-[-0.02em] text-slate-950">{title}</h2>
      {helper && (
        <>
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          <p className="text-sm text-slate-500">{helper}</p>
        </>
      )}
    </div>
  )
}

function AdminSurface({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-[1.4rem] border border-slate-200/80 bg-white shadow-[0_20px_55px_rgba(15,23,42,0.06)] ${className}`}>
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
    <div className={`grid h-11 w-11 place-items-center rounded-2xl border ${toneClass}`}>
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
        placeholder="Buscar alumno, DNI o telefono..."
        className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-sm text-slate-950 shadow-[0_10px_30px_rgba(15,23,42,0.04)] outline-none transition placeholder:text-slate-400 focus:border-accent/40 focus:ring-4 focus:ring-orange-100"
      />

      {showResults && (
        <div className="absolute left-0 right-0 top-14 z-20 max-h-80 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.16)]">
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
      ? 'border-rose-200 bg-rose-50/80'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50/80'
        : 'border-slate-200 bg-white'
  const iconTone = tone === 'critical' ? 'red' : tone === 'warning' ? 'amber' : 'orange'

  return (
    <article className={`group relative overflow-hidden rounded-2xl border p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(15,23,42,0.1)] ${toneClass}`}>
      <Link href={href} aria-label={action} className="absolute inset-0 z-10" />
      <div className="relative flex items-start justify-between gap-3">
        <IconBadge icon={icon} tone={iconTone} />
        <ArrowRight className="mt-3 h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-accent" />
      </div>
      <div className="relative mt-4">
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        <div className="mt-2 flex items-end justify-between gap-3">
          <p className="font-heading text-4xl font-black leading-none tracking-[-0.05em] text-slate-950">{value}</p>
          <span className="hidden rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500 sm:inline-flex">
            Hoy
          </span>
        </div>
        <p className="mt-2 max-w-[12rem] text-xs leading-5 text-slate-500">{helper}</p>
      </div>
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
  const isCritical = getAlertSeverity(numericCount) === 'critical'
  const isWarning = getAlertSeverity(numericCount) === 'warning'
  const toneClass = isCritical
    ? 'border-rose-200 bg-gradient-to-br from-rose-50 to-orange-50'
    : isWarning
      ? 'border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50'
      : 'border-slate-200 bg-white'
  const badgeClass = isCritical
    ? 'bg-rose-500 text-white'
    : isWarning
      ? 'bg-amber-400 text-slate-950'
      : 'bg-slate-100 text-slate-700'

  return (
    <article className={`rounded-2xl border p-5 shadow-[0_18px_45px_rgba(15,23,42,0.05)] ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="max-w-[11rem] text-sm font-bold leading-5 text-slate-950">{title}</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">{description}</p>
        </div>
        <span className={`rounded-xl px-3 py-1.5 text-sm font-black shadow-card ${badgeClass}`}>
          {count === null ? 'N/D' : count}
        </span>
      </div>
      <Link href={href} className="mt-7 inline-flex items-center gap-1 text-sm font-bold text-accent">
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
  const tone =
    title.includes('activos')
      ? 'green'
      : title.includes('Nuevos')
        ? 'blue'
        : title.includes('Conversion')
          ? 'teal'
          : title.includes('Facturacion')
            ? 'orange'
            : title.includes('Ocupacion')
              ? 'blue'
              : 'purple'

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_16px_42px_rgba(15,23,42,0.055)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="max-w-[8rem] text-sm font-semibold leading-5 text-slate-700">{title}</p>
          <p className="mt-3 font-heading text-3xl font-black tracking-[-0.045em] text-slate-950">{value}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2 text-slate-500">{icon}</div>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3 border-t border-slate-100 pt-3">
        <p className="text-xs leading-4 text-slate-500">{helper}</p>
        <AdminMiniBarChart
          tone={tone as 'orange' | 'green' | 'blue' | 'purple' | 'teal'}
          data={[16, 22, 18, 28, 24, 30, 26].map((item, index) => ({ name: `${index + 1}`, value: item }))}
        />
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
  }
}) {
  const data = [
    { name: 'Principiantes', code: 'P1', value: levels.beginner, color: '#2563eb' },
    { name: 'En desarrollo', code: 'D2', value: levels.developing, color: '#14b8a6' },
    { name: 'Avanzados', code: 'A3', value: levels.advanced, color: '#f97316' },
    { name: 'Competitivos', code: 'C4', value: levels.competitive, color: '#8b5cf6' },
  ]
  const total = data.reduce((sum, item) => sum + item.value, 0)

  return (
    <AdminSurface className="p-5">
      <SectionHeader title="Distribucion de alumnos" helper="Solo alumnos activos." />
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
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
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
    <AdminSurface className="p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <SectionHeader title="Agenda semanal" helper="Reservas accionables de la semana actual." />
        <div className="flex flex-wrap gap-2">
          {agendaFilters.map((item) => (
            <button
              key={item.key}
              onClick={() => setFilter(item.key)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                filter === item.key
                  ? 'border-accent bg-accent text-white shadow-[0_10px_25px_rgba(249,115,22,0.22)]'
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

function WeeklyOccupancy({
  rows,
}: {
  rows: Array<{ day: string; usedSlots: number; totalSlots: number | null; occupancyRate: number | null }>
}) {
  return (
    <AdminSurface className="p-5">
      <SectionHeader
        title="Ocupacion semanal"
        helper="Cupos usados contra capacidad configurada por dia."
      />

      {rows.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
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

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
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
    </AdminSurface>
  )
}

export default function AdminDashboard() {
  const [isQuickBookingOpen, setIsQuickBookingOpen] = useState(false)
  const today = useMemo(() => todayInLima(), [])
  const currentDate = useMemo(() => todayLongLabel(), [])
  const { dashboard, isLoading, isFetching, error, refetch } = useAdminDashboardData()

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

  return (
    <div className="space-y-7">
        <AdminPageHeader
          eyebrow={currentDate}
          title="Dashboard administrativo"
          description="Operacion diaria, reservas, alumnos y membresias"
          actions={
            <>
              <StudentSearchBox />
              <button
                className="relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition hover:text-accent"
                aria-label="Notificaciones"
              >
                <Bell className="h-5 w-5" />
                {dashboard.today.pendingConfirmations > 0 && (
                  <span className="absolute -right-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-accent px-1 text-xs font-black text-white">
                    {Math.min(dashboard.today.pendingConfirmations, 9)}
                  </span>
                )}
              </button>
              <button
                className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-accent px-5 font-bold text-white shadow-[0_16px_35px_rgba(249,115,22,0.28)] transition hover:-translate-y-0.5 hover:brightness-105"
                onClick={() => setIsQuickBookingOpen(true)}
              >
                <Plus className="h-5 w-5" />
                Reserva rapida
              </button>
            </>
          }
        />

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
            <StudentsLevelDistribution levels={dashboard.studentsByLevel} />
          </div>
        </div>

        <AdminSurface className="p-5">
          <SectionHeader title="Acciones rapidas" helper="Accesos operativos frecuentes." />
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <button
              onClick={() => setIsQuickBookingOpen(true)}
              className="flex items-center gap-2 rounded-2xl border border-accent bg-accent px-3 py-3 text-sm font-bold text-white shadow-[0_14px_30px_rgba(249,115,22,0.22)] transition hover:-translate-y-0.5"
            >
              <Plus className="h-4 w-4" />
              Nueva reserva
            </button>
            {quickActions.map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700 transition hover:-translate-y-0.5 hover:border-accent/30 hover:text-accent"
              >
                {action.icon}
                {action.label}
              </Link>
            ))}
          </div>
        </AdminSurface>

        <Modal title="Reserva rapida" isOpen={isQuickBookingOpen} onClose={() => setIsQuickBookingOpen(false)}>
          <AdminQuickBooking />
        </Modal>
    </div>
  )
}
