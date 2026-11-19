import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { TrainingEvolutionChart } from '@/components/student/progress/TrainingEvolutionChart'

it('renders a chart with valid initial dimensions before the first resize measurement', () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  try {
    const html = renderToStaticMarkup(
      createElement(TrainingEvolutionChart, {
        format: 36,
        controls: [
          {
            id: 'fixture',
            student_id: 'fixture-student',
            distance: 30,
            arrows: 36,
            score: 280,
            performed_date: '2026-10-01',
            performed_time: null,
            status: 'valid',
            revision: 1,
            created_at: '2026-10-01T18:00:00Z',
            updated_at: '2026-10-01T18:00:00Z',
          },
        ],
      })
    )
    expect(html).toContain('recharts-wrapper')
    expect(warning).not.toHaveBeenCalled()
  } finally {
    warning.mockRestore()
  }
})

it('draws the chart and shows the dated score for a single control in student detail', () => {
  const html = renderToStaticMarkup(createElement(TrainingEvolutionChart, {
    format: 72,
    studentDetail: true,
    controls: [{
      id: 'only', student_id: 'student', distance: 40, arrows: 72, score: 489,
      performed_date: '2026-10-03', performed_time: null, status: 'valid',
      revision: 1, created_at: '', updated_at: '',
    }],
  }))
  expect(html).toContain('489')
  expect(html).toContain('oct.')
  expect(html).toContain('Evolución de 1 control válido de 72 flechas')
  expect(html).toContain('recharts-wrapper')
})
