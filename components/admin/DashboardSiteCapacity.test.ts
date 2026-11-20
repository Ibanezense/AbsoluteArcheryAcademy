// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('next/link', () => ({ default: ({ href, children }: any) => createElement('a', { href }, children) }))
vi.mock('@/lib/supabaseClient', () => ({ supabase: {} }))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ isPending: false, isError: false, data: [
  { sessionId: 't', site: 'tiabaya', name: 'Tiabaya', start: '2026-11-20T15:00:00Z', end: '2026-11-20T16:00:00Z', occupied: 8, academyBowsInUse: 3, unknownBowUsage: 1 },
  { sessionId: 'u', site: 'umacollo', name: 'Umacollo', start: '2026-11-20T16:00:00Z', end: '2026-11-20T17:00:00Z', occupied: 3, academyBowsInUse: 2, unknownBowUsage: 0 },
] }) }))
import DashboardSiteCapacity from './DashboardSiteCapacity'

afterEach(cleanup)
it('filters the schedule and does not invent a number for unclassified equipment', () => {
  render(createElement(DashboardSiteCapacity))
  expect(screen.getByText('Uso de arco por confirmar')).toBeTruthy()
  expect(screen.getByText('1 de 4 espacios físicos')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Sede'), { target: { value: 'tiabaya' } })
  expect(screen.queryByText('1 de 4 espacios físicos')).toBeNull()
  expect(screen.getByText('Uso de arco por confirmar')).toBeTruthy()
})
