import { describe, expect, it, vi } from 'vitest'
import { adminBookSession, adminCancelBooking, adminCancelSession } from '@/lib/services/adminBookingService'

describe('adminBookingService', () => {
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

    await adminCancelBooking({ rpc }, 'booking-22')

    expect(rpc).toHaveBeenCalledWith('admin_cancel_booking', {
      p_booking_id: 'booking-22',
    })
  })

  it('cancelSession sends refund flag correctly', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: 4,
      error: null,
    })

    const result = await adminCancelSession({ rpc }, {
      sessionId: 'session-3',
      refund: false,
    })

    expect(rpc).toHaveBeenCalledWith('admin_cancel_session', {
      p_session: 'session-3',
      p_refund: false,
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
