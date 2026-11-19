'use client'

import { useMemo, useState } from 'react'
import type { TrainingProgressResponse, TrainingFilter } from '@/lib/contracts/studentProgress'
import {
  filterTrainingControls,
  selectInitialTrainingFormat,
  trainingRecordsByDistance,
} from '@/lib/utils/studentTrainingProgress'
import { ScrollText, SlidersHorizontal, Trophy } from 'lucide-react'
import { ProgressSummary, progressDate } from './ProgressSummary'
import { StudentProgressSummary } from './StudentProgressSummary'
import { TrainingHistory } from './TrainingHistory'
import { TrainingEvolutionChart } from './TrainingEvolutionChart'

export function TrainingWorkspace({ data, studentView = false }: { data: TrainingProgressResponse; studentView?: boolean }) {
  const initialDistance = data.summary?.reference.summary_distance_m ?? data.assigned_distance_m
  const [distance, setDistance] = useState<number | null>(initialDistance)
  const [format, setFormat] = useState<TrainingFilter['format']>(() =>
    selectInitialTrainingFormat(data.controls, initialDistance)
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
  const records = useMemo(() => studentView ? trainingRecordsByDistance(data.controls) : [], [data.controls, studentView])
  const inputClass =
    'mt-1 min-h-11 w-full min-w-0 rounded-xl border border-line bg-white px-3 text-sm'
  const dateFields = (
    <>
      <label className="min-w-0 text-xs font-semibold text-textsec">
        Desde
        <input aria-label="Desde la fecha" type="date" className={inputClass} value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} />
      </label>
      <label className="min-w-0 text-xs font-semibold text-textsec">
        Hasta
        <input aria-label="Hasta la fecha" type="date" className={inputClass} value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
      </label>
    </>
  )
  return (
    <div className={studentView ? 'space-y-4' : 'space-y-6'}>
      {studentView ? (
        <>
          <StudentProgressSummary summary={data.summary} assignedDistance={data.assigned_distance_m} />
          <div className="flex flex-wrap gap-2">
            {distance !== null && <a href="#progress-history" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-blue-100 bg-white px-3 text-sm font-bold text-[#0758aa] hover:border-blue-300">
              <ScrollText aria-hidden="true" className="size-4" /> Ver historial
            </a>}
            {records.length > 0 && <a href="#progress-records" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-blue-100 bg-white px-3 text-sm font-bold text-[#0758aa] hover:border-blue-300">
              <Trophy aria-hidden="true" className="size-4" /> Récords por distancia
            </a>}
          </div>
        </>
      ) : <ProgressSummary summary={data.summary} assignedDistance={data.assigned_distance_m} />}
      <section
        aria-label="Filtros de controles"
        className={`space-y-3 rounded-2xl border bg-white p-4 md:p-5 ${studentView ? 'border-blue-100' : 'border-line'}`}
      >
        <h2 className="text-lg font-bold">Explorar mis controles</h2>
        <div className={`grid grid-cols-2 gap-3 ${studentView ? '' : 'lg:grid-cols-4'}`}>
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
          {!studentView && dateFields}
        </div>
        {studentView && <details className="rounded-xl border border-blue-100 bg-slate-50 px-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-[#0758aa] [&::-webkit-details-marker]:hidden">
            <SlidersHorizontal aria-hidden="true" className="size-4" /> Más filtros{(from || to) && <span className="ml-auto text-xs">Fechas aplicadas</span>}
          </summary>
          <div className="grid grid-cols-2 gap-3 pb-3">{dateFields}</div>
        </details>}
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
            {!studentView && <p className="text-xs text-textsec">
              Cada punto es un control válido. Los formatos se muestran por separado.
            </p>}
            {(format === 'all' ? ([36, 72] as const) : [format]).map((value) => (
              <TrainingEvolutionChart key={value} controls={rows} format={value} studentDetail={studentView} />
            ))}
          </section>
          <TrainingHistory key={`${distance}:${format}:${from}:${to}`} controls={rows} concise={studentView} />
        </div>
      )}
      {records.length > 0 && (
        <section id="progress-records" className="scroll-mt-4 rounded-2xl border border-blue-100 bg-white p-4" aria-labelledby="progress-records-title">
          <h2 id="progress-records-title" className="flex items-center gap-2 text-lg font-bold text-[#101e3e]">
            <Trophy aria-hidden="true" className="size-5 text-orange-700" /> Récords por distancia
          </h2>
          <p className="mt-1 text-xs text-slate-600">Mejores puntajes de todas las fechas.</p>
          <table className="mt-3 w-full table-fixed text-left text-sm">
            <thead className="border-b border-blue-100 text-xs text-slate-600">
              <tr>
                <th scope="col" className="py-2">Distancia</th>
                <th scope="col" className="py-2">36 flechas</th>
                <th scope="col" className="py-2">72 flechas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-100">
              {records.map(record => <tr key={record.distance}>
                <th scope="row" className="py-2 align-top text-[#101e3e]">{record.distance} m</th>
                {[record.best36, record.best72].map((control, index) => <td key={index} className="py-2 pr-2 align-top">
                  {control ? (
                    <>
                      <p className="font-bold tabular-nums text-[#0758aa]">{control.score} / {control.arrows * 10}</p>
                      <p className="text-xs text-slate-600">{progressDate(control.performed_date)}</p>
                    </>
                  ) : <span className="text-xs text-slate-600">Sin récord</span>}
                </td>)}
              </tr>)}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
