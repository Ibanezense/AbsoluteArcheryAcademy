// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DashboardTodayOverview } from './DashboardTodayOverview'

vi.mock('next/link', () => ({ default: ({ href, children, ...props }: any) => createElement('a', { href, ...props }, children) }))

afterEach(cleanup)

describe('DashboardTodayOverview', () => {
  it('shows the real daily totals and links to their operational details', () => {
    render(createElement(DashboardTodayOverview, { today: { reservationsToday: 12, scheduledSessionsToday: 3, availableSlotsToday: 5, pendingConfirmations: 2, attendancePending: 4 } }))
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByText('4')).toBeTruthy()
    expect(screen.getByRole('link', { name: /reservas de hoy/i }).getAttribute('href')).toBe('/admin/asistencia')
    expect(screen.getByRole('link', { name: /turnos programados/i }).getAttribute('href')).toBe('/admin/sesiones')
  })

  it('does not present the legacy capacity estimate as actual availability', () => {
    render(createElement(DashboardTodayOverview, { today: { reservationsToday: 0, scheduledSessionsToday: 0, availableSlotsToday: null, pendingConfirmations: 0, attendancePending: 0 } }))
    expect(screen.queryByText(/cupos disponibles/i)).toBeNull()
  })
})
