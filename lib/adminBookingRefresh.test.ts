// @vitest-environment jsdom
import { createElement } from 'react'
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

vi.mock('@/lib/supabaseClient', () => ({ supabase: {} }))
vi.mock('@/lib/services/adminBookingService', () => ({ adminBookSession: vi.fn().mockResolvedValue({ success: true }), adminCancelBooking: vi.fn() }))
import { useAdminBookSession } from './adminBookingQueries'

it('marks the dashboard and booking calendar stale after a quick booking', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity }, mutations: { retry: false } } })
  const keys = [['admin-dashboard-operational', 'site', 'all'], ['admin-dashboard-site-capacity'], ['admin-session-calendar', '2026-11-16']]
  keys.forEach(key => client.setQueryData(key, { old: true }))
  const wrapper = ({ children }: { children: React.ReactNode }) => createElement(QueryClientProvider, { client }, children)
  const hook = renderHook(() => useAdminBookSession(), { wrapper })
  await act(async () => { await hook.result.current.mutateAsync({ sessionId: 'session', studentId: 'student' }) })
  keys.forEach(key => expect(client.getQueryState(key)?.isInvalidated).toBe(true))
})

it('reloads the visible dashboard after the booking succeeds', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity }, mutations: { retry: false } } })
  const load = vi.fn().mockResolvedValueOnce({ reservations: 1 }).mockResolvedValue({ reservations: 2 })
  const observer = new QueryObserver(client, { queryKey: ['admin-dashboard-operational'], queryFn: load })
  const unsubscribe = observer.subscribe(() => {})
  await waitFor(() => expect(client.getQueryData(['admin-dashboard-operational'])).toEqual({ reservations: 1 }))
  const wrapper = ({ children }: { children: React.ReactNode }) => createElement(QueryClientProvider, { client }, children)
  const hook = renderHook(() => useAdminBookSession(), { wrapper })
  await act(async () => { await hook.result.current.mutateAsync({ sessionId: 'session', studentId: 'student' }) })
  await waitFor(() => expect(client.getQueryData(['admin-dashboard-operational'])).toEqual({ reservations: 2 }))
  unsubscribe()
})

it('refreshes the quick-booking student list after assigning membership from the profile', () => {
  const page = readFileSync('app/admin/alumnos/[id]/page.tsx', 'utf8')
  const refresh = page.slice(page.indexOf('async function refreshStudentData'), page.indexOf('async function uploadAvatar'))
  expect(refresh).toContain("['admin-students']")
})
