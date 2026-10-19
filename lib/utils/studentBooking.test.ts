import { describe, expect, it } from 'vitest'
import { bookingEligibilityMessage, bookingModeLabel, bookingConfirmationText, limaBookingDate, bookingCancellationLabel } from './studentBooking'

describe('student booking presentation', () => {
  it('does not offer renewal for equipment, quota or freezes', () => {
    expect(bookingEligibilityMessage('membership_dates')).toContain('renovar')
    expect(bookingEligibilityMessage('weekly_limit')).toContain('semanal')
    expect(bookingEligibilityMessage('frozen')).toContain('congelada')
    expect(bookingEligibilityMessage('capacity', 'Arco no disponible')).toBe('Arco no disponible')
  })
  it('translates internal modes without leaking ownbow', () => {
    expect(bookingModeLabel('ownbow')).toBe('Clase con arco propio')
    expect(bookingModeLabel('assigned')).toBe('Clase con arco asignado')
    expect(bookingModeLabel('children')).toBe('Clase infantil')
    expect(bookingModeLabel('unknown')).toBe('Clase regular')
  })
  it('shows known cancellation sources and keeps missing sources unknown', () => {
    expect(bookingCancellationLabel('day_end', null)).toContain('asistencia no registrada')
    expect(bookingCancellationLabel('membership_expiry', null)).toContain('vencimiento')
    expect(bookingCancellationLabel(null, null)).toBeNull()
    expect(bookingCancellationLabel('student', 'no_show')).toContain('Inasistencia')
  })
  it('groups a UTC next-day session into its Lima calendar day', () => {
    expect(limaBookingDate('2026-10-20T01:00:00Z').format('YYYY-MM-DD HH:mm')).toBe('2026-10-19 20:00')
  })
  it('confirms student, location, date, time and credit without claiming consumption', () => {
    const text = bookingConfirmationText({ fullName: 'Alumno', locationName: 'Tiabaya', locationAddress: 'Calle 1', startAt: '2026-10-20T15:00:00Z', endAt: '2026-10-20T16:00:00Z', creditKind: 'recovery' })
    expect(text).toContain('Alumno')
    expect(text).toContain('Tiabaya · Calle 1')
    expect(text).toContain('10:00')
    expect(text).toContain('recuperación')
    expect(text).toContain('al registrar tu asistencia')
  })
})
