'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MobileStudentHeader } from '@/components/student/MobileStudentHeader'
import { StudentCard, StudentNotice } from '@/components/student/StudentCard'
import StudentBookingHistory from '@/components/student/StudentBookingHistory'
import { StudentPageSkeleton } from '@/components/ui/StudentPageSkeleton'
import { useStudentContext } from '@/lib/hooks/useStudentContext'
import { useStudentBookingHistory } from '@/lib/hooks/useStudentBookingHistory'

export default function MisReservasPage() {
  const { account, activeStudent, activeStudentId, loading } = useStudentContext()
  const [tab, setTab] = useState<'upcoming' | 'history'>('upcoming')
  const summaryQuery = useStudentBookingHistory(activeStudentId)
  if (loading) return <StudentPageSkeleton variant="reservations" />
  const summary = summaryQuery.data?.summary
  return <div className="min-h-screen bg-[#F7F8FA] text-textpri">
    <MobileStudentHeader title="Mis reservas" subtitle="Próximas clases e historial completo" showBack />
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-5 sm:px-6">
      {account?.role === 'guardian' && activeStudent && <StudentCard className="flex items-center justify-between gap-4 p-4">
        <div className="min-w-0"><p className="text-xs font-semibold text-textsec">Viendo reservas de</p><p className="break-words font-semibold">{activeStudent.full_name}</p></div>
        <Link href="/hub" className="btn-outline btn-sm shrink-0">Cambiar</Link>
      </StudentCard>}
      {activeStudentId ? <>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Próximas" value={summary?.upcoming} /><Stat label="Historial" value={summary?.history} /><Stat label="Asistidas" value={summary?.attended} />
        </div>
        <p className="text-xs text-textsec">Totales de todos tus planes. El historial incluye inasistencias semanales y clases no recuperables.</p>
        {summaryQuery.isError && <StudentCard className="p-4"><p role="alert" className="text-sm text-danger">No se pudo cargar el resumen. <button className="font-bold underline" onClick={() => summaryQuery.refetch()}>Reintentar</button></p></StudentCard>}
        <StudentNotice>Puedes cancelar tu reserva hasta el inicio de la clase.</StudentNotice>
        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-line bg-white p-1" aria-label="Sección de reservas">
          {(['upcoming', 'history'] as const).map(value => <button key={value} type="button" aria-pressed={tab === value} className={`min-h-[44px] rounded-xl text-sm font-bold ${tab === value ? 'bg-accent text-white' : 'text-textsec'}`} onClick={() => setTab(value)}>{value === 'upcoming' ? 'Próximas' : 'Historial'}</button>)}
        </div>
        <StudentBookingHistory key={`${activeStudentId}:${tab}`} studentId={activeStudentId} scope={tab} />
        {tab === 'upcoming' && <Link href="/reservar" className="btn min-h-[44px]">Reservar clase</Link>}
      </> : <StudentCard className="p-5 text-sm text-textsec">Selecciona un alumno antes de continuar. <Link href="/hub" className="font-bold text-accent">Elegir alumno</Link></StudentCard>}
    </div>
  </div>
}
function Stat({ label, value }: { label: string; value?: number }) {
  return <StudentCard className="p-3 text-center"><p className="text-2xl font-black">{value ?? '—'}</p><p className="mt-1 text-xs text-textsec">{label}</p></StudentCard>
}
