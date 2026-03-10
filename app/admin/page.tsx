'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  ClipboardCheck,
  Settings,
  Users,
} from 'lucide-react'
import AdminGuard from '@/components/AdminGuard'
import AdminQuickBooking from '@/components/AdminQuickBooking'
import { ActiveBookingsWidget } from '@/components/ActiveBookingsWidget'
import { Modal } from '@/components/ui/Modal'
import { StatCard } from '@/components/ui/StatCard'
import WeeklyOccupancyChart from '@/components/ui/WeeklyOccupancyChart'
import { useDashboardStats } from '@/lib/hooks/useDashboardStats'

type HubCard = {
  href: string
  title: string
  description: string
  icon: React.ReactNode
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
    description: 'Administra fichas, foto, tutor, nivel, distancia y libraje.',
    icon: <Users className="h-5 w-5" />,
  },
  {
    href: '/admin/asistencia',
    title: 'Asistencia',
    description: 'Pasa lista rapido por turno y marca asistio o no-show.',
    icon: <ClipboardCheck className="h-5 w-5" />,
  },
  {
    href: '/admin/membresias',
    title: 'Membresias',
    description: 'Renueva paquetes, registra pagos y controla clases disponibles.',
    icon: <BadgeCheck className="h-5 w-5" />,
  },
  {
    href: '/admin/ajustes',
    title: 'Configuracion',
    description: 'Configura inventario de arcos, plantillas y ajustes del sistema.',
    icon: <Settings className="h-5 w-5" />,
  },
]

function HubLinkCard({ card }: { card: HubCard }) {
  return (
    <Link
      href={card.href}
      className="group rounded-2xl border border-white/10 bg-card p-4 transition-colors hover:border-accent/40 hover:bg-accent/5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 text-accent">
          {card.icon}
        </div>
        <ArrowRight className="h-4 w-4 text-textsec transition-transform group-hover:translate-x-1 group-hover:text-accent" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-textpri">{card.title}</h3>
      <p className="mt-2 text-sm text-textsec">{card.description}</p>
    </Link>
  )
}

export default function AdminDashboard() {
  const { stats, isLoading: statsLoading, error: statsError } = useDashboardStats()
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <AdminGuard>
      <div className="space-y-6">
        {/* Header */}
        <section className="rounded-3xl border border-white/10 bg-card p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-accent">Dashboard</p>
              <h1 className="mt-2 text-3xl font-bold text-textpri">Hub administrativo</h1>
              <p className="mt-2 max-w-2xl text-sm text-textsec">
                Vista general de la academia. Metricas, ocupacion y accesos directos.
              </p>
            </div>
            <button
              className="btn inline-flex items-center justify-center"
              onClick={() => setIsModalOpen(true)}
            >
              Reserva rapida
            </button>
          </div>
        </section>

        {statsError && (
          <div className="rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
            Error cargando estadisticas: {statsError}
          </div>
        )}

        {/* KPI cards — 6 metricas principales */}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard title="Alumnos activos" value={stats.total_alumnos_activos} icon="👤">
            <span className="text-xs text-textsec">Alumnos con membresia vigente</span>
          </StatCard>
          <StatCard
            title="Ocupacion semanal"
            value={`${stats.ocupacion_semana_pct}%`}
            icon="📊"
          >
            <div className="mt-1 h-2 w-full rounded-full bg-line/40">
              <div
                className="h-2 rounded-full bg-accent transition-all"
                style={{ width: `${Math.min(stats.ocupacion_semana_pct, 100)}%` }}
              />
            </div>
          </StatCard>
          <StatCard title="Facturacion del mes" value={`S/. ${stats.facturacion_mes_actual.toLocaleString()}`} icon="💰">
            <span className="text-xs text-textsec">Ingresos registrados este mes</span>
          </StatCard>
          <StatCard title="Membresias por vencer" value={stats.membresias_por_vencer} icon="⚠️">
            <span className="text-xs text-textsec">Proximos 7 dias</span>
          </StatCard>
          <StatCard title="Alumnos sin clases" value={stats.alumnos_sin_clases} icon="🚫">
            <span className="text-xs text-textsec">Requieren renovacion</span>
          </StatCard>
          <StatCard title="Turnos disponibles" value={stats.turnos_disponibles_semana} icon="📅">
            <span className="text-xs text-textsec">Esta semana</span>
          </StatCard>
        </section>

        {/* Ocupacion semanal (gráfico principal) + Reservas activas */}
        <section className="grid gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <div className="card p-5">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-textpri">Ocupacion semanal</h2>
                <p className="text-sm text-textsec">Demanda y disponibilidad por dia de la semana.</p>
              </div>

              {statsLoading ? (
                <div className="flex h-[300px] items-center justify-center text-textsec">Cargando grafico...</div>
              ) : (
                <WeeklyOccupancyChart data={stats.ocupacion_por_dia} />
              )}
            </div>
          </div>

          <div>
            <ActiveBookingsWidget />
          </div>
        </section>

        {/* Secciones del panel */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-textpri">Secciones del panel</h2>
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
