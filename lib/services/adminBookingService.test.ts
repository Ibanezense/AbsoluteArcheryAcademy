import { describe, expect, it, vi } from 'vitest'
import { adminBookSession, adminCancelBooking, adminCancelSession, adminRescheduleBooking } from '@/lib/services/adminBookingService'

describe('adminBookingService', () => {
  it('moves the same booking with its exact version and surfaces conflicts', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: 'same-booking' }, error: null })
    const input = { bookingId: 'same-booking', sessionId: 'new-session', expectedUpdatedAt: '2026-10-16T12:00:00.123456+00:00' }
    expect(await adminRescheduleBooking({ rpc }, input)).toEqual({ id: 'same-booking' })
    expect(rpc).toHaveBeenCalledWith('admin_reschedule_student_booking', {
      p_booking_id: input.bookingId, p_session_id: input.sessionId, p_expected_updated_at: input.expectedUpdatedAt,
    })
    rpc.mockResolvedValue({ data: null, error: { message: 'La reserva cambió. Actualiza el perfil.' } })
    await expect(adminRescheduleBooking({ rpc }, input)).rejects.toThrow('La reserva cambió')
  })
  it('bookSession sends expected RPC payload', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: 'booking-1' },
      error: null,
    })

    const result = await adminBookSession({ rpc }, {
      sessionId: 'session-1',
      studentId: 'student-1',
      adminNotes: 'forzada por admin',
      forceBooking: true,
    })

    expect(rpc).toHaveBeenCalledWith('admin_book_session', {
      p_session_id: 'session-1',
      p_student_id: 'student-1',
      p_admin_notes: 'forzada por admin',
      p_force: true,
    })
    expect(result).toEqual({ id: 'booking-1' })
  })

  it('cancelBooking sends expected RPC payload', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { success: true },
      error: null,
    })

    await adminCancelBooking({ rpc }, 'booking-22', 'Cierre del campo')

    expect(rpc).toHaveBeenCalledWith('admin_cancel_booking', {
      p_booking_id: 'booking-22',
      p_reason: 'Cierre del campo',
    })
  })

  it('cancelSession sends the required academy reason', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: 4,
      error: null,
    })

    const result = await adminCancelSession({ rpc }, {
      sessionId: 'session-3',
      reason: 'Campo cerrado por mantenimiento',
    })

    expect(rpc).toHaveBeenCalledWith('admin_cancel_session', {
      p_session: 'session-3',
      p_reason: 'Campo cerrado por mantenimiento',
    })
    expect(result).toBe(4)
  })

  it('throws message when RPC fails', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'No autorizado' },
    })

    await expect(
      adminBookSession({ rpc }, {
        sessionId: 'session-1',
        studentId: 'student-1',
      })
    ).rejects.toThrow('No autorizado')
  })
})
