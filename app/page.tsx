'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarPlus, Ticket, MessagesSquare, LogOut } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { AuthGuard } from '@/components/AuthGuard'
import Avatar from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'
import { NextBookingWidget } from '@/components/ui/NextBookingWidget'
import { useStudentContext } from '@/lib/hooks/useStudentContext'
import { useStudentDashboard } from '@/lib/hooks/useStudentDashboard'
import { useMembershipExpiry } from '@/lib/hooks/useMembershipExpiry'
import dayjs from 'dayjs'

function StudentHomeContent() {
  const router = useRouter()
  const {
    account,
    students,
    activeStudent,
    activeStudentId,
    loading: contextLoading,
    error: contextError,
  } = useStudentContext()
  const {
    dashboard,
    loading: dashboardLoading,
    error: dashboardError,
  } = useStudentDashboard(activeStudentId)

  const { daysUntilExpiry, isExpired, isExpiringSoon } = useMembershipExpiry(dashboard)

  useEffect(() => {
    if (account?.role === 'admin') {
      router.replace('/admin')
    }
  }, [account?.role, router])

  useEffect(() => {
    // Si es tutor y tiene más de 1 alumno, PERO no ha seleccionado uno, forzar hub
    if (account?.role === 'guardian' && students.length > 1 && !activeStudentId) {
      router.replace('/hub')
    }
    // NOTA: Si es tutor de 1 solo alumno, el context ya autoseleccionó activeStudentId.
  }, [account?.role, students.length, activeStudentId, router])

  const signOut = async () => {
    await supabase.auth.signOut()
    router.replace('/login')
  }



  const loading = contextLoading || dashboardLoading
  const error = contextError || dashboardError

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <Spinner />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="card p-8 text-center max-w-md">
          <p className="text-danger mb-4">{error}</p>
          <button className="btn" onClick={() => window.location.reload()}>
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  // Si por alguna razón el activeStudentId no carga, pero sabemos que la cuenta terminó de cargar
  if (account?.role === 'guardian' && !activeStudentId && students.length > 1) {
    return (
      <div className="min-h-screen bg-bg text-textpri flex items-center justify-center">
        <div className="card p-8 text-center max-w-md">
          <p className="text-textsec mb-4">
            Selecciona un hijo en el hub para ver su informacion.
          </p>
          <Link href="/hub" className="btn inline-flex justify-center">
            Ir al hub
          </Link>
        </div>
      </div>
    )
  }

  if (!dashboard) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="card p-8 text-center max-w-md">
          <p className="text-danger mb-4">No se pudo cargar el resumen del alumno</p>
          <button className="btn" onClick={() => window.location.reload()}>
            Reintentar
          </button>
        </div>
      </div>
    )
  }



  return (
    <div className="min-h-screen bg-bg text-textpri">
      <div className="mx-auto w-full max-w-screen-2xl px-0 sm:px-4 lg:px-8 py-6 pb-24 space-y-5">
        {account?.role === 'guardian' && activeStudent && students.length > 1 && (
          <div className="card p-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-textsec">Viendo alumno</p>
              <p className="font-medium truncate max-w-[150px] sm:max-w-[200px]">{activeStudent.full_name}</p>
            </div>
            <Link href="/hub" className="btn-outline text-xs px-3">
              Cambiar
            </Link>
          </div>
        )}

          {/* Perfil del Alumno - Estilo App Nativa / Social */}
          <div className="w-full bg-card rounded-2xl shadow-soft border border-line overflow-hidden relative pb-6">
            {/* Banner Background */}
            <div className="h-32 w-full bg-gradient-to-r from-accent/20 to-accent/5 relative">
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
              {/* Boton Cerrar Sesion */}
              <button
                onClick={signOut}
                className="absolute top-4 right-4 z-20 p-2 rounded-full bg-black/20 text-white backdrop-blur-md border border-white/10 hover:bg-black/40 transition-colors"
                aria-label="Cerrar sesion"
              >
                <LogOut size={18} />
              </button>
            </div>

            {/* Avatar Superpuesto Centrado */}
            <div className="flex justify-center -mt-16 relative z-10">
              <div className="rounded-full p-1.5 bg-card">
                <Avatar
                  url={dashboard.avatar_url}
                  name={dashboard.full_name || 'Alumno'}
                  size="lg"
                  className="!h-28 !w-28 !text-3xl shadow-md border-2 border-line/40"
                />
              </div>
            </div>

            {/* Info del Atleta */}
            <div className="text-center px-4 mt-3 space-y-1.5">
              <h1 className="text-2xl font-bold text-textpri leading-tight">
                {dashboard.full_name || 'Alumno'}
              </h1>

              <div className="flex items-center justify-center gap-2 text-textsec text-sm">
                {dashboard.age && <span>{dashboard.age} años</span>}
                {dashboard.age && dashboard.current_distance_m && <span className="opacity-50">•</span>}
                {dashboard.current_distance_m && (
                  <span>Distancia: <strong className="text-textpri font-medium">{dashboard.current_distance_m}m</strong></span>
                )}
              </div>

              {/* Badges y status */}
              <div className="flex flex-wrap items-center justify-center gap-2 pt-3">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide uppercase ${dashboard.student_is_active ? 'bg-success/10 text-success border border-success/20' : 'bg-danger/10 text-danger border border-danger/20'
                  }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${dashboard.student_is_active ? 'bg-success animate-pulse' : 'bg-danger'}`}></span>
                  {dashboard.student_is_active ? 'Activo' : 'Inactivo'}
                </span>

                <span className="px-3 py-1 rounded-full text-xs font-medium bg-accent/10 border border-accent/20 text-accent">
                  {dashboard.membership_name || 'Sin membresía'}
                </span>

                {dashboard.category && (
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-background border border-line text-textsec">
                    {dashboard.category} {dashboard.level ? `· ${dashboard.level}` : ''}
                  </span>
                )}
              </div>

              {/* Mini-Resumen de Membresia Interactivo */}
              {dashboard.membership_status === 'active' && (
                <div className="mt-5 pt-4 border-t border-line/50">
                  <div className="grid grid-cols-2 gap-3 mx-auto max-w-sm">
                    <div className={`flex flex-col items-center justify-center p-2.5 rounded-xl border ${(dashboard.classes_remaining ?? 0) === 0 ? 'bg-danger/10 border-danger/20 text-danger' :
                        (dashboard.classes_remaining ?? 0) <= 2 ? 'bg-warning/10 border-warning/20 text-warning' :
                          'bg-success/10 border-success/20 text-success'
                      }`}>
                      <span className="text-2xl font-bold leading-none mb-1">{dashboard.classes_remaining ?? 0}</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wider opacity-80">Clases Libres</span>
                    </div>
                    <div className={`flex flex-col items-center justify-center p-2.5 rounded-xl border ${isExpired ? 'bg-danger/10 border-danger/20 text-danger' :
                        isExpiringSoon ? 'bg-warning/10 border-warning/20 text-warning' :
                          'bg-background border-line text-textpri'
                      }`}>
                      <span className="text-sm font-bold leading-none mb-1">
                        {dashboard.membership_end ? dayjs(dashboard.membership_end).format('D MMM') : 'N/A'}
                      </span>
                      <span className="text-[10px] text-textsec font-semibold uppercase tracking-wider">Vence</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Acciones Rapidas (Quick Actions Grid) */}
          <div className="grid grid-cols-3 gap-3 w-full px-1 sm:px-0">
            <Link href="/reservar" className="flex flex-col items-center justify-center gap-2 bg-card border border-line rounded-2xl p-4 shadow-sm hover:scale-95 hover:bg-accent/5 transition-all text-center group">
              <div className="w-12 h-12 rounded-full bg-accent/10 text-accent flex items-center justify-center group-hover:bg-accent group-hover:text-white transition-colors">
                <CalendarPlus size={22} />
              </div>
              <span className="text-xs font-medium text-textpri">Agendar</span>
            </Link>

            <Link href="/membresias" className="flex flex-col items-center justify-center gap-2 bg-card border border-line rounded-2xl p-4 shadow-sm hover:scale-95 transition-all text-center group">
              <div className="w-12 h-12 rounded-full bg-background border border-line text-textpri flex items-center justify-center group-hover:bg-line transition-colors">
                <Ticket size={22} className="opacity-80" />
              </div>
              <span className="text-xs font-medium text-textpri">Mi Cuenta</span>
            </Link>

            <button disabled className="flex flex-col items-center justify-center gap-2 bg-card border border-line rounded-2xl p-4 shadow-sm opacity-50 cursor-not-allowed text-center">
              <div className="w-12 h-12 rounded-full bg-background border border-line text-textsec flex items-center justify-center">
                <MessagesSquare size={22} className="opacity-60" />
              </div>
              <span className="text-xs font-medium text-textsec">Soporte</span>
            </button>
          </div>

          <div className="w-full space-y-3 px-1 sm:px-0">
            <h2 className="text-sm font-semibold text-textsec uppercase tracking-wider pl-1">Agenda</h2>
            <div className="shadow-sm rounded-2xl overflow-hidden border border-line">
              <NextBookingWidget studentId={activeStudentId} />
            </div>
          </div>
      </div>
    </div>
  )
}

export default function HomePage() {
  return (
    <AuthGuard>
      <StudentHomeContent />
    </AuthGuard>
  )
}
