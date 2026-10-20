'use client'

import { useMemo, useState } from 'react'
import type { TrainingProgressResponse, TrainingFilter } from '@/lib/contracts/studentProgress'
import {
  filterTrainingControls,
  selectInitialTrainingFormat,
} from '@/lib/utils/studentTrainingProgress'
import { ProgressSummary } from './ProgressSummary'
import { TrainingHistory } from './TrainingHistory'
import { TrainingEvolutionChart } from './TrainingEvolutionChart'

export function TrainingWorkspace({ data }: { data: TrainingProgressResponse }) {
  const [distance, setDistance] = useState<number | null>(data.assigned_distance_m)
  const [format, setFormat] = useState<TrainingFilter['format']>(() =>
    selectInitialTrainingFormat(data.controls, data.assigned_distance_m)
  )
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const distances = Array.from(
    new Set([
      ...data.controls.map((row) => row.distance),
      ...(data.assigned_distance_m === null ? [] : [data.assigned_distance_m]),
    ])
  ).sort((a, b) => a - b)
  const invalidRange = !!from && !!to && from > to
  const rows = useMemo(
    () =>
      invalidRange ? [] : filterTrainingControls(data.controls, { distance, format, from, to }),
    [data.controls, distance, format, from, to, invalidRange]
  )
  const validCount = rows.filter((row) => row.status === 'valid').length
  const inputClass =
    'mt-1 min-h-11 w-full min-w-0 rounded-xl border border-line bg-white px-3 text-sm'
  return (
    <div className="space-y-6">
      <ProgressSummary summary={data.summary} assignedDistance={data.assigned_distance_m} />
      <section
        aria-label="Filtros de controles"
        className="space-y-3 rounded-2xl border border-line bg-white p-4 md:p-5"
      >
        <h2 className="text-lg font-bold">Explorar mis controles</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <label className="min-w-0 text-xs font-semibold text-textsec">
            Distancia
            <select
              aria-label="Distancia de los controles"
              className={inputClass}
              value={distance ?? ''}
              onChange={(event) => {
                const next = event.target.value ? Number(event.target.value) : null
                setDistance(next)
                setFormat(selectInitialTrainingFormat(data.controls, next))
              }}
            >
              <option value="" disabled>
                Seleccionar distancia
              </option>
              {distances.map((value) => (
                <option key={value} value={value}>
                  {value} m
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 text-xs font-semibold text-textsec">
            Formato
            <select
              aria-label="Cantidad de flechas"
              className={inputClass}
              value={format}
              onChange={(event) =>
                setFormat(
                  event.target.value === 'all' ? 'all' : (Number(event.target.value) as 36 | 72)
                )
              }
            >
              <option value={36}>36 flechas</option>
              <option value={72}>72 flechas</option>
              <option value="all">Ambos formatos</option>
            </select>
          </label>
          <label className="min-w-0 text-xs font-semibold text-textsec">
            Desde
            <input
              aria-label="Desde la fecha"
              type="date"
              className={inputClass}
              value={from}
              max={to || undefined}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label className="min-w-0 text-xs font-semibold text-textsec">
            Hasta
            <input
              aria-label="Hasta la fecha"
              type="date"
              className={inputClass}
              value={to}
              min={from || undefined}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-textsec">
          <p>
            {!from && !to ? 'Todas las fechas' : 'Rango de fechas seleccionado'} · {rows.length}{' '}
            {rows.length === 1 ? 'intento' : 'intentos'} · {validCount}{' '}
            {validCount === 1 ? 'válido' : 'válidos'}
          </p>
          {(from || to) && (
            <button
              type="button"
              className="min-h-11 font-semibold text-accent"
              onClick={() => {
                setFrom('')
                setTo('')
              }}
            >
              Todas las fechas
            </button>
          )}
        </div>
        {invalidRange && (
          <p role="alert" className="text-sm text-danger">
            La fecha Desde debe ser anterior o igual a Hasta.
          </p>
        )}
      </section>
      {distance === null ? (
        <p className="rounded-xl bg-orange-50 p-4 text-sm text-textsec">
          Selecciona una distancia para explorar tu evolución. Esto no modifica tu asignación de
          entrenamiento.
        </p>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <section aria-label="Gráfica de evolución" className="space-y-3">
            <h2 className="text-lg font-bold">Evolución a {distance} m</h2>
            <p className="text-xs text-textsec">
              Cada punto es un control válido. Los formatos se muestran por separado.
            </p>
            {(format === 'all' ? ([36, 72] as const) : [format]).map((value) => (
              <TrainingEvolutionChart key={value} controls={rows} format={value} />
            ))}
          </section>
          <TrainingHistory key={`${distance}:${format}:${from}:${to}`} controls={rows} />
        </div>
      )}
    </div>
  )
}
