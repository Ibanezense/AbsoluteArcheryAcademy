// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('next/link', () => ({ default: ({ href, children }: any) => createElement('a', { href }, children) }))
vi.mock('@/lib/supabaseClient', () => ({ supabase: {} }))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ isPending: false, isError: false, data: [
  { student_id: '1', full_name: 'Ana Ejemplo', end_date: '2026-11-20', category: 'expiring' },
  { student_id: '2', full_name: 'Luis Ejemplo', end_date: '2026-11-17', category: 'expired' },
] }) }))
import DashboardMembershipFollowups from './DashboardMembershipFollowups'
afterEach(cleanup)
it('separates upcoming and expired memberships and links to each student', () => {
  render(createElement(DashboardMembershipFollowups))
  expect(screen.getByText('Por vencer')).toBeTruthy()
  expect(screen.getByText('Vencidas sin renovar')).toBeTruthy()
  expect(screen.getByRole('link', { name: /Ana Ejemplo/i }).getAttribute('href')).toBe('/admin/alumnos/1')
  expect(screen.getByRole('link', { name: /Luis Ejemplo/i }).getAttribute('href')).toBe('/admin/alumnos/2')
})
