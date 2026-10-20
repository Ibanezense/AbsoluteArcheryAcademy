import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  context: {} as any,
  accountId: 'account-a',
  query: {} as any,
  useQuery: vi.fn(),
}))
vi.mock('@/components/AuthGuard', () => ({ AuthGuard: ({ children }: any) => children }))
vi.mock('@/components/student/MobileStudentHeader', () => ({
  MobileStudentHeader: () => createElement('h1', null, 'Mi progreso'),
}))
vi.mock('@/lib/hooks/useStudentContext', () => ({ useStudentContext: () => mocks.context }))
vi.mock('@/lib/hooks/useStudentProgress', () => ({
  useProgressAccountId: () => mocks.accountId,
  useStudentProgress: (...args: any[]) => {
    mocks.useQuery(...args)
    return mocks.query
  },
}))
vi.mock('@/components/student/progress/TrainingWorkspace', () => ({
  TrainingWorkspace: () => createElement('div', null, 'CONTROLES PRIVADOS'),
}))
import StudentProgressPage from '@/components/student/progress/StudentProgressPage'
vi.mock('@/components/student/progress/StudentCompetitionsPanel', () => ({
  StudentCompetitionsPanel: () => createElement('div', null, 'COMPETENCIAS PRIVADAS'),
}))
import { CompetitionAvailabilityContext } from '@/components/student/progress/ProgressAvailability'
describe('student progress identity presentation boundary', () => {
  it('keeps competition access absent until the independent feature is enabled', () => {
    const html = renderToStaticMarkup(createElement(StudentProgressPage))
    expect(html).not.toContain('role="tablist"')
    expect(html).not.toContain('COMPETENCIAS PRIVADAS')
  })
  it('offers separate source tabs when competitions are enabled, starting with controls', () => {
    const html = renderToStaticMarkup(
      createElement(
        CompetitionAvailabilityContext.Provider,
        { value: true },
        createElement(StudentProgressPage)
      )
    )
    expect(html).toContain('role="tablist"')
    expect(html).toContain('Competencias')
    expect(html).toContain('CONTROLES PRIVADOS')
    expect(html).not.toContain('COMPETENCIAS PRIVADAS')
  })
  beforeEach(() => {
    mocks.accountId = 'account-a'
    mocks.context = {
      account: { id: 'account-a' },
      activeStudentId: 'student-a',
      activeStudent: { full_name: 'Alumno A' },
      loading: false,
    }
    mocks.query = {
      data: { student_id: 'student-a', state: 'ready', checked_at: null },
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    }
    mocks.useQuery.mockClear()
  })
  it('does not request or render old identity data when the signed in account changes', () => {
    mocks.accountId = 'account-b'
    const html = renderToStaticMarkup(createElement(StudentProgressPage))
    expect(mocks.useQuery).toHaveBeenCalledWith('account-b', 'student-a', false)
    expect(html).not.toContain('CONTROLES PRIVADOS')
    expect(html).not.toContain('Alumno A')
  })
  it('never displays another selected student response', () => {
    mocks.query.data.student_id = 'student-b'
    expect(renderToStaticMarkup(createElement(StudentProgressPage))).not.toContain(
      'CONTROLES PRIVADOS'
    )
  })
  it('removes cached sporting data when access revalidation fails', () => {
    mocks.query.isError = true
    mocks.query.error = new Error('Acceso revocado')
    const html = renderToStaticMarkup(createElement(StudentProgressPage))
    expect(html).not.toContain('CONTROLES PRIVADOS')
    expect(html).toContain('Acceso revocado')
  })
  it('shows private controls only for the current account and student', () => {
    expect(renderToStaticMarkup(createElement(StudentProgressPage))).toContain('CONTROLES PRIVADOS')
    expect(mocks.useQuery).toHaveBeenCalledWith('account-a', 'student-a', true)
  })
})
