'use client'

import {
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts'
import type { AcademyControl } from '@/lib/contracts/studentProgress'
import { progressDate } from './ProgressSummary'

export function TrainingEvolutionChart({
  controls,
  format,
  compact = false,
  studentDetail = false,
}: {
  controls: AcademyControl[]
  format: 36 | 72
  compact?: boolean
  studentDetail?: boolean
}) {
  const rows = controls.filter((row) => row.status === 'valid' && row.arrows === format)
  const only = studentDetail && rows.length === 1 ? rows[0] : null
  const data = rows.map((row) => ({ ...row, day: Date.parse(`${row.performed_date}T12:00:00Z`) }))
  const days = data.map((row) => row.day)
  const min = Math.min(...days)
  const max = Math.max(...days)
  const chartHeight = compact ? 170 : studentDetail ? 200 : 250
  return (
    <div className={compact ? 'min-w-0' : 'rounded-2xl border border-line bg-white p-4'}>
      {!compact && <h3 className="text-sm font-bold">
        {format} flechas <span className="font-normal text-textsec">· máximo {format * 10}</span>
      </h3>}
      {only && (
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-xl font-bold tabular-nums text-[#0758aa]">{only.score} <span className="text-sm font-medium text-textsec">/ {format * 10}</span></p>
          <p className="text-xs text-textsec">{progressDate(only.performed_date)}</p>
        </div>
      )}
      {data.length ? (
        <div
          className={compact ? 'h-[170px] w-full min-w-0' : studentDetail ? 'mt-3 h-[200px] w-full min-w-0' : 'mt-4 h-[250px] w-full min-w-0'}
          role="img"
          aria-label={`Evolución de ${rows.length} ${rows.length === 1 ? 'control válido' : 'controles válidos'} de ${format} flechas. Puntajes entre 0 y ${format * 10}. Consulta los valores en el historial.`}
        >
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            initialDimension={{ width: 300, height: chartHeight }}
          >
            <ScatterChart margin={{ left: -18, right: 12, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="day"
                type="number"
                domain={[min === max ? min - 86400000 : min, min === max ? max + 86400000 : max]}
                tickFormatter={(value) =>
                  new Intl.DateTimeFormat('es-PE', {
                    day: 'numeric',
                    month: 'short',
                    timeZone: 'UTC',
                  }).format(new Date(value))
                }
                tick={{ fontSize: 11 }}
                minTickGap={24}
              />
              <YAxis
                dataKey="score"
                type="number"
                domain={[0, format * 10]}
                tick={{ fontSize: 11 }}
                width={48}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]?.payload) return null
                  const item = payload[0].payload as (typeof data)[number]
                  const same = rows.filter(
                    (row) => row.performed_date === item.performed_date && row.score === item.score
                  )
                  return (
                    <div className="max-w-[250px] rounded-xl border border-line bg-white p-3 text-xs shadow-lg">
                      <p className="font-bold">
                        {progressDate(item.performed_date)} · {item.score}/{format * 10}
                      </p>
                      <p className="mt-1">
                        {same.length} {same.length === 1 ? 'intento' : 'intentos'} en este punto
                      </p>
                      {same.map((row) => (
                        <p className="mt-1" key={row.id}>
                          {row.performed_time || 'Hora desconocida'}
                        </p>
                      ))}
                    </div>
                  )
                }}
              />
              <Scatter
                data={data}
                fill={format === 36 ? '#ea580c' : '#0369a1'}
                isAnimationActive={false}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="py-8 text-sm text-textsec">
          Sin controles válidos de {format} flechas{compact ? ' a esta distancia.' : ' con estos filtros.'}
        </p>
      )}
      {!compact && !studentDetail && <a
        href="#progress-history"
        className="mt-2 inline-flex min-h-11 items-center text-xs font-semibold text-accent"
      >
        Consultar los valores en el historial
      </a>}
    </div>
  )
}
