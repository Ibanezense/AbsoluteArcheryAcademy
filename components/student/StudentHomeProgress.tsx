'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ChevronRight, Target } from 'lucide-react'
import { StudentCard } from '@/components/student/StudentCard'
import { useStudentProgress } from '@/lib/hooks/useStudentProgress'
import type { AcademyControl } from '@/lib/contracts/studentProgress'
import { progressDate } from '@/components/student/progress/ProgressSummary'
import { TrainingEvolutionChart } from '@/components/student/progress/TrainingEvolutionChart'
import { selectInitialTrainingFormat } from '@/lib/utils/studentTrainingProgress'

function score(control: AcademyControl) {
  return `${control.score} / ${control.arrows * 10}`
}

export function StudentHomeProgress({ accountId, studentId }: { accountId: string; studentId: string }) {
  const query = useStudentProgress(accountId, studentId, true)
  const result = query.data?.student_id === studentId ? query.data : undefined
  const distance = result?.assigned_distance_m
  const summary = result?.summary
  const recordDistance = summary?.reference.summary_distance_m ?? distance ?? null
  const previousDistance = summary?.reference.kind === 'previous'
  const last = summary?.last_control
  const assignedControl = last && last.distance === distance ? last : null
  const assignedControls = result?.controls.filter(control =>
    control.distance === distance && control.status === 'valid'
  ) ?? []

  return (
    <StudentCard className="p-4 sm:p-5">
      <section aria-labelledby="student-home-progress-title">
        <h2 id="student-home-progress-title" className="flex items-center gap-2 text-lg font-bold text-[#101e3e]">
          <Target aria-hidden="true" className="h-5 w-5 text-[#0758aa]" /> Mi progreso
        </h2>
        {query.isPending ? <p role="status" className="py-4 text-sm text-slate-600">Cargando controles…</p>
          : query.isError || !result || result.state === 'unavailable' ? (
            <p role="alert" className="py-4 text-sm text-slate-600">
              No pudimos cargar tus controles.{' '}
              <button type="button" onClick={() => void query.refetch()} className="font-semibold text-[#0758aa] underline">Reintentar</button>
            </p>
          ) : result?.state === 'pending_link' ? (
            <p className="py-4 text-sm text-slate-600">Tus controles aparecerán cuando la academia vincule tu registro.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {distance != null && assignedControls.length > 0 && (
                <HomeControlsChart key={`${studentId}:${distance}`} controls={assignedControls} distance={distance} />
              )}
              <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
                <p className="text-sm font-semibold text-[#101e3e]">Último control{distance != null ? ` · ${distance} m` : ''}</p>
                {assignedControl && summary && !summary.last_order_uncertain ? (
                  <><p className="mt-1 text-2xl font-bold tabular-nums text-accent">{score(assignedControl)}</p>
                  <p className="text-xs text-slate-600">{assignedControl.arrows} flechas · {progressDate(assignedControl.performed_date)}</p></>
                ) : <p className="mt-1 text-sm text-slate-600">
                  {distance == null ? 'Tu distancia está pendiente de asignación.'
                    : assignedControl ? 'Hay varios controles y su orden está por confirmar.'
                    : `Aún no hay controles a ${distance} m.`}
                </p>}
              </div>
              {recordDistance != null && <div>
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
                  <h3 className="text-sm font-bold">Récords personales</h3>
                  <span className="text-xs font-semibold text-slate-600">{recordDistance} m{previousDistance && ' · Distancia anterior'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {([36, 72] as const).map(arrows => {
                    const record = arrows === 36 ? summary?.best_36 : summary?.best_72
                    return <div key={arrows} className="rounded-lg border border-blue-100 bg-white p-2.5">
                      <p className="text-xs font-medium text-slate-600">{arrows} flechas</p>
                      <p className={record ? 'mt-1 text-lg font-bold tabular-nums text-[#084681]' : 'mt-1 text-xs text-slate-600'}>
                        {record ? score(record) : `Sin récord de ${arrows} flechas`}
                      </p>
                    </div>
                  })}
                </div>
              </div>}
            </div>
          )}
        <Link href="/mi-progreso" className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-bold text-[#0758aa] hover:underline">
          Historial y récords por distancia <ChevronRight aria-hidden="true" size={16} />
        </Link>
      </section>
    </StudentCard>
  )
}

function HomeControlsChart({ controls, distance }: { controls: AcademyControl[]; distance: number }) {
  const [selectedFormat, setSelectedFormat] = useState<36 | 72 | null>(null)
  const format = selectedFormat ?? selectInitialTrainingFormat(controls, distance)

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold">Evolución a {distance} m</h3>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-blue-50 p-1" role="group" aria-label="Formato de los controles">
        {([36, 72] as const).map(arrows => (
          <button
            key={arrows}
            type="button"
            aria-pressed={format === arrows}
            onClick={() => setSelectedFormat(arrows)}
            className={`min-h-11 rounded-lg px-2 text-sm font-semibold ${format === arrows ? 'bg-[#0758aa] text-white' : 'text-[#0758aa]'}`}
          >
            {arrows} flechas
          </button>
        ))}
      </div>
      <TrainingEvolutionChart controls={controls} format={format} compact />
    </div>
  )
}
