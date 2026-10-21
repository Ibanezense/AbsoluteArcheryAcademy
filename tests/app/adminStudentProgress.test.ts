import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ accountId: 'admin' as string | null, query: {} as any, hook: vi.fn() }))
vi.mock('@/lib/hooks/useStudentProgress', () => ({
  useProgressAccountId: () => mocks.accountId,
  useStudentProgress: (...args: unknown[]) => { mocks.hook(...args); return mocks.query },
}))
vi.mock('@/components/student/progress/TrainingWorkspace', () => ({
  TrainingWorkspace: ({ data }: any) => createElement('p', null, `CONTROL-${data.student_id}`),
}))
vi.mock('@/components/student/progress/StudentCompetitionsPanel', () => ({
  StudentCompetitionsPanel: () => createElement('p', null, 'COMPETITIONS'),
}))
import AdminStudentProgress from '@/components/admin/AdminStudentProgress'
const html = () => renderToStaticMarkup(createElement(AdminStudentProgress, {
  studentId: 'student-a', onManageLinks: () => {},
}))
beforeEach(() => {
  mocks.accountId = 'admin'
  mocks.query = { data: { student_id: 'student-a', state: 'ready' }, isError: false, isFetching: false, refetch: vi.fn() }
  mocks.hook.mockClear()
})
describe('admin student progress', () => {
  it('uses the student explicitly selected in the admin profile and the current actor', () => {
    expect(html()).toContain('CONTROL-student-a')
    expect(mocks.hook).toHaveBeenCalledWith('admin', 'student-a', true)
  })
  it('never renders cached progress from a different student', () => {
    mocks.query.data.student_id = 'student-b'
    expect(html()).not.toContain('CONTROL-')
  })
  it('hides cached sporting data while the actor is absent', () => {
    mocks.accountId = null
    expect(html()).not.toContain('CONTROL-')
  })
  it('hides cached sporting data after an access or source request error', () => {
    mocks.query.isError = true
    mocks.query.error = new Error('Acceso no disponible')
    const output = html()
    expect(output).not.toContain('CONTROL-')
    expect(output).toContain('Acceso no disponible')
  })
  it('explains unlinked controls without inventing empty results', () => {
    mocks.query.data.state = 'pending_link'
    const output = html()
    expect(output).toContain('Controles sin vincular')
    expect(output).toContain('Gestionar vínculos')
    expect(output).not.toContain('CONTROL-')
  })
})
