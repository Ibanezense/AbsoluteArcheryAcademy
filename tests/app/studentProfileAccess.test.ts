import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  context: {} as any,
  accountId: 'a',
  query: {} as any,
  hook: vi.fn(),
}))
vi.mock('@/components/AuthGuard', () => ({
  AuthGuard: ({ children }: any) => children,
}))
vi.mock('@/components/student/MobileStudentHeader', () => ({
  MobileStudentHeader: () => createElement('h1', null, 'Mi perfil'),
}))
vi.mock('@/lib/hooks/useStudentContext', () => ({
  useStudentContext: () => mocks.context,
}))
vi.mock('@/lib/hooks/useStudentProgress', () => ({
  useProgressAccountId: () => mocks.accountId,
}))
vi.mock('@/lib/hooks/useStudentProfile', () => ({
  useStudentProfile: (...args: any[]) => {
    mocks.hook(...args)
    return mocks.query
  },
}))
import StudentProfilePage from '@/components/student/profile/StudentProfilePage'
import { ProgressAvailabilityContext } from '@/components/student/progress/ProgressAvailability'
const html = () =>
  renderToStaticMarkup(
    createElement(
      ProgressAvailabilityContext.Provider,
      { value: true },
      createElement(StudentProfilePage),
    ),
  )
beforeEach(() => {
  mocks.accountId = 'a'
  mocks.context = {
    account: { id: 'a', role: 'student' },
    loading: false,
    activeStudentId: 's',
    activeStudent: { full_name: 'PRIVATE NAME' },
  }
  mocks.query = {
    data: {
      student_id: 's',
      profile: {
        id: 's',
        full_name: 'PRIVATE NAME',
        current_distance_m: 40,
        has_own_bow: false,
      },
    },
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }
  mocks.hook.mockClear()
})
it('disables profile queries and hides cached personal data after account changes', () => {
  mocks.accountId = 'other'
  expect(html()).not.toContain('PRIVATE NAME')
  expect(mocks.hook).toHaveBeenCalledWith('other', 's', false)
})
it('hides cached personal data after failed access revalidation', () => {
  mocks.query.isError = true
  expect(html()).not.toContain('PRIVATE NAME')
  expect(html()).toContain('No pudimos cargar tu perfil')
})
it('rejects another selected student response', () => {
  mocks.query.data.student_id = 'other'
  expect(html()).not.toContain('PRIVATE NAME')
})
it('shows personal and sporting sections and the progress destination for the verified student', () => {
  expect(html()).toContain('Datos personales')
  expect(html()).toContain('Datos deportivos')
  expect(html()).toContain('href="/mi-progreso"')
  expect(html()).toContain('40 m')
  expect(html()).toContain('No registrado')
  expect(html()).toContain('Arco de la academia')
  expect(html()).toContain('https://wa.me/51997224472')
})
it('shows the configured student avatar when available', () => {
  mocks.query.data.profile.avatar_url = 'https://example.com/student.jpg'
  expect(html()).toContain('https://example.com/student.jpg')
})
it('hides personal data when student context validation fails', () => {
  mocks.context.error = 'Access lost'
  expect(html()).not.toContain('PRIVATE NAME')
})
it('allows guardians to change students without exposing the guardian contact details', () => {
  mocks.context.account.role = 'guardian'
  expect(html()).toContain('Cambiar alumno')
  expect(html()).toContain('href="/hub"')
})
it('offers student selection before rendering a profile', () => {
  mocks.context.activeStudentId = null
  expect(html()).toContain('Elegir alumno')
  expect(html()).not.toContain('PRIVATE NAME')
})
it('keeps administrators on their existing administration surface without a profile query', () => {
  mocks.context.account.role = 'admin'
  expect(html()).toContain('href="/admin"')
  expect(html()).not.toContain('PRIVATE NAME')
  expect(mocks.hook).toHaveBeenCalledWith('a', 's', false)
})
