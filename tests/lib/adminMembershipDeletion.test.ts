import { describe, expect, it } from 'vitest'
import {
  buildMembershipDeletionConfirmation,
  formatMembershipDeletionSuccess,
  isPersistedMembership,
  parseMembershipDeletionPreview,
  parseMembershipDeletionResult,
} from '../../lib/utils/adminMembershipDeletion'

describe('admin membership deletion rules', () => {
  it('offers corrective deletion for every persisted membership regardless of status', () => {
    for (const status of ['active', 'scheduled', 'expired', 'historical', 'cancelled', 'consumed', 'draft']) {
      expect(isPersistedMembership({ id: 'membership-1', status })).toBe(true)
    }
    expect(isPersistedMembership({ id: '', status: 'expired' })).toBe(false)
  })

  it('builds irreversible confirmation and success copy from backend counts', () => {
    const preview = {
      can_delete: true,
      reason: 'La membresia puede eliminarse.',
      booking_count: 3,
      payment_count: 2,
      ledger_count: 4,
      weekly_attendance_count: 0,
    }

    const confirmation = buildMembershipDeletionConfirmation('Plan 8 clases', preview)
    expect(confirmation).toContain('Plan 8 clases')
    expect(confirmation).toContain('Reservas vinculadas: 3')
    expect(confirmation).toContain('Pagos vinculados: 2')
    expect(confirmation).toContain('Movimientos de credito: 4')
    expect(confirmation).toContain('Esta accion es irreversible.')

    expect(formatMembershipDeletionSuccess({
      success: true,
      booking_count: 3,
      payment_count: 2,
      ledger_count: 4,
      membership_count: 1,
    })).toContain('3 reservas, 2 pagos y 4 movimientos')
  })

  it('strictly validates preview payloads and rejects malformed counts', () => {
    expect(parseMembershipDeletionPreview({
      can_delete: false,
      reason: 'Tiene asistencias vinculadas.',
      booking_count: 1,
      payment_count: 0,
      ledger_count: 2,
      weekly_attendance_count: 1,
    })).toMatchObject({ can_delete: false, booking_count: 1 })

    for (const payload of [
      null,
      { can_delete: 'true', booking_count: 0, payment_count: 0, ledger_count: 0, weekly_attendance_count: 0 },
      { can_delete: true, booking_count: -1, payment_count: 0, ledger_count: 0, weekly_attendance_count: 0 },
      { can_delete: true, booking_count: 0.5, payment_count: 0, ledger_count: 0, weekly_attendance_count: 0 },
      { can_delete: true, booking_count: 0, payment_count: Number.POSITIVE_INFINITY, ledger_count: 0, weekly_attendance_count: 0 },
      { can_delete: true, booking_count: 0, payment_count: 0, ledger_count: 0, weekly_attendance_count: 0, reason: 42 },
    ]) {
      expect(() => parseMembershipDeletionPreview(payload)).toThrow('Respuesta invalida')
    }
  })

  it('requires strict success and complete nonnegative counts for successful deletion', () => {
    expect(parseMembershipDeletionResult({
      success: true,
      booking_count: 3,
      payment_count: 2,
      ledger_count: 4,
      membership_count: 1,
    })).toMatchObject({ success: true, membership_count: 1 })
    expect(parseMembershipDeletionResult({ success: false, error: 'Bloqueada' }))
      .toEqual({ success: false, error: 'Bloqueada' })

    for (const payload of [
      { success: 'true', booking_count: 0, payment_count: 0, ledger_count: 0, membership_count: 1 },
      { success: true, booking_count: 0, payment_count: 0, ledger_count: 0 },
      { success: true, booking_count: 0, payment_count: 0, ledger_count: -1, membership_count: 1 },
      { success: false, error: { message: 'Bloqueada' } },
      { success: false, error: 'Bloqueada', booking_count: -1 },
    ]) {
      expect(() => parseMembershipDeletionResult(payload)).toThrow('Respuesta invalida')
    }
  })
})
