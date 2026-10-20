import { Flag, BadgeCheck } from 'lucide-react'
import type { CompetitionParticipationView } from '@/lib/utils/studentCompetitionProgress'
import { getCompetitionAward } from '@/lib/utils/studentAchievement'
import { MedalBadge } from './MedalBadge'

const resultLabels: Record<string, string> = {
  official: 'Oficial',
  provisional: 'Provisional',
  dns: 'No tomó la salida',
  dnf: 'No finalizó',
  disqualified: 'Descalificación',
  unknown: 'Estado no documentado',
}

export function CompetitionResultHero({ result }: { result: CompetitionParticipationView }) {
  const award = getCompetitionAward(result)
  const statuses = result.finalStatuses.length ? result.finalStatuses : ['unknown']
  if (award)
    return (
      <div className="relative isolate overflow-hidden bg-[#0a1828] px-4 py-5 text-white min-[360px]:px-5 sm:px-7 sm:py-6">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-24 -z-10 h-72 w-72 rounded-full border-[35px] border-white/[0.035]"
        />
        <div className="flex items-center gap-3 min-[360px]:gap-5 sm:gap-7">
          <MedalBadge award={award} />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">
              Resultado final
            </p>
            <h4
              className={`mt-2 text-sm font-semibold sm:text-base ${award.metal === 'gold' ? 'text-amber-200' : award.metal === 'silver' ? 'text-slate-200' : 'text-orange-200'}`}
            >
              {award.label}
            </h4>
            <p className="mt-1 font-heading text-[clamp(1.75rem,8vw,3.3rem)] font-bold leading-tight tracking-[-0.045em] text-white tabular-nums">{`${award.place}.º puesto`}</p>
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-300">
              <BadgeCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />
              Oficial
            </p>
          </div>
        </div>
      </div>
    )
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-slate-50 px-5 py-5 sm:px-6">
      <div className="flex items-start gap-3">
        <Flag className="mt-1 h-5 w-5 text-slate-400" aria-hidden="true" />
        <div>
          <p className="text-xs font-semibold text-textsec">Posición final</p>
          <p
            className={`mt-1 font-heading font-bold tracking-tight ${result.finalPosition.value !== null && !result.finalPosition.review ? 'text-3xl' : 'text-sm'}`}
          >
            {result.finalPosition.review
              ? 'Posición por revisar'
              : result.finalPosition.value === null
                ? 'No documentada'
                : `${result.finalPosition.value}.º puesto`}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {statuses.map((status) => (
          <span
            key={status}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${status === 'official' ? 'bg-emerald-100 text-emerald-900' : status === 'provisional' ? 'bg-amber-100 text-amber-900' : 'bg-slate-200 text-slate-700'}`}
          >
            {resultLabels[status] || 'Estado no documentado'}
          </span>
        ))}
      </div>
    </div>
  )
}
