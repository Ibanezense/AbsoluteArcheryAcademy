import { Target, Trophy, CalendarClock } from 'lucide-react'
import { StudentCard } from '@/components/student/StudentCard'
import type { AcademyControl, TrainingSummary } from '@/lib/contracts/studentProgress'

export function progressDate(date: string) {
  return new Intl.DateTimeFormat('es-PE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`))
}
export function ProgressSummary({
  summary,
  assignedDistance,
}: {
  summary: TrainingSummary | null
  assignedDistance: number | null
}) {
  const reference = summary?.reference
  const discrepancy = reference && ['discrepant', 'uncertain'].includes(reference.kind)
  return (
    <section aria-label="Resumen de entrenamiento" className="space-y-4">
      <StudentCard className="overflow-hidden p-5 md:p-6">
        <div className="flex items-center gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-orange-50 text-accent">
            <Target className="h-8 w-8" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-textsec">
              {reference?.kind === 'current'
                ? 'Distancia actual de entrenamiento'
                : assignedDistance === null
                  ? 'Distancia pendiente de confirmar'
                  : 'Distancia asignada'}
            </h2>
            <p className="mt-1 text-3xl font-bold tracking-tight">
              {assignedDistance === null ? 'Por asignar' : `${assignedDistance} m`}
            </p>
          </div>
        </div>
        {discrepancy && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-bold">Pendiente de revisión</p>
            <p className="mt-1">
              {reference.kind === 'uncertain'
                ? 'No podemos confirmar el orden de los últimos controles.'
                : 'La distancia asignada no coincide con el último control registrado.'}{' '}
              Últimos controles: {reference.latest_distances_m.map((d) => `${d} m`).join(' y ')}
              {reference.latest_date ? ` · ${progressDate(reference.latest_date)}` : ''}.
            </p>
            <p className="mt-1">
              Puedes consultar todo tu historial. La academia revisará la asignación.
            </p>
          </div>
        )}
        {assignedDistance !== null && (
          <p className="mt-4 text-xs leading-relaxed text-textsec">
            El resumen muestra tus controles válidos a {assignedDistance} m en todas las fechas. Los
            filtros de abajo solo cambian la gráfica y el historial.
          </p>
        )}
      </StudentCard>
      {summary?.last_control && assignedDistance === null && (
        <div className="space-y-2">
          <ScoreCard
            title={
              summary.last_order_uncertain
                ? 'Registro histórico de la última fecha'
                : 'Último control histórico'
            }
            control={summary.last_control}
            empty=""
            icon="calendar"
            showTime
          />
          <p className="text-xs text-textsec">
            {summary.last_control.distance} m · Referencia histórica. La academia debe confirmar tu
            distancia de entrenamiento.
            {summary.last_order_uncertain
              ? ' El orden de los controles de ese día es incierto.'
              : ''}
          </p>
        </div>
      )}
      {summary && assignedDistance !== null && (
        <div className="grid gap-3 sm:grid-cols-3">
          <ScoreCard
            title={summary.last_order_uncertain ? 'Último registro de esa fecha' : 'Último control'}
            control={summary.last_control}
            icon="calendar"
            empty="Sin controles en esta distancia"
            showTime
          />
          <ScoreCard
            title="Mejor marca · 36 flechas"
            control={summary.best_36}
            empty="Sin controles de 36 flechas"
          />
          <ScoreCard
            title="Mejor marca · 72 flechas"
            control={summary.best_72}
            empty="Sin controles de 72 flechas"
          />
        </div>
      )}
    </section>
  )
}
function ScoreCard({
  title,
  control,
  empty,
  icon = 'trophy',
  showTime = false,
}: {
  title: string
  control: AcademyControl | null
  empty: string
  icon?: 'calendar' | 'trophy'
  showTime?: boolean
}) {
  const Icon = icon === 'calendar' ? CalendarClock : Trophy
  return (
    <StudentCard className="p-4 md:p-5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-textsec">{title}</h3>
        <Icon className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
      </div>
      {control ? (
        <>
          <p className="mt-3 font-bold tabular-nums">
            <span className="text-3xl tracking-tight">{control.score}</span>
            <span className="ml-1 text-base text-textsec">/ {control.arrows * 10}</span>
          </p>
          <p className="mt-1 text-xs font-semibold text-accent">{control.arrows} flechas</p>
          <p className="mt-3 text-xs text-textsec">
            {progressDate(control.performed_date)}
            {showTime ? ` · ${control.performed_time || 'Hora desconocida'}` : ''}
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm text-textsec">{empty}</p>
      )}
    </StudentCard>
  )
}
