'use client'

import { useMemo, useState } from 'react'
import { Trophy } from 'lucide-react'
import type { AcademyCompetitionSnapshot } from '@/lib/contracts/studentCompetitions'
import {
  projectCompetitionTournaments,
  type CompetitionParticipationView,
  type CompetitionPosition,
} from '@/lib/utils/studentCompetitionProgress'
import { progressDate } from './ProgressSummary'
import { CompetitionResultHero } from './CompetitionResultHero'

const participationLabels: Record<string, string> = {
  entered: 'Inscripción registrada',
  started: 'En curso',
  finished: 'Finalizada',
  dns: 'No tomó la salida',
  dnf: 'No finalizó',
  disqualified: 'Descalificación',
  unknown: 'Estado no documentado',
}
function Position({ value, label }: { value: CompetitionPosition; label: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-textsec">{label}</p>
      <p className="mt-1 text-sm font-bold">
        {value.review
          ? 'Posición por revisar'
          : value.value === null
            ? 'No documentada'
            : value.value}
      </p>
    </div>
  )
}
function standingLabel(result: CompetitionParticipationView, index: number) {
  const scope = result.competitionScope === 'national' ? 'Nacional' : result.competitionScope === 'open' ? 'Open' : `Resultado ${index + 1} · Ámbito no documentado`
  return `${result.categoryLabel} · ${scope}`
}
export function CompetitionHistory({ datasets }: { datasets: AcademyCompetitionSnapshot[] }) {
  const cards = useMemo(() => projectCompetitionTournaments(datasets), [datasets])
  const [page, setPage] = useState(1)
  const maxPage = Math.max(1, Math.ceil(cards.length / 10))
  const current = Math.min(page, maxPage)
  return (
    <section aria-label="Historial de competencias individuales" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">Mis competencias</h2>
        <p className="text-xs text-textsec">
          {cards.length}{' '}
          {cards.length === 1 ? 'torneo verificado' : 'torneos verificados'}
        </p>
      </div>
      {cards.length === 0 && (
        <p className="rounded-xl border border-line bg-white p-5 text-sm text-textsec">
          No hay participaciones vigentes entre los registros verificados.
        </p>
      )}
      {cards.slice((current - 1) * 10, current * 10).map((card) => {
        const results = card.participations.filter(result => result.finalPosition.value !== null || result.finalPosition.review || result.finalStatuses.length > 0)
        const qualifications = card.participations.flatMap(result => result.qualifications.map(row => ({ row, result })))
        const statuses = Array.from(new Set(card.participations.map(result => participationLabels[result.participationStatus] || participationLabels.unknown)))
        return (
          <article
            key={card.key}
            className="overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-[0_10px_32px_-18px_rgba(15,23,42,0.22)]"
          >
            <div className="flex gap-3 p-5 md:p-6">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-accent">
                <Trophy className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-bold leading-snug sm:text-lg">{card.eventName}</h3>
                <p className="mt-1 text-sm font-medium text-textsec">{card.categoryLabels.join(' · ') || 'Categoría no documentada'}</p>
                <p className="mt-2 text-xs text-textsec">
                  Fecha del evento:{' '}
                  {card.eventStart ? progressDate(card.eventStart) : 'No documentada'}
                  {card.eventEnd && card.eventEnd !== card.eventStart
                    ? ` al ${progressDate(card.eventEnd)}`
                    : ''}
                </p>
              </div>
            </div>
            {(results.length ? results : [card.participations[0]]).map((result, index) => (
              <div key={result.key}>
                {(results.length > 1 || result.competitionScope !== 'unknown') && (
                  <h4 className="border-t border-line bg-slate-100 px-5 py-3 text-sm font-bold sm:px-6">
                    {standingLabel(result, index)}
                  </h4>
                )}
                <CompetitionResultHero result={result} />
              </div>
            ))}
            <div className="space-y-4 p-5 md:p-6">
              <div className="space-y-3">
                <h4 className="text-sm font-bold">Clasificación</h4>
                {qualifications.length ? (
                  qualifications.map(({ row, result }, index) => (
                    <div
                      key={`${result.key}:${row.id}`}
                      className="rounded-xl border border-line bg-slate-50/70 p-3 sm:p-4"
                    >
                      {(qualifications.length > 1 || result.competitionScope !== 'unknown' || card.categoryLabels.length > 1) && (
                        <p className="mb-2 text-xs font-semibold text-textsec">
                          {result.categoryLabel} · {result.competitionScope === 'unknown' ? `Registro ${index + 1}` : result.competitionScope === 'national' ? 'Nacional' : 'Open'}
                        </p>
                      )}
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-bold tabular-nums">
                            {row.score === null ? (
                              <span className="text-sm text-textsec">
                                Puntaje no documentado
                              </span>
                            ) : (
                              <>
                                <span className="text-3xl tracking-tight">{row.score}</span>
                                <span className="ml-1 text-xs font-medium text-textsec">
                                  puntos
                                </span>
                              </>
                            )}
                          </p>
                          <p className="mt-1 text-xs text-textsec">
                            {row.arrows === null
                              ? 'Cantidad de flechas no documentada'
                              : `${row.arrows} flechas`}
                          </p>
                        </div>
                        <Position value={row.position} label="Posición de clasificación" />
                      </div>
                      <p className="mt-3 text-xs text-textsec">
                        Distancia:{' '}
                        {row.distances.length
                          ? row.distances.map((value) => `${value} m`).join(' y ')
                          : 'No documentada'}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-textsec">Sin puntaje de clasificación publicado.</p>
                )}
              </div>
              <p className="border-t border-line pt-3 text-xs text-textsec">{`Participación: ${statuses.join(' · ')}`}</p>
            </div>
          </article>
        )
      })}
      {maxPage > 1 && (
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            className="btn-outline min-h-11"
            disabled={current === 1}
            onClick={() => setPage(current - 1)}
          >
            Anterior
          </button>
          <p className="text-xs text-textsec" aria-live="polite">
            Página {current} de {maxPage}
          </p>
          <button
            type="button"
            className="btn-outline min-h-11"
            disabled={current === maxPage}
            onClick={() => setPage(current + 1)}
          >
            Siguiente
          </button>
        </div>
      )}
    </section>
  )
}
