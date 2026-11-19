import { CalendarClock, Target, Trophy } from 'lucide-react'
import { StudentCard } from '@/components/student/StudentCard'
import type { AcademyControl, TrainingSummary } from '@/lib/contracts/studentProgress'
import { progressDate } from './ProgressSummary'

export function StudentProgressSummary({ summary, assignedDistance }: {
  summary: TrainingSummary | null
  assignedDistance: number | null
}) {
  const reference = summary?.reference
  const previous = reference?.kind === 'previous'
  const recordsDistance = reference?.summary_distance_m === undefined ? assignedDistance : reference.summary_distance_m
  const last = summary?.last_control
  const relevantLast = assignedDistance === null || last?.distance === assignedDistance ? last : null

  return (
    <StudentCard className="overflow-hidden border-blue-100">
      <section aria-label="Resumen de entrenamiento">
        <div className="flex items-center justify-between gap-3 border-b border-blue-100 bg-blue-50/60 px-4 py-3 sm:px-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[#101e3e]">
            <Target aria-hidden="true" className="size-5 shrink-0 text-[#0758aa]" /> Distancia asignada
          </h2>
          <p className="text-lg font-bold text-[#0758aa]">{assignedDistance === null ? 'Por asignar' : `${assignedDistance} m`}</p>
        </div>
        {summary && (
          <div className="space-y-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl bg-slate-50 px-3 py-2.5">
              <div>
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-[#101e3e]">
                  <CalendarClock aria-hidden="true" className="size-4 text-[#0758aa]" />
                  {summary.last_order_uncertain && relevantLast ? 'Control de la última fecha' : assignedDistance === null && relevantLast ? 'Último control histórico' : 'Último control'}
                </h3>
                {relevantLast ? (
                  <p className="mt-1 text-xs text-slate-600">
                    {progressDate(relevantLast.performed_date)} · {relevantLast.arrows} flechas{assignedDistance === null && ` · ${relevantLast.distance} m`}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-slate-600">{assignedDistance === null ? 'Distancia pendiente de asignación.' : `Aún no tienes controles válidos a ${assignedDistance} m.`}</p>
                )}
              </div>
              {relevantLast && <ControlScore control={relevantLast} />}
              {summary.last_order_uncertain && relevantLast && <p className="basis-full text-xs text-slate-600">Hay varios controles de ese día y el orden está por confirmar.</p>}
            </div>
            {recordsDistance !== null && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                  <h3 className="flex items-center gap-1.5 text-sm font-bold text-[#101e3e]">
                    <Trophy aria-hidden="true" className="size-4 text-orange-700" /> Récords personales
                  </h3>
                  <span className="text-xs font-semibold text-slate-600">{recordsDistance} m{previous && ' · Distancia anterior'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <RecordTile arrows={36} control={summary.best_36} />
                  <RecordTile arrows={72} control={summary.best_72} />
                </div>
              </div>
            )}
            {(reference?.kind === 'discrepant' || reference?.kind === 'uncertain') && (
              <p className="rounded-xl border border-orange-100 bg-orange-50 px-3 py-2 text-xs text-orange-900">
                {reference.kind === 'discrepant'
                  ? `El control más reciente se registró a ${reference.latest_distances_m.map(distance => `${distance} m`).join(' y ')}. Tu distancia asignada es ${assignedDistance} m.`
                  : 'La academia debe confirmar el orden de los controles más recientes.'}
              </p>
            )}
          </div>
        )}
      </section>
    </StudentCard>
  )
}

function ControlScore({ control }: { control: AcademyControl }) {
  return (
    <span className="whitespace-nowrap text-xl font-bold tabular-nums text-accent">
      {control.score} <span className="text-xs font-medium text-slate-600">/ {control.arrows * 10}</span>
    </span>
  )
}

function RecordTile({ arrows, control }: { arrows: 36 | 72; control: AcademyControl | null }) {
  return (
    <article className="min-w-0 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2.5">
      <h4 className="text-xs font-semibold text-slate-700">{arrows} flechas</h4>
      {control ? (
        <>
          <p className="mt-0.5"><ControlScore control={control} /></p>
          <p className="mt-0.5 text-xs text-slate-600">{progressDate(control.performed_date)}</p>
        </>
      ) : <p className="mt-1 text-xs text-slate-600">Sin récord registrado</p>}
    </article>
  )
}
