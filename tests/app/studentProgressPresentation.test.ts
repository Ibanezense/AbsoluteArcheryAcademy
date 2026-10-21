import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
vi.mock('@/components/student/progress/TrainingEvolutionChart', () => ({
  TrainingEvolutionChart: () => createElement('div', null, 'Gráfica'),
}))
import { ProgressSummary } from '@/components/student/progress/ProgressSummary'
import { TrainingWorkspace } from '@/components/student/progress/TrainingWorkspace'
import { ProgressSourceState } from '@/components/student/progress/ProgressSourceState'
import { summarizeTrainingControls } from '@/lib/utils/studentTrainingProgress'
const row = (id: string, score: number, date: string, extra = {}) => ({
  id,
  student_id: 'source',
  distance: 30,
  arrows: 36,
  score,
  performed_date: date,
  performed_time: null,
  status: 'valid',
  revision: 1,
  created_at: `${date}T16:00:00Z`,
  updated_at: `${date}T16:00:00Z`,
  ...extra,
})

describe('student progress presentation', () => {
  it('shows a dated historical last control without assigning its distance', () => {
    const controls = [row('historical', 299, '2026-10-01', { distance: 20 })]
    const html = renderToStaticMarkup(
      createElement(ProgressSummary, {
        summary: summarizeTrainingControls(controls as any, null),
        assignedDistance: null,
      })
    )
    expect(html).toContain('Último control histórico')
    expect(html).toContain('299')
    expect(html).toContain('20 m')
    expect(html).toContain('Por asignar')
    expect(html).not.toContain('Distancia actual de entrenamiento')
  })
  it('shows last and best as different scores with their own format', () => {
    const controls = [row('best', 305, '2026-09-01'), row('last', 280, '2026-10-01')]
    const html = renderToStaticMarkup(
      createElement(ProgressSummary, {
        summary: summarizeTrainingControls(controls as any, 30),
        assignedDistance: 30,
      })
    )
    expect(html).toContain('Último control')
    expect(html).toContain('280')
    expect(html).toContain('305')
    expect(html).toContain('Sin controles de 72 flechas')
  })
  it('does not label an unsupported assigned distance as current', () => {
    const summary = summarizeTrainingControls(
      [row('other', 280, '2026-10-01', { distance: 20 })] as any,
      30
    )
    const html = renderToStaticMarkup(
      createElement(ProgressSummary, { summary, assignedDistance: 30 })
    )
    expect(html).toContain('Distancia asignada')
    expect(html).toContain('Aún no tienes controles válidos a 30 m')
    expect(html).toContain('Distancia anterior')
    expect(html).toContain('280')
    expect(html).not.toContain('Distancia actual de entrenamiento')
  })
  it('distinguishes unlinked, empty and unavailable without false zeroes', () => {
    const markup = (state: 'pending_link' | 'empty' | 'unavailable') =>
      renderToStaticMarkup(createElement(ProgressSourceState, { state, onRetry: () => undefined }))
    expect(markup('pending_link')).toContain('vinculados')
    expect(markup('empty')).toContain('Aún no tienes controles')
    expect(markup('unavailable')).toContain('No pudimos consultar')
    expect(markup('unavailable')).not.toContain('Sin controles')
  })
  it('keeps annulled attempts readable and excludes them from valid totals', () => {
    const controls = [
      row('best', 305, '2026-09-01'),
      row('void', 340, '2026-10-01', { status: 'annulled' }),
    ]
    const data = {
      state: 'ready',
      student_id: 'student',
      assigned_distance_m: 30,
      assignment_checked_at: '2026-10-19T15:00:00Z',
      link_revision: 1,
      checked_at: '2026-10-19T15:00:00Z',
      controls,
      summary: summarizeTrainingControls(controls as any, 30),
    }
    const html = renderToStaticMarkup(createElement(TrainingWorkspace, { data: data as any }))
    expect(html).toContain('Anulado')
    expect(html).toContain('2 intentos')
    expect(html).toContain('1 válido')
    expect(html).toContain('Todas las fechas')
    expect(html).not.toContain('Competencias')
  })
})
