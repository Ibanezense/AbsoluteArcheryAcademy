import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, it, expect, vi } from 'vitest'
const { mocks } = vi.hoisted(() => ({
  mocks: { account: 'admin-a' as string | null, query: vi.fn(), invalidate: vi.fn() },
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mocks.query(options),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}))
vi.mock('@/lib/hooks/useStudentProgress', () => ({ useProgressAccountId: () => mocks.account }))
vi.mock('@/lib/services/studentProgressService', () => ({
  progressRequest: vi.fn(),
  ProgressRequestError: class extends Error {
    status = 503
  },
}))
import StudentProgressLinks, {
  canConfirmProgressIdentity,
  isCurrentProgressOperation,
} from './StudentProgressLinks'
const identity = { id: 'external-1', name: 'María Pérez', active: 1 as const }
describe('admin identity confirmation rules', () => {
  it('requires explicit human verification and evidence after preview', () => {
    expect(canConfirmProgressIdentity(identity, 'Documento comprobado', true)).toBe(true)
    expect(canConfirmProgressIdentity(null, 'Documento comprobado', true)).toBe(false)
    expect(canConfirmProgressIdentity(identity, 'Documento comprobado', false)).toBe(false)
    expect(canConfirmProgressIdentity(identity, '  ', true)).toBe(false)
    expect(canConfirmProgressIdentity(identity, 'x'.repeat(1001), true)).toBe(false)
  })
  it('does not treat inactive source records as a different identity', () => {
    expect(
      canConfirmProgressIdentity({ ...identity, active: 0 }, 'Verificado manualmente', true)
    ).toBe(true)
  })
  it('rejects late answers from another student, account or request', () => {
    const operation = { scope: 'account-a:student-a', sequence: 2 }
    expect(isCurrentProgressOperation(operation, { ...operation })).toBe(true)
    expect(
      isCurrentProgressOperation(operation, { scope: 'account-a:student-b', sequence: 2 })
    ).toBe(false)
    expect(
      isCurrentProgressOperation(operation, { scope: 'account-b:student-a', sequence: 2 })
    ).toBe(false)
    expect(isCurrentProgressOperation(operation, { scope: operation.scope, sequence: 3 })).toBe(
      false
    )
  })
})

afterEach(() => {
  mocks.account = 'admin-a'
  vi.clearAllMocks()
})
describe('admin identity panel rendering', () => {
  const render = () =>
    renderToStaticMarkup(
      createElement(StudentProgressLinks, {
        studentId: 'student-a',
        onReviewDistance: () => undefined,
      })
    )
  it('renders an explicit pending state and keeps search scoped to account and student', () => {
    mocks.query.mockReturnValue({
      data: { student_id: 'student-a', assigned_distance_m: null, link: null },
      isLoading: false,
      isError: false,
      isFetching: false,
    })
    const html = render()
    expect(html).toContain('Pendiente de asignación')
    expect(html).toContain('Pendiente de vinculación')
    expect(html).toContain('Revisar distancia asignada')
    expect(html).not.toContain('Vinculación confirmada')
    expect(html).not.toContain('Retirar vinculación')
    expect(mocks.query).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['admin-student-progress', 'admin-a', 'student-a'],
        enabled: true,
      })
    )
  })
  it('shows stable external ID and revision without guessing the linked name', () => {
    mocks.query.mockReturnValue({
      data: {
        student_id: 'student-a',
        assigned_distance_m: 20,
        link: {
          id: 'link',
          external_id: 'external-exact',
          student_id: 'student-a',
          source: 'academy_controls',
          status: 'confirmed',
          revision: 4,
        },
      },
      isLoading: false,
      isError: false,
      isFetching: false,
    })
    const html = render()
    expect(html).toContain('Vinculación confirmada')
    expect(html).toContain('external-exact')
    expect(html).toContain('Revisión 4')
    expect(html).toContain('20 m')
    expect(html).toContain('Retirar vinculación')
  })
  it('does not show a previous student response after the student changes', () => {
    mocks.query.mockReturnValue({
      data: {
        student_id: 'student-other',
        assigned_distance_m: 70,
        link: { external_id: 'private-other-external' },
      },
      isLoading: false,
      isError: false,
      isFetching: false,
    })
    const html = render()
    expect(html).not.toContain('private-other-external')
    expect(html).not.toContain('70 m')
    expect(html).not.toContain('Buscar en Controles')
  })
  it('offers retry on authorization or unavailable errors without false empty history', () => {
    mocks.query.mockReturnValue({
      data: {
        student_id: 'student-a',
        assigned_distance_m: 70,
        link: { external_id: 'stale-revoked-identity' },
      },
      isLoading: false,
      isError: true,
      isFetching: false,
      error: Error('No tienes permiso para consultar esta vinculación.'),
    })
    const html = render()
    expect(html).toContain('role="alert"')
    expect(html).toContain('Volver a consultar')
    expect(html).not.toContain('Pendiente de vinculación')
    expect(html).not.toContain('stale-revoked-identity')
    expect(html).not.toContain('70 m')
  })
  it('does not enable queries while session is unresolved', () => {
    mocks.account = null
    mocks.query.mockReturnValue({ data: null, isLoading: false, isError: false, isFetching: false })
    expect(render()).toContain('Comprobando vinculación')
    expect(mocks.query).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
        queryKey: ['admin-student-progress', null, 'student-a'],
      })
    )
  })
})
