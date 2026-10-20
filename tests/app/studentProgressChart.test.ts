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
