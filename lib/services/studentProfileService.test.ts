import { beforeEach, expect, it, vi } from 'vitest'
const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('./studentProgressService', () => ({ progressRequest: request }))
import {
  fetchStudentProfile,
  studentProfileKeys,
} from './studentProfileService'
beforeEach(() => request.mockReset())
it('isolates personal profiles by account and student', () => {
  expect(studentProfileKeys.student('a', 's')).toEqual([
    'student-profile',
    'a',
    's',
  ])
  expect(studentProfileKeys.student('a', 's')).not.toEqual(
    studentProfileKeys.student('b', 's'),
  )
  expect(studentProfileKeys.student('a', 's')).not.toEqual(
    studentProfileKeys.student('a', 'other'),
  )
})
it('uses the current account and cancellation signal for private transport', async () => {
  request.mockResolvedValue({
    student_id: 's',
    profile: { id: 's', full_name: 'Alumno' },
  })
  const signal = new AbortController().signal
  await fetchStudentProfile('a', 's', signal)
  expect(request).toHaveBeenCalledWith('/api/student-profile?studentId=s', {
    accountId: 'a',
    signal,
  })
})
it('keeps missing names explicit rather than failing a permitted empty field', async () => {
  request.mockResolvedValue({
    student_id: 's',
    profile: { id: 's', full_name: null },
  })
  expect((await fetchStudentProfile('a', 's')).profile.full_name).toBeNull()
})
it.each([
  { student_id: 'other', profile: { id: 's' } },
  { student_id: 's', profile: { id: 'other' } },
  { student_id: 's', profile: null },
])('discards mismatched or malformed personal data', async (value) => {
  request.mockResolvedValue(value)
  await expect(fetchStudentProfile('a', 's')).rejects.toThrow('perfil')
})
