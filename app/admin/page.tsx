'use client'

import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import AdminGuard from '@/components/AdminGuard'
import AdminQuickBooking from '@/components/AdminQuickBooking'
import AdminBookingsManager from '@/components/AdminBookingsManager'
import { useDashboardStats } from '@/lib/hooks/useDashboardStats'
import { StatCard } from '@/components/ui/StatCard'

export default function AdminDashboard() {
  const router = useRouter()
  const { signOut } = useAuth()
  const { stats, isLoading: statsLoading, error: statsError, refetch } = useDashboardStats()

  return (
    <AdminGuard>
      <div className="space-y-6">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-bg/80 backdrop-blur border-b border-white/10 -mx-4 lg:-mx-8 px-4 lg:px-8">
          <div className="flex items-center justify-between py-3">
            <h1 className="text-lg font-semibold">Panel de Control</h1>
            <div className="flex items-center gap-2">
              <button 
                className="btn-ghost px-3 py-1.5 text-sm"
                onClick={signOut}
                title="Cerrar Sesión"
              >
                Salir
              </button>
              <button className="btn-ghost px-2" onClick={refetch}>⟳</button>
            </div>
          </div>
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
            <AdminQuickBooking />
            <AdminBookingsManager />
          </div>

          {/* CTA gestionar */}
          <button className="w-full btn" onClick={() => router.push('/admin/sesiones')}>
            Gestionar Turnos
          </button>
        </div>
      </div>
    </AdminGuard>
  )
}
