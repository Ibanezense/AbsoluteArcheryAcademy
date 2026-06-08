import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('admin attendance cancellation surface', () => {
  it('allows admin cancellation outside the reserved-only state', () => {
    const page = readFileSync(
      join(process.cwd(), 'app', 'admin', 'asistencia', 'page.tsx'),
      'utf8',
    )
    const components = readFileSync(
      join(process.cwd(), 'components', 'admin', 'AdminOperationalComponents.tsx'),
      'utf8',
    )
    const surface = `${page}\n${components}`

    expect(surface).toContain("supabase.rpc('admin_cancel_booking'")
    expect(surface).toContain("disabled={isProcessing || status === 'cancelled'}")
    expect(surface).not.toContain("title={!isReserved ? 'Solo se pueden cancelar reservas pendientes' : 'Cancelar reserva'}")
  })

  it('renders intro bookings inside attendance with a differentiated trial label', () => {
    const page = readFileSync(
      join(process.cwd(), 'app', 'admin', 'asistencia', 'page.tsx'),
      'utf8',
    )
    const components = readFileSync(
      join(process.cwd(), 'components', 'admin', 'AdminOperationalComponents.tsx'),
      'utf8',
    )
    const surface = `${page}\n${components}`

    expect(surface).toContain('entry_type')
    expect(surface).toContain('Clase de prueba')
    expect(surface).toContain('entryType={booking.entry_type}')
  })

  it('routes intro booking edits from attendance to the admin intro editor', () => {
    const page = readFileSync(
      join(process.cwd(), 'app', 'admin', 'asistencia', 'page.tsx'),
      'utf8',
    )

    expect(page).toContain('/admin/intro?editBookingId=')
    expect(page).not.toContain('Las clases de prueba no se editan desde este flujo.')
  })
})
