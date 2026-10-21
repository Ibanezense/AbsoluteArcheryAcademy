'use client'

import { useId, useState } from 'react'
import { useProgressAccountId, useStudentProgress } from '@/lib/hooks/useStudentProgress'
import { useCompetitionAvailability } from '@/components/student/progress/ProgressAvailability'
import { TrainingWorkspace } from '@/components/student/progress/TrainingWorkspace'
import { StudentCompetitionsPanel } from '@/components/student/progress/StudentCompetitionsPanel'

export default function AdminStudentProgress({ studentId, onManageLinks }: {
  studentId: string
  onManageLinks: () => void
}) {
  const accountId = useProgressAccountId()
  const competitionsEnabled = useCompetitionAvailability()
  const [section, setSection] = useState<'training' | 'competitions'>('training')
  const showCompetitions = competitionsEnabled && section === 'competitions'
  const tabsId = useId()
  const query = useStudentProgress(accountId, studentId, !!accountId && !showCompetitions)
  const data = accountId && !query.isError && query.data?.student_id === studentId ? query.data : null
  return (
    <section className="space-y-5" aria-label="Progreso del alumno">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Progreso del alumno</h2>
          <p className="mt-1 text-sm text-slate-600">La misma información que consulta el alumno. Solo lectura.</p>
        </div>
        <button type="button" className="btn-outline min-h-11" onClick={onManageLinks}>Gestionar vínculos</button>
      </div>
      {competitionsEnabled && <div role="tablist" aria-label="Fuentes de progreso" className="grid grid-cols-2 rounded-2xl border border-line bg-white p-1">
        {(['training', 'competitions'] as const).map(source => {
          const active = source === (showCompetitions ? 'competitions' : 'training')
          return <button key={source} type="button" role="tab" id={`${tabsId}-${source}`} aria-selected={active} aria-controls={`${tabsId}-panel`} tabIndex={active ? 0 : -1}
            onClick={() => setSection(source)}
            onKeyDown={event => {
              const next = event.key === 'Home' ? 'training' : event.key === 'End' ? 'competitions' : ['ArrowLeft', 'ArrowRight'].includes(event.key) ? source === 'training' ? 'competitions' : 'training' : null
              if (!next) return
              event.preventDefault()
              setSection(next)
              document.getElementById(`${tabsId}-${next}`)?.focus()
            }}
            className={`min-h-11 rounded-xl px-4 py-2 text-sm font-semibold ${active ? 'bg-slate-950 text-white shadow-sm' : 'text-textsec hover:bg-slate-50'}`}>
            {source === 'training' ? 'Controles' : 'Competencias'}
          </button>
        })}
      </div>}
      <div role={competitionsEnabled ? 'tabpanel' : undefined} id={`${tabsId}-panel`} aria-labelledby={competitionsEnabled ? `${tabsId}-${showCompetitions ? 'competitions' : 'training'}` : undefined}>
        {!accountId ? <p role="status">Verificando tu acceso…</p>
          : showCompetitions ? <StudentCompetitionsPanel key={`${accountId}:${studentId}`} accountId={accountId} studentId={studentId} />
          : <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-600">{data?.checked_at ? `Controles consultados: ${new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.checked_at))}` : 'Controles registrados por la academia'}</p>
              <button type="button" className="btn-outline min-h-11" disabled={query.isFetching} onClick={() => void query.refetch()}>{query.isFetching ? 'Consultando…' : 'Actualizar controles'}</button>
            </div>
            {query.isError ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5"><h3 className="font-bold">No pudimos consultar el progreso</h3><p className="mt-2 text-sm">{query.error.message}</p></div>
              : !data ? <p role="status">Consultando controles…</p>
              : data.state === 'ready' ? <TrainingWorkspace key={`${accountId}:${studentId}:${data.link_revision}:${data.assigned_distance_m}`} data={data} />
              : <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="font-bold">{data.state === 'pending_link' ? 'Controles sin vincular' : data.state === 'empty' ? 'Sin controles registrados' : 'Origen de controles no disponible'}</h3>
                <p className="mt-2 text-sm text-slate-600">{data.state === 'pending_link' ? 'Confirma el registro correspondiente desde Perfil para consultar los controles del alumno.' : data.state === 'empty' ? 'El vínculo está confirmado, pero el origen no tiene controles para este alumno.' : 'No pudimos leer el historial. Puedes volver a consultar; este estado no significa que no existan controles.'}</p>
              </div>}
          </div>}
      </div>
    </section>
  )
}
