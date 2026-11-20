// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('next/link', () => ({ default: ({ href, children }: any) => createElement('a', { href }, children) }))
vi.mock('@/lib/supabaseClient', () => ({ supabase: {} }))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ isPending: false, isError: false, data: [
  { student_id: '1', full_name: 'Ana Ejemplo', phone: '999999999', day_offset: 0 },
  { student_id: '2', full_name: 'Luis Ejemplo', phone: null, day_offset: 1 },
] }) }))
import DashboardBirthdays from './DashboardBirthdays'

afterEach(cleanup)
it('shows today and tomorrow and offers a reviewable greeting or contact detail', () => {
  render(createElement(DashboardBirthdays))
  expect(screen.getByText('Hoy')).toBeTruthy()
  expect(screen.getByText('Mañana')).toBeTruthy()
  expect(screen.getByRole('link', { name: /saludar a Ana Ejemplo/i }).getAttribute('href')).toContain('wa.me')
  expect(screen.getByRole('link', { name: /revisar contacto/i }).getAttribute('href')).toBe('/admin/alumnos/2')
})
