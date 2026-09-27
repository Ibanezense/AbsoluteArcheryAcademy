import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('immediate cancellation experience', () => {
  it('tells the student that cancellation immediately frees the class credit', () => {
    const reservations = source('app/mis-reservas/page.tsx')

    expect(reservations).toContain('liberará el cupo y el crédito inmediatamente')
    expect(reservations).toContain('Reserva cancelada. El crédito está disponible nuevamente.')
    expect(reservations).not.toContain('pendiente de revisión')
  })

  it('does not expose cancellation resolution controls in the weekly attendance review', () => {
    const review = source('components/admin/WeeklyAttendanceReview.tsx')
    const page = source('app/admin/asistencia/page.tsx')

    expect(review).not.toContain('onResolveCancellation')
    expect(review).not.toContain('Justificar cancelación')
    expect(page).not.toContain('resolveStudentCancellation')
  })

  it('does not show pending cancellation notices in the student week overview', () => {
    const overview = source('components/student/StudentWeekOverview.tsx')

    expect(overview).not.toContain('pending_cancellations')
    expect(overview).not.toContain('Cancelación pendiente de revisión')
  })
})
