// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AdminAlumnosPage from '@/app/admin/alumnos/page'

const state = vi.hoisted(() => ({ flags: {} as Record<string, boolean>, students: [] as any[], unavailable: false }))
vi.mock('@/lib/hooks/useAuth', () => ({ useAuth: () => ({ profile: { id: 'a1', role: 'admin' } }) }))
vi.mock('@/lib/queries/studentQueries', () => ({ useStudents: () => ({ data: state.students, isLoading: false, isError: false, refetch: vi.fn() }) }))
vi.mock('@/lib/hooks/useMembershipRenewalAlerts', () => ({ useMembershipRenewalAlerts: () => ({ data: {} }) }))
vi.mock('@/lib/hooks/useAdminStudentBirthdays', () => ({ useAdminStudentBirthdays: () => ({ flags: state.flags, unavailable: state.unavailable, partial: false, refetch: vi.fn() }) }))
vi.mock('next/image', () => ({ default: (props: any) => createElement('img', { alt: props.alt }) }))

afterEach(cleanup)
beforeEach(() => {
  state.unavailable = false
  state.flags = { s1: true, s2: true, s3: false }
  state.students = [
    { id: 's1', full_name: 'Ana Activa', operational_status: 'active', effective_operational_status: 'active', phone: '997224472', home_location_id: 'loc1', home_location_name: 'Centro', is_active: true, classes_remaining: 2 },
    { id: 's2', full_name: 'Beto Inactivo', operational_status: 'inactive', effective_operational_status: 'inactive', phone: null, home_location_id: 'loc2', home_location_name: 'Norte', is_active: false },
    { id: 's3', full_name: 'Carla Pausa', operational_status: 'paused', effective_operational_status: 'paused', phone: null, home_location_id: 'loc1', home_location_name: 'Centro', is_active: true },
  ]
})
function rowNames() { return Array.from(document.querySelectorAll('tbody tr')).map(row => row.textContent?.match(/Ana Activa|Beto Inactivo|Carla Pausa/)?.[0]) }

it('highlights only eligible saved birthdays in both representations without reordering rows', () => {
  render(createElement(AdminAlumnosPage))
  expect(rowNames()).toEqual(['Ana Activa', 'Carla Pausa', 'Beto Inactivo'])
  expect(screen.getAllByText('Cumpleaños hoy')).toHaveLength(2)
  const inactiveRow = document.querySelectorAll('tbody tr')[2]
  expect(within(inactiveRow as HTMLElement).queryByText('Cumpleaños hoy')).toBeNull()
  expect(screen.getAllByRole('link', { name: 'Saludar a Ana Activa por WhatsApp' })).toHaveLength(2)
})
it('preserves search and state filters while birthdays remain an annotation', () => {
  render(createElement(AdminAlumnosPage))
  fireEvent.change(screen.getByPlaceholderText('Buscar por nombre, DNI o teléfono'), { target: { value: 'Beto' } })
  expect(rowNames()).toEqual(['Beto Inactivo'])
  expect(screen.queryByText('Cumpleaños hoy')).toBeNull()
  fireEvent.change(screen.getByPlaceholderText('Buscar por nombre, DNI o teléfono'), { target: { value: '' } })
  fireEvent.change(screen.getByRole('combobox', { name: 'Filtrar alumnos por estado' }), { target: { value: 'paused' } })
  expect(rowNames()).toEqual(['Carla Pausa'])
})
it('keeps rows usable and distinguishes unavailable birthday data from no birthdays', () => {
  state.flags = {}
  state.unavailable = true
  render(createElement(AdminAlumnosPage))
  expect(rowNames()).toHaveLength(3)
  expect(screen.getByText(/No se pudieron consultar los cumpleaños/)).toBeTruthy()
  expect(screen.queryByText('Cumpleaños hoy')).toBeNull()
})
it.each(['active', 'expired', 'paused'])('includes a %s student without depending on membership balance or a popup receipt', status => {
  state.students = [{ ...state.students[0], operational_status: status, effective_operational_status: status, classes_remaining: 0 }]
  render(createElement(AdminAlumnosPage))
  expect(screen.getAllByText('Cumpleaños hoy')).toHaveLength(2)
})
it('preserves site filtering and name sorting with no birthday priority', () => {
  render(createElement(AdminAlumnosPage))
  fireEvent.change(screen.getByRole('combobox', { name: 'Ordenar alumnos' }), { target: { value: 'name' } })
  expect(rowNames()).toEqual(['Ana Activa', 'Beto Inactivo', 'Carla Pausa'])
  fireEvent.change(screen.getByRole('combobox', { name: 'Filtrar por sede' }), { target: { value: 'loc2' } })
  expect(rowNames()).toEqual(['Beto Inactivo'])
  expect(screen.queryByText('Cumpleaños hoy')).toBeNull()
})
