// @vitest-environment jsdom
import { createElement } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StudentNotificationCenter from './StudentNotificationCenter'

const state = vi.hoisted(() => ({
  feed: { notices: [] as { id: string; title: string; body: string }[], membership: { expired: true, state_key: 'm1' } },
  failDismissal: false,
}))
vi.mock('@/lib/supabaseClient', () => ({ supabase: { rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
  if (name === 'get_student_notification_feed') return { data: structuredClone(state.feed), error: null }
  if (name === 'dismiss_academy_notification') {
    if (state.failDismissal) return { data: null, error: { message: 'Offline' } }
    state.feed.notices = state.feed.notices.filter(n => n.id !== args.p_notification_id)
    return { data: null, error: null }
  }
  throw new Error(`Unexpected RPC ${name}`)
}) } }))
vi.mock('@/lib/hooks/useStudentContext', () => ({ useStudentContext: () => ({ account: { id: 'account1', role: 'student' }, activeStudentId: 'student1', loading: false }) }))
vi.mock('@/lib/hooks/useMembershipRenewalAlerts', () => ({ useMembershipRenewalAlerts: () => ({ data: {}, isLoading: false, isFetching: false, error: null }) }))
vi.mock('@/lib/hooks/useMembershipRenewal', () => ({
  useMembershipRenewalOptions: () => ({ data: [], isLoading: false, error: null }),
  useRequestMembershipRenewal: () => ({ mutateAsync: vi.fn() }),
  useStudentPendingRenewal: () => ({ data: null }),
}))
vi.mock('@/components/ui/ToastProvider', () => ({ useToast: () => ({ push: vi.fn() }) }))

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = (route: string) => createElement(QueryClientProvider, { client }, createElement('div', { 'data-route': route }, createElement(StudentNotificationCenter)))
  const result = render(view('/'))
  return { client, navigate: () => result.rerender(view('/mis-reservas')) }
}
async function resume() {
  await act(async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

beforeEach(() => {
  state.feed = { notices: [], membership: { expired: true, state_key: 'm1' } }
  state.failDismissal = false
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('mounted student notification lifecycle', () => {
  it('stays closed across navigation, then reappears after returning from background', async () => {
    const app = mount()
    await screen.findByRole('heading', { name: 'Tu membresía está vencida' })
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar notificación' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    app.navigate()
    expect(screen.queryByRole('dialog')).toBeNull()
    await resume()
    await screen.findByRole('heading', { name: 'Tu membresía está vencida' })
  })
  it('removes an already visible expiration alert when an active membership is received', async () => {
    const app = mount()
    await screen.findByRole('heading', { name: 'Tu membresía está vencida' })
    state.feed.membership = { expired: false, state_key: '' }
    await act(async () => { await app.client.invalidateQueries({ queryKey: ['student-notifications'] }) })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
  it('hands off to exactly one renewal dialog, then advances the unread announcement', async () => {
    state.feed.notices = [{ id: 'n1', title: 'Entrenamiento especial', body: 'Este sábado' }]
    mount()
    await screen.findByRole('heading', { name: 'Tu membresía está vencida' })
    fireEvent.click(screen.getByRole('button', { name: 'Renovar membresía' }))
    await screen.findByRole('heading', { name: 'Renueva tu membresía' })
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar modal' }))
    await screen.findByRole('heading', { name: 'Entrenamiento especial' })
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })
  it('allows offline dismissal, stays closed during navigation and retries next opening', async () => {
    state.feed.membership = { expired: false, state_key: '' }
    state.feed.notices = [{ id: 'n1', title: 'Comunicado', body: 'Texto' }]
    state.failDismissal = true
    const app = mount()
    await screen.findByRole('heading', { name: 'Comunicado' })
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar notificación' }))
    await act(async () => { await Promise.resolve() })
    app.navigate()
    expect(screen.queryByRole('dialog')).toBeNull()
    await resume()
    await screen.findByRole('heading', { name: 'Comunicado' })
  })
  it('dismisses announcements in order and never shows a persisted dismissal again', async () => {
    state.feed.membership = { expired: false, state_key: '' }
    state.feed.notices = [{ id: 'n1', title: 'Primero', body: 'Uno' }, { id: 'n2', title: 'Segundo', body: 'Dos' }]
    mount()
    await screen.findByRole('heading', { name: 'Primero' })
    fireEvent.click(screen.getByRole('button', { name: 'Entendido' }))
    await screen.findByRole('heading', { name: 'Segundo' })
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await resume()
    await act(async () => { await Promise.resolve() })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(state.feed.notices).toHaveLength(0)
  })
  it('waits for the next opening before displaying an announcement published during use', async () => {
    state.feed.membership = { expired: false, state_key: '' }
    const app = mount()
    await waitFor(() => expect(app.client.getQueryState(['student-notifications', 'account1', 'student1', 0])?.status).toBe('success'))
    state.feed.notices = [{ id: 'late', title: 'Nuevo aviso', body: 'Para la próxima apertura' }]
    await act(async () => {
      await app.client.invalidateQueries({ queryKey: ['student-notifications'] })
      // React Query batches observer updates on a scheduled task.
      await new Promise(resolve => setTimeout(resolve, 25))
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    await resume()
    await screen.findByRole('heading', { name: 'Nuevo aviso' })
  })
})
