import { expect, it, vi } from 'vitest'
import { invalidateStudentBirthdayQueries } from './invalidateStudentBirthdays'

it('invalidates birthday flags and only the affected student notification scopes', async () => {
  const client = { invalidateQueries: vi.fn(async () => undefined) }
  await invalidateStudentBirthdayQueries(client as any, 's1')
  expect(client.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['admin-student-birthdays'] })
  const predicate = client.invalidateQueries.mock.calls.map(([args]: any) => args.predicate).find(Boolean)
  expect(predicate({ queryKey: ['student-notifications', 'account1', 's1', 0] })).toBe(true)
  expect(predicate({ queryKey: ['student-notifications', 'account2', 's1', 3] })).toBe(true)
  expect(predicate({ queryKey: ['student-notifications', 'account1', 's2', 0] })).toBe(false)
})
