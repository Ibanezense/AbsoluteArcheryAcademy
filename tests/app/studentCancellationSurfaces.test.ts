import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('student cancellation surfaces', () => {
  it('uses the shared cancelability rule in class cards instead of the old 12 hour cutoff', () => {
    const source = readFileSync(
      join(process.cwd(), 'components', 'ui', 'ClassCardsBoard.tsx'),
      'utf8',
    )

    expect(source).toContain('canStudentCancelBooking')
    expect(source).not.toContain("add(12, 'hour')")
    expect(source).not.toContain('add(12, "hour")')
  })

  it('lets the next booking widget cancel the upcoming booking', () => {
    const source = readFileSync(
      join(process.cwd(), 'components', 'ui', 'NextBookingWidget.tsx'),
      'utf8',
    )

    expect(source).toContain('canStudentCancelBooking')
    expect(source).toContain("supabase.rpc('cancel_booking'")
    expect(source).toContain('Cancelar reserva')
  })
})
