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
const html = () => renderToStaticMarkup(createElement(StudentProfilePage))
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
it('prioritizes the sporting profile and keeps corrections within personal data', () => {
  const markup = html()
  expect(markup.indexOf('Datos deportivos')).toBeLessThan(markup.indexOf('Datos personales'))
  expect(markup.indexOf('Distancia asignada')).toBeLessThan(markup.indexOf('División'))
  expect(markup.indexOf('Equipo')).toBeLessThan(markup.indexOf('División'))
  expect(markup).not.toContain('href="/mi-progreso"')
  expect(markup).toContain('40 m')
  expect(markup).toContain('No registrado')
  expect(markup).toContain('Arco de la academia')
  expect(markup).toMatch(/id="personal-title"[\s\S]*href="https:\/\/wa\.me\/51997224472"[\s\S]*Solicitar corrección por WhatsApp[\s\S]*<\/section>/)
})
it('shows the configured student avatar when available', () => {
  mocks.query.data.profile.avatar_url = 'https://example.com/student.jpg'
  expect(html()).toContain('https://example.com/student.jpg')
})
it('hides personal data when student context validation fails', () => {
  mocks.context.error = 'Access lost'
  expect(html()).not.toContain('PRIVATE NAME')
})
it('shows the verified profile without a student-switching shortcut for legacy guardian sessions', () => {
  mocks.context.account.role = 'guardian'
  expect(html()).toContain('PRIVATE NAME')
  expect(html()).not.toContain('Cambiar alumno')
  expect(html()).not.toContain('href="/hub"')
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
