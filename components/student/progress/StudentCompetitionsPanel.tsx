'use client'

import { StudentCard } from '@/components/student/StudentCard'
import { useStudentCompetitions } from '@/lib/hooks/useStudentCompetitions'
import { CompetitionHistory } from './CompetitionHistory'
import { CompetitionSourceState } from './CompetitionSourceState'

export function StudentCompetitionsPanel({
  accountId,
  studentId,
}: {
  accountId: string
  studentId: string
}) {
  const query = useStudentCompetitions(accountId, studentId)
  const data = !query.isError && query.data?.student_id === studentId ? query.data : null
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Resultados individuales publicados</p>
          <p className="mt-1 text-xs text-textsec">
            {data?.checked_at
              ? `Última consulta correcta: ${new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.checked_at))}`
              : 'Las clasificaciones y posiciones se muestran según los registros de cada torneo.'}
          </p>
        </div>
        <button
          type="button"
          className="btn-outline min-h-11"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching ? 'Consultando…' : 'Actualizar competencias'}
        </button>
      </div>
      {query.isError ? (
        <StudentCard className="p-5">
          <h2 className="font-bold">No pudimos cargar tus competencias</h2>
          <p role="alert" className="mt-2 text-sm text-textsec">
            {query.error.message}
          </p>
        </StudentCard>
      ) : !data ? (
        <StudentCard className="p-5">
          <p role="status">Consultando tus competencias…</p>
        </StudentCard>
      ) : (
        <>
          {data.state !== 'ready' && (
            <CompetitionSourceState
              state={data.state}
              failures={data.failures}
              busy={query.isFetching}
              onRetry={() => void query.refetch()}
            />
          )}
          {(data.state === 'ready' || data.state === 'partial') && (
            <CompetitionHistory datasets={data.datasets} />
          )}
        </>
      )}
    </div>
  )
}
