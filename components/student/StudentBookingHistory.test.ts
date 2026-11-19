// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import StudentBookingHistory from './StudentBookingHistory'
import type { StudentHistoryRow } from '@/lib/services/studentBookingHistoryService'

const state = vi.hoisted(() => ({ rows: [] as StudentHistoryRow[] }))
vi.mock('@/lib/hooks/useStudentBookingHistory', () => ({
  useStudentBookingHistory: () => ({ data: { rows: state.rows, total: state.rows.length, pageSize: 10 } }),
}))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }))
vi.mock('@/components/ui/ConfirmDialog', () => ({ useConfirm: () => vi.fn() }))
vi.mock('@/components/ui/ToastProvider', () => ({ useToast: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/supabaseClient', () => ({ supabase: { rpc: vi.fn() } }))

function historyRow(overrides: Partial<StudentHistoryRow> = {}): StudentHistoryRow {
  return {
    booking_id: '1', start_at: '2099-11-20T15:00:00-05:00', end_at: '2099-11-20T16:00:00-05:00',
    status: 'reserved', distance_m: 25, bow_usage_type: 'own', bow_poundage: null,
    student_membership_id: 'plan', membership_code: 'MEM-01', note: null, event_source: 'booking',
    cancellation_source: null, cancellation_resolution: null, ...overrides,
  }
}

afterEach(cleanup)

it('keeps detail and cancel in one action row for a reserved class', () => {
  state.rows = [historyRow()]
  render(createElement(StudentBookingHistory, { studentId: 'student', scope: 'upcoming', compact: true }))
  const actions = within(screen.getByRole('group', { name: 'Acciones de la reserva' }))
  expect(actions.getByRole('link', { name: 'Ver detalle' }).getAttribute('href')).toBe('/reserva/1')
  expect(actions.getByRole('button', { name: 'Cancelar reserva' })).toBeTruthy()
})

it('shows the reason for a lost class only when the info button opens it', () => {
  state.rows = [historyRow({
    event_source: 'expiry', status: 'expired_unattended', note: 'Clase pendiente al finalizar el periodo de membresía.',
  })]
  render(createElement(StudentBookingHistory, { studentId: 'student', compact: true }))
  expect(screen.queryByText(/Clase pendiente al finalizar/)).toBeNull()
  const button = screen.getByRole('button', { name: 'Por qué se perdió esta clase' })
  expect(screen.queryByRole('tooltip')).toBeNull()
  fireEvent.click(button)
  expect(screen.getByRole('tooltip').textContent).toMatch(/no se recuperó durante la vigencia de la membresía/)
  fireEvent.keyDown(button, { key: 'Escape' })
  expect(screen.queryByRole('tooltip')).toBeNull()
})
