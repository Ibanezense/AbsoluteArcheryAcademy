'use client'

import Link from 'next/link'
import { useMemo, useState, type ReactNode } from 'react'
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  Layers3,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import AdminGuard from '@/components/AdminGuard'
import AdminQuickBooking from '@/components/AdminQuickBooking'
import { ActiveBookingsWidget } from '@/components/ActiveBookingsWidget'
import { Modal } from '@/components/ui/Modal'
import WeeklyOccupancyChart from '@/components/ui/WeeklyOccupancyChart'
import { useDashboardStats } from '@/lib/hooks/useDashboardStats'

type HubCard = {
  href: string
  title: string
  description: string
  icon: ReactNode
}

type PrimaryKpi = {
  title: string
  value: string | number
  helper: string
  icon: ReactNode
  accent: 'orange' | 'sky' | 'emerald' | 'green' | 'rose' | 'slate'
}

const menuCards: HubCard[] = [
  {
    href: '/admin/sesiones',
    title: 'Turnos',
    description: 'Genera semanas, edita horarios y controla cupos por distancia.',
    icon: <CalendarDays className="h-5 w-5" />,
  },
  {
    href: '/admin/alumnos',
    title: 'Alumnos',
    description: 'Administra fichas, nivel, distancia, estados y datos de contacto.',
    icon: <Users className="h-5 w-5" />,
  },
  {
    href: '/admin/asistencia',
    title: 'Asistencia',
    description: 'Pasa lista rapido y marca asistio/no-show por sesion.',
    icon: <ClipboardCheck className="h-5 w-5" />,
  },
  {
    href: '/admin/membresias',
    title: 'Membresias',
    description: 'Gestiona renovaciones, saldo de clases y fechas de vencimiento.',
    icon: <BadgeCheck className="h-5 w-5" />,
  },
  {
    href: '/admin/intro',
    title: 'Clases de prueba',
    description: 'Registra prospectos y convierte interesados a alumnos activos.',
    icon: <Target className="h-5 w-5" />,
  },
  {
    href: '/admin/finanzas',
    title: 'Finanzas',
    description: 'Monitorea cobros, mora y proyecciones mensuales.',
    icon: <Wallet className="h-5 w-5" />,
  },
  {
    href: '/admin/ajustes',
    title: 'Configuracion',
    description: 'Define infraestructura, reglas operativas y parametros globales.',
    icon: <Settings className="h-5 w-5" />,
  },
]

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    maximumFractionDigits: 0,
  }).format(value || 0)
}

function accentClasses(accent: PrimaryKpi['accent']) {
  switch (accent) {
    case 'orange':
      return 'from-orange-200/50 to-orange-100/20 text-orange-600'
    case 'sky':
      return 'from-sky-200/50 to-sky-100/20 text-sky-600'
    case 'emerald':
      return 'from-emerald-200/50 to-emerald-100/20 text-emerald-600'
    case 'green':
      return 'from-green-200/50 to-green-100/20 text-green-600'
    case 'rose':
      return 'from-rose-200/50 to-rose-100/20 text-rose-600'
    default:
      return 'from-slate-200/50 to-slate-100/20 text-slate-600'
  }
}

function PrimaryStatCard({ kpi }: { kpi: PrimaryKpi }) {
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-line/80 bg-card p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-soft">
      <div
        className={`pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gradient-to-br blur-xl ${accentClasses(kpi.accent)}`}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-textsec">{kpi.title}</p>
          <p className="mt-2 text-3xl font-bold text-textpri">{kpi.value}</p>
        </div>
        <div className="rounded-xl border border-line bg-white/90 p-2 text-textsec transition group-hover:text-textpri">
          {kpi.icon}
        </div>
      </div>
      <div className="relative mt-4 border-t border-line pt-3 text-sm text-textsec">{kpi.helper}</div>
    </article>
  )
}

function LevelCard({
  title,
  value,
  code,
}: {
  title: string
  value: number
  code: string
}) {
  return (
    <article className="relative overflow-hidden rounded-2xl border border-line bg-card p-5 shadow-card">
      <div className="pointer-events-none absolute -right-2 top-0 text-6xl font-semibold tracking-tight text-slate-200">
        {code}
      </div>
      <p className="text-sm text-textsec">{title}</p>
      <p className="mt-2 text-5xl font-semibold leading-none text-textpri">{value}</p>
      <div className="mt-4 border-t border-line pt-3 text-sm text-textsec">Solo alumnos activos</div>
    </article>
  )
}

function HubLinkCard({ card }: { card: HubCard }) {
  return (
    <Link
      href={card.href}
      className="group rounded-2xl border border-line bg-card p-4 shadow-card transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-soft"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-slate-50 text-accent">
          {card.icon}
        </div>
        <ArrowRight className="h-4 w-4 text-textsec transition group-hover:translate-x-1 group-hover:text-accent" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-textpri">{card.title}</h3>
      <p className="mt-2 text-sm text-textsec">{card.description}</p>
    </Link>
  )
}

export default function AdminDashboard() {
  const { stats, isLoading: statsLoading, error: statsError } = useDashboardStats()
  const [isModalOpen, setIsModalOpen] = useState(false)

  const ocupacionWidth = `${Math.min(Math.max(stats.ocupacion_semana_pct, 0), 100)}%`
  const facturacionLabel = useMemo(
    () => formatCurrency(stats.facturacion_mes_actual),
    [stats.facturacion_mes_actual]
  )

  const primaryKpis: PrimaryKpi[] = [
    {
      title: 'Alumnos activos',
      value: stats.total_alumnos_activos,
      helper: 'Base activa actual',
      icon: <Users className="h-5 w-5" />,
      accent: 'orange',
    },
    {
      title: 'Alumnos CCT activos',
      value: stats.alumnos_cct_activos,
      helper: 'Afiliados activos del club',
      icon: <BadgeCheck className="h-5 w-5" />,
      accent: 'green',
    },
    {
      title: 'Ocupacion semanal',
      value: `${stats.ocupacion_semana_pct}%`,
      helper: 'Uso agregado de cupos de la semana',
      icon: <TrendingUp className="h-5 w-5" />,
      accent: 'sky',
    },
    {
      title: 'Facturacion del mes',
      value: facturacionLabel,
      helper: 'Pagos de membresias registrados',
      icon: <Wallet className="h-5 w-5" />,
      accent: 'emerald',
    },
    {
      title: 'Membresias por vencer',
      value: stats.membresias_por_vencer,
      helper: 'Proximos 7 dias',
      icon: <Clock3 className="h-5 w-5" />,
      accent: 'rose',
    },
    {
      title: 'Alumnos sin clases',
      value: stats.alumnos_sin_clases,
      helper: 'Requieren renovacion',
      icon: <Layers3 className="h-5 w-5" />,
      accent: 'slate',
    },
    {
      title: 'Clases de prueba (mes)',
      value: stats.clases_prueba_mes_actual,
      helper: 'Reservadas/atendidas/no-show',
      icon: <Target className="h-5 w-5" />,
      accent: 'orange',
    },
  ]

  return (
    <AdminGuard>
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-3xl border border-line bg-card p-5 shadow-card sm:p-7">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_20%,rgba(249,115,22,0.14),transparent_35%),radial-gradient(circle_at_90%_18%,rgba(56,189,248,0.12),transparent_28%)]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-accent">
                <Sparkles className="h-3.5 w-3.5" />
                Panel Ejecutivo
              </div>
              <h1 className="mt-3 text-3xl font-bold text-textpri sm:text-4xl">Dashboard administrativo</h1>
              <p className="mt-2 text-sm text-textsec sm:text-base">
                Vista central para operar turnos, alumnos, membresias y conversion de clases de prueba.
              </p>
            </div>

            <button className="btn shrink-0" onClick={() => setIsModalOpen(true)}>
              Reserva rapida
            </button>
          </div>

          <div className="relative mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-line bg-white/80 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-textsec">Turnos disponibles</p>
              <p className="mt-1 text-2xl font-semibold text-textpri">{stats.turnos_disponibles_semana}</p>
              <p className="text-xs text-textsec">Semana actual</p>
            </div>
            <div className="rounded-2xl border border-line bg-white/80 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-textsec">Clases de prueba</p>
              <p className="mt-1 text-2xl font-semibold text-textpri">{stats.clases_prueba_mes_actual}</p>
              <p className="text-xs text-textsec">Mes actual</p>
            </div>
            <div className="rounded-2xl border border-line bg-white/80 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-textsec">Ocupacion semanal</p>
              <p className="mt-1 text-2xl font-semibold text-textpri">{stats.ocupacion_semana_pct}%</p>
              <div className="mt-2 h-2 w-full rounded-full bg-line/70">
                <div className="h-2 rounded-full bg-accent transition-all" style={{ width: ocupacionWidth }} />
              </div>
            </div>
          </div>
        </section>

        {statsError && (
          <div className="rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
            Error cargando estadisticas: {statsError}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {primaryKpis.map((kpi) => (
            <PrimaryStatCard key={kpi.title} kpi={kpi} />
          ))}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-textpri">Distribucion por nivel</h2>
            <span className="text-xs uppercase tracking-wide text-textsec">Solo alumnos activos</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <LevelCard title="Principiantes" value={stats.alumnos_principiantes} code="P1" />
            <LevelCard title="En desarrollo" value={stats.alumnos_en_desarrollo} code="D2" />
            <LevelCard title="Avanzados" value={stats.alumnos_avanzados} code="A3" />
            <LevelCard title="Competitivos" value={stats.alumnos_competitivos} code="C4" />
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <div className="card p-5 sm:p-6">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-textpri">Ocupacion semanal por dia</h2>
                <p className="text-sm text-textsec">Demanda de cupos de lunes a domingo.</p>
              </div>

              {statsLoading ? (
                <div className="flex h-[300px] items-center justify-center text-textsec">Actualizando grafico...</div>
              ) : (
                <WeeklyOccupancyChart data={stats.ocupacion_por_dia} />
              )}
            </div>
          </div>

          <div>
            <ActiveBookingsWidget />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-textpri">Accesos directos</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {menuCards.map((card) => (
              <HubLinkCard key={card.title} card={card} />
            ))}
          </div>
        </section>

        <Modal title="Reserva rapida" isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
          <AdminQuickBooking />
        </Modal>
      </div>
    </AdminGuard>
  )
}
