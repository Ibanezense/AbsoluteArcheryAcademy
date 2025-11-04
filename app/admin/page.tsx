'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import AdminGuard from '@/components/AdminGuard'
import AdminQuickBooking from '@/components/AdminQuickBooking'
import AdminBookingsManager from '@/components/AdminBookingsManager'
import { useDashboardStats } from '@/lib/hooks/useDashboardStats'
import { StatCard } from '@/components/ui/StatCard'
import { Modal } from '@/components/ui/Modal'

export default function AdminDashboard() {
  const router = useRouter()
  const { stats, isLoading: statsLoading, error: statsError } = useDashboardStats()
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <AdminGuard>
      <div className="space-y-6">
        {/* Nuevo Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-textpri">Dashboard</h1>
            <p className="text-sm text-textsec mt-1">Resumen de la actividad de la academia.</p>
          </div>
          <button 
            className="bg-accent text-white font-medium px-5 py-2.5 rounded-lg hover:bg-accent/90 transition-colors"
            onClick={() => setIsModalOpen(true)}
          >
            Reserva Rápida
          </button>
        </div>

        <div className="space-y-6">
          {/* Métricas Generales */}
          <div>
            <h2 className="text-sm font-semibold mb-4">Métricas Generales</h2>
            
            {statsLoading && (
              <div className="text-textsec text-sm">Cargando estadísticas...</div>
            )}
            
            {statsError && (
              <div className="card p-4 bg-danger/10 border-danger/20 text-danger text-sm">
                Error: {statsError}
              </div>
            )}
            
            {!statsLoading && !statsError && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard 
                  title="Alumnos Activos" 
                  value={stats.total_alumnos_activos}
                  icon="👥"
                >
                  <p className="text-xs text-textsec">Total de estudiantes activos</p>
                </StatCard>

                <StatCard 
                  title="Facturación del Mes" 
                  value={`S/. ${stats.facturacion_mes_actual.toLocaleString()}`}
                  icon="💰"
                >
                  <p className="text-xs text-textsec">Ingresos mes actual</p>
                </StatCard>

                <StatCard 
                  title="Membresías por Vencer" 
                  value={stats.membresias_por_vencer}
                  icon="⚠️"
                >
                  <p className="text-xs text-textsec">Próximos 7 días</p>
                </StatCard>

                <StatCard 
                  title="Alumnos sin Clases" 
                  value={stats.alumnos_sin_clases}
                  icon="📉"
                >
                  <p className="text-xs text-textsec">Requieren renovación</p>
                </StatCard>
              </div>
            )}
          </div>

          {/* Resumen de la Semana */}
          <div>
            <h2 className="text-sm font-semibold mb-4">Resumen de la Semana</h2>
            
            {statsLoading && (
              <div className="text-textsec text-sm">Cargando...</div>
            )}
            
            {!statsLoading && !statsError && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <StatCard 
                  title="Ocupación Semanal" 
                  value={`${stats.ocupacion_semana_pct}%`}
                  icon="📊"
                >
                  <p className="text-xs text-textsec">Lunes a Domingo</p>
                </StatCard>

                <StatCard 
                  title="Turnos Disponibles" 
                  value={stats.turnos_disponibles_semana}
                  icon="📅"
                >
                  <p className="text-xs text-textsec">Semana actual con cupos</p>
                </StatCard>
              </div>
            )}
          </div>

          {/* Reserva Rápida y Gestión en grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card p-5 flex flex-col justify-between">
              <h3 className="text-sm font-semibold text-textsec mb-4 uppercase tracking-wide">
                Acciones Rápidas
              </h3>
              <button 
                className="btn w-full" 
                onClick={() => setIsModalOpen(true)}
              >
                + Reserva Rápida
              </button>
            </div>
            <AdminBookingsManager />
          </div>

          {/* CTA gestionar */}
          <button className="w-full btn" onClick={() => router.push('/admin/sesiones')}>
            Gestionar Turnos
          </button>
        </div>
      </div>

      {/* Modal de Reserva Rápida */}
      <Modal 
        title="Reserva Rápida" 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
      >
        <AdminQuickBooking />
      </Modal>
    </AdminGuard>
  )
}
