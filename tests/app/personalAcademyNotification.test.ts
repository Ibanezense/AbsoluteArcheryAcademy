// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import AcademyNotifications from '@/components/admin/AcademyNotifications'

const state = vi.hoisted(() => ({ create: vi.fn(), confirm: vi.fn(async (_message: string) => true) }))
vi.mock('@/lib/hooks/useAuth', () => ({ useAuth: () => ({ profile: { id: 'admin', role: 'admin' } }) }))
vi.mock('@/components/ui/ConfirmDialog', () => ({ useConfirm: () => state.confirm }))
vi.mock('@/lib/supabaseClient', () => ({ supabase: { from: () => ({ select: () => ({ order: async () => ({ data: [{ id: 'a', full_name: 'Ana Uno' }, { id: 'b', full_name: 'Bruno Dos' }], error: null }) }) }) } }))
vi.mock('@/lib/services/academyNotificationService', () => ({ createAcademyNotification: state.create, notificationRpc: vi.fn(async () => []) }))
vi.mock('@tanstack/react-query', () => ({ useQuery: (options: any) => options.queryKey[0] === 'notification-recipient-options' ? { data: [{ id: 'a', full_name: 'Ana Uno' }, { id: 'b', full_name: 'Bruno Dos' }], isLoading: false, refetch: vi.fn() } : { data: [], isLoading: false, refetch: vi.fn() } }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('selects exactly one personal recipient and confirms the name before publishing', async () => {
  state.create.mockResolvedValue('notice')
  render(createElement(AcademyNotifications))
  fireEvent.click(screen.getByLabelText('Un alumno'))
  fireEvent.click(screen.getByLabelText('Ana Uno'))
  fireEvent.click(screen.getByLabelText('Bruno Dos'))
  expect((screen.getByLabelText('Ana Uno') as HTMLInputElement).checked).toBe(false)
  expect((screen.getByLabelText('Bruno Dos') as HTMLInputElement).checked).toBe(true)
  fireEvent.change(screen.getByLabelText('Título'), { target: { value: '¡Felicitaciones!' } })
  fireEvent.change(screen.getByLabelText(/Mensaje/), { target: { value: 'Gran logro' } })
  fireEvent.click(screen.getByRole('button', { name: 'Publicar aviso' }))
  await waitFor(() => expect(state.create).toHaveBeenCalled())
  expect(state.confirm.mock.calls[0][0]).toContain('Bruno Dos')
  expect(state.create.mock.calls[0][1]).toMatchObject({ audience: 'selected', studentIds: ['b'] })
})

it('clears recipients when changing audience so a previous group cannot leak into a personal notice', () => {
  render(createElement(AcademyNotifications))
  fireEvent.click(screen.getByLabelText('Varios alumnos'))
  fireEvent.click(screen.getByLabelText('Ana Uno'))
  fireEvent.click(screen.getByLabelText('Bruno Dos'))
  fireEvent.click(screen.getByLabelText('Un alumno'))
  expect((screen.getByLabelText('Ana Uno') as HTMLInputElement).checked).toBe(false)
  expect((screen.getByLabelText('Bruno Dos') as HTMLInputElement).checked).toBe(false)
})

it('previews a message without a recipient and never publishes it', () => {
  render(createElement(AcademyNotifications))
  fireEvent.click(screen.getByLabelText('Un alumno'))
  fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Nuevo récord' } })
  fireEvent.change(screen.getByLabelText(/Mensaje/), { target: { value: '¡Felicitaciones!' } })
  fireEvent.click(screen.getByRole('button', { name: 'Vista previa' }))
  expect(screen.getByRole('dialog', { name: 'Nuevo récord' })).toBeTruthy()
  expect(within(screen.getByRole('dialog')).getByText('¡Felicitaciones!')).toBeTruthy()
  expect(state.create).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar notificación' }))
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('shows placeholders when previewing an unfinished notice', () => {
  render(createElement(AcademyNotifications))
  fireEvent.click(screen.getByRole('button', { name: 'Vista previa' }))
  expect(screen.getByRole('dialog', { name: 'Título de tu aviso' })).toBeTruthy()
  expect(screen.getByText('Aquí aparecerá tu mensaje.')).toBeTruthy()
  expect(state.create).not.toHaveBeenCalled()
})
