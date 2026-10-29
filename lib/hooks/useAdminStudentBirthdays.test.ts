// @vitest-environment jsdom
import { createElement } from 'react'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAdminStudentBirthdays } from './useAdminStudentBirthdays'

const mocks = vi.hoisted(() => ({ prepare: vi.fn(), flags: vi.fn(), fresh: true }))
vi.mock('@/lib/supabaseClient', () => ({ supabase: {} }))
vi.mock('@/lib/services/studentBirthdayService', () => ({
  prepareStudentBirthdayDay: mocks.prepare,
  getAdminStudentBirthdayFlags: mocks.flags,
}))
vi.mock('@/lib/hooks/useBirthdayFreshness', () => ({ useBirthdayFreshness: () => mocks.fresh }))

const clients: QueryClient[] = []
function mount(ids: string[] = ['s1'], account = 'admin1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  clients.push(client)
  return renderHook(({ studentIds, accountId }) => useAdminStudentBirthdays(accountId, studentIds), {
    initialProps: { studentIds: ids, accountId: account },
    wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
  })
}
beforeEach(() => {
  mocks.fresh = true
  mocks.prepare.mockReset().mockResolvedValue({ ready: true, today_lima: '2026-10-28' })
  mocks.flags.mockReset().mockResolvedValue({ ready: true, calendar: { today_lima: '2026-10-28', valid_for_ms: 1000 }, students: [{ student_id: 's1', is_birthday_today: true }], received_at_monotonic: 0, deadline_monotonic: 1000 })
})
afterEach(() => { cleanup(); clients.forEach(c => c.clear()); clients.length = 0 })

it('prepares once and reads flags without a polling interval', async () => {
  const view = mount()
  await waitFor(() => expect(view.result.current.flags.s1).toBe(true))
  expect(mocks.prepare).toHaveBeenCalledTimes(1)
  expect(mocks.flags).toHaveBeenCalledTimes(1)
  expect(view.result.current.available).toBe(true)
})
it('does not confuse an incomplete daily result with a non birthday', async () => {
  mocks.flags.mockResolvedValue({ ready: false, calendar: { today_lima: '2026-10-28', valid_for_ms: 1000 }, students: [], received_at_monotonic: 0, deadline_monotonic: 1000 })
  const view = mount()
  await waitFor(() => expect(view.result.current.isFetching).toBe(false))
  expect(view.result.current.available).toBe(false)
  expect(view.result.current.flags).toEqual({})
})
it('ignores old scope results while changing the rendered student IDs', async () => {
  let release!: (value: unknown) => void
  mocks.flags.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
  const view = mount()
  await waitFor(() => expect(mocks.flags).toHaveBeenCalledTimes(1))
  mocks.flags.mockResolvedValue({ ready: true, calendar: { today_lima: '2026-10-28', valid_for_ms: 1000 }, students: [{ student_id: 's2', is_birthday_today: false }], received_at_monotonic: 0, deadline_monotonic: 1000 })
  view.rerender({ studentIds: ['s2'], accountId: 'admin1' })
  await waitFor(() => expect(view.result.current.flags.s2).toBe(false))
  await act(async () => release({ ready: true, calendar: { today_lima: '2026-10-28', valid_for_ms: 1000 }, students: [{ student_id: 's1', is_birthday_today: true }], received_at_monotonic: 0, deadline_monotonic: 1000 }))
  expect(view.result.current.flags).toEqual({ s2: false })
})
it('hides expired snapshots and refetches when returning from a hidden page', async () => {
  const view = mount()
  await waitFor(() => expect(view.result.current.available).toBe(true))
  mocks.fresh = false
  view.rerender({ studentIds: ['s1'], accountId: 'admin1' })
  expect(view.result.current.flags).toEqual({})
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')) })
  await waitFor(() => expect(mocks.prepare.mock.calls.length).toBeGreaterThan(1))
})
