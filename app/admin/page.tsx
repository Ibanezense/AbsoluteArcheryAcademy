'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AdminGuard from '@/components/AdminGuard'
import AdminQuickBooking from '@/components/AdminQuickBooking'
import { useDashboardStats } from '@/lib/hooks/useDashboardStats'
import { StatCard } from '@/components/ui/StatCard'
import { Modal } from '@/components/ui/Modal'
import { supabase } from '@/lib/supabaseClient'
import dayjs from 'dayjs'
import 'dayjs/locale/es'

dayjs.locale('es')

// Iconos SVG
const IconAlumnos = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><path d="M16 3.128a4 4 0 0 1 0 7.744"></path><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><circle cx="9" cy="7" r="4"></circle></svg>
const IconFacturacion = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8"></circle><line x1="12" y1="16" x2="12" y2="16"></line><line x1="12" y1="8" x2="12" y2="12"></line></svg>
const IconVencer = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>
const IconSinClases = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" x2="19" y1="5" y2="19"></line><line x1="5" x2="19" y1="19" y2="5"></line></svg>
const IconOcupacion = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"></rect><line x1="16" x2="16" y1="2" y2="6"></line><line x1="8" x2="8" y1="2" y2="6"></line><line x1="3" x2="21" y1="10" y2="10"></line><path d="M8 14h.01"></path><path d="M12 14h.01"></path><path d="M16 14h.01"></path><path d="M8 18h.01"></path><path d="M12 18h.01"></path><path d="M16 18h.01"></path></svg>

export default function AdminDashboard() {
  const router = useRouter()
  const { stats, isLoading: statsLoading, error: statsError } = useDashboardStats()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [activeBookings, setActiveBookings] = useState<any[]>([])

  useEffect(() => {
    // Cargar reservas activas
    const fetchActiveBookings = async () => {
      const { data } = await supabase
        .from('user_booking_history')
        .select('*')
        .eq('status', 'reserved')
        .order('start_at', { ascending: true })
        .limit(3)
      setActiveBookings(data || [])
    }
    fetchActiveBookings()
  }, [])

  return (
    <AdminGuard>
      <div className="space-y-6">

        {/* --- 1. NUEVO HEADER --- */}
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

        {/* --- 2. MÉTRICAS GENERALES (KPIs) --- */}
        <div>
          <h2 className="text-lg font-semibold mb-3 text-textpri">Métricas Generales</h2>
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
              <StatCard title="Alumnos Activos" value={stats.total_alumnos_activos}>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-textsec">Total de estudiantes activos</span>
                  <span className="text-textsec"><IconAlumnos /></span>
                </div>
              </StatCard>
              <StatCard title="Facturación del Mes" value={`S/. ${stats.facturacion_mes_actual.toLocaleString()}`}>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-textsec">Ingresos mes actual</span>
                  <span className="text-yellow-400"><IconFacturacion /></span>
                </div>
              </StatCard>
              <StatCard title="Membresías por Vencer" value={stats.membresias_por_vencer}>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-textsec">Próximos 7 días</span>
                  <span className="text-warning"><IconVencer /></span>
                </div>
              </StatCard>
              <StatCard title="Alumnos sin Clases" value={stats.alumnos_sin_clases}>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-textsec">Requieren renovación</span>
                  <span className="text-danger"><IconSinClases /></span>
                </div>
              </StatCard>
            </div>
          )}
        </div>
        
        {/* --- 3. RESUMEN SEMANAL --- */}
        <div>
          <h2 className="text-lg font-semibold mb-3 text-textpri">Resumen de la Semana</h2>
          {statsLoading && (
            <div className="text-textsec text-sm">Cargando...</div>
          )}
          {!statsLoading && !statsError && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard title="Ocupación Semanal" value={`${stats.ocupacion_semana_pct}%`}>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-textsec">Lunes a Domingo</span>
                  <span className="text-info"><IconOcupacion /></span>
                </div>
              </StatCard>
              <StatCard title="Turnos Disponibles" value={stats.turnos_disponibles_semana}>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-textsec">Semana actual con cupos</span>
                  <span className="text-success"><IconOcupacion /></span>
                </div>
              </StatCard>
              
              {/* Espacios vacíos para alinear el grid */}
              <div className="hidden lg:block"></div>
              <div className="hidden lg:block"></div>
            </div>
          )}
        </div>

        {/* --- 4. RESERVAS ACTIVAS --- */}
        <div>
          <h2 className="text-lg font-semibold mb-3 text-textpri">Reservas Activas</h2>
          <div className="card p-4 space-y-3">
            {activeBookings.length === 0 && (
              <p className="text-textsec text-sm">No hay próximas reservas de estudiantes.</p>
            )}
            {activeBookings.map((booking) => (
              <div key={booking.id} className="bg-bg p-3 rounded-lg border border-white/10">
                <p className="font-medium">{booking.full_name}</p>
                <p className="text-sm text-textsec">
                  {dayjs(booking.start_at).format('ddd, D [de] MMM, HH:mm')}
                </p>
              </div>
            ))}
          </div>
        </div>
        
        {/* --- 5. MODAL --- */}
        <Modal 
          title="Reserva Rápida" 
          isOpen={isModalOpen} 
          onClose={() => setIsModalOpen(false)}
        >
          <AdminQuickBooking />
        </Modal>
        
      </div>
    </AdminGuard>
  )
}
