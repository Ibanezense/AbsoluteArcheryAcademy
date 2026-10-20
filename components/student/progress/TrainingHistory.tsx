'use client'

import { useState } from 'react'
import type { AcademyControl } from '@/lib/contracts/studentProgress'
import { progressDate } from './ProgressSummary'

export function TrainingHistory({ controls }: { controls: AcademyControl[] }) {
  const [page, setPage] = useState(1)
  const maxPage = Math.max(1, Math.ceil(controls.length / 10))
  const current = Math.min(page, maxPage)
  const rows = controls.slice((current - 1) * 10, current * 10)
  return (
    <section
      id="progress-history"
      className="space-y-4"
      aria-label="Historial de controles filtrado"
    >
      <h2 className="text-lg font-bold">Historial de controles</h2>
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
        {rows.length === 0 && (
          <p className="p-5 text-sm text-textsec">No hay intentos con estos filtros.</p>
        )}
        {rows.map((row) => (
          <article key={row.id} className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold">{progressDate(row.performed_date)}</h3>
                <p className="mt-1 text-xs text-textsec">
                  {row.performed_time || 'Hora desconocida'} · {row.distance} m · {row.arrows}{' '}
                  flechas
                </p>
              </div>
              <p
                className={`shrink-0 font-bold tabular-nums ${row.status === 'annulled' ? 'text-textsec line-through' : 'text-textpri'}`}
              >
                {row.score}
                <span className="text-xs font-normal text-textsec"> / {row.arrows * 10}</span>
              </p>
            </div>
            {row.status === 'annulled' && (
              <p className="mt-2 text-xs font-semibold text-amber-800">
                Anulado · no cuenta para mejores marcas ni gráfica
              </p>
            )}
          </article>
        ))}
      </div>
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
          <span className="text-xs text-textsec" aria-live="polite">
            Página {current} de {maxPage}
          </span>
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
      <p className="text-xs leading-relaxed text-textsec">
        Las horas desconocidas no determinan el orden deportivo de los intentos de un mismo día. Las
        correcciones y anulaciones se reflejan desde el registro de la academia.
      </p>
    </section>
  )
}
