'use client'

import Link from 'next/link'
import { AuthGuard } from '@/components/AuthGuard'
import { MobileStudentHeader } from '@/components/student/MobileStudentHeader'
import { StudentCard } from '@/components/student/StudentCard'
import { useStudentContext } from '@/lib/hooks/useStudentContext'
import { useProgressAccountId, useStudentProgress } from '@/lib/hooks/useStudentProgress'
import { ProgressSummary } from './ProgressSummary'
import { ProgressSourceState } from './ProgressSourceState'
import { TrainingWorkspace } from './TrainingWorkspace'

export default function StudentProgressPage() {
  const context = useStudentContext()
  const accountId = useProgressAccountId()
  const ready = !context.loading && !!accountId && context.account?.id === accountId
  const query = useStudentProgress(accountId, context.activeStudentId, ready)
  const data =
    ready && query.data?.student_id === context.activeStudentId && !query.isError
      ? query.data
      : null
  return (
    <AuthGuard>
      <div className="min-h-screen bg-[#F7F8FA] pb-8 text-textpri">
        <MobileStudentHeader title="Mi progreso" subtitle="Controles de entrenamiento" showBack />
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
                  <p className="mt-1 text-xs text-textsec">
                    {data?.checked_at
                      ? `Controles consultados: ${new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.checked_at))}`
                      : 'Controles registrados por la academia'}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-outline min-h-11"
                  onClick={() => void query.refetch()}
                  disabled={query.isFetching}
                >
                  {query.isFetching ? 'Consultando…' : 'Actualizar'}
                </button>
                {context.account?.role === 'guardian' && (
                  <Link
                    href="/hub"
                    className="inline-flex min-h-11 items-center text-sm font-semibold text-accent"
                  >
                    Cambiar alumno
                  </Link>
                )}
              </div>
              {query.isError ? (
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
            </>
          )}
        </div>
      </div>
    </AuthGuard>
  )
}
