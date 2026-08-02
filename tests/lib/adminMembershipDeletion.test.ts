import { describe, expect, it } from 'vitest'
import {
  buildMembershipDeletionConfirmation,
  formatMembershipDeletionSuccess,
  isPersistedMembership,
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
})
