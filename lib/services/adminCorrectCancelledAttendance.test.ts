import { describe, expect, it, vi } from 'vitest'
import { correctCancelledAttendance } from './adminCorrectCancelledAttendance'

describe('correctCancelledAttendance', () => {
  it('requests the correction for the original booking', async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: { success: true, booking_id: 'booking-1', already_corrected: false }, error: null }) }
    await expect(correctCancelledAttendance(client, 'booking-1')).resolves.toMatchObject({ success: true })
    expect(client.rpc).toHaveBeenCalledWith('admin_correct_cancelled_attendance', { p_booking_id: 'booking-1' })
  })

  it('shows the database reason when correction is rejected', async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'No hay saldo disponible' } }) }
    await expect(correctCancelledAttendance(client, 'booking-1')).rejects.toThrow('No hay saldo disponible')
  })

  it('does not report success for an unsuccessful response', async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: { success: false }, error: null }) }
    await expect(correctCancelledAttendance(client, 'booking-1')).rejects.toThrow('No se pudo registrar la asistencia')
  })
})
