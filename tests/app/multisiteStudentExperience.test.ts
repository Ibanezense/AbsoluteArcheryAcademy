import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('multisite student experience', () => {
  it('shows the weekly schedule and location details on student home', () => {
    expect(source('app/page.tsx')).toContain('StudentWeekOverview')
    const overview = source('components/student/StudentWeekOverview.tsx')
    expect(overview).toContain('Mi semana')
    expect(overview).toContain('Horario fijo')
    expect(overview).toContain('Reserva flexible')
    expect(overview).toContain('recuperación')
    expect(overview).toContain('location_name')
    expect(overview).toContain('location_address')
  })

  it('uses a weekly Tiabaya agenda without membership-card selection', () => {
    const bookingPage = source('app/reservar/page.tsx')
    expect(bookingPage).toContain('Agenda semanal')
    expect(bookingPage).toContain('Tiabaya')
    expect(bookingPage).toContain('Reservar este turno')
    expect(bookingPage).not.toContain('Calendario de turnos')
    expect(bookingPage).not.toContain('<ClassCardsBoard')
    expect(bookingPage).toContain('book_session_multisite')
  })

  it('labels student cancellations as pending administrative review', () => {
    const reservations = source('app/mis-reservas/page.tsx')
    expect(reservations).toContain('Cancelación pendiente de revisión')
    expect(reservations).toContain('La cancelación liberará el cupo')
    expect(reservations).toContain('Cancelar reserva')
  })
})
