'use client'

import Link from 'next/link'
import { useId, useState } from 'react'
import { AuthGuard } from '@/components/AuthGuard'
import { MobileStudentHeader } from '@/components/student/MobileStudentHeader'
import { StudentCard } from '@/components/student/StudentCard'
import { useStudentContext } from '@/lib/hooks/useStudentContext'
import { useProgressAccountId, useStudentProgress } from '@/lib/hooks/useStudentProgress'
import { ProgressSummary } from './ProgressSummary'
import { ProgressSourceState } from './ProgressSourceState'
import { TrainingWorkspace } from './TrainingWorkspace'
import { StudentCompetitionsPanel } from './StudentCompetitionsPanel'
import { useCompetitionAvailability } from './ProgressAvailability'

export default function StudentProgressPage() {
  const competitionsEnabled = useCompetitionAvailability()
  const [section, setSection] = useState<'training' | 'competitions'>('training')
  const showCompetitions = competitionsEnabled && section === 'competitions'
  const tabsId = useId()
  const context = useStudentContext()
  const accountId = useProgressAccountId()
  const ready = !context.loading && !!accountId && context.account?.id === accountId
  const query = useStudentProgress(accountId, context.activeStudentId, ready && !showCompetitions)
  const data =
    ready && query.data?.student_id === context.activeStudentId && !query.isError
      ? query.data
      : null
  return (
    <AuthGuard>
      <div className="min-h-screen bg-[#F7F8FA] pb-8 text-textpri">
        <MobileStudentHeader
          title="Mi progreso"
          subtitle={
            competitionsEnabled ? 'Entrenamiento y competencias' : 'Controles de entrenamiento'
          }
          showBack
        />
        <div className="mx-auto max-w-6xl space-y-5 px-4 py-5 sm:px-6">
          {!ready ? (
            <StudentCard className="p-6">
              <p role="status">{context.error || 'Verificando tu acceso…'}</p>
            </StudentCard>
          ) : !context.activeStudentId ? (
            <StudentCard className="p-6">
              <p>Selecciona un alumno para consultar sus controles.</p>
              <Link
                href="/hub"
                className="mt-4 inline-flex min-h-11 items-center font-semibold text-accent"
              >
                Elegir alumno
              </Link>
            </StudentCard>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-bold">{context.activeStudent?.full_name}</p>
                  {!showCompetitions && (
                    <p className="mt-1 text-xs text-textsec">
                      {data?.checked_at
                        ? `Controles consultados: ${new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.checked_at))}`
                        : 'Controles registrados por la academia'}
                    </p>
                  )}
                </div>
                {!showCompetitions && (
                  <button
                    type="button"
                    className="btn-outline min-h-11"
                    onClick={() => void query.refetch()}
                    disabled={query.isFetching}
                  >
                    {query.isFetching ? 'Consultando…' : 'Actualizar'}
                  </button>
                )}
                {context.account?.role === 'guardian' && (
                  <Link
                    href="/hub"
                    className="inline-flex min-h-11 items-center text-sm font-semibold text-accent"
                  >
                    Cambiar alumno
                  </Link>
                )}
              </div>
              {competitionsEnabled && (
                <div
                  role="tablist"
                  aria-label="Fuentes de progreso"
                  className="grid grid-cols-2 rounded-2xl border border-line bg-white p-1"
                >
                  {(['training', 'competitions'] as const).map((source) => {
                    const active = source === (showCompetitions ? 'competitions' : 'training')
                    return (
                      <button
                        key={source}
                        type="button"
                        role="tab"
                        id={`${tabsId}-${source}`}
                        aria-controls={`${tabsId}-panel`}
                        aria-selected={active}
                        tabIndex={active ? 0 : -1}
                        onClick={() => setSection(source)}
                        onKeyDown={(event) => {
                          const next =
                            event.key === 'Home'
                              ? 'training'
                              : event.key === 'End'
                                ? 'competitions'
                                : ['ArrowLeft', 'ArrowRight'].includes(event.key)
                                  ? source === 'training'
                                    ? 'competitions'
                                    : 'training'
                                  : null
                          if (!next) return
                          event.preventDefault()
                          setSection(next)
                          document.getElementById(`${tabsId}-${next}`)?.focus()
                        }}
                        className={`min-h-11 rounded-xl px-4 py-2 text-sm font-semibold transition ${active ? 'bg-slate-950 text-white shadow-sm' : 'text-textsec hover:bg-slate-50'}`}
                      >
                        {source === 'training' ? 'Controles' : 'Competencias'}
                      </button>
                    )
                  })}
                </div>
              )}
              <div
                role={competitionsEnabled ? 'tabpanel' : undefined}
                id={`${tabsId}-panel`}
                aria-labelledby={
                  competitionsEnabled
                    ? `${tabsId}-${showCompetitions ? 'competitions' : 'training'}`
                    : undefined
                }
              >
                {showCompetitions ? (
                  <StudentCompetitionsPanel
                    key={`${accountId}:${context.activeStudentId}`}
                    accountId={accountId!}
                    studentId={context.activeStudentId}
                  />
                ) : query.isError ? (
                  <StudentCard className="p-6">
                    <h2 className="font-bold">No pudimos cargar tu progreso</h2>
                    <p role="alert" className="mt-2 text-sm text-textsec">
                      {query.error.message}
                    </p>
                    <p className="mt-2 text-sm text-textsec">
                      Actualiza para volver a verificar tu acceso.
                    </p>
                  </StudentCard>
                ) : !data ? (
                  <StudentCard className="p-6">
                    <p role="status">Consultando tus controles…</p>
                  </StudentCard>
                ) : data.state === 'ready' ? (
                  <TrainingWorkspace
                    key={`${accountId}:${data.student_id}:${data.link_revision}:${data.assigned_distance_m}`}
                    data={data}
                  />
                ) : (
                  <>
                    <ProgressSummary
                      summary={data.summary}
                      assignedDistance={data.assigned_distance_m}
                    />
                    <ProgressSourceState
                      state={data.state}
                      onRetry={() => void query.refetch()}
                      busy={query.isFetching}
                    />
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </AuthGuard>
  )
}
