// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { StudentReservationPlanner } from './StudentReservationPlanner'
import type { StudentBookingSession } from '@/lib/services/studentBookingService'

const mocks = vi.hoisted(() => ({ confirm: vi.fn(), reserve: vi.fn(), agenda: vi.fn() }))
vi.mock('@/lib/hooks/useStudentDashboard', () => ({
  useStudentMembershipBalance: () => ({}),
  useStudentMembershipCoverageEnd: () => ({}),
}))
vi.mock('@/components/ui/ConfirmDialog', () => ({ useConfirm: () => mocks.confirm }))
vi.mock('@/lib/services/studentBookingService', () => ({
  bookStudentSessions: mocks.reserve,
  fetchStudentBookingAgenda: mocks.agenda,
}))

function turn(id: string, day: string): StudentBookingSession {
  return {
    session_id: id, start_at: `${day}T15:00:00-05:00`, end_at: `${day}T16:00:00-05:00`, status: 'scheduled',
    already_reserved: false, distance_m: 25, bow_usage_type: 'own', spots_for_student: 3,
    location_code: 'tiabaya', location_name: 'Tiabaya', location_address: null, booking_mode: 'flexible',
    can_book: true, eligibility_reason: 'available', eligibility_message: null,
    credit_kind: 'normal', eligible_membership_id: 'plan',
  }
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

it('keeps the selection across views and reports a partial confirmation by turn', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-19T12:00:00-05:00'))
  mocks.agenda.mockResolvedValue([turn('early', '2026-11-20'), turn('late', '2026-11-21')])
  mocks.confirm.mockResolvedValue(true)
  mocks.reserve.mockResolvedValue([
    { sessionId: 'early', status: 'confirmed' },
    { sessionId: 'late', status: 'rejected', message: 'Ya alcanzaste el límite semanal.' },
  ])
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  render(createElement(QueryClientProvider, { client },
    createElement(StudentReservationPlanner, { studentId: 'student', studentName: 'Alumno' }),
  ))

  fireEvent.click(await screen.findByRole('button', { name: /sáb.*21.*Disponible/i }))
  fireEvent.click(screen.getByRole('button', { name: /vie.*20.*Disponible/i }))
  fireEvent.click(screen.getByRole('button', { name: /^Mes$/ }))
  expect(await screen.findByRole('button', { name: /sábado 21.*con selección/i })).toBeTruthy()
  expect(mocks.agenda).toHaveBeenCalledWith('student', '2026-11-01', '2026-11-30')
  fireEvent.click(screen.getByRole('button', { name: 'Revisar y confirmar reservas' }))

  expect(await screen.findByText('1 reserva confirmada')).toBeTruthy()
  expect(screen.getByText('Ya alcanzaste el límite semanal.')).toBeTruthy()
  expect(mocks.reserve).toHaveBeenCalledOnce()
  expect(mocks.reserve).toHaveBeenCalledWith('student', ['early', 'late'])
  await waitFor(() => expect(mocks.agenda).toHaveBeenCalledTimes(3))
})
