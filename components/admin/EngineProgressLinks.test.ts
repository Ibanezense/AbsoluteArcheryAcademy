import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const { mocks } = vi.hoisted(() => ({
  mocks: { query: vi.fn(), account: 'admin-a' as string | null },
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: (value: unknown) => mocks.query(value),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('@/lib/hooks/useStudentProgress', () => ({ useProgressAccountId: () => mocks.account }))
vi.mock('@/lib/services/studentProgressService', () => ({
  progressRequest: vi.fn(),
  ProgressRequestError: class extends Error {},
}))
vi.mock('@/components/ui/ConfirmDialog', () => ({ useConfirm: () => vi.fn() }))
import EngineProgressLinks from './EngineProgressLinks'

const link = (id: string, status = 'confirmed') => ({
  id,
  student_id: 'student-a',
  source: 'tournament_engine',
  external_id: `competitor-${id}`,
  status,
  revision: 2,
})
describe('competition identity administration presentation', () => {
  beforeEach(() => {
    mocks.account = 'admin-a'
    mocks.query.mockReset()
  })
  const render = () =>
    renderToStaticMarkup(createElement(EngineProgressLinks, { studentId: 'student-a' }))
  it('allows multiple confirmed competitor IDs for the same student', () => {
    mocks.query.mockReturnValue({
      data: { student_id: 'student-a', links: [link('a'), link('b')], operations: [] },
    })
    const html = render()
    expect(html).toContain('competitor-a')
    expect(html).toContain('competitor-b')
    expect(mocks.query).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['admin-student-progress', 'admin-a', 'student-a', 'competitions'],
      })
    )
  })
  it('keeps incomplete remote confirmation pending and offers retry without another human decision', () => {
    mocks.query.mockReturnValue({
      data: {
        student_id: 'student-a',
        links: [link('a', 'pending')],
        operations: [
          {
            id: 'op',
            link_id: 'a',
            action: 'confirm',
            state: 'pending',
            last_error_code: 'remote_unavailable',
          },
        ],
      },
    })
    const html = render()
    expect(html).toContain('Pendiente de confirmar')
    expect(html).toContain('Reintentar operación')
    expect(html).not.toContain('Vinculación confirmada')
  })
  it('shows local access withdrawn while remote cleanup is still pending', () => {
    mocks.query.mockReturnValue({
      data: {
        student_id: 'student-a',
        links: [link('a', 'revoked')],
        operations: [
          {
            id: 'op',
            link_id: 'a',
            action: 'revoke',
            state: 'pending',
            last_error_code: 'remote_unavailable',
          },
        ],
      },
    })
    const html = render()
    expect(html).toContain('Acceso retirado')
    expect(html).toContain('limpieza pendiente')
    expect(html).toContain('Reintentar operación')
  })
  it('does not render cached identity information after a permission error or student change', () => {
    mocks.query.mockReturnValue({
      data: { student_id: 'student-a', links: [link('private')], operations: [] },
      isError: true,
      error: Error('Acceso denegado'),
    })
    expect(render()).not.toContain('competitor-private')
    mocks.query.mockReturnValue({
      data: { student_id: 'other', links: [link('private')], operations: [] },
    })
    expect(render()).not.toContain('competitor-private')
  })
})
