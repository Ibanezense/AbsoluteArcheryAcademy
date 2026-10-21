import { Target, Trophy, CalendarClock, Sparkles } from 'lucide-react'
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
  const recordDistance = reference?.summary_distance_m === undefined ? assignedDistance : reference.summary_distance_m
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
            <p className="mt-1 font-heading text-5xl font-bold leading-none tracking-tight">
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
              Últimos controles:{' '}
              {reference.latest_distances_m.map((d) => `${d} m`).join(' y ')}
              {reference.latest_date ? ` · ${progressDate(reference.latest_date)}` : ''}.
            </p>
            <p className="mt-1">
              Puedes consultar todo tu historial. La academia revisará la asignación.
            </p>
          </div>
        )}
        {reference?.kind === 'previous' && (
          <p className="mt-4 rounded-xl border border-orange-100 bg-orange-50 p-3 text-sm leading-6 text-orange-900">
            Aún no tienes controles válidos a {assignedDistance} m. Conservamos tus récords a {recordDistance} m hasta que registres tu primer puntaje en la distancia actual.
          </p>
        )}
        {recordDistance !== null && (
          <p className="mt-4 text-xs leading-relaxed text-textsec">
            El resumen muestra tus controles válidos a {recordDistance} m en todas las
            fechas. Los filtros de abajo solo cambian la gráfica y el historial.
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
            {summary.last_control.distance} m · Referencia histórica. La academia debe
            confirmar tu distancia de entrenamiento.
            {summary.last_order_uncertain
              ? ' El orden de los controles de ese día es incierto.'
              : ''}
          </p>
        </div>
      )}
      {summary && recordDistance !== null && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 px-1">
            <h2 className="text-base font-bold">Tus récords personales</h2>
            <span className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-textsec">
              {recordDistance} m{reference?.kind === 'previous' ? ' · Distancia anterior' : ''}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
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
          <ScoreCard
            title={
              summary.last_order_uncertain ? 'Último registro de esa fecha' : 'Último control'
            }
            control={summary.last_control}
            icon="calendar"
            empty="Sin controles en esta distancia"
            showTime
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
  if (icon === 'trophy') return <RecordCard title={title} control={control} empty={empty} />
  return (
    <StudentCard className="flex flex-wrap items-center justify-between gap-4 p-4 md:p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">
          <CalendarClock className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
          {control && (
            <p className="mt-1 text-xs text-textsec">
              {progressDate(control.performed_date)}
              {showTime ? ` · ${control.performed_time || 'Hora desconocida'}` : ''}
            </p>
          )}
        </div>
      </div>
      {control ? (
        <div className="ml-auto text-right">
          <p className="font-bold tabular-nums">
            <span className="text-2xl tracking-tight">{control.score}</span>
            <span className="ml-1 text-sm font-medium text-textsec">
              / {control.arrows * 10}
            </span>
          </p>
          <p className="mt-1 text-xs text-textsec">{control.arrows} flechas</p>
        </div>
      ) : (
        <p className="mt-4 text-sm text-textsec">{empty}</p>
      )}
    </StudentCard>
  )
}

function RecordCard({
  title,
  control,
  empty,
}: {
  title: string
  control: AcademyControl | null
  empty: string
}) {
  if (!control)
    return (
      <div className="flex min-h-[230px] flex-col rounded-[1.35rem] border border-dashed border-slate-300 bg-white/60 p-4 sm:p-5">
        <h3 className="text-xs font-semibold leading-relaxed text-textsec">{title}</h3>
        <Target className="my-5 h-7 w-7 text-slate-300" aria-hidden="true" />
        <p className="text-sm font-medium text-slate-600">{empty}</p>
        <p className="mt-2 text-xs leading-relaxed text-textsec">
          Tu primera marca quedará aquí.
        </p>
      </div>
    )
  return (
    <article
      aria-label={title}
      className="sport-dark relative isolate overflow-hidden rounded-2xl border border-slate-700 p-5 text-white shadow-soft sm:p-6"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 top-0 -z-10 h-full w-40 -skew-x-[20deg] border-x-[16px] border-white/[0.035]"
      />
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-orange-200 sm:text-[10px]">
            <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />
            Récord personal
          </p>
          <h3 className="mt-2 font-sans text-sm font-semibold text-white sm:text-base">
            {control.arrows} flechas
          </h3>
        </div>
        <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full border border-orange-300/30 bg-orange-300/10 text-orange-200 sm:flex">
          <Trophy className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-5 font-heading text-[clamp(3.5rem,16vw,6rem)] font-bold leading-none tracking-tight text-white tabular-nums">
        {control.score}
      </p>
      <p className="mt-2 text-xs text-slate-300">de {control.arrows * 10} puntos</p>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-white/15 pt-3">
        <p className="text-[11px] text-slate-300 sm:text-xs">
          {progressDate(control.performed_date)}
        </p>
        <span className="text-[11px] font-semibold text-orange-200">{control.distance} m</span>
      </div>
    </article>
  )
}
